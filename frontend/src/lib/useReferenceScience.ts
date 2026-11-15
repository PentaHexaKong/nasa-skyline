import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReferenceSite } from './data'
import { type PlannerRow, runPlannerRequests } from './dynamicPlanner'
import { buildRequest } from './missionScience'
import {
  annualWindows,
  evaluateReference,
  queueReference,
  type ReferenceData,
  type ReferenceState,
  referenceInitial,
  referenceRequest,
  referenceSource,
  utcDayMs,
} from './referenceScience'

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

export function useReferenceInstant(site: ReferenceSite, date: string, minute: number, enabled: boolean, attempt: number): PlannerRow {
  const start = Date.parse(`${date}T00:00:00Z`) + minute * 60000
  const requestKey = JSON.stringify(
    buildRequest(site, { start, end: start + 60000 }, { minSun: 0, minEarth: 0, maxNoSun: 8760, maxNoEarth: 8760 }),
  )
  const request = useMemo(() => JSON.parse(requestKey) as ReturnType<typeof buildRequest>, [requestKey])
  const key = `${requestKey}-${enabled}-${attempt}`
  const [result, setResult] = useState<{ key: string; row: PlannerRow } | null>(null)
  useEffect(() => {
    if (!enabled || !request) return
    let current = true
    const timer = setTimeout(() => {
      void queueReference(
        async () => {
          await runPlannerRequests(
            [{ siteId: site.site.id, request }],
            (_, row) => {
              if (current) setResult({ key, row })
            },
            () => current,
          )
        },
        () => current,
      ).catch((error) => {
        if (current) setResult({ key, row: failure(error) })
      })
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [key, request, enabled, site.site.id])
  if (result?.key === key) return result.row
  const initial = referenceInitial(site)
  return initial.state === 'computed' ? { state: 'loading', message: 'Evaluating the selected UTC instant.' } : initial
}

export type AnnualReference = {
  state: 'loading' | 'computed' | 'unsupported' | 'not_computed' | 'failed' | 'unavailable'
  chunks: ReferenceData[]
  total: number
  message: string
}

export function useAnnualReference(site: ReferenceSite, year: number, enabled: boolean, attempt: number) {
  const windows = useMemo(() => (year >= 1 && year <= 9998 ? annualWindows(year) : []), [year])
  const inputKey = JSON.stringify(windows.map((window) => referenceRequest(site, window.start, window.end)))
  const requests = useMemo(() => JSON.parse(inputKey) as ReturnType<typeof referenceRequest>[], [inputKey])
  const key = `${inputKey}-${enabled}-${attempt}`
  const [result, setResult] = useState<{ key: string; value: AnnualReference } | null>(null)
  const cancel = useRef<() => void>(() => {})
  useEffect(() => {
    if (!enabled || requests.length === 0 || requests.some((request) => !request)) return
    let current = true
    const chunks: ReferenceData[] = []
    cancel.current = () => {
      current = false
      setResult((previous) =>
        previous?.key === key
          ? {
              key,
              value: {
                ...previous.value,
                state: 'not_computed',
                message: 'Annual evaluation stopped. Completed windows retain their provenance.',
              },
            }
          : previous,
      )
    }
    const publish = (state: AnnualReference['state'], message: string) => {
      if (current) setResult({ key, value: { state, chunks: [...chunks], total: requests.length, message } })
    }
    const run = async () => {
      try {
        for (const request of requests) {
          if (!current) return
          const row = await queueReference(
            () => evaluateReference(request!),
            () => current,
            true,
          )
          if (!current || !row) return
          if (row.state !== 'computed') {
            publish(row.state, row.message)
            return
          }
          if (
            chunks.length &&
            (referenceSource(chunks[0]!.response) !== referenceSource(row.data.response) ||
              chunks.at(-1)!.window.endEt !== row.data.window.startEt)
          ) {
            chunks.length = 0
            publish('failed', 'Scientific source identities changed during the year. Re-evaluate to obtain a consistent report.')
            return
          }
          chunks.push(row.data)
          publish(chunks.length === requests.length ? 'computed' : 'loading', 'Evaluating bounded UTC windows with the scientific engine.')
        }
      } catch (error) {
        publish('failed', failure(error).message)
      }
    }
    const timer = setTimeout(() => {
      void run()
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [key, requests, enabled])
  const initial = referenceInitial(site)
  const value: AnnualReference =
    result?.key === key
      ? result.value
      : {
          state: initial.state === 'computed' ? 'loading' : initial.state,
          chunks: [],
          total: requests.length,
          message: initial.state === 'computed' ? 'Preparing annual evaluation.' : initial.message,
        }
  return {
    ...value,
    ...(requests.length === 0
      ? {
          state: 'unsupported' as const,
          message: 'Choose a valid UTC calendar year. Kernel coverage is checked during scientific evaluation.',
        }
      : {}),
    stop: () => cancel.current(),
  }
}
