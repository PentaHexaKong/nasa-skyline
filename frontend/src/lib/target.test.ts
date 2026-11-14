import { expect, test } from 'vitest'
import { daySpans } from './target'

test('day spans clip [start, end) intervals to one UTC day, in minutes', () => {
  const iv: [string, string][] = [
    ['2026-11-16T22:00:00Z', '2026-11-17T01:30:00Z'],
    ['2026-11-17T12:00:00Z', '2026-11-17T12:00:30Z'],
    ['2026-11-17T23:00:00Z', '2026-11-18T02:00:00Z'],
  ]
  expect(daySpans(iv, '2026-11-17')).toEqual([
    [0, 90],
    [720, 720.5],
    [1380, 1440],
  ])
  expect(daySpans(iv, '2026-11-19')).toEqual([])
})
