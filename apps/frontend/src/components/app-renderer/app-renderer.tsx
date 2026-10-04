import { resolveActionParam } from '@json-render/core'
import {
  ActionProvider,
  createStateStore,
  Renderer,
  StateProvider,
  type StateStore,
  useActions,
  useOptionalValidation,
  ValidationProvider,
  VisibilityProvider,
} from '@json-render/react'
import {
  type ActionBinding,
  type AppSpec,
  type MutationState,
  mutateParams,
  runScriptParams,
  toastParams,
} from '@template/api/ui'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/toast'
import { AuthorizationRequiredError, executeScript } from '@/lib/mcp'
import { toastScriptError } from './authorization'
import {
  AppQueriesProvider,
  initialAppState,
  QueryRunners,
  resolveInput,
  scriptQueryKey,
} from './queries'
import { registry } from './registry'

type Validation = ReturnType<typeof useOptionalValidation>

const runScriptInput = runScriptParams.partial().required({ script: true })

const mutateInput = mutateParams.partial().required({ mutation: true })

const toastInput = toastParams.partial().required({ message: true })

/**
 * Stops the rest of an action list after a failure the user has already seen
 * (invalid fields, an error toast or errorPath).
 */
class ActionStoppedError extends Error {
  name = 'ActionStoppedError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Handlers for the catalog's custom actions; json-render runs the built-ins. */
function createHandlers({
  spec,
  store,
  queryClient,
  getValidation,
}: {
  spec: AppSpec
  store: StateStore
  queryClient: QueryClient
  getValidation: () => Validation
}) {
  // Runs in flight per mutation, so isPending stays true until all settle.
  const inFlight = new Map<string, number>()

  return {
    mutate: async (params: Record<string, unknown>) => {
      const { mutation: name, input, validate } = mutateInput.parse(params)
      const mutation = spec.mutations?.[name]

      if (!mutation) {
        throw new Error(`No mutation named "${name}"`)
      }

      if (validate && getValidation()?.validateAll() === false) {
        throw new ActionStoppedError('Some fields are invalid')
      }

      const path = `/mutations/${name}`
      const base = resolveInput(mutation.input, store.getSnapshot())
      const merged =
        isRecord(base) && isRecord(input)
          ? { ...base, ...input }
          : (input ?? base)

      function settle(state: Omit<MutationState, 'isPending'>) {
        const count = (inFlight.get(name) ?? 1) - 1
        inFlight.set(name, count)
        store.set(path, { ...state, isPending: count > 0 })
      }

      inFlight.set(name, (inFlight.get(name) ?? 0) + 1)
      store.set(path, {
        status: 'pending',
        data: null,
        error: null,
        isPending: true,
      } satisfies MutationState)

      try {
        const data = await executeScript(mutation.script, merged)
        settle({ status: 'success', data, error: null })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        settle({ status: 'error', data: null, error: message })
        toastScriptError(`${name} failed`, error)
        throw new ActionStoppedError(message, { cause: error })
      }

      // Refetch in the background; the rest of the action list doesn't wait.
      for (const query of mutation.invalidates ?? []) {
        const script = spec.queries?.[query]?.script

        if (script) {
          void queryClient.invalidateQueries({
            queryKey: scriptQueryKey(script),
          })
        }
      }
    },
    runScript: async (params: Record<string, unknown>) => {
      const { script, input, statePath, loadingPath, errorPath, validate } =
        runScriptInput.parse(params)

      if (validate && getValidation()?.validateAll() === false) {
        throw new ActionStoppedError('Some fields are invalid')
      }

      if (loadingPath) store.set(loadingPath, true)

      try {
        const value = await executeScript(script, input ?? {})

        if (statePath) store.set(statePath, value)
        if (errorPath) store.set(errorPath, null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        if (errorPath) store.set(errorPath, message)

        // An errorPath can't show the Authorize link, so those always toast.
        if (!errorPath || error instanceof AuthorizationRequiredError) {
          toastScriptError(`${script} failed`, error)
        }
        throw new ActionStoppedError(message, { cause: error })
      } finally {
        if (loadingPath) store.set(loadingPath, false)
      }
    },
    toast: (params: Record<string, unknown>) => {
      const { message, description, type } = toastInput.parse(params)
      toast.add({
        title: message,
        description: description ?? undefined,
        type: type ?? undefined,
      })
    },
  }
}

/** Runs the app's onLoad actions once, in order, stopping at a failure. */
function OnLoad({
  bindings,
  store,
}: {
  bindings: ActionBinding[]
  store: StateStore
}) {
  const { execute } = useActions()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      for (const binding of bindings) {
        // Resolve expressions like an event would, against the current state.
        const context = { stateModel: store.getSnapshot() }
        const params = Object.fromEntries(
          Object.entries(binding.params ?? {}).map(([key, value]) => [
            key,
            resolveActionParam(value, context),
          ]),
        )

        await execute({ ...binding, params })
      }
    })().catch((error: unknown) => {
      if (!(error instanceof ActionStoppedError)) throw error
    })
  }, [])

  return null
}

function ConfirmAction() {
  const { pendingConfirmation, confirm, cancel } = useActions()
  const details = pendingConfirmation?.action.confirm

  return (
    <AlertDialog
      open={Boolean(details)}
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{details?.title}</AlertDialogTitle>
          <AlertDialogDescription>{details?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {details?.cancelLabel ?? 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={details?.variant === 'danger' ? 'destructive' : 'default'}
            onClick={confirm}
          >
            {details?.confirmLabel ?? 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AppActions({
  spec,
  onLoad,
  store,
}: {
  spec: AppSpec
  onLoad: ActionBinding[]
  store: StateStore
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const validation = useOptionalValidation()
  const validationRef = useRef(validation)
  validationRef.current = validation

  // ActionProvider keeps the first handlers it gets, so they read the
  // latest validation context through a ref.
  const [handlers] = useState(() =>
    createHandlers({
      spec,
      store,
      queryClient,
      getValidation: () => validationRef.current,
    }),
  )

  const queries = useMemo(
    () => ({
      refetch: (name: string) => {
        const script = spec.queries?.[name]?.script

        if (script) {
          void queryClient.refetchQueries({
            queryKey: scriptQueryKey(script),
            type: 'active',
          })
        }
      },
    }),
    [spec, queryClient],
  )

  return (
    <ActionProvider handlers={handlers} navigate={(to) => navigate({ to })}>
      <AppQueriesProvider value={queries}>
        {/* Grows to fill a flex column, so the app can fill what it's in. */}
        <div data-fill-root className="flex min-w-0 flex-1 flex-col">
          <Renderer spec={spec} registry={registry} />
        </div>
      </AppQueriesProvider>
      <QueryRunners spec={spec} store={store} />
      <OnLoad bindings={onLoad} store={store} />
      <ConfirmAction />
    </ActionProvider>
  )
}

/**
 * Renders a json-render spec: an app's, or a component embedded in a doc. Its
 * queries and actions run scripts over MCP, and query and mutation results are
 * kept in state under `/queries` and `/mutations`.
 */
export function AppRenderer({
  spec,
  onLoad = [],
}: {
  spec: AppSpec
  onLoad?: ActionBinding[]
}) {
  const queryClient = useQueryClient()
  const [store] = useState(() =>
    createStateStore(initialAppState(spec, queryClient)),
  )

  // json-render doesn't catch failed event handlers, so a stopped action list
  // would surface as an unhandled rejection.
  useEffect(() => {
    function ignoreStopped(event: PromiseRejectionEvent) {
      if (event.reason instanceof ActionStoppedError) {
        event.preventDefault()
      }
    }

    window.addEventListener('unhandledrejection', ignoreStopped)
    return () => window.removeEventListener('unhandledrejection', ignoreStopped)
  }, [])

  return (
    <StateProvider store={store}>
      <VisibilityProvider>
        <ValidationProvider>
          <AppActions spec={spec} onLoad={onLoad} store={store} />
        </ValidationProvider>
      </VisibilityProvider>
    </StateProvider>
  )
}
