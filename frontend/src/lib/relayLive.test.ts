import { describe, expect, it } from 'vitest'
import { contactSpans, readRelayReply, relaySteps, suggestedRelays } from './relayLive'

// Ten samples, 600 s apart. Earth is in view directly for the first three only.
const direct = [true, true, true, false, false, false, false, false, false, false]
const T = true
const F = false
// Relay 1 covers samples 3 to 7, relay 2 covers 8, relay 3 duplicates relay 1, relay 4 covers 9 but never sees Earth then.
const site = [
  [F, F, F, T, T, T, T, T, F, F],
  [F, F, F, F, F, F, F, F, T, F],
  [F, F, F, T, T, T, T, T, F, F],
  [F, F, F, F, F, F, F, F, F, T],
]
const earth = [
  [T, T, T, T, T, T, T, T, T, T],
  [T, T, T, T, T, T, T, T, T, T],
  [T, T, T, T, T, T, T, T, T, T],
  [T, T, T, T, T, T, T, T, T, F],
]

describe('relaySteps', () => {
  it('adds each satellite on top of the ones before it', () => {
    const steps = relaySteps(direct, site, earth, 600)
    expect(steps.map((s) => [s.relays, s.share, s.longestSilenceS])).toEqual([
      [0, 0.3, 4200],
      [1, 0.8, 1200],
      [2, 0.9, 600],
      [3, 0.9, 600],
      [4, 0.9, 600],
    ])
    expect(steps.map((s) => Number(s.gain.toFixed(3)))).toEqual([0, 0.5, 0.1, 0, 0])
  })

  it('needs both legs through the same satellite at the same moment', () => {
    const steps = relaySteps([F, F], [[T, F]], [[F, T]], 120)
    expect(steps[1]?.share).toBe(0)
  })
})

describe('suggestedRelays', () => {
  it('stops where one more relay adds under half a point', () => {
    expect(suggestedRelays(relaySteps(direct, site, earth, 600))).toBe(2)
  })

  it('suggests none when direct contact already covers the stay', () => {
    expect(suggestedRelays(relaySteps([T, T], [[T, T]], [[T, T]], 120))).toBe(0)
  })
})

const START = '2027-03-01T00:00:00Z'
const t0 = Date.parse(START)
const body = (extra: object = {}) => ({
  dataState: 'computed',
  tier: 'propagated-two-body',
  cadenceS: 600,
  relayScience: {
    result: { directAvailable: direct, siteRelayAvailable: site, relayEarthAvailable: earth, ...extra },
    provenance: { sampleUtc: [START] },
  },
})

describe('readRelayReply', () => {
  it('keeps the samples and the positions beside the ladder', () => {
    const relayKm = site.map((row) => row.map(() => [0, 0, 1800] as [number, number, number]))
    const earthKm = direct.map(() => [384400, 0, 0] as [number, number, number])
    const load = readRelayReply(body({ relayPositionKm: relayKm, earthPositionKm: earthKm }), 6000)
    if (load.status !== 'ready') throw new Error(load.status)
    const { track, steps } = load.ladder
    expect(track.startMs).toBe(t0)
    expect(track.relayed[3]?.[9]).toBe(false) // relay 4 sees the site but not Earth
    expect(track.relayKm?.[0]?.[0]).toEqual([0, 0, 1800])
    expect(track.earthKm).toHaveLength(10)
    expect(steps[2]?.share).toBe(0.9)
  })

  it('accepts replies without positions', () => {
    const load = readRelayReply(body(), 6000)
    expect(load.status === 'ready' && load.ladder.track.relayKm).toBeUndefined()
  })

  it('rejects positions that are not 3-vectors', () => {
    expect(readRelayReply(body({ earthPositionKm: [[1, 2]] }), 6000).status).toBe('unavailable')
  })
})

describe('contactSpans', () => {
  const load = readRelayReply(body(), 6000)
  const track = load.status === 'ready' ? load.ladder.track : undefined
  const at = (i: number) => t0 + i * 600_000

  it('merges consecutive samples into spans that end where contact stops', () => {
    if (!track) throw new Error('no track')
    expect(contactSpans(track, 0)).toEqual([[at(0), at(3)]])
    expect(contactSpans(track, 1)).toEqual([[at(0), at(8)]])
    expect(contactSpans(track, 4)).toEqual([[at(0), at(9)]])
  })
})
