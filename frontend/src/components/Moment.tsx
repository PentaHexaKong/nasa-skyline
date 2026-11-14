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

/** "Earthset in 2 d 4 h" / "Earthrise in 9 h 12 min", from the Earth visibility intervals (O4). */
export function NextEarth({ data, at }: { data: Summary; at: Date }) {
  const state = sunStateAt(data.earth_intervals ?? [], at, dataEnd(data.params))
  if (!state.next || state.inMs == null) {
    return <p className="text-base text-ink-muted">No {state.inSun ? 'Earthset' : 'Earthrise'} within the computed year.</p>
  }
  return (
    <p className="text-base">
      <span className="text-ink-muted">{state.inSun ? 'Earthset in ' : 'Earthrise in '}</span>
      <span className="tabular font-medium">{duration(state.inMs)}</span>
    </p>
  )
}

/** "Terrain sunset in 2 h 14 min" / "Direct sun returns in 89 d 3 h": the operational number (C6, O4). */
export function NextChange({ m, compact = false }: { m: Moment; compact?: boolean }) {
  const { state } = m
  if (!state.next || state.inMs == null) {
    return <p className="text-base text-ink-muted">No {state.inSun ? 'terrain sunset' : 'direct sun'} within the computed year.</p>
  }
  const when = `${clock(state.next)} UTC${state.inMs > 86_400_000 ? `, ${shortDate(state.next.toISOString().slice(0, 10))}` : ''}`
  return (
    <div className={compact ? '' : 'grid gap-0.5'}>
      <p className="text-base">
        <span className="text-ink-muted">{state.inSun ? 'Terrain sunset in ' : 'Direct sun returns in '}</span>
        <span className="tabular font-medium">{duration(state.inMs)}</span>
      </p>
      {!compact && <p className="tabular text-xs text-ink-muted">{when}</p>}
    </div>
  )
}
