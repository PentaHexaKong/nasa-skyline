import { expect, test } from 'vitest'
import { duration, instant, minutes, sunAt, sunStateAt } from './time'

const intervals: [string, string][] = [
  ['2026-11-14T10:00:00Z', '2026-11-14T12:30:00Z'],
  ['2026-11-15T10:05:00Z', '2026-11-15T12:20:00Z'],
]

const dataEnd = Date.parse('2027-01-14T00:00:00Z')

test('reports time to terrain sunset inside an interval, and to the next sunrise outside', () => {
  const inside = sunStateAt(intervals, instant('2026-11-14', 11 * 60), dataEnd)
  expect(inside).toMatchObject({ inSun: true, inMs: 90 * 60_000 })
  const after = sunStateAt(intervals, instant('2026-11-14', 13 * 60), dataEnd)
  expect(after.inSun).toBe(false)
  expect(after.next?.toISOString()).toBe('2026-11-15T10:05:00.000Z')
  // [start, end): the end instant itself is already out of the sun.
  expect(sunStateAt(intervals, new Date('2026-11-14T12:30:00Z'), dataEnd).inSun).toBe(false)
  expect(sunStateAt(intervals, new Date('2026-11-16T00:00:00Z'), dataEnd)).toEqual({ inSun: false })
})

test('an interval cut off by the end of the data has no next change', () => {
  const whole: [string, string][] = [['2026-11-17T00:00:00Z', '2027-11-17T00:00:00Z']]
  const end = Date.parse('2027-11-17T00:00:00Z')
  expect(sunStateAt(whole, instant('2026-11-27', 720), end)).toEqual({ inSun: true })
  expect(sunStateAt(whole, instant('2027-11-16', 0), end + 3_600_000)).toEqual({
    inSun: true,
    next: new Date('2027-11-17T00:00:00Z'),
    inMs: 86_400_000,
  })
})

test('interpolates the Sun across the north wrap and treats gaps as night', () => {
  const track = { t_min: [0, 10, 600], az_deg: [355, 5, 180], el_deg: [1, 2, 30], direct_fraction: [0, 1, 1] }
  expect(sunAt(track, 5)).toEqual({ az: 0, el: 1.5, fraction: 0.5 })
  expect(sunAt(track, 300)).toBeUndefined()
})

test('formats durations at a readable precision', () => {
  expect(duration(45_000)).toBe('45 s')
  expect(duration(134 * 60_000)).toBe('2 h 14 min')
  expect(duration(76 * 3_600_000)).toBe('3 d 4 h')
})

test('formats minute counts for daily totals', () => {
  expect(minutes(0)).toBe('0 min')
  expect(minutes(32)).toBe('32 min')
  expect(minutes(590)).toBe('9 h 50 min')
  expect(minutes(589.6)).toBe('9 h 50 min')
})
