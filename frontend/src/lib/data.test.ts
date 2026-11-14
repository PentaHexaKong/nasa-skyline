import { expect, test } from 'vitest'
import { loadMoonEphemeris, loadSummary, loadTracks, MAP_SITES, MOON_SITES, NEIGHBOURS, readerReference, surfaceMetres } from './data'
import { earthTarget } from './target'

test('a Moon site parses with Earth as its comms target', async () => {
  const data = await loadSummary('connecting-ridge')
  expect(data.kind).toBe('lunar')
  expect(data.site.body).toBe('moon')
  const day = data.days[0]?.date ?? ''
  const track = (await loadTracks('connecting-ridge'))[day]
  expect(track?.earth?.t_min).toHaveLength(24)
  const target = earthTarget(data, track, day, 720)
  expect(target?.kind).toBe('earth')
  expect(target?.label).toBe('Earth')
  for (const [a, b] of target?.lane ?? []) expect(0 <= a && a < b && b <= 1440).toBe(true)
})

test('the Moon ephemeris covers the computed window hourly', async () => {
  const e = await loadMoonEphemeris()
  expect(e.subsolar_lat_deg).toHaveLength(365 * 24)
  expect(MOON_SITES.map((s) => s.id).sort()).toEqual([
    'apollo11',
    'connecting-ridge',
    'de-gerlache-rim',
    'shackleton-ridge',
    'shackleton-rim',
  ])
  expect(MAP_SITES.map((s) => s.id).sort()).toEqual(['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'])
})

test('reader reference: team to-dos leave the page, the "Unverified" mark stays', () => {
  expect(readerReference('Unverified: commonly described as the sunniest point on the rim. Find a primary source before citing.')).toBe(
    'Unverified: commonly described as the sunniest point on the rim.',
  )
  expect(readerReference('A lander touched down near here in 2025. Unverified: find a primary source before citing.')).toBe(
    'A lander touched down near here in 2025. Unverified.',
  )
  expect(readerReference('A region centre, not a landing point.')).toBe('A region centre, not a landing point.')
})

test('the sunniest spot on Connecting Ridge is its near neighbour, 212 m away', async () => {
  const [a, b] = await Promise.all([loadSummary('connecting-ridge'), loadSummary('shackleton-ridge')])
  expect(NEIGHBOURS['connecting-ridge']).toBe('shackleton-ridge')
  expect(NEIGHBOURS['shackleton-ridge']).toBe('connecting-ridge')
  expect(Math.round(surfaceMetres(a.site, b.site))).toBe(212)
})
