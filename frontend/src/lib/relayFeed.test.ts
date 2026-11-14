import { expect, test } from 'vitest'
import { z } from 'zod'
import contract from '../../../contracts/relayFeedV1.schema.json'
import example from '../../../examples/relayFeed.computed.json'
import { RelayFeed, RelayFeedV1, RelayManifest } from './feed-schemas'
import { loadFeed } from './feeds'

test('the versioned relay feed matches the exported schema and CR1 regression', () => {
  expect(contract).toEqual(z.toJSONSchema(RelayFeedV1, { io: 'input' }))
  const parsed = RelayFeedV1.parse(example)
  expect(parsed.comparison.direct.fraction).toBe(0.3625)
  expect(parsed.comparison.assisted.fraction).toBe(1)
  expect(parsed.comparison.direct.longestBlackoutS).toBe(55080)
  expect(parsed.scenarios[0]!.longest_gap_h).toBe(55080 / 3600)
  expect(parsed.comparison.grid.sampleCount).toBe(720)
  expect(parsed.comparison.intervalMethod.transitionTimesRefined).toBe(false)
  expect(parsed.comparison.continuousAvailabilityValidated).toBe(false)
})

test('invalid relay science cannot fall back to the legacy feed parser', () => {
  for (const field of ['comparison', 'scenario', 'validation']) {
    const altered = structuredClone(example) as Record<string, unknown>
    delete altered[field]
    expect(RelayFeed.safeParse(altered).success, field).toBe(false)
  }
  const invalid = structuredClone(example)
  invalid.comparison.rfQualified = true
  expect(RelayFeed.safeParse(invalid).success).toBe(false)
  const grid = structuredClone(example)
  grid.comparison.grid.elapsedS[1] = 121
  expect(RelayFeed.safeParse(grid).success).toBe(false)
  const hops = structuredClone(example)
  hops.comparison.samples.viaRelayAvailable[0] = false
  expect(RelayFeed.safeParse(hops).success).toBe(false)
  const units = structuredClone(example)
  units.scenarios[0]!.longest_gap_h = 55080
  expect(RelayFeed.safeParse(units).success).toBe(false)
  const clipping = structuredClone(example)
  clipping.comparison.direct.blackoutIntervals[0]!.startClipped = false
  expect(RelayFeed.safeParse(clipping).success).toBe(false)
})

test('relay manifests require an explicit complete scenario identity', async () => {
  const manifest = RelayManifest.parse({
    schemaVersion: 'skyline-relay-manifest/1.0.0',
    siteId: 'CR1',
    scenarioSelectionRequired: true,
    scenarioPathTemplate: 'scenarios/{scenarioId}.json',
  })
  expect(manifest.scenarioSelectionRequired).toBe(true)
  const missing = await loadFeed('relay', 'CR1')
  expect(missing.state).toBe('not_computed')
  if (missing.state === 'not_computed') expect(missing.reason).toContain('scenario identity')
  const loaded = await loadFeed('relay', 'CR1', example.scenarioId)
  expect(loaded.state, JSON.stringify(loaded)).toBe('ready')
  expect((await loadFeed('relay', 'CR1', 'wrong')).state).toBe('invalid')
  expect((await loadFeed('relay', 'SR1', example.scenarioId)).state).toBe('invalid')
})
