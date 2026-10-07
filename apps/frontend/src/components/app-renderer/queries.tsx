import {
  evaluateVisibility,
  resolvePropValue,
  type StateModel,
  type StateStore,
} from '@json-render/core'
import { useStateStore } from '@json-render/react'
import type {
  AppQuery,
  AppSpec,
  MutationState,
  QueryState,
} from '@template/api/ui'
import {
  type QueryClient,
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query'
import { createContext, useContext, useEffect } from 'react'
import { AuthorizationRequiredError, executeScript } from '@/lib/mcp'

/**
 * Query key for a script's result. Queries share results by script and input,
 * and mutations invalidate every input of a script with `scriptQueryKey(script)`.
 */
export function scriptQueryKey(script: string, input?: unknown) {
  return input === undefined ? ['scripts', script] : ['scripts', script, input]
}

/** A query or mutation input with its `$state` expressions resolved. */
export function resolveInput(input: unknown, stateModel: StateModel) {
  return input === undefined ? {} : resolvePropValue(input, { stateModel })
}

/** A query's cached result: the script's value and how long its run took. */
type ScriptRun = { value: unknown; timing: NonNullable<QueryState['timing']> }

/** Runs a script, timing it end to end as the browser sees it. */
async function runTimed(script: string, input: unknown): Promise<ScriptRun> {
  const started = performance.now()
  const { value, toolMs } = await executeScript(script, input)

  return {
    value,
    timing: { totalMs: Math.round(performance.now() - started), toolMs },
  }
}

const idleMutation: MutationState = {
  status: 'idle',
  data: null,
  error: null,
  isPending: false,
}

/**
 * The app's initial state: the spec's state plus `/queries` and `/mutations`.
 * Queries start from cached results when there are any, so reopening an app
 * doesn't flash skeletons.
 */
export function initialAppState(spec: AppSpec, queryClient: QueryClient) {
  const state = structuredClone(spec.state ?? {})

  const queries = Object.fromEntries(
    Object.entries(spec.queries ?? {}).map(([name, query]) => {
      const key = scriptQueryKey(query.script, resolveInput(query.input, state))
      const cached = queryClient.getQueryState<ScriptRun>(key)
      const enabled = evaluateVisibility(query.enabled, { stateModel: state })
      const initial: QueryState =
        cached?.status === 'success'
          ? {
              status: 'success',
              data: cached.data?.value ?? null,
              error: null,
              authorizationUrl: null,
              isFetching: false,
              timing: cached.data?.timing ?? null,
            }
          : {
              status: enabled ? 'pending' : 'idle',
              data: null,
              error: null,
              authorizationUrl: null,
              isFetching: enabled,
              timing: null,
            }

      return [name, initial]
    }),
  )

  const mutations = Object.fromEntries(
    Object.keys(spec.mutations ?? {}).map((name) => [name, idleMutation]),
  )

  return { ...state, queries, mutations }
}

/** Runs one query and mirrors its result into state at `/queries/<name>`. */
function QueryRunner({
  name,
  query,
  store,
}: {
  name: string
  query: AppQuery
  store: StateStore
}) {
  // Re-renders on state changes, so a changed input refetches.
  const { state } = useStateStore()
  const input = resolveInput(query.input, state)
  const enabled = evaluateVisibility(query.enabled, { stateModel: state })

  const result = useQuery({
    queryKey: scriptQueryKey(query.script, input),
    queryFn: () => runTimed(query.script, input),
    enabled,
    refetchInterval: query.refetchInterval ?? false,
    // Script failures are usually deterministic, so retry only once, and
    // not at all until the user authorizes. Coming back to the tab after
    // authorizing refetches it.
    retry: (failureCount, error) =>
      failureCount < 1 && !(error instanceof AuthorizationRequiredError),
    // Keep showing the previous rows while a changed input loads.
    placeholderData: keepPreviousData,
  })

  // A paused query (e.g. retrying in a background tab) is still pending.
  const status: QueryState['status'] =
    !enabled && result.isPending ? 'idle' : result.status
  const data = result.data?.value ?? null
  const timing = result.data?.timing ?? null
  const error = result.error?.message ?? null
  const authorizationUrl =
    result.error instanceof AuthorizationRequiredError
      ? result.error.authorizationUrl
      : null
  const { isFetching } = result

  useEffect(() => {
    store.set(`/queries/${name}`, {
      status,
      data,
      error,
      authorizationUrl,
      isFetching,
      timing,
    } satisfies QueryState)
  }, [store, name, status, data, error, authorizationUrl, isFetching, timing])

  return null
}

/** Runs every query in the spec for as long as the app is open. */
export function QueryRunners({
  spec,
  store,
}: {
  spec: AppSpec
  store: StateStore
}) {
  return Object.entries(spec.queries ?? {}).map(([name, query]) => (
    <QueryRunner key={name} name={name} query={query} store={store} />
  ))
}

type AppQueries = {
  /** Refetches a query by name, e.g. from a Query element's retry button. */
  refetch: (name: string) => void
}

const AppQueriesContext = createContext<AppQueries | null>(null)

export const AppQueriesProvider = AppQueriesContext.Provider

export function useAppQueries() {
  const context = useContext(AppQueriesContext)

  if (!context) {
    throw new Error('useAppQueries must be used inside an AppRenderer')
  }

  return context
}
