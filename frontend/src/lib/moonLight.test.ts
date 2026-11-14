import { expect, test } from 'vitest'
import { scrollState, sideOf } from '~/components/ParallaxMoon'
import ephemeris from '../data/generated/moon/ephemeris.json'
import { MoonEphemerisSchema } from './data'
import { bestHour, SYNODIC_HOURS, subPoints, whenAt, windowDays } from './moonLight'

const eph = MoonEphemerisSchema.parse(ephemeris)

test('sub-points match the stored hourly samples and interpolate across the 0/360 seam', () => {
  const i = 100
  const p = subPoints(eph, i)
  expect(p.sun.lat).toBeCloseTo(eph.subsolar_lat_deg[i] ?? Number.NaN, 9)
  expect(p.sun.lon).toBeCloseTo(eph.subsolar_lon_deg_east[i] ?? Number.NaN, 9)
  expect(p.earth.lat).toBeCloseTo(eph.subearth_lat_deg[i] ?? Number.NaN, 9)
  // Between two samples every longitude stays in [0, 360) and moves less than a sample step would.
  for (let h = 0; h < 2000; h += 0.5) {
    const { sun, earth } = subPoints(eph, h)
    for (const lon of [sun.lon, earth.lon]) {
      expect(lon).toBeGreaterThanOrEqual(0)
      expect(lon).toBeLessThan(360)
    }
  }
})

test('one synodic month later the Sun stands over almost the same longitude', () => {
  const h0 = bestHour(eph, [{ lat: -89.47, lon: 222.56 }])
  const a = subPoints(eph, h0).sun.lon
  const b = subPoints(eph, h0 + SYNODIC_HOURS).sun.lon
  const d = Math.abs(((b - a + 540) % 360) - 180)
  expect(d).toBeLessThan(1.5)
})

test('the first-visit hour lies in the first month and dates follow the ephemeris start', () => {
  const h = bestHour(eph, [{ lat: -86, lon: 2 }])
  expect(h).toBeGreaterThanOrEqual(0)
  expect(h).toBeLessThan(30 * 24)
  expect(whenAt(eph, 0)).toEqual({ date: windowDays(eph)[0], minute: 0 })
  expect(whenAt(eph, 25.5)).toEqual({ date: windowDays(eph)[1], minute: 90 })
})

test('scroll state: poses hold around each chapter middle and blend across boundaries', () => {
  const boxes = [
    { top: 0, height: 800 },
    { top: 800, height: 800 },
    { top: 1600, height: 1600 },
  ]
  const at = (y: number) =>
    scrollState(
      boxes.map((b) => ({ top: b.top - y, height: b.height })),
      400,
    )
  // Middle of the first chapter: the first pose alone.
  expect(at(0)).toMatchObject({ index: 0, from: 0, blend: 0 })
  // Boundary between the first two: halfway.
  expect(at(400)).toMatchObject({ index: 1, from: 0, to: 1 })
  expect(at(400).blend).toBeCloseTo(0.5, 9)
  // Middle of the second: the second pose alone.
  expect(at(800)).toMatchObject({ index: 1, from: 1, blend: 0 })
  // Past the end: held on the last pose.
  expect(at(5000)).toMatchObject({ index: 2, from: 2, to: 2, progress: 1 })
})

test('moon side: right by default, and two opposite sides blend through the middle', () => {
  expect(sideOf({ cam: [0, 0, 5] })).toBe(1)
  expect(sideOf({ cam: [0, 0, 5], side: 'right' })).toBe(1)
  expect(sideOf({ cam: [0, 0, 5], side: 'left' })).toBe(-1)
  const mid = (sideOf({ cam: [0, 0, 5], side: 'right' }) + sideOf({ cam: [0, 0, 5], side: 'left' })) / 2
  expect(mid).toBe(0)
})
