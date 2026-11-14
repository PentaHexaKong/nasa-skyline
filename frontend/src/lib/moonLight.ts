import type { MoonEphemeris } from './data'

/**
 * Where the Sun and Earth stand over the Moon at a given hour, from the pipeline's hourly sub-solar and sub-Earth
 * points (SPICE, Moon ME frame). Hours count from `ephemeris.start`.
 */

const DAY_MS = 86_400_000

/** One synodic month (new Moon to new Moon) in hours: after it, the Sun lights the Moon from almost the same side again. */
export const SYNODIC_HOURS = 29.530589 * 24

/** Days covered by the hourly ephemeris, as ISO dates. */
export function windowDays(e: MoonEphemeris) {
  const t0 = Date.parse(e.start.length === 10 ? `${e.start}T00:00:00Z` : e.start)
  const n = Math.floor((e.subsolar_lat_deg.length * e.step_h) / 24)
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * DAY_MS).toISOString().slice(0, 10))
}

/** Hours the ephemeris covers. */
export const ephemerisHours = (e: MoonEphemeris) => (e.subsolar_lat_deg.length - 1) * e.step_h

/** Unit vector for a latitude and east longitude, in a right-handed frame with z north. */
function dir(lat: number, lon: number): [number, number, number] {
  const r = Math.PI / 180
  return [Math.cos(lat * r) * Math.cos(lon * r), Math.cos(lat * r) * Math.sin(lon * r), Math.sin(lat * r)]
}

/** First-visit moment: the hour in the first 30 days when the Sun stands highest over the polar sites, so they are lit. */
export function bestHour(e: MoonEphemeris, sites: { lat: number; lon: number }[]) {
  const polar = sites.filter((s) => s.lat < -60)
  const ref = polar.length > 0 ? polar : sites
  const normals = ref.map((s) => dir(s.lat, s.lon))
  let best = 0
  let score = -2
  for (let i = 0; i < Math.min(e.subsolar_lat_deg.length, (30 * 24) / e.step_h); i++) {
    const sun = dir(e.subsolar_lat_deg[i] ?? 0, e.subsolar_lon_deg_east[i] ?? 0)
    const v = Math.min(...normals.map((n) => n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]))
    if (v > score) {
      score = v
      best = i
    }
  }
  return best * e.step_h
}

/** Interpolates a longitude series across the 0/360 seam. */
function lonAt(series: number[], i: number, f: number) {
  const a = series[i] ?? 0
  let b = series[i + 1] ?? a
  if (b - a > 180) b -= 360
  if (a - b > 180) b += 360
  return (((a + (b - a) * f) % 360) + 360) % 360
}

export type SubPoints = { sun: { lat: number; lon: number }; earth: { lat: number; lon: number } }

/** Sub-solar and sub-Earth points at `hours` after the ephemeris start, clamped to the window and interpolated. */
export function subPoints(e: MoonEphemeris, hours: number): SubPoints {
  const x = Math.max(0, Math.min(e.subsolar_lat_deg.length - 1, hours / e.step_h))
  const i = Math.min(e.subsolar_lat_deg.length - 2, Math.floor(x))
  const f = x - i
  const lat = (s: number[]) => (s[i] ?? 0) + ((s[i + 1] ?? s[i] ?? 0) - (s[i] ?? 0)) * f
  return {
    sun: { lat: lat(e.subsolar_lat_deg), lon: lonAt(e.subsolar_lon_deg_east, i, f) },
    earth: { lat: lat(e.subearth_lat_deg), lon: lonAt(e.subearth_lon_deg_east, i, f) },
  }
}

/** ISO date and minute of day (UTC) at `hours` after the ephemeris start. */
export function whenAt(e: MoonEphemeris, hours: number) {
  const t0 = Date.parse(e.start.length === 10 ? `${e.start}T00:00:00Z` : e.start)
  const at = new Date(t0 + Math.round(hours * 60) * 60_000)
  return { date: at.toISOString().slice(0, 10), minute: at.getUTCHours() * 60 + at.getUTCMinutes() }
}
