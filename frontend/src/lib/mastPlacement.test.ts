import { expect, test, vi } from 'vitest'
import { z } from 'zod'
import schema from '../../../contracts/mastFeedV1.schema.json'
import feed from '../../../examples/mastFeed.computed.json'
import request from '../../../examples/mastPlacementRequest.json'
import response from '../../../examples/mastPlacementResponse.computed.json'
import { deliveredFeeds } from '../data/generated/feedIndex'
import { MastFeed, MastFeedV1 } from './feed-schemas'
import { loadFeed } from './feeds'
import { evaluateMastPlacementScenario } from './scientificContract'
import type { MastPlacementRequest } from './scientificContract.generated'

test('real MastFeed retains actual coordinates, feasibility and server Pareto ranks', () => {
  const parsed = MastFeedV1.parse(feed)
  expect(parsed.candidates.length).toBe(5)
  expect(parsed.request.mastHeightsM).toEqual([0, 2])
  expect(parsed.referenceObserver.frame).toBe('MOON_ME_DE421')
  expect(parsed.optimization.complete).toBe(true)
  expect(parsed.optimization.paretoSet.length).toBeGreaterThan(0)
  expect(parsed.candidates.every((candidate) => candidate.constructionSafetyValidated === false)).toBe(true)
  const standalone = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0])
  expect(standalone.safeParse(feed).success).toBe(true)
})

test('versioned MastFeed rejects missing data and inconsistent availability', () => {
  const missing = structuredClone(feed) as Record<string, unknown>
  delete missing.optimization
  expect(MastFeed.safeParse(missing).success).toBe(false)
  const invalid = structuredClone(feed)
  invalid.candidates[0]!.outcomes[0]!.dataState = 'not_computed'
  expect(MastFeed.safeParse(invalid).success).toBe(false)
})

test('MastFeed manifests preserve explicit scenario selection', async () => {
  const missing = await loadFeed('mast', 'CR1')
  expect(missing.state).toBe('not_computed')
  if (missing.state === 'not_computed') expect(missing.reason).toContain('scenario identity')
  const loaded = await loadFeed('mast', 'CR1', feed.scenarioId)
  expect(loaded.state, JSON.stringify(loaded)).toBe('ready')
  const mastScenarios = Object.keys(deliveredFeeds).filter((path) => path.startsWith('mast/scenarios/'))
  expect(mastScenarios.length).toBeGreaterThanOrEqual(2)
  for (const path of mastScenarios) {
    const scenarioId = path
      .split('/')
      .at(-1)!
      .replace(/\.json$/, '')
    expect((await loadFeed('mast', 'CR1', scenarioId)).state, scenarioId).toBe('ready')
  }
  expect((await loadFeed('mast', 'CR1', 'wrong')).state).toBe('invalid')
  expect((await loadFeed('mast', 'unverified-location', feed.scenarioId)).state).toBe('not_computed')
})

test('typed placement client forwards the scenario to the authoritative API', async () => {
  const mocked = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
  vi.stubGlobal('fetch', mocked)
  try {
    const result = await evaluateMastPlacementScenario(request as MastPlacementRequest)
    expect(result.dataState).toBe('computed')
    expect(mocked.mock.calls[0]?.[0]).toBe('/api/mission-science/v1/mast-placement-evaluations')
    const body = JSON.parse(mocked.mock.calls[0]?.[1].body as string)
    expect(body.searchRadiusM).toBe(request.searchRadiusM)
    expect(body.evaluationBudget).toEqual(request.evaluationBudget)
  } finally {
    vi.unstubAllGlobals()
  }
})
