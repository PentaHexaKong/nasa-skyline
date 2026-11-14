import { scaleLinear } from 'd3-scale'
import { type KeyboardEvent, type MouseEvent, useState } from 'react'
import type { LandingRun, LandingStatus } from '~/lib/mission'
import { longDate } from '~/lib/time'
import { useWidth } from '~/lib/useWidth'

const ROW = 26
const GAP = 10
const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }

const STATUS_WORD: Record<LandingStatus, string> = {
  go: 'works',
  arrive: 'stay misses a requirement',
  no: 'Sun or Earth hidden',
  outside: 'not computed',
}

export type LandingRow = { id: string; label: string; runs: LandingRun[] }

/**
 * Sites as rows, landing days as columns. Status reads from shape: a full bar, a half-height bar or an empty track. A day
 * that works is the only one in colour, the Sun's amber over Earth's cyan: both are in view at touchdown.
 */
export function LandingStrip({
  dates,
  rows,
  selected,
  onSelect,
}: {
  dates: string[]
  rows: LandingRow[]
  selected: number
  onSelect: (i: number) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const narrow = width < 640
  const M = { t: 4, r: 4, b: 22, l: narrow ? 92 : 148 }
  const n = dates.length
  const height = M.t + rows.length * (ROW + GAP) - GAP + M.b
  const x = scaleLinear([0, n], [M.l, width - M.r])
  const bw = Math.max(0.5, x(1) - x(0))
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i))
  const [hover, setHover] = useState<number | null>(null)
  const dayAt = (e: MouseEvent<HTMLDivElement>) => {
    const left = e.clientX - e.currentTarget.getBoundingClientRect().left
    return left >= M.l ? clamp(Math.floor(x.invert(left))) : null
  }
  const pick = (e: MouseEvent<HTMLDivElement>) => {
    const day = dayAt(e)
    if (day != null) onSelect(day)
  }
  const onKey = (e: KeyboardEvent) => {
    const step = KEYS[e.key]
    if (step) {
      e.preventDefault()
      onSelect(clamp(selected + step))
    }
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Landing day, compared across sites"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={selected}
      aria-valuetext={dates[selected]}
      onKeyDown={onKey}
      onClick={pick}
      onMouseMove={(e) => setHover(dayAt(e))}
      onMouseLeave={() => setHover(null)}
      className="relative cursor-pointer rounded-sm"
    >
      <svg height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block w-full overflow-visible text-xs">
        {dates.map((d, i) =>
          d.endsWith('-01') && (!narrow || Number(d.slice(5, 7)) % 3 === 1) ? (
            <g key={d} className="font-mono text-2xs">
              <line x1={x(i)} x2={x(i)} y1={M.t} y2={height - M.b + 4} className="stroke-line" />
              <text x={x(i) + 3} y={height - 6} className="fill-ink-faint">
                {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
              </text>
            </g>
          ) : null,
        )}
        {rows.map((row, r) => {
          const y0 = M.t + r * (ROW + GAP)
          return (
            <g key={row.id}>
              <text x={0} y={y0 + ROW / 2 + 4} className="fill-ink-muted">
                {row.label}
              </text>
              <rect x={M.l} y={y0} width={width - M.l - M.r} height={ROW} className="fill-surface" />
              {row.runs.map((run) =>
                run.status === 'go' ? (
                  <g key={run.from}>
                    <rect x={x(run.from)} y={y0} width={x(run.to) - x(run.from)} height={ROW / 2} className="fill-sun" />
                    <rect x={x(run.from)} y={y0 + ROW / 2} width={x(run.to) - x(run.from)} height={ROW / 2} className="fill-comms" />
                  </g>
                ) : run.status === 'arrive' ? (
                  <rect
                    key={run.from}
                    x={x(run.from)}
                    y={y0 + ROW / 4}
                    width={x(run.to) - x(run.from)}
                    height={ROW / 2}
                    className="fill-line-strong"
                  />
                ) : null,
              )}
            </g>
          )
        })}
        <line
          x1={x(selected) + bw / 2}
          x2={x(selected) + bw / 2}
          y1={M.t - 4}
          y2={height - M.b + 4}
          className="stroke-now"
          strokeWidth={1.5}
        />
      </svg>
      {hover != null && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-full z-(--z-sticky) mb-1 rounded-sm bg-surface-raised px-2.5 py-1.5 text-xs whitespace-nowrap ring ring-line-strong"
          style={x(hover) > width / 2 ? { right: width - x(hover) } : { left: x(hover) }}
        >
          <p className="tabular font-medium">{longDate(dates[hover] ?? '')}</p>
          {rows.map((row) => (
            <p key={row.id} className="text-ink-muted">
              {row.label}: {STATUS_WORD[row.runs.find((run) => hover >= run.from && hover < run.to)?.status ?? 'outside']}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
