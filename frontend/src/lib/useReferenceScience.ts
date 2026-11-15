import { useEffect, useMemo, useState } from 'react'
import type { ReferenceSite } from './data'
import { evaluateReference, queueReference, type ReferenceState, referenceInitial, referenceRequest, utcDayMs } from './referenceScience'

const failure = (error: unknown) => ({
  state: 'failed' as const,
  message: error instanceof Error ? error.message : 'Scientific reference evaluation failed.',
})

export function useReferenceWindow(site: ReferenceSite, date: string, enabled: boolean, attempt: number) {
  const start = Date.parse(`${date}T00:00:00Z`)
  const requestKey = JSON.stringify(referenceRequest(site, start, start + utcDayMs, 600))
  const request = useMemo(() => JSON.parse(requestKey) as ReturnType<typeof referenceRequest>, [requestKey])
  const key = `${requestKey}-${enabled}-${attempt}`
  const [result, setResult] = useState<{ key: string; row: ReferenceState } | null>(null)
  const initial = referenceInitial(site)
  useEffect(() => {
    if (!enabled || !request) return
    let current = true
    const timer = setTimeout(() => {
      void queueReference(
        () => evaluateReference(request),
        () => current,
      )
        .then((row) => {
          if (current && row) setResult({ key, row })
        })
        .catch((error) => {
          if (current) setResult({ key, row: failure(error) })
        })
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [key, request, enabled])
  return result?.key === key ? result.row : initial
}
