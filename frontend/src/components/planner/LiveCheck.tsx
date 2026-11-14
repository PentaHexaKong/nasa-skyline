import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { ArrowsClockwiseIcon, CloudCheckIcon, CloudSlashIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import type { Plan } from '~/components/planner/plan'
import { shortName } from '~/lib/mission'
import { API_URL, buildRequest, checkHealth, evaluateAll, type LiveReading } from '~/lib/missionScience'

type Row = { state: 'waiting' } | { state: 'done'; reading: LiveReading } | { state: 'error'; error: string }

const pct = (x: number) => `${(x * 100).toFixed(1)} %`
const hours = (h: number, open: boolean) => `${h.toFixed(1)} h${open ? ' +' : ''}`

/**
 * The same landing, sent through the backend (`/api/mission-science`) to the mission-science service and read back. The service
 * computes the stay on its own, from the pinned SPICE kernels and LOLA grids, with its own resolution and frame; its
 * answer sits beside the pipeline's numbers, never in their place. Nothing is sent until the reader asks.
 */
export function LiveCheck({ plan }: { plan: Plan }) {
  const [health, setHealth] = useState<'checking' | 'up' | 'down'>('checking')
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const key = `${plan.window.start}-${plan.window.end}-${plan.sites.map((s) => s.data.site.id).join()}-${JSON.stringify(plan.requirements)}`

  useEffect(() => {
    const c = new AbortController()
    checkHealth(API_URL, c.signal).then((h) => !c.signal.aborted && setHealth(h.reachable ? 'up' : 'down'))
    return () => c.abort()
  }, [])

  // A changed plan makes earlier answers stale: drop them rather than show them against the new stay.
  useEffect(() => {
    abort.current?.abort()
    setRows({})
    setRunning(false)
  }, [key])

  const run = async () => {
    abort.current?.abort()
    const c = new AbortController()
    abort.current = c
    setRunning(true)
    setRows(Object.fromEntries(plan.sites.map((s) => [s.data.site.id, { state: 'waiting' } as Row])))
    try {
      await evaluateAll(
        plan.sites.map((s) => s.data),
        plan.window,
        plan.requirements,
        (id, r) =>
          setRows((prev) => ({ ...prev, [id]: 'error' in r ? { state: 'error', error: r.error } : { state: 'done', reading: r } })),
        API_URL,
        c.signal,
      )
    } catch {
      // Aborted by a newer run or a changed plan.
    }
    if (!c.signal.aborted) setRunning(false)
  }

  const sample = plan.sites[0] && buildRequest(plan.sites[0].data, plan.window, plan.requirements)

  return (
    <section aria-labelledby="live-check" className="grid gap-4 rounded-lg border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-[64ch] gap-1">
          <h2 id="live-check" className="flex items-center gap-2 text-lg font-medium">
            {health === 'up' ? (
              <CloudCheckIcon aria-hidden className="text-go" />
            ) : (
              <CloudSlashIcon aria-hidden className="text-ink-faint" />
            )}
            Live check
          </h2>
          <p className="text-sm text-ink-muted text-pretty">
            {health === 'checking'
              ? 'Looking for the service…'
              : health === 'up'
                ? 'Recompute this stay on the mission-science service and compare it with the numbers above.'
                : `Service offline at ${API_URL}. The numbers above come from the pipeline’s files and don’t need it.`}
          </p>
        </div>
        <button
          type="button"
          disabled={health !== 'up' || running}
          onClick={run}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 font-medium hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowsClockwiseIcon aria-hidden className={running ? 'animate-spin' : ''} />
          {running ? 'Computing…' : Object.keys(rows).length ? 'Run again' : 'Compute live'}
        </button>
      </div>
      {Object.keys(rows).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-ink-muted">
                <th className="pb-2 text-left font-normal">Site</th>
                <th className="pb-2 text-right font-normal">Sun in view</th>
                <th className="pb-2 text-right font-normal">Longest without Sun</th>
                <th className="pb-2 text-right font-normal">Earth in view</th>
                <th className="pb-2 text-right font-normal">Longest without Earth</th>
                <th className="pb-2 pl-3 text-left font-normal">Source</th>
              </tr>
            </thead>
            <tbody className="readout">
              {plan.sites.map((s) => {
                const row = rows[s.data.site.id]
                const stay = s.stay
                return [
                  <tr key={`${s.data.site.id}-pipe`} className="border-t border-line">
                    <td className="py-1.5 font-sans" rowSpan={2}>
                      {shortName(s.data)}
                    </td>
                    <td className="py-1.5 text-right">{stay ? pct(stay.sunShare) : 'not computed'}</td>
                    <td className="py-1.5 text-right">{stay ? hours(stay.noSun.hours, stay.noSun.truncated) : '—'}</td>
                    <td className="py-1.5 text-right">{stay ? pct(stay.earthShare) : '—'}</td>
                    <td className="py-1.5 text-right">{stay ? hours(stay.noEarth.hours, stay.noEarth.truncated) : '—'}</td>
                    <td className="py-1.5 pl-3 font-sans text-xs text-ink-muted">
                      Pipeline file, algorithm {s.data.provenance.algorithm_version}
                    </td>
                  </tr>,
                  <tr key={`${s.data.site.id}-live`} className="text-ink">
                    {row?.state === 'done' ? (
                      <>
                        <td className="py-1.5 text-right">{pct(row.reading.sunShare)}</td>
                        <td className="py-1.5 text-right">{hours(row.reading.noSun.hours, row.reading.noSun.truncated)}</td>
                        <td className="py-1.5 text-right">{pct(row.reading.earthShare)}</td>
                        <td className="py-1.5 text-right">{hours(row.reading.noEarth.hours, row.reading.noEarth.truncated)}</td>
                        <td className="py-1.5 pl-3 font-sans text-xs text-go">
                          Live: service {row.reading.serviceSite}, engine {row.reading.provenance.engine}, algorithm{' '}
                          {row.reading.provenance.algorithm}
                        </td>
                      </>
                    ) : (
                      <td colSpan={5} className="py-1.5 font-sans text-xs text-ink-muted">
                        {row?.state === 'error' ? `Live: ${row.error}` : 'Live: waiting for the service…'}
                      </td>
                    )}
                  </tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
      <Collapsible.Root>
        <Collapsible.DefaultTrigger>What is sent, and why the two can differ</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="grid max-w-[80ch] gap-3 text-sm text-ink-muted">
            <p>
              One request per site through the backend (POST /api/mission-science/v1/scientific-evaluations), one after another, since the
              service evaluates one at a time. The same rules as above: a partly visible Sun counts as in view, Earth counts when its centre
              clears the skyline, no atmosphere, [start, end) in UTC. Your limits travel as the request’s constraints.
            </p>
            <p>
              The two are computed independently. The service reads the 80 m LOLA grid in the DE421 Moon frame and searches hourly, refining
              each event to 1 s; the pipeline uses the 20 m grid near the site and the DE440 ME frame. Small differences near an event are
              expected. Neither is delivered power or a working radio link.
            </p>
            {Object.values(rows).some((r) => r.state === 'done') && (
              <ul className="grid gap-1 text-xs">
                {Object.values(rows).flatMap((r) =>
                  r.state === 'done'
                    ? [
                        <li key={r.reading.siteId}>
                          {r.reading.serviceSite}: {r.reading.provenance.execution}, computed{' '}
                          {r.reading.provenance.computedAt ?? 'time not given'}, DEMs {r.reading.provenance.dems.join(', ')}, kernels{' '}
                          {r.reading.provenance.kernels.join(', ')}.
                          {r.reading.possibleMissedEvents && ' The service notes that events shorter than its search step could be missed.'}
                          {!r.reading.provenance.validated && ' Not independently validated.'}
                        </li>,
                      ]
                    : [],
                )}
              </ul>
            )}
            {sample && (
              <pre className="overflow-x-auto rounded-md bg-surface p-3 font-mono text-xs text-ink">{JSON.stringify(sample, null, 2)}</pre>
            )}
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </section>
  )
}
