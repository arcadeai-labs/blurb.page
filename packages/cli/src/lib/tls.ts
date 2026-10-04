import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getCACertificates, setDefaultCACertificates } from 'node:tls'

const CA_PATH = join(homedir(), '.portless', 'ca.pem')

let trusted = false

/**
 * portless terminates TLS with its own CA, which Node does not read from the
 * system trust store. Adding it to the default CA list lets `fetch` talk to
 * `https://*.localhost` without disabling verification.
 */
export function trustPortlessCa() {
  if (trusted) {
    return
  }
  trusted = true

  let ca: string
  try {
    ca = readFileSync(CA_PATH, 'utf8')
  } catch {
    // portless has not generated a CA yet; nothing to trust.
    return
  }

  setDefaultCACertificates([...getCACertificates(), ca])
}
