import { expect, test } from 'vitest'
import { evaluate, HOUR_MS, type MissionWindow, measure, type SitePlan } from './mission'
import { matchesScenario, scenarioGuidance } from './scenarios'

// Synthetic intervals for decision-logic tests only; never presented as lunar results.
const window: MissionWindow = { start: 0, end: 10 * HOUR_MS }
const stay = measure(
  {
    sun: [
      [0, HOUR_MS],
      [5 * HOUR_MS, 10 * HOUR_MS],
    ],
    earth: [
      [0, HOUR_MS],
      [7 * HOUR_MS, 10 * HOUR_MS],
    ],
    both: [
      [0, HOUR_MS],
      [7 * HOUR_MS, 10 * HOUR_MS],
    ],
    coverage: window,
  },
  window,
)
const limits = { minSun: 50, maxNoSun: 5, minEarth: 30, maxNoEarth: 7 }
const site = (changes = {}): Pick<SitePlan, 'stay' | 'checks' | 'touchdown'> => ({
  stay,
  checks: evaluate(stay, { ...limits, ...changes }),
  touchdown: 'both',
})

test('Sun and Earth visible at landing do not hide later gaps during the stay', () => {
  const guidance = scenarioGuidance(site({ maxNoSun: 2, maxNoEarth: 2 }))
  expect(guidance.priority).toEqual(['mast', 'relay'])
  expect(guidance.sun.map((c) => c.key)).toEqual(['maxNoSun'])
  expect(guidance.earth.map((c) => c.key)).toEqual(['maxNoEarth'])
  expect(guidance.optional).toEqual(['rover'])
})

test('low sunlight or Earth share also invites investigating the relevant scenario', () => {
  expect(scenarioGuidance(site({ minSun: 80 })).priority).toEqual(['mast'])
  expect(scenarioGuidance(site({ minEarth: 80 })).priority).toEqual(['relay'])
})

test('meeting the stay limits leaves all three tools available without a hardware recommendation', () => {
  const guidance = scenarioGuidance(site())
  expect(guidance.priority).toEqual([])
  expect(guidance.optional).toEqual(['mast', 'relay', 'rover'])
  expect(guidance.headline).toContain('meets your limits')
})

test('hidden bodies at touchdown are explained separately from the whole-stay checks', () => {
  const guidance = scenarioGuidance({ ...site(), touchdown: 'neither' })
  expect(guidance.priority).toEqual([])
  expect(guidance.detail).toContain('hidden at touchdown')
})

test('uncomputed time never becomes a missed limit or a hardware recommendation', () => {
  const guidance = scenarioGuidance({ stay: null, checks: null, touchdown: 'neither' })
  expect(guidance.priority).toEqual([])
  expect(guidance.sun).toEqual([])
  expect(guidance.earth).toEqual([])
  expect(guidance.headline).toContain('not fully computed')
})

const feed = {
  origin: 'computed',
  site_id: 'synthetic-test-site',
  period: { start_utc: new Date(window.start).toISOString(), end_utc: new Date(window.end).toISOString() },
}

test('scenario results need a computed feed for the exact site and period', () => {
  expect(matchesScenario(feed, feed.site_id, window)).toBe(true)
  expect(matchesScenario({ ...feed, origin: 'fixture' }, feed.site_id, window)).toBe(false)
  expect(matchesScenario(feed, 'another-site', window)).toBe(false)
  expect(matchesScenario(feed, feed.site_id, { ...window, start: 1 })).toBe(false)
  expect(matchesScenario(feed, feed.site_id, { ...window, end: window.end + 1 })).toBe(false)
})
