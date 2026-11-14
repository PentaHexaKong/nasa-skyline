import { describe, expect, it } from 'vitest'
import { type Space, sampleSpace, spaceReadouts } from './space'

const s45 = Math.SQRT1_2
const fixture: Space = {
  start: '2026-11-17T00:00:00Z',
  step_h: 2,
  n: 2,
  frame: 'test',
  units: 'km',
  earth_km: [384_000, 0, 0, 0, 384_000, 0],
  sun_km: [-1.5e8, 0, 0, -1.5e8, 0, 0],
  // identity, then 90° about +y
  moon_q: [0, 0, 0, 1, 0, s45, 0, s45],
  earth_q: [0, 0, 0, 1, 0, 0, 0, 1],
  provenance: {},
}

describe('sampleSpace', () => {
  it('interpolates positions linearly and rotations along the short arc', () => {
    const mid = sampleSpace(fixture, 1)
    expect(mid.earth).toEqual([192_000, 192_000, 0])
    // halfway to 90° about +y is 45°: (0, sin 22.5°, 0, cos 22.5°)
    expect(mid.moonQ[1]).toBeCloseTo(Math.sin(Math.PI / 8), 6)
    expect(mid.moonQ[3]).toBeCloseTo(Math.cos(Math.PI / 8), 6)
  })

  it('clamps outside the file', () => {
    expect(sampleSpace(fixture, -5).earth).toEqual([384_000, 0, 0])
    expect(sampleSpace(fixture, 99).earth).toEqual([0, 384_000, 0])
  })
})

describe('spaceReadouts', () => {
  it('full Earth from the Moon at new Moon, and Earth about 1.9° wide', () => {
    // Sun behind the Moon as seen from Earth: Moon between, Earth fully lit for a lunar observer.
    const r = spaceReadouts({ earth: [384_000, 0, 0], sun: [-1.5e8, 0, 0], moonQ: [0, 0, 0, 1], earthQ: [0, 0, 0, 1] })
    expect(r.earthLit).toBeCloseTo(1, 3)
    expect(r.moonLit).toBeCloseTo(0, 3)
    expect(r.earthDeg).toBeCloseTo(1.9, 1)
  })
})
