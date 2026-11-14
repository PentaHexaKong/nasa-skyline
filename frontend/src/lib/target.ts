import { horizonAt } from '~/components/Moment'
import type { SkyTarget, Summary, Track } from './data'
import { dataEnd, instant, sunStateAt } from './time'

/** Earth's position at `minute`, linear between hourly samples; azimuth interpolated the short way round. */
function earthAt(e: NonNullable<Track['earth']>, minute: number) {
  const ts = e.t_min
  if (ts.length === 0) return undefined
  let i = ts.findIndex((t) => t >= minute)
  if (i === -1) i = ts.length - 1
  const j = Math.max(0, i - 1)
  const a = ts[j] ?? 0
  const b = ts[i] ?? a
  const f = b === a ? 0 : Math.min(1, Math.max(0, (minute - a) / (b - a)))
  const azA = e.az_deg[j] ?? 0
  let azB = e.az_deg[i] ?? azA
  if (azB - azA > 180) azB -= 360
  if (azA - azB > 180) azB += 360
  const elA = e.el_deg[j] ?? 0
  return { az: (((azA + (azB - azA) * f) % 360) + 360) % 360, el: elA + ((e.el_deg[i] ?? elA) - elA) * f }
}

/** Earth as the comms target: its path today, and whether it is in view now (from the 1 s intervals). */
export function earthTarget(data: Summary, track: Track | undefined, date: string, minute: number): SkyTarget | undefined {
  const e = track?.earth
  const now = e && earthAt(e, minute)
  if (!e || !now || !data.earth_intervals) return undefined
  const sky = data.skyline.elevation_deg
  const step = data.skyline.az_step_deg
  const clearance = (az: number, el: number) => el - horizonAt(sky, step, az)
  return {
    kind: 'earth',
    label: 'Earth',
    margin_deg: 0,
    arc: e.t_min.map((_, i) => {
      const az = e.az_deg[i] ?? 0
      const el = e.el_deg[i] ?? 0
      return { az_deg: az, el_deg: el, clearance_deg: clearance(az, el) }
    }),
    reference: {
      name: 'Earth',
      az_deg: now.az,
      el_deg: now.el,
      clearance_deg: clearance(now.az, now.el),
      visible: sunStateAt(data.earth_intervals, instant(date, minute), dataEnd(data.params)).inSun,
    },
    lane: daySpans(data.earth_intervals, date),
  }
}

/** The parts of a UTC day covered by [start, end) intervals, in minutes from midnight. */
export function daySpans(intervals: [string, string][], date: string): [number, number][] {
  const d0 = Date.parse(`${date}T00:00:00Z`)
  const d1 = d0 + 86_400_000
  return intervals.flatMap(([a, b]) => {
    const s = Math.max(d0, Date.parse(a))
    const e = Math.min(d1, Date.parse(b))
    return e > s ? [[(s - d0) / 60_000, (e - d0) / 60_000] as [number, number]] : []
  })
}
