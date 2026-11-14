import { afterEach, expect, test, vi } from 'vitest'
import backendSchema from '../../../contracts/scientificResponse.schema.json'
import mastExample from '../../../examples/mastPowerResponse.computed.json'
import computedExample from '../../../examples/scientificResponse.computed.json'
import {
  evaluateMastPowerScenario,
  evaluateScientificScenario,
  fractionToPercent,
  loadScientificFeed,
  parseScientificResponse,
  scientificPresentationMetrics,
  secondsToHours,
} from './scientificContract'
import frontendSchema from './scientificResponse.schema.json'

afterEach(() => vi.unstubAllGlobals())

test('frontend schema matches the authoritative exported backend schema', () => {
  expect(frontendSchema).toEqual(backendSchema)
  const result = parseScientificResponse(computedExample)
  expect(result.dataState).toBe('computed')
  if (result.dataState === 'computed') {
    expect(result.units).toEqual({ angles: 'deg', distances: 'm', durations: 's', fractions: 'fraction', timestamps: 'UTC ISO 8601' })
    expect(result.result.samples).toHaveLength(25)
    expect(result.provenance.independentlyValidated).toBe(false)
  }
})

test('units are converted only at the presentation boundary', () => {
  expect(secondsToHours(3600)).toBe(1)
  expect(secondsToHours(90)).toBe(0.025)
  expect(fractionToPercent(0.125)).toBe(12.5)
  const parsed = parseScientificResponse(computedExample)
  const presentation = scientificPresentationMetrics(parsed)
  if (parsed.dataState !== 'computed') throw new Error('Example must be computed')
  expect(presentation?.sunlightHours).toBe(parsed.result.metrics.sunlightDurationS / 3600)
})

test.each(['unsupported', 'not_computed', 'unavailable', 'failed'])('%s retains missing data without zero-filled metrics', (dataState) => {
  const result = parseScientificResponse({
    schemaVersion: 'skyline-scientific-response/1.0.0',
    dataState,
    scenarioId: null,
    request: null,
    units: computedExample.units,
    result: null,
    provenance: null,
    coverage: null,
    error: { code: 'fixture', message: 'State fixture' },
  })
  expect(scientificPresentationMetrics(result)).toBeNull()
})

test('out-of-range fractions and missing availability state fail schema validation', () => {
  const changed = structuredClone(computedExample)
  changed.result.samples[0]!.sun.visibleDiskFraction = 2
  expect(() => parseScientificResponse(changed)).toThrow()
  const { dataState: removed, ...withoutState } = computedExample
  expect(removed).toBe('computed')
  expect(() => parseScientificResponse(withoutState)).toThrow()
})

test('typed client uses the versioned scientific route', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => computedExample })
  vi.stubGlobal('fetch', fetchMock)
  const response = await evaluateScientificScenario({ startUtc: '2025-01-06T00:00:00Z', durationS: 86400 })
  expect(response.dataState).toBe('computed')
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/mission-science/v1/scientific-evaluations')
})

test('feed lookup requires exact scenario identity', async () => {
  await expect(loadScientificFeed('CR1')).rejects.toThrow('complete scenario')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => computedExample }))
  await expect(loadScientificFeed(`scenario-${'0'.repeat(64)}`)).rejects.toThrow('identity mismatch')
})

test('mast/power client parses the real height-aware contract', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => mastExample })
  vi.stubGlobal('fetch', fetchMock)
  const response = await evaluateMastPowerScenario({
    startUtc: '2025-01-06T00:00:00Z',
    mastHeightsM: [0, 2, 10, 30],
    verticalAzimuthDeg: 90,
  })
  expect(response.dataState).toBe('computed')
  if (response.dataState === 'computed') expect(response.result.outcomes.map((outcome) => outcome.observerHeightM)).toEqual([0, 2, 10, 30])
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/mission-science/v1/mast-power-evaluations')
})
