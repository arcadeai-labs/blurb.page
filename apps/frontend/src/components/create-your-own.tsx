import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { mcpPath } from '@/lib/mcp'

/** The MCP URL agents connect to; only known in the browser. */
function useMcpUrl() {
  const [url, setUrl] = useState(mcpPath)

  useEffect(() => {
    setUrl(new URL(mcpPath, window.location.href).toString())
  }, [])

  return url
}

/** Copies `value` to the clipboard, and whether it was just copied. */
function useCopy(value: string) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timeout = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeout)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch (error) {
      toast.add({
        title: 'Could not copy the prompt',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      })
    }
  }

  return { copied, copy }
}

/**
 * How to make an app: a prompt that connects an agent to the MCP URL and asks
 * it for one. Clicking anywhere on the card copies it.
 */
export function CreateYourOwn() {
  const prompt = `Set up the blurb.page MCP server at ${useMcpUrl()}, then build me an app that lists my open GitHub pull requests waiting on my review.`
  const { copied, copy } = useCopy(prompt)

  return (
    <button type="button" className="grid text-left" onClick={copy}>
      <Card className="cursor-pointer border border-dashed border-muted-foreground/40 bg-transparent hover:border-muted-foreground">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            Create your own
            <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground [&>svg]:size-3.5">
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? 'Copied' : 'Copy prompt'}
            </span>
          </CardTitle>
          <CardDescription>“{prompt}”</CardDescription>
        </CardHeader>
      </Card>
    </button>
  )
}
