import { expect, test } from 'vitest'
import apolloSite from '../../data/apollo11.json'
import ridgeSite from '../../data/connecting-ridge.json'
import apollo from '../data/generated/apollo11.tracks.json'
import ridge from '../data/generated/connecting-ridge.tracks.json'
import ephemeris from '../data/generated/moon/ephemeris.json'
import { MoonEphemerisSchema, TrackSchema } from './data'
import { hoursAt, orbitSky, SYNODIC_HOURS, skyNow } from './moonLight'

const eph = MoonEphemerisSchema.parse(ephemeris)
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

test.each([
  ['connecting-ridge', ridge, ridgeSite.site],
  ['apollo11', apollo, apolloSite.site],
])('the ephemeris sky matches the pipeline track at %s', (_, tracks, s) => {
  const site = { lat: s.lat_deg, lon: s.lon_deg_east }
  let checked = 0
  for (const [date, raw] of Object.entries(tracks).slice(0, 40)) {
    const t = TrackSchema.parse(raw)
    for (let i = 0; i < t.t_min.length; i += 36) {
      const at = skyNow(eph, site, hoursAt(eph, date, t.t_min[i] ?? 0))
      expect(Math.abs(at.sun.el - (t.el_deg[i] ?? 0))).toBeLessThan(0.15)
      // Azimuth is meaningless with the Sun near the zenith.
      if ((t.el_deg[i] ?? 0) < 80) expect(angle(at.sun.az, t.az_deg[i] ?? 0)).toBeLessThan(0.5)
      checked++
    }
    const e = t.earth
    if (e) {
      const at = skyNow(eph, site, hoursAt(eph, date, e.t_min[0] ?? 0))
      expect(Math.abs(at.earth.el - (e.el_deg[0] ?? 0))).toBeLessThan(0.15)
      expect(angle(at.earth.az, e.az_deg[0] ?? 0)).toBeLessThan(0.5)
    }
  }
  expect(checked).toBeGreaterThan(20)
})

test('the orbit spans one synodic month, hourly, and the night side of it is below the horizon', () => {
  const o = orbitSky(eph, { lat: apolloSite.site.lat_deg, lon: apolloSite.site.lon_deg_east }, 400)
  expect(o.sun.length).toBe(Math.floor(SYNODIC_HOURS) + 1)
  expect(Math.min(...o.sun.map((p) => p.el))).toBeLessThan(-60)
  expect(Math.max(...o.sun.map((p) => p.el))).toBeGreaterThan(60)
})
