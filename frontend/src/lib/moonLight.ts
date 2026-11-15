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

const MOON_R_KM = 1737.4
// ponytail: mean Earth distance; the true one swings 363k–405k km, under 0.03° of parallax change at the site.
const EARTH_KM = 384_400

export type SkyPoint = { az: number; el: number }

/**
 * Azimuth (from north, clockwise) and elevation above the flat horizon of a site, toward a sub-point. With `km` the
 * body is that far from the Moon's centre and the site's offset from the centre (parallax) is taken out.
 */
export function skyAt(site: { lat: number; lon: number }, sub: { lat: number; lon: number }, km = Number.POSITIVE_INFINITY) {
  const r = Math.PI / 180
  const up = dir(site.lat, site.lon)
  const [sl, cl] = [Math.sin(site.lon * r), Math.cos(site.lon * r)]
  const east = [-sl, cl, 0]
  const north = [-Math.sin(site.lat * r) * cl, -Math.sin(site.lat * r) * sl, Math.cos(site.lat * r)]
  let v = dir(sub.lat, sub.lon)
  if (Number.isFinite(km)) v = v.map((c, i) => c * km - (up[i] ?? 0) * MOON_R_KM) as typeof v
  const dot = (a: number[]) => a[0]! * v[0] + a[1]! * v[1] + a[2]! * v[2]
  const len = Math.hypot(...v)
  return {
    az: (((Math.atan2(dot(east), dot(north)) / r) % 360) + 360) % 360,
    el: Math.asin(dot(up) / len) / r,
  }
}

/** Hours from the ephemeris start to a UTC date and minute. */
export const hoursAt = (e: MoonEphemeris, date: string, minute: number) =>
  (Date.parse(`${date}T00:00:00Z`) - Date.parse(e.start.length === 10 ? `${e.start}T00:00:00Z` : e.start)) / 3_600_000 + minute / 60

/**
 * The Sun's and Earth's paths over one synodic month centred on `hours`, sampled hourly: a whole lunar day and night,
 * including the stretches below the horizon that the per-day tracks leave out.
 */
export function orbitSky(e: MoonEphemeris, site: { lat: number; lon: number }, hours: number) {
  const max = ephemerisHours(e)
  const from = Math.max(0, Math.min(max - SYNODIC_HOURS, hours - SYNODIC_HOURS / 2))
  const sun: SkyPoint[] = []
  const earth: SkyPoint[] = []
  for (let h = from; h <= Math.min(max, from + SYNODIC_HOURS); h += 1) {
    const p = subPoints(e, h)
    sun.push(skyAt(site, p.sun))
    earth.push(skyAt(site, p.earth, EARTH_KM))
  }
  return { from, sun, earth }
}

/** The Sun and Earth at one moment, for when no stored track covers it (the Sun far below the horizon at night). */
export function skyNow(e: MoonEphemeris, site: { lat: number; lon: number }, hours: number) {
  const p = subPoints(e, hours)
  return { sun: skyAt(site, p.sun), earth: skyAt(site, p.earth, EARTH_KM) }
}
