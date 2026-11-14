import { describe, expect, it } from 'vitest'
import { relaySteps, suggestedRelays } from './relayLive'

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
