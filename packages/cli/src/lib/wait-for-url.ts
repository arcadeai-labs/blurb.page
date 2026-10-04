import { setTimeout as delay } from 'node:timers/promises'
import { trustPortlessCa } from './tls.ts'

export type WaitForUrlOptions = {
  timeoutMs?: number
  intervalMs?: number
  signal?: AbortSignal
}

/**
 * Polls `url` until the proxy has a live upstream behind it. portless answers
 * with 404/502 while the dev server is still booting, so only a successful
 * response counts as ready.
 */
export async function waitForUrl(
  url: string,
  { timeoutMs = 120_000, intervalMs = 500, signal }: WaitForUrlOptions = {},
): Promise<boolean> {
  trustPortlessCa()

  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return false
    }

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(Math.min(intervalMs * 10, 10_000)),
      })
      if (response.ok) {
        return true
      }
    } catch {
      // Proxy or dev server is not answering yet; keep polling.
    }

    try {
      await delay(intervalMs, undefined, { signal })
    } catch {
      return false
    }
  }

  return false
}
