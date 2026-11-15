import { ArrowsClockwiseIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { useHydrated } from '@tanstack/react-router'
import { useState } from 'react'
import { Eyebrow } from '~/components/Shell'
import type { Day, Summary } from '~/lib/data'
import { readableReason } from '~/lib/dynamicPlanner'
import { shortDate } from '~/lib/time'
import { useReferenceWindow } from '~/lib/useReferenceScience'

const pct = (x: number) => `${(x * 100).toFixed(1)} %`

/**
 * The selected UTC day recomputed by the mission-science engine, beside the precomputed file's numbers for the same day.
 * The page itself never waits on it: without the engine, this section says so and everything above still stands.
 */
export function LiveDay({ data, day }: { data: Summary; day: Day }) {
  const hydrated = useHydrated()
  const [attempt, setAttempt] = useState(0)
  const row = useReferenceWindow(data, day.date, hydrated, attempt)
  const result = row.state === 'computed' ? row.data.response.result : null
  const busy = row.state === 'loading' || !hydrated
  const rows: [string, string, string][] = [
    ['Sun in view', pct(day.direct_min / 1440), result ? pct(result.metrics.sunlightAvailabilityFraction) : '—'],
    [
      'Earth in view',
      day.earth_min === undefined ? 'Not computed' : pct(day.earth_min / 1440),
      result ? pct(result.metrics.directEarthAvailabilityFraction) : '—',
    ],
  ]
  const status = busy
    ? 'Asking the live engine about this day…'
    : row.state === 'computed'
      ? `Computed live for ${shortDate(day.date)}, 00:00 to 24:00 UTC, from pinned SPICE kernels and the 80 m LOLA grid.`
      : row.state === 'unsupported'
        ? 'The live engine doesn’t cover this site yet. Everything above comes from its precomputed file.'
        : `The live engine couldn’t check this day (${readableReason(row.message)}). Everything above comes from the precomputed file.`

  return (
    <section aria-labelledby="live-day-h" aria-busy={busy} className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid gap-2">
          <Eyebrow pip>Live engine</Eyebrow>
          <h2 id="live-day-h" className="text-2xl font-medium">
            {shortDate(day.date)}, recomputed live
          </h2>
          <p aria-live="polite" className="flex max-w-[68ch] items-start gap-2 text-sm text-ink-muted text-pretty">
            {busy && (
              <span className="flex h-lh items-center">
                <CircleNotchIcon aria-hidden className="animate-spin" />
              </span>
            )}
            {status}
          </p>
        </div>
        {row.state !== 'unsupported' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAttempt((n) => n + 1)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowsClockwiseIcon aria-hidden className={busy ? 'animate-spin' : ''} />
            {busy ? 'Checking…' : 'Check again'}
          </button>
        )}
      </div>
      {row.state !== 'unsupported' && (
        <div className="overflow-x-auto">
          <table className="w-full max-w-[44rem] min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-ink-muted">
                <th className="pb-2 text-left font-normal">This UTC day</th>
                <th className="pb-2 text-right font-normal">Precomputed file</th>
                <th className="pb-2 text-right font-normal">Live engine</th>
              </tr>
            </thead>
            <tbody className="readout">
              {rows.map(([label, file, live]) => (
                <tr key={label} className="border-t border-line">
                  <td className="py-1.5 font-sans">{label}</td>
                  <td className="py-1.5 text-right text-ink-muted">{file}</td>
                  <td className={`py-1.5 text-right ${result ? '' : 'text-ink-faint'}`}>{busy ? '…' : live}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result && (
        <p className="max-w-[72ch] text-xs text-ink-faint text-pretty">
          The file was made with pipeline {data.provenance.algorithm_version} on the 20 m grid near the site; the engine uses the 80 m grid,
          the DE421 Moon frame and events refined to {result.sunlightIntervals.detection.numericalRootToleranceS} s. Small differences near
          sunrise, sunset and Earthset are expected. Neither is delivered power or a working radio link.
        </p>
      )}
    </section>
  )
}
