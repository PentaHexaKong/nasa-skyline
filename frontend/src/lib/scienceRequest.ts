import { API_URL } from './missionScience'

const inflight = new Map<string, Promise<unknown>>()
const RETRY_MS = 5000
const ATTEMPTS = 12

const isBusy = (body: unknown) => {
  const error = (body as { error?: { code?: string; message?: string } } | null)?.error
  return error?.code === 'busy' || /\bbusy\b/i.test(error?.message ?? '')
}

async function post(path: string, body: unknown): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const reply: unknown = await response.json().catch(() => null)
    // A reply that isn't JSON (a 404 from an older backend, a proxy error page) has nothing to parse: say what happened.
    if (reply === null)
      throw new Error(response.ok ? 'The service sent back an unreadable reply.' : `The service answered HTTP ${response.status}.`)
    if (!isBusy(reply) || attempt === ATTEMPTS) return reply
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
  }
}

/**
 * POSTs to a science service through the gateway. The rover and relay services admit one evaluation at a time and turn
 * the rest away as busy, so the same request from two places on the page shares one call, and a busy reply (another
 * viewer's evaluation) is retried for about a minute. Not aborted on unmount: abandoning the HTTP call would not stop the
 * evaluation, it would only make the next caller wait for it.
 */
export function postScience(path: string, body: unknown): Promise<unknown> {
  const key = `${path} ${JSON.stringify(body)}`
  let pending = inflight.get(key)
  if (!pending) {
    pending = post(path, body).finally(() => inflight.delete(key))
    inflight.set(key, pending)
  }
  return pending
}
