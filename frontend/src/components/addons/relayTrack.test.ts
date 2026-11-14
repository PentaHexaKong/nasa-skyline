import { describe, expect, it } from 'vitest'
import { type RelayLadder, type RelayTrack, relaySteps } from '~/lib/relayLive'
import { fitView, gapsOf, lerpSamples, orbitNormal, rungsOf, sampleAt, ticksOf, windowOf } from './relayTrack'

const track: RelayTrack = {
  startMs: 0,
  cadenceS: 60,
  direct: [true, false, false, true],
  relayed: [
    [false, true, false, false],
    [false, false, true, false],
  ],
}
const ladder: RelayLadder = {
  tier: 'propagated-two-body',
  cadenceS: 60,
  startUtc: '1970-01-01T00:00:00Z',
  durationS: 240,
  truncated: false,
  steps: relaySteps(track.direct, track.relayed, track.relayed, 60),
  track,
}

describe('relay track helpers', () => {
  it('spans the window one cadence step per sample', () => {
    expect(windowOf(track)).toEqual({ start: 0, end: 240_000 })
  })

  it('builds one rung per relay count with its gaps and longest gap', () => {
    const rungs = rungsOf(ladder)
    expect(rungs.map((r) => r.label)).toEqual(['No relays', 'One relay', 'Two relays'])
    expect(rungs[0]?.gaps).toEqual([[60_000, 180_000]])
    expect(rungs[1]?.gaps).toEqual([[120_000, 180_000]])
    expect(rungs[2]?.gaps).toEqual([])
    expect(rungs[2]?.longest).toBeUndefined()
    expect(rungs.map((r) => r.share)).toEqual([0.5, 0.75, 1])
  })

  it('finds the gaps between unsorted spans', () => {
    expect(
      gapsOf(
        [
          [50, 60],
          [10, 20],
        ],
        { start: 0, end: 100 },
      ),
    ).toEqual([
      [0, 10],
      [20, 50],
      [60, 100],
    ])
  })

  it('interpolates between samples and clamps at both ends', () => {
    const km = [
      [0, 0, 0],
      [10, 20, -30],
    ]
    expect(lerpSamples(km, 60, 30_000)).toEqual([5, 10, -15])
    expect(lerpSamples(km, 60, -5)).toEqual([0, 0, 0])
    expect(lerpSamples(km, 60, 1e9)).toEqual([10, 20, -30])
    expect(lerpSamples([[1, 2, 3]], 60, 30_000)).toEqual([1, 2, 3])
  })

  it('picks the sample in force and clamps it', () => {
    expect(sampleAt(track, 119_999)).toBe(1)
    expect(sampleAt(track, -1)).toBe(0)
    expect(sampleAt(track, 1e9)).toBe(3)
  })

  it('keeps ticks to a handful on a round step', () => {
    const day = 86_400_000
    expect(ticksOf({ start: 0, end: 28 * day }).map((t) => t.label)).toEqual([null, '+5 d', '+10 d', '+15 d', '+20 d', '+25 d'])
    expect(ticksOf({ start: 0, end: day }).map((t) => t.label)).toEqual([null, '+6 h', '+12 h', '+18 h'])
  })
})

describe('camera fit', () => {
  it('finds the normal of a circle in the xz plane', () => {
    const ring = Array.from({ length: 9 }, (_, i) => [Math.cos(i), 0, -Math.sin(i)] as [number, number, number])
    const n = orbitNormal(ring)
    expect(n[1]).toBeCloseTo(1)
  })

  it('centres on the points and backs off until both edges fit', () => {
    const pts: [number, number, number][] = [
      [-4, -1, 0],
      [4, 1, 0],
    ]
    const { eye, target } = fitView(pts, [0, 0, 1], 90, 2, 1)
    expect(target.map((v) => v + 0)).toEqual([0, 0, 0])
    // Horizontal half-FOV tan is 2, so x = 4 needs 2 units; vertical tan 1, y = 1 needs 1.
    expect(eye[2]).toBeCloseTo(2)
  })
})
