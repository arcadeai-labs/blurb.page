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
  type App,
  runScriptParams,
  toastParams,
} from '@template/api/ui'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { executeScript } from '@/lib/mcp'
import { registry } from './registry'

type Validation = ReturnType<typeof useOptionalValidation>

const runScriptInput = runScriptParams.partial().required({ script: true })

const toastInput = toastParams.partial().required({ message: true })

/**
 * Stops the rest of an action list after a failure the user has already seen
 * (invalid fields, an error toast or errorPath).
 */
class ActionStoppedError extends Error {
  name = 'ActionStoppedError'
}

/** Handlers for the catalog's custom actions; json-render runs the built-ins. */
function createHandlers(store: StateStore, getValidation: () => Validation) {
  return {
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

        if (errorPath) {
          store.set(errorPath, message)
        } else {
          toast.error(`${script} failed`, { description: message })
        }
        throw new ActionStoppedError(message, { cause: error })
      } finally {
        if (loadingPath) store.set(loadingPath, false)
      }
    },
    toast: (params: Record<string, unknown>) => {
      const { message, description, type } = toastInput.parse(params)
      const show =
        type === 'success'
          ? toast.success
          : type === 'error'
            ? toast.error
            : type === 'info'
              ? toast.info
              : toast

      show(message, { description: description ?? undefined })
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

function AppActions({ app, store }: { app: App; store: StateStore }) {
  const navigate = useNavigate()
  const validation = useOptionalValidation()
  const validationRef = useRef(validation)
  validationRef.current = validation

  // ActionProvider keeps the first handlers it gets, so they read the
  // latest validation context through a ref.
  const [handlers] = useState(() =>
    createHandlers(store, () => validationRef.current),
  )

  return (
    <ActionProvider handlers={handlers} navigate={(to) => navigate({ to })}>
      <Renderer spec={app.spec} registry={registry} />
      <OnLoad bindings={app.onLoad} store={store} />
      <ConfirmAction />
    </ActionProvider>
  )
}

/** Renders an app's json-render spec; its actions run scripts over MCP. */
export function AppRenderer({ app }: { app: App }) {
  const [store] = useState(() =>
    createStateStore(structuredClone(app.spec.state ?? {})),
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
          <AppActions app={app} store={store} />
        </ValidationProvider>
      </VisibilityProvider>
    </StateProvider>
  )
}
