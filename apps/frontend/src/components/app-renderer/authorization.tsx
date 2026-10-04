import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { AuthorizationRequiredError } from '@/lib/mcp'

/** Opens the authorization page in a new tab. */
export function AuthorizeButton({ url }: { url: string }) {
  return (
    <Button
      size="sm"
      nativeButton={false}
      render={
        <a href={url} target="_blank" rel="noreferrer">
          Authorize
        </a>
      }
    />
  )
}

/**
 * Toasts a failed script run. When it failed for lack of authorization, the
 * toast stays up with an Authorize button instead of the error.
 */
export function toastScriptError(title: string, error: unknown) {
  if (error instanceof AuthorizationRequiredError) {
    const id = toast.add({
      title: 'Authorization required',
      description: error.message,
      type: 'warning',
      timeout: 0,
      actionProps: {
        children: 'Authorize',
        onClick: () => {
          window.open(error.authorizationUrl, '_blank', 'noreferrer')
          toast.close(id)
        },
      },
    })
    return
  }

  toast.add({
    title,
    description: error instanceof Error ? error.message : String(error),
    type: 'error',
  })
}
