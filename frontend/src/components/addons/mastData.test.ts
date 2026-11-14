import { describe, expect, it } from 'vitest'
import { MAST_EXAMPLE, spotLabel } from './mastData'
import computed from './mastData.computed.json'

describe('the mast example', () => {
  it('keeps the service numbers for every computed outcome', () => {
    const raw = computed.candidates[3]
    const spot = MAST_EXAMPLE.candidates.find((c) => c.east_m === raw?.eastM && c.north_m === raw?.northM)
    const outcome = raw?.outcomes[1]
    expect(spot?.outcomes[1]?.sun_share).toBe(outcome?.metrics?.sunlightAvailabilityFraction)
    expect(spot?.outcomes[1]?.longest_no_earth_h).toBe((outcome?.metrics?.longestDirectEarthBlackout.durationS ?? 0) / 3600)
    expect(MAST_EXAMPLE.origin).toBe('computed')
    expect(MAST_EXAMPLE.candidates).toHaveLength(computed.candidates.length)
  })

  it('names spots by distance and direction from the landing', () => {
    expect(spotLabel(0, 0)).toBe('Landing')
    expect(spotLabel(0, -80)).toBe('80 m S')
    expect(spotLabel(80, 0)).toBe('80 m E')
    expect(spotLabel(-56.6, 56.6)).toBe('80 m NW')
  })
})
