import { expect, test } from 'vitest'
import binUrl from '../../data/terrain/connecting-ridge.bin?inline'
import metaJson from '../../data/terrain/connecting-ridge.json'
import { type Terrain, TerrainSchema } from './data'
import { blockedAt, direction, heightAt, runs } from './sky'

const meta = TerrainSchema.parse(metaJson)
const bytes = Uint8Array.from(atob(binUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
const ridge: Terrain = { meta, heights: new Int16Array(bytes.buffer) }

/** The direction (azimuth) and elevation angle of the terrain cell that rises highest above the eye, from the grid itself. */
function steepest({ meta: m, heights }: Terrain) {
  const eye = m.observer_height_m / 1000
  let best = { az: 0, el: -90 }
  for (let i = 0; i < m.n; i++)
    for (let j = 0; j < m.n; j++) {
      const x = -m.radius_km + (2 * m.radius_km * j) / (m.n - 1)
      const z = -m.radius_km + (2 * m.radius_km * i) / (m.n - 1)
      const d = Math.hypot(x, z)
      if (d < 0.05 || d >= m.radius_km) continue
      const el = (Math.atan2(((heights[i * m.n + j] ?? 0) - m.ground_height_m) / 1000 - eye, d) * 180) / Math.PI
      if (el > best.el) best = { az: ((((Math.atan2(x, -z) * 180) / Math.PI) % 360) + 360) % 360, el }
    }
  return best
}

test('azimuth is clockwise from north in an x-east, y-up, z-south frame', () => {
  const round = (v: number[]) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0)
  expect(round(direction(0, 0))).toEqual([0, 0, -1])
  expect(round(direction(90, 0))).toEqual([1, 0, 0])
  expect(round(direction(180, 0))).toEqual([0, 0, 1])
  expect(round(direction(123, 90))).toEqual([0, 1, 0])
})

test('the heightmap is centred on the site', () => {
  expect(ridge.heights.length).toBe(meta.n ** 2)
  expect(Math.abs(heightAt(ridge, 0, 0))).toBeLessThan(0.01)
})

test('a sight line just under the highest terrain is blocked, one just over it is not', () => {
  const top = steepest(ridge)
  expect(blockedAt(ridge, top.az, top.el - 1)).toBeDefined()
  expect(blockedAt(ridge, top.az, top.el + 1)).toBeUndefined()
  expect(blockedAt(ridge, top.az, 60)).toBeUndefined()
})

test('runs split a path and share edge points', () => {
  const lit = [0, 0, 1, 1, 0]
  expect(runs(5, (i) => lit[i] === 1)).toEqual([
    { on: false, from: 0, to: 1 },
    { on: true, from: 1, to: 3 },
    { on: false, from: 3, to: 4 },
  ])
})
