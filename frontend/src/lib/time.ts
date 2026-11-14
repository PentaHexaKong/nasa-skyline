import type { Track } from './data'

const DAY_MS = 86_400_000

/** Sun position at minute `t` of the UTC day, linearly interpolated between stored track samples (10 min apart). */
export function sunAt(track: Track | undefined, t: number) {
  if (!track || track.t_min.length === 0) return undefined
  const ts = track.t_min
  const i = ts.findIndex((x) => x >= t)
  if (i === -1 || (i === 0 && (ts[0] ?? 0) > t)) {
    // Outside the stored samples: the Sun is below about -1 deg, so it is night.
    return undefined
  }
  const j = i === 0 ? 0 : i - 1
  const a = ts[j] ?? 0
  const b = ts[i] ?? a
  // A gap wider than two samples means the Sun set and rose in between.
  if (b - a > 25) return undefined
  const f = b === a ? 0 : (t - a) / (b - a)
  const lerp = (v: number[]) => (v[j] ?? 0) + ((v[i] ?? 0) - (v[j] ?? 0)) * f
  const azA = track.az_deg[j] ?? 0
  let azB = track.az_deg[i] ?? azA
  if (azB - azA > 180) azB -= 360
  if (azA - azB > 180) azB += 360
  return {
    az: (((azA + (azB - azA) * f) % 360) + 360) % 360,
    el: lerp(track.el_deg),
    fraction: Math.max(0, Math.min(1, lerp(track.direct_fraction))),
  }
}

/** Minute of the day with the highest Sun, as a sensible default moment. */
export function peakMinute(track: Track | undefined) {
  if (!track || track.el_deg.length === 0) return 720
  const i = track.el_deg.indexOf(Math.max(...track.el_deg))
  return track.t_min[i] ?? 720
}

export type SunState = {
  /** True when any part of the disk is above the terrain skyline. */
  inSun: boolean
  /** Next change of state (terrain sunset if in sun, terrain sunrise if not), or undefined if none in the data. */
  next?: Date
  /** Milliseconds until `next`. */
  inMs?: number
}

/** Direct-sun state at an instant, from the pipeline's 1 s intervals. Intervals are [start, end) and sorted. */
/** When the computed data stops, exclusive. An interval ending here was cut off by the data, not by the Sun or Earth setting. */
export const dataEnd = (params: { start: string; days: number }) => Date.parse(`${params.start}T00:00:00Z`) + params.days * 86_400_000

export function sunStateAt(intervals: [string, string][], at: Date, end: number): SunState {
  const t = at.getTime()
  for (const [a, b] of intervals) {
    const start = Date.parse(a)
    const stop = Date.parse(b)
    if (t < start) return { inSun: false, next: new Date(start), inMs: start - t }
    if (t < stop) return stop >= end ? { inSun: true } : { inSun: true, next: new Date(stop), inMs: stop - t }
  }
  return { inSun: false }
}

export function instant(date: string, minute: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + Math.round(minute * 60_000))
}

/** "2 h 14 min", "3 d 4 h", "45 s". */
export function duration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** A length of time given in minutes: "32 min", "9 h 50 min". */
export const minutes = (min: number) => (Math.round(min) < 1 ? '0 min' : duration(Math.round(min) * 60_000))

export const clock = (d: Date) => d.toISOString().slice(11, 16)

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const minuteLabel = (m: number) => {
  const r = Math.round(m)
  return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
}

export const isoDay = (ms: number) => new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10)
