import { validateSpec } from '@json-render/core'
import type { z } from 'zod'

import { type ActionBinding, type AppSpec, actionBindingSchema } from './app'
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

function checkBinding(
  binding: ActionBinding,
  where: string,
  scriptNames: ReadonlySet<string>,
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
    !scriptNames.has(script)
  ) {
    errors.push(
      `${where}: no script named "${script}" (create it with create_script, or see list_scripts)`,
    )
  }

  for (const key of ['onSuccess', 'onError'] as const) {
    // `{ set }` and `{ navigate }` handlers need no checks; `{ action }` does.
    const next = actionBindingSchema.safeParse(binding[key])

    if (next.success) {
      errors.push(...checkBinding(next.data, `${where}.${key}`, scriptNames))
    }
  }

  return errors
}

function checkBindings(
  bindings: ActionBinding | ActionBinding[],
  where: string,
  scriptNames: ReadonlySet<string>,
) {
  const list = Array.isArray(bindings) ? bindings : [bindings]

  return list.flatMap((binding, index) =>
    checkBinding(
      binding,
      list.length > 1 ? `${where}[${index}]` : where,
      scriptNames,
    ),
  )
}

/**
 * Validates an app beyond its JSON shape: component and prop names, literal
 * prop values, event names, actions and the scripts they run, and the
 * integrity of the element tree. Returns readable errors, empty when valid.
 */
export function validateApp(
  app: { spec: AppSpec; onLoad?: ActionBinding[] },
  scriptNames: ReadonlySet<string>,
) {
  const { spec } = app
  const errors: string[] = []

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
    if (issue.severity === 'error') {
      errors.push(issue.message)
    }
  }

  for (const [key, element] of Object.entries(spec.elements)) {
    const where = `elements.${key}`
    const component = components[element.type]

    if (!component) {
      continue
    }

    errors.push(
      ...checkFields(
        component.props,
        element.props,
        `${where} (${element.type})`,
        'prop',
      ),
    )

    for (const [event, bindings] of Object.entries(element.on ?? {})) {
      if (!component.events?.includes(event)) {
        errors.push(
          `${where}.on: ${element.type} has no "${event}" event (events: ${component.events?.join(', ') || 'none'})`,
        )
      }
      errors.push(
        ...checkBindings(bindings, `${where}.on.${event}`, scriptNames),
      )
    }

    for (const [path, bindings] of Object.entries(element.watch ?? {})) {
      errors.push(
        ...checkBindings(bindings, `${where}.watch.${path}`, scriptNames),
      )
    }
  }

  errors.push(...checkBindings(app.onLoad ?? [], 'onLoad', scriptNames))

  return [...new Set(errors)]
}

/** Names of the scripts an app runs, for the existence check. */
export function referencedScripts(app: {
  spec: AppSpec
  onLoad?: ActionBinding[]
}) {
  const names = new Set<string>()

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
