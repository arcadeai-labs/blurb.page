import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
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

/** The MCP URL, which copies to the clipboard when clicked. */
export function McpUrl() {
  const url = useMcpUrl()
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
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch (error) {
      toast.add({
        title: 'Could not copy the MCP URL',
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      })
    }
  }

  return (
    <InputGroup className="hidden w-64 md:flex">
      <InputGroupInput
        readOnly
        value={url}
        aria-label="MCP URL"
        className="cursor-pointer font-mono"
        onClick={copy}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={copied ? 'Copied' : 'Copy MCP URL'}
          onClick={copy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
