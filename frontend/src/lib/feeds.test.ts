import { expect, test } from 'vitest'
import { z } from 'zod'
import mastExample from '../../../examples/mastPowerResponse.computed.json'
import { FEED_SCHEMAS, PowerFeed } from './feed-schemas'
import { feedDelivered, loadFeed } from './feeds'

const fixtures = import.meta.glob<{ default: unknown }>('../../fixtures/feeds/**/*.json', { eager: true })
const contracts = import.meta.glob<{ default: unknown }>('../../../contracts/feeds/*.json', { eager: true })

const feedOf = (path: string) => path.replace('../../fixtures/feeds/', '').split(/[/.]/)[0] as keyof typeof FEED_SCHEMAS

test('every fixture matches its contract and says it is a fixture', () => {
  const entries = Object.entries(fixtures)
  expect(entries.length).toBeGreaterThanOrEqual(5)
  for (const [path, file] of entries) {
    expect(FEED_SCHEMAS[feedOf(path)].parse(file.default).origin, path).toBe('fixture')
  }
})

test('the exported JSON Schemas match the frontend contract', () => {
  for (const [name, schema] of Object.entries(FEED_SCHEMAS)) {
    const written = contracts[`../../../contracts/feeds/${name}.schema.json`]?.default
    expect(written, `${name}: run pnpm contracts`).toEqual(z.toJSONSchema(schema, { io: 'input' }))
  }
})

test('the contract rejects a share over 1 and a feed without an origin', () => {
  const good = fixtures['../../fixtures/feeds/power/connecting-ridge.json']?.default as {
    origin?: string
    outcomes: { sun_share: number }[]
  }
  expect(PowerFeed.safeParse(good).success).toBe(true)
  const over = structuredClone(good)
  ;(over.outcomes[0] as { sun_share: number }).sun_share = 1.2
  expect(PowerFeed.safeParse(over).success).toBe(false)
  const unlabelled = structuredClone(good)
  delete unlabelled.origin
  expect(PowerFeed.safeParse(unlabelled).success).toBe(false)
})

test('a feed with no delivered file is not computed, not an error', async () => {
  expect(await loadFeed('power', 'no-such-site')).toEqual({ state: 'not_computed', path: 'power/no-such-site.json' })
})

test('power scenario manifests require explicit selection and preserve a zero-height baseline', async () => {
  const missingSelection = await loadFeed('power', 'CR1')
  expect(missingSelection.state).toBe('not_computed')
  if (missingSelection.state === 'not_computed') expect(missingSelection.reason).toContain('scenario identity')
  const loaded = await loadFeed('power', 'CR1', mastExample.scenarioId)
  expect(loaded.state, JSON.stringify({ expectedScenario: mastExample.scenarioId, loaded })).toBe('ready')
  if (loaded.state === 'ready') {
    expect(loaded.data.outcomes[0]?.mast_m).toBe(0)
    expect(loaded.data.panelGeometry?.verticalAzimuthDeg).toBe(90)
    expect(loaded.data.outcomes[1]?.potential_tracking).toBeGreaterThanOrEqual(0)
  }
  const scenarioFiles = import.meta.glob('../data/generated/feeds/power/scenarios/*.json')
  expect(Object.keys(scenarioFiles).length).toBeGreaterThanOrEqual(1)
  for (const path of Object.keys(scenarioFiles)) {
    const scenarioId = path
      .split('/')
      .at(-1)!
      .replace(/\.json$/, '')
    expect((await loadFeed('power', 'CR1', scenarioId)).state, scenarioId).toBe('ready')
  }
  expect((await loadFeed('power', 'CR1', 'wrong')).state).toBe('invalid')
})

test('a feed delivered for the science engine study points never counts for an app site', () => {
  // power/CR1.json, relay/{CR1,GR1,SR1}.json come from the scientificEngine branch; no app site has its own file yet.
  expect(feedDelivered('power', ['CR1'])).toBe(true)
  expect(feedDelivered('relay', ['GR1', 'SR1'])).toBe(true)
  for (const id of ['connecting-ridge', 'malapert-massif', 'im2-mons-mouton', 'im1-malapert', 'apollo11']) {
    expect(feedDelivered('power', [id])).toBe(false)
    expect(feedDelivered('mast', [id])).toBe(false)
    expect(feedDelivered('relay', [id])).toBe(false)
  }
  // Without sites, any delivered file of the feed counts; a feed with no file at all does not.
  expect(feedDelivered('relay')).toBe(true)
  expect(feedDelivered('validation')).toBe(false)
})
