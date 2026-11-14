import type { Summary, Track } from '~/lib/data'
import { clock, dataEnd, duration, instant, shortDate, sunAt, sunStateAt } from '~/lib/time'

export function horizonAt(skyline: number[], step: number, az: number) {
  const n = skyline.length
  const f = (((az % 360) + 360) % 360) / step
  const i = Math.floor(f) % n
  const a = skyline[i] ?? 0
  const b = skyline[(i + 1) % n] ?? a
  return a + (b - a) * (f - Math.floor(f))
}

export type Moment = ReturnType<typeof moment>

/** Everything the readouts need for one site at one instant. Positions come from the stored track; states and edges from the 1 s intervals. */
export function moment(data: Summary, track: Track | undefined, date: string, minute: number) {
  const at = instant(date, minute)
  const sun = sunAt(track, minute)
  const horizon = sun ? horizonAt(data.skyline.elevation_deg, data.skyline.az_step_deg, sun.az) : undefined
  const state = sunStateAt(data.intervals, at, dataEnd(data.params))
  const phase: 'sun' | 'shadow' | 'night' | 'loading' = !track
    ? 'loading'
    : state.inSun
      ? 'sun'
      : sun && sun.el > -0.27
        ? 'shadow'
        : 'night'
  return { at, sun, horizon, state, phase }
}

const PHASE = {
  sun: { label: 'In direct sun', dot: 'bg-sun' },
  shadow: { label: 'Sun behind terrain', dot: 'border-[1.5px] border-sun bg-transparent' },
  night: { label: 'Sun below the horizon', dot: 'border-[1.5px] border-ink-faint bg-transparent' },
  loading: { label: 'Loading Sun path', dot: 'bg-line-strong' },
} as const

export function PhaseBadge({ phase }: { phase: Moment['phase'] }) {
  const p = PHASE[phase]
  return (
    <span className="inline-flex items-center gap-2 text-base font-medium">
      <span aria-hidden className={`size-2.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  )
}

export type Readout = { label: string; value: string; sub?: string; tone?: string }

const signedDeg = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`
const deg = (v: number) => `${v.toFixed(1).replace('-', '−')}°`

/** The Sun's height above a flat horizon: the number solar power turns on (C4), with its clearance over the ridge that way. */
export function sunReadout(m: Moment): Readout {
  if (m.phase === 'loading') return { label: 'Sun elevation', value: '…', tone: 'text-sun' }
  if (!m.sun) return { label: 'Sun elevation', value: 'Below −1°', sub: 'Night', tone: 'text-ink-muted' }
  return {
    label: 'Sun elevation',
    value: deg(m.sun.el),
    sub: m.horizon == null ? undefined : `${signedDeg(m.sun.el - m.horizon)} vs the ridge`,
    tone: m.state.inSun ? 'text-sun' : 'text-ink-muted',
  }
}

/** "Terrain sunset · in 2 h 14 min" within two days, else the date it happens (C6, O4). */
export function changeReadout(
  state: Moment['state'],
  [setting, rising]: [string, string] = ['Terrain sunset', 'Direct sun returns'],
): Readout {
  const { next, inMs, inSun } = state
  const label = inSun ? setting : rising
  if (!next || inMs == null)
    return { label, value: 'Not this year', sub: inSun ? 'In view to the end of the data' : 'Hidden to the end of the data' }
  const soon = inMs < 48 * 3_600_000
  return {
    label,
    value: soon ? `in ${duration(inMs)}` : shortDate(next.toISOString().slice(0, 10)),
    sub: soon ? `${clock(next)} UTC` : `in ${duration(inMs)}`,
  }
}

/** Earthset or Earthrise, from the Earth line-of-sight intervals. */
export const earthChangeReadout = (data: Summary, at: Date) =>
  changeReadout(sunStateAt(data.earth_intervals ?? [], at, dataEnd(data.params)), ['Earthset', 'Earthrise'])

/** Label over value over note, in a two-column grid: the Sun row first, then Earth. */
export function Readouts({ items, compact = false }: { items: Readout[]; compact?: boolean }) {
  return (
    <dl className={`grid grid-cols-2 ${compact ? 'gap-x-4 gap-y-3' : 'gap-x-6 gap-y-5 sm:gap-x-10'}`}>
      {items.map((r) => (
        <div key={r.label} className="grid content-start gap-1">
          <dt className="eyebrow text-ink-faint sm:whitespace-nowrap">{r.label}</dt>
          <dd
            className={`readout leading-tight ${compact ? 'text-lg' : 'text-lg sm:text-2xl sm:leading-none sm:whitespace-nowrap'} ${r.tone ?? ''}`}
          >
            {r.value}
          </dd>
          <dd className="readout min-h-[1lh] text-xs font-normal text-ink-faint sm:whitespace-nowrap">{r.sub}</dd>
        </div>
      ))}
    </dl>
  )
}
