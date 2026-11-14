import { expect, test } from 'vitest'
import { DAY_MS } from '~/lib/mission'
import { tickStride } from './Lanes'

const days = (n: number) => ({ start: Date.UTC(2026, 10, 4), end: Date.UTC(2026, 10, 4) + n * DAY_MS })

test('date labels: all kept while they fit, thinned on narrow rows, all kept before measuring', () => {
  // 60 days in weekly labels: a desktop row fits them all, a phone row keeps every second one.
  expect(tickStride(days(60), 546)).toBe(1)
  expect(tickStride(days(60), 320)).toBe(2)
  // One lunar month beside a long lane label on a phone (about 135 px).
  expect(tickStride(days(29.53), 135)).toBe(2)
  expect(tickStride(days(29.53), 60)).toBe(4)
  // Not measured yet (server render): every label, as before.
  expect(tickStride(days(60), 0)).toBe(1)
})
