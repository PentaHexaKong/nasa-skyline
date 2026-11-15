import { expect, test } from 'vitest'
import catalog from '../../../examples/siteCatalog.json'
import metadata from '../../data/catalogue/sites.json'
import { loadReferenceSite, REFERENCE_SITES } from './data'
import { SERVICE_SITE } from './missionScience'
import { referenceRequest } from './referenceScience'
import { roverRequest } from './roverLive'

test('frontend catalogue mirrors canonical coordinates, frame and capability without aliases', () => {
  expect(REFERENCE_SITES).toEqual(metadata)
  expect(REFERENCE_SITES).toHaveLength(13)
  expect(catalog.aliases).toEqual({})
  for (const entry of REFERENCE_SITES) {
    const canonical = catalog.sites.find((site) => site.canonicalId === entry.canonicalId)
    expect(canonical).toBeDefined()
    expect(entry.latitudeDeg).toBe(canonical?.latitudeDeg)
    expect(entry.longitudeDegEast).toBe(canonical?.longitudeDegEast)
    expect(entry.frame).toBe(canonical?.frame)
    expect(entry.liveEvaluation).toBe(canonical?.liveEvaluation)
    expect(entry.coordinateSource).toBe(canonical?.coordinateSource)
  }
})

test('all missions have provenance-tracked entries and distinct role identities', () => {
  expect(new Set(REFERENCE_SITES.filter((entry) => entry.agency).map((entry) => entry.agency))).toEqual(
    new Set(['CNSA', 'ISRO', 'JAXA', 'Roscosmos']),
  )
  const ce6 = REFERENCE_SITES.find((entry) => entry.id === 'change6')!
  expect(ce6.publishedElevationM).toBe(-5256)
  expect(ce6.uncertaintyComponent).toBe('horizontal')
  const target = REFERENCE_SITES.find((entry) => entry.id === 'luna25-target')!
  const impact = REFERENCE_SITES.find((entry) => entry.id === 'luna25-impact')!
  expect(target.latitudeDeg).not.toBe(impact.latitudeDeg)
  expect(target.publishedElevationM).toBeNull()
})

test('exploratory requests retain canonical observer and actual terrain resolution', async () => {
  for (const entry of REFERENCE_SITES) {
    const reference = await loadReferenceSite(entry.id)
    const request = referenceRequest(reference, Date.UTC(2026, 10, 20), Date.UTC(2026, 10, 21))
    if (!entry.liveEvaluation.startsWith('supported')) {
      expect(request).toBeNull()
      expect(SERVICE_SITE[entry.id]).toBeUndefined()
      continue
    }
    expect(request).toMatchObject({ site: entry.canonicalId, localResolutionM: entry.terrainResolutionM, observerHeightM: 2 })
    if (!['CR1', 'GR1', 'SR1'].includes(entry.canonicalId)) {
      expect(roverRequest(entry.id, Date.UTC(2026, 10, 20))).toBeNull()
    }
  }
})
