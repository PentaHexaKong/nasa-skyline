import { describe, expect, it } from 'vitest'
import type { Terrain } from './data'
import { offsetFromSite, shadedWindow } from './roverMap'

describe('offsetFromSite', () => {
  it('puts a point 0.1° of latitude toward the equator about 3032 m north', () => {
    const { east, north } = offsetFromSite(-89.5, 220, -89.4, 220)
    expect(Math.round(north)).toBe(3032)
    expect(Math.abs(east)).toBeLessThan(1)
  })

  it('puts a point a quarter turn east around the pole, same latitude, about 15.2 km east and 15.2 km south, since the straight line passes nearer the pole', () => {
    const { east, north } = offsetFromSite(-89.5, 0, -89.5, 90)
    expect(Math.round(east / 100) * 100).toBe(15_200)
    expect(Math.round(north / 100) * 100).toBe(-15_200)
  })
})

/** A flat 21 by 21 tile, 10 m cells, with one 200 m tower in the middle. */
function tower(): Terrain {
  const n = 21
  const heights = new Int16Array(n * n)
  heights[10 * n + 10] = 200
  return {
    meta: {
      site_id: 'test',
      file: 'test.bin',
      n,
      radius_km: 0.1,
      cell_m: 10,
      ground_height_m: 0,
      observer_height_m: 0,
      min_m: 0,
      max_m: 200,
      skyline_inside_share: 0,
      tier: 'inner',
      body: 'moon',
    },
    heights,
  }
}

describe('shadedWindow', () => {
  it('casts the tower’s shadow away from the Sun, and lights the ground toward it', () => {
    // Sun in the east, low: the shadow falls west of the tower.
    const px = 20
    const out = shadedWindow(tower(), 100, px, 90, 10)
    const at = (eastM: number) => out[10 * px + Math.floor(((eastM + 100) / 200) * px)] ?? -1
    expect(at(-40)).toBe(0)
    expect(at(60)).toBeGreaterThan(0)
  })

  it('is dark everywhere when the Sun is below the horizon', () => {
    expect(Math.max(...shadedWindow(tower(), 100, 8, 90, -1))).toBe(0)
  })
})
