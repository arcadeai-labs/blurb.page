import { validateSpec } from '@json-render/core'
import type { z } from 'zod'

import {
  type ActionBinding,
  type AppElement,
  type AppSpec,
  actionBindingSchema,
  reservedStateKeys,
} from './app'
import {
  appActionDefinitions,
  appCatalog,
  appComponentDefinitions,
  builtInActionNames,
} from './catalog'

type ComponentDefinition = { props: z.ZodObject; events?: string[] }

const components: Record<string, ComponentDefinition> = appComponentDefinitions

const customActions: Record<string, { params: z.ZodObject }> =
  appActionDefinitions

const actionNames = [...builtInActionNames, ...Object.keys(customActions)]

const expressionKeys = [
  '$state',
  '$bindState',
  '$item',
  '$bindItem',
  '$index',
  '$cond',
  '$template',
  '$computed',
]

/** Action params that name a state path the action writes to. */
const writtenPathParams = [
  'statePath',
  'clearStatePath',
  'loadingPath',
  'errorPath',
]

/** What a spec defines that its parts can refer to. */
type Names = {
  scripts: ReadonlySet<string>
  svgs: ReadonlySet<string>
  queries: ReadonlySet<string>
  mutations: ReadonlySet<string>
}

/** Whether `value` is, or contains, a dynamic expression resolved at render time. */
function hasExpression(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasExpression)
  }
  if (value === null || typeof value !== 'object') {
    return false
  }
  return Object.entries(value).some(
    ([key, inner]) => expressionKeys.includes(key) || hasExpression(inner),
  )
}

/** Whether `value` contains any of the expression `keys`. */
function usesKeys(value: unknown, keys: string[]): boolean {
  if (Array.isArray(value)) {
    return value.some((inner) => usesKeys(inner, keys))
  }
  if (value === null || typeof value !== 'object') {
    return false
  }
  return Object.entries(value).some(
    ([key, inner]) => keys.includes(key) || usesKeys(inner, keys),
  )
}

/** Absolute state paths an expression reads (`$state`, `$template`) or binds (`$bindState`). */
function statePaths(value: unknown): { reads: string[]; binds: string[] } {
  const reads: string[] = []
  const binds: string[] = []

  function visit(inner: unknown) {
    if (Array.isArray(inner)) {
      inner.forEach(visit)
      return
    }
    if (inner === null || typeof inner !== 'object') {
      return
    }
    for (const [key, field] of Object.entries(inner)) {
      if (key === '$state' && typeof field === 'string') {
        reads.push(field)
      } else if (key === '$bindState' && typeof field === 'string') {
        binds.push(field)
      } else if (key === '$template' && typeof field === 'string') {
        for (const [, path] of field.matchAll(/\$\{([^}]+)\}/g)) {
          reads.push(path.startsWith('/') ? path : `/${path}`)
        }
      } else {
        visit(field)
      }
    }
  }

  visit(value)
  return { reads, binds }
}

/** `["queries", "issues", "data"]` for `/queries/issues/data/0`. */
function segments(path: string) {
  return path.split('/').slice(1)
}

function isReserved(path: string) {
  return reservedStateKeys.some((key) => segments(path)[0] === key)
}

/** Checks literal values against `schema`; expressions are checked at runtime. */
function checkFields(
  schema: z.ZodObject,
  values: Record<string, unknown>,
  where: string,
  noun: 'prop' | 'param',
) {
  const errors: string[] = []

  for (const key of Object.keys(values)) {
    if (!(key in schema.shape)) {
      errors.push(
        `${where}: unknown ${noun} "${key}" (expected one of: ${Object.keys(schema.shape).join(', ') || 'none'})`,
      )
    }
  }

  for (const [key, field] of Object.entries<z.ZodType>(schema.shape)) {
    const value = values[key]

    if (value === undefined) {
      if (
        !field.safeParse(undefined).success &&
        !field.safeParse(null).success
      ) {
        errors.push(`${where}: missing required ${noun} "${key}"`)
      }
    } else if (!hasExpression(value)) {
      const result = field.safeParse(value)

      if (!result.success) {
        errors.push(
          `${where}: ${noun} "${key}" ${result.error.issues
            .map((issue) =>
              issue.path.length > 0
                ? `at ${issue.path.join('.')}: ${issue.message}`
                : issue.message,
            )
            .join('; ')}`,
        )
      }
    }
  }

  return errors
}

/**
 * Checks state paths read under `/queries` and `/mutations`: the query or
 * mutation must exist, and query data may only be read inside a Query
 * element for it, so loading and error states are always handled.
 */
function checkReads(
  paths: string[],
  where: string,
  names: Names,
  boundaries: ReadonlySet<string> | undefined,
) {
  const errors: string[] = []

  for (const path of paths) {
    const [key, name, field] = segments(path)

    if (key === 'queries' && name !== undefined) {
      if (!names.queries.has(name)) {
        errors.push(`${where}: reads ${path} but there is no query "${name}"`)
      } else if (field === 'data' && boundaries && !boundaries.has(name)) {
        errors.push(
          `${where}: reads ${path} outside a Query element for "${name}"; put it inside { "type": "Query", "props": { "query": "${name}" } } so loading and errors are handled`,
        )
      }
    } else if (
      key === 'mutations' &&
      name !== undefined &&
      !names.mutations.has(name)
    ) {
      errors.push(`${where}: reads ${path} but there is no mutation "${name}"`)
    }
  }

  return errors
}

function checkWrites(paths: string[], where: string) {
  return paths
    .filter(isReserved)
    .map(
      (path) =>
        `${where}: writes to ${path}, but /queries and /mutations are kept up to date by the app; copy the value into your own state path instead`,
    )
}

/** State paths an action binding writes to, read from its literal params. */
function writtenPaths(binding: ActionBinding) {
  const paths = writtenPathParams
    .map((param) => binding.params?.[param])
    .filter((path): path is string => typeof path === 'string')

  for (const key of ['onSuccess', 'onError'] as const) {
    const handler = binding[key]

    if (handler && 'set' in handler) {
      paths.push(...Object.keys(handler.set))
    }
  }

  return paths
}

function checkBinding(
  binding: ActionBinding,
  where: string,
  names: Names,
  boundaries: ReadonlySet<string> | undefined,
): string[] {
  if (!actionNames.includes(binding.action)) {
    return [
      `${where}: unknown action "${binding.action}" (expected one of: ${actionNames.join(', ')})`,
    ]
  }

  const errors: string[] = []
  const custom = customActions[binding.action]

  if (custom) {
    errors.push(
      ...checkFields(custom.params, binding.params ?? {}, where, 'param'),
    )
  }

  const script = binding.params?.script
  if (
    binding.action === 'runScript' &&
    typeof script === 'string' &&
    !names.scripts.has(script)
  ) {
    errors.push(
      `${where}: no script named "${script}" (create it with create_script, or see list_scripts)`,
    )
  }

  const mutation = binding.params?.mutation
  if (
    binding.action === 'mutate' &&
    typeof mutation === 'string' &&
    !names.mutations.has(mutation)
  ) {
    errors.push(
      `${where}: no mutation named "${mutation}" (define it in spec.mutations)`,
    )
  }

  const { reads, binds } = statePaths(binding.params)
  errors.push(
    ...checkReads([...reads, ...binds], where, names, boundaries),
    ...checkWrites([...binds, ...writtenPaths(binding)], where),
  )

  for (const key of ['onSuccess', 'onError'] as const) {
    // `{ set }` and `{ navigate }` handlers need no checks; `{ action }` does.
    const next = actionBindingSchema.safeParse(binding[key])

    if (next.success) {
      errors.push(
        ...checkBinding(next.data, `${where}.${key}`, names, boundaries),
      )
    }
  }

  return errors
}

function checkBindings(
  bindings: ActionBinding | ActionBinding[],
  where: string,
  names: Names,
  boundaries?: ReadonlySet<string>,
) {
  const list = Array.isArray(bindings) ? bindings : [bindings]

  return list.flatMap((binding, index) =>
    checkBinding(
      binding,
      list.length > 1 ? `${where}[${index}]` : where,
      names,
      boundaries,
    ),
  )
}

/** Checks spec.queries and spec.mutations: scripts, inputs and invalidations. */
function checkOperations(spec: AppSpec, names: Names) {
  const errors: string[] = []
  const operations = [
    ...Object.entries(spec.queries ?? {}).map(
      ([name, query]) =>
        [
          `queries.${name}`,
          query.script,
          [query.input, query.enabled],
        ] as const,
    ),
    ...Object.entries(spec.mutations ?? {}).map(
      ([name, mutation]) =>
        [`mutations.${name}`, mutation.script, [mutation.input]] as const,
    ),
  ]

  for (const [where, script, expressions] of operations) {
    if (!names.scripts.has(script)) {
      errors.push(
        `${where}: no script named "${script}" (create it with create_script, or see list_scripts)`,
      )
    }

    if (usesKeys(expressions, ['$item', '$index', '$bindItem', '$bindState'])) {
      errors.push(
        `${where}: only { "$state": "/path" } expressions work here; pass row values ($item) through the mutate action's input instead`,
      )
    }

    // Queries may depend on other queries' data, so reads aren't bounded here.
    errors.push(
      ...checkReads(statePaths(expressions).reads, where, names, undefined),
    )
  }

  for (const [name, mutation] of Object.entries(spec.mutations ?? {})) {
    for (const query of mutation.invalidates ?? []) {
      if (!names.queries.has(query)) {
        errors.push(
          `mutations.${name}.invalidates: no query named "${query}" (define it in spec.queries)`,
        )
      }
    }
  }

  for (const key of reservedStateKeys) {
    if (spec.state && key in spec.state) {
      errors.push(
        `spec.state.${key}: reserved for query and mutation results; remove it`,
      )
    }
  }

  return errors
}

/** Checks one element's props, events and watchers. */
function checkElement(
  key: string,
  element: AppElement,
  names: Names,
  { boundaries, repeatsQueryData, inSlides }: Placement,
) {
  const where = `elements.${key}`
  const errors: string[] = []
  const component = components[element.type]

  if (component) {
    errors.push(
      ...checkFields(
        component.props,
        element.props,
        `${where} (${element.type})`,
        'prop',
      ),
    )
  }

  const { reads, binds } = statePaths([element.props, element.visible])
  const repeatPath = element.repeat?.statePath

  if (typeof repeatPath === 'string') {
    reads.push(repeatPath)
  }
  reads.push(...Object.keys(element.watch ?? {}))

  errors.push(
    ...checkReads([...reads, ...binds], where, names, boundaries),
    ...checkWrites(binds, where),
  )

  if (repeatsQueryData && usesKeys(element.props, ['$bindItem'])) {
    errors.push(
      `${where}: $bindItem would write into query results; use { "$item": "field" } to read, or copy the rows into your own state first`,
    )
  }

  if (element.type === 'ScrollArea' && inSlides) {
    errors.push(
      `${where} (ScrollArea): slides don't scroll, like slides in a presentation; content that doesn't fit is shrunk, so split long content across slides instead`,
    )
  }

  if (element.type === 'Svg') {
    const name = element.props.name

    if (typeof name === 'string' && !names.svgs.has(name)) {
      errors.push(
        `${where} (Svg): no SVG named "${name}" (create it with create_svg, or see list_svgs)`,
      )
    }
  }

  if (element.type === 'Query') {
    const query = element.props.query

    if (typeof query === 'string' && !names.queries.has(query)) {
      errors.push(
        `${where} (Query): no query named "${query}" (define it in spec.queries)`,
      )
    }
  }

  for (const [event, bindings] of Object.entries(element.on ?? {})) {
    if (component && !component.events?.includes(event)) {
      errors.push(
        `${where}.on: ${element.type} has no "${event}" event (events: ${component.events?.join(', ') || 'none'})`,
      )
    }
    errors.push(
      ...checkBindings(bindings, `${where}.on.${event}`, names, boundaries),
    )
  }

  for (const [path, bindings] of Object.entries(element.watch ?? {})) {
    errors.push(
      ...checkBindings(bindings, `${where}.watch.${path}`, names, boundaries),
    )
  }

  return errors
}

/**
 * Where an element sits: the Query elements around it, whether it repeats
 * over query data, and whether it's in a Slides deck.
 */
type Placement = {
  boundaries: ReadonlySet<string>
  repeatsQueryData: boolean
  inSlides: boolean
}

const topLevel: Placement = {
  boundaries: new Set(),
  repeatsQueryData: false,
  inSlides: false,
}

/** Walks the element tree from the root to find each element's placement. */
function placements(spec: AppSpec) {
  const found = new Map<string, Placement>()

  function visit(
    key: string,
    placement: Placement,
    ancestors: ReadonlySet<string>,
  ) {
    const element = spec.elements[key]

    if (!element || ancestors.has(key) || found.has(key)) {
      return
    }
    found.set(key, placement)

    const query = element.type === 'Query' ? element.props.query : undefined
    const repeatPath = element.repeat?.statePath
    const child: Placement = {
      boundaries:
        typeof query === 'string'
          ? new Set([...placement.boundaries, query])
          : placement.boundaries,
      repeatsQueryData:
        typeof repeatPath === 'string'
          ? isReserved(repeatPath)
          : placement.repeatsQueryData,
      inSlides: placement.inSlides || element.type === 'Slides',
    }
    const childAncestors = new Set([...ancestors, key])

    for (const childKey of [
      ...element.children,
      ...Object.values(element.slots ?? {}).flat(),
    ]) {
      visit(childKey, child, childAncestors)
    }
  }

  visit(spec.root, topLevel, new Set())
  return found
}

/**
 * Validates an app beyond its JSON shape: component and prop names, literal
 * prop values, event names, actions and the scripts they run, the SVGs it
 * shows, queries and mutations, and the integrity of the element tree.
 * Returns readable errors, empty when valid.
 */
export function validateApp(
  app: { spec: AppSpec; onLoad?: ActionBinding[] },
  existing: { scripts: ReadonlySet<string>; svgs: ReadonlySet<string> },
) {
  const { spec } = app
  const errors: string[] = []
  const names: Names = {
    ...existing,
    queries: new Set(Object.keys(spec.queries ?? {})),
    mutations: new Set(Object.keys(spec.mutations ?? {})),
  }

  const parsed = appCatalog.validate(spec)
  if (!parsed.success && parsed.error) {
    errors.push(
      ...parsed.error.issues.map(
        (issue) => `spec.${issue.path.join('.')}: ${issue.message}`,
      ),
    )
  }

  if (!(spec.root in spec.elements)) {
    errors.push(`spec.root: no element with key "${spec.root}"`)
  }

  for (const issue of validateSpec(spec).issues) {
    const repeatPath = issue.elementKey
      ? spec.elements[issue.elementKey]?.repeat?.statePath
      : undefined

    // Query results aren't in the initial state, so json-render can't check
    // that they're arrays.
    if (
      issue.code === 'repeat_state_mismatch' &&
      typeof repeatPath === 'string' &&
      isReserved(repeatPath)
    ) {
      continue
    }

    if (issue.severity === 'error') {
      errors.push(issue.message)
    }
  }

  errors.push(...checkOperations(spec, names))

  const placed = placements(spec)
  for (const [key, element] of Object.entries(spec.elements)) {
    errors.push(
      ...checkElement(key, element, names, placed.get(key) ?? topLevel),
    )
  }

  errors.push(...checkBindings(app.onLoad ?? [], 'onLoad', names))

  return [...new Set(errors)]
}

/** Names of the scripts an app runs, for the existence check. */
export function referencedScripts(app: {
  spec: AppSpec
  onLoad?: ActionBinding[]
}) {
  const names = new Set<string>()

  for (const operation of [
    ...Object.values(app.spec.queries ?? {}),
    ...Object.values(app.spec.mutations ?? {}),
  ]) {
    names.add(operation.script)
  }

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit)
    } else if (value && typeof value === 'object') {
      if (
        'action' in value &&
        value.action === 'runScript' &&
        'params' in value &&
        value.params &&
        typeof value.params === 'object' &&
        'script' in value.params &&
        typeof value.params.script === 'string'
      ) {
        names.add(value.params.script)
      }
      Object.values(value).forEach(visit)
    }
  }

  visit(app)
  return names
}

/**
 * Validates a component embedded in a doc: an app spec, except that a
 * ScrollArea needs a height, since a doc scrolls rather than fitting the
 * window.
 */
export function validateEmbed(
  spec: AppSpec,
  existing: { scripts: ReadonlySet<string>; svgs: ReadonlySet<string> },
) {
  const errors = validateApp({ spec }, existing)

  for (const [key, element] of Object.entries(spec.elements)) {
    if (element.type === 'ScrollArea' && element.props.height == null) {
      errors.push(
        `elements.${key} (ScrollArea): needs a height in a doc, which scrolls instead of filling the window`,
      )
    }
  }

  return errors
}

/** Names of the SVGs an app shows with a literal Svg name. */
export function referencedSvgs(app: { spec: AppSpec }) {
  return new Set(
    Object.values(app.spec.elements).flatMap((element) =>
      element.type === 'Svg' && typeof element.props.name === 'string'
        ? [element.props.name]
        : [],
    ),
  )
}
