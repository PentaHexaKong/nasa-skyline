import { scaleBand, scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Day } from '~/lib/data'
import { useWidth } from '~/lib/useWidth'

const HEIGHT = 220
const M = { t: 8, r: 8, b: 40, l: 40 }
const STEP_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }

export function YearChart({ days, selected, onSelect }: { days: Day[]; selected: number; onSelect: (index: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const maxMin = Math.ceil(Math.max(...days.map((d) => Math.max(d.daylight_min, d.direct_min))) / 120) * 120
  const x = scaleBand(
    days.map((_, i) => i),
    [M.l, width - M.r],
  )
  const y = scaleLinear([0, maxMin], [HEIGHT - M.b, M.t])
  const bw = x.bandwidth()
  const daylight = line<Day>(
    (_, i) => (x(i) ?? 0) + bw / 2,
    (d) => y(d.daylight_min),
  )
  const clamp = (i: number) => Math.max(0, Math.min(days.length - 1, i))
  const pick = (e: MouseEvent<HTMLDivElement>) => {
    const left = e.currentTarget.getBoundingClientRect().left + M.l
    return clamp(Math.floor(((e.clientX - left) / (width - M.l - M.r)) * days.length))
  }
  const onKey = (e: KeyboardEvent) => {
    const step = STEP_KEYS[e.key]
    if (step) {
      e.preventDefault()
      onSelect(clamp(selected + step))
    }
  }
  const sel = days[selected]

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Day of the year"
      aria-valuemin={0}
      aria-valuemax={days.length - 1}
      aria-valuenow={selected}
      aria-valuetext={sel?.date}
      onKeyDown={onKey}
      onClick={(e) => onSelect(pick(e))}
      className="cursor-pointer rounded-sm"
    >
      <svg height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden className="block w-full overflow-visible font-mono text-2xs">
        {Array.from({ length: Math.floor(maxMin / 240) + 1 }, (_, k) => k * 240).map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} className="stroke-grid" />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-faint">
              {Math.round(v / 60)}h
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x0 = x(i) ?? 0
          return (
            <g key={d.date}>
              {d.date.endsWith('-01') && (width >= 640 || Number(d.date.slice(5, 7)) % 3 === 1) && (
                <>
                  <line x1={x0} x2={x0} y1={M.t} y2={HEIGHT - M.b} className="stroke-grid" />
                  <text x={x0 + 3} y={HEIGHT - 10} className="fill-ink-faint">
                    {new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                  </text>
                </>
              )}
              {d.direct_min > 0 && (
                <rect x={x0} y={y(d.direct_min)} width={bw + 0.5} height={y(0) - y(d.direct_min)} className="fill-sun" />
              )}
              {d.daylight_min > 0 && d.direct_min === 0 && (
                <rect x={x0} y={y(0) + 4} width={Math.max(1, bw)} height={5} className="fill-ink-muted" />
              )}
            </g>
          )
        })}
        <path d={daylight(days) ?? ''} fill="none" className="stroke-ink-muted" strokeWidth={1} />
        <line x1={M.l} x2={width - M.r} y1={y(0)} y2={y(0)} className="stroke-line-strong" />
        <line
          x1={(x(selected) ?? 0) + bw / 2}
          x2={(x(selected) ?? 0) + bw / 2}
          y1={M.t}
          y2={y(0) + 12}
          className="stroke-now"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  )
}
