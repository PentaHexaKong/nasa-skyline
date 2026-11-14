import { expect, test } from 'vitest'
import { loadMoonEphemeris } from '~/lib/data'
import { SYNODIC_HOURS, subPoints } from '~/lib/moonLight'
import { horizonFrame, MAX_RADIUS, quarterHour, RISE, SUN_EAST } from './HorizonMoon'

test('the front door starts lit at a real moment in the data, with the Sun SUN_EAST degrees east of the near side', async () => {
  const eph = await loadMoonEphemeris()
  const h = quarterHour(eph)
  expect(h).toBeGreaterThanOrEqual(0)
  expect(h).toBeLessThanOrEqual(SYNODIC_HOURS)
  const lon = subPoints(eph, h).sun.lon
  const off = ((((lon - SUN_EAST + 180) % 360) + 360) % 360) - 180
  // Within the Sun's travel over one step of the ephemeris (about 0.5° an hour).
  expect(Math.abs(off)).toBeLessThanOrEqual(0.6 * eph.step_h)
})

test('the disc rises into the free space below the content, never into it, and is always there', () => {
  expect(horizonFrame(1440, 300).rise).toBe(280)
  expect(horizonFrame(1440, 2000).rise).toBe(RISE.max)
  expect(horizonFrame(390, 0).rise).toBe(RISE.min)
  expect(horizonFrame(390, 0).radius).toBeGreaterThan(390 / 2)
})

test('the disc never grows past the size the colour map can keep sharp', () => {
  for (const w of [390, 1024, 1440, 2560, 3840]) expect(horizonFrame(w, 400).radius).toBeLessThanOrEqual(MAX_RADIUS)
})
