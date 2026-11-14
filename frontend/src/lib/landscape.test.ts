import { expect, test } from 'vitest'
import type { Terrain } from './data'
import { extremes, lineOfSight, nearest, relief, slopes, stepToward } from './landscape'

/** A flat 9×9 tile with one 100 m tower in the middle, 10 m cells. */
function tower(): Terrain {
  const n = 9
  const heights = new Int16Array(n * n)
  heights[4 * n + 4] = 100
  return {
    meta: {
      site_id: 'test',
      file: 'test.bin',
      n,
      radius_km: 0.045,
      cell_m: 10,
      ground_height_m: 0,
      observer_height_m: 0,
      min_m: 0,
      max_m: 100,
      skyline_inside_share: 1,
      tier: 'inner',
      body: 'moon',
    },
    heights,
  }
}

test('azimuth steps: north is up the rows, east is along the columns', () => {
  const [nc, nr] = stepToward(0)
  expect(nc).toBeCloseTo(0)
  expect(nr).toBeCloseTo(-1)
  const [ec, er] = stepToward(90)
  expect(ec).toBeCloseTo(1)
  expect(er).toBeCloseTo(0)
})

test('a low Sun in the east puts the cells west of the tower in shadow, and the rest in light', () => {
  const t = tower()
  const lit = lineOfSight(t, 90, 5)
  const n = t.meta.n
  expect(lit[4 * n + 3]).toBe(0)
  expect(lit[4 * n + 0]).toBe(0)
  expect(lit[4 * n + 5]).toBe(1)
  expect(lit[0]).toBe(1)
  // A high Sun clears the tower from the next cell over.
  expect(lineOfSight(t, 90, 89)[4 * n + 3]).toBe(1)
})

test('flat ground is evenly lit and level; the tower’s sides are steep', () => {
  const t = tower()
  const shade = relief(t, 0, 30)
  expect(shade[0]).toBeCloseTo(Math.sin(Math.PI / 6), 5)
  const s = slopes(t)
  expect(s[0]).toBe(0)
  expect(s[4 * 9 + 3]).toBeGreaterThan(70)
})

test('extremes find the tower and the nearest shadow', () => {
  const t = tower()
  const { high, site } = extremes(t)
  expect(high).toMatchObject({ row: 4, col: 4, height: 100 })
  expect(site.height).toBe(100)
  const lit = lineOfSight(t, 90, 5)
  expect(nearest(lit, 9, 0)).toMatchObject({ row: 4, col: 2 })
})
