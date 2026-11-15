import { expect, test } from 'vitest'
import { resolvePlan } from '~/components/planner/resolvePlan'
import { loadSummary, MOON_SITES } from './data'
import { DAY_MS } from './mission'
import { buildRequest, evaluateAll, readResponse, SERVICE_SITE, SITE_CAPABILITIES } from './missionScience'
import { PROFILES } from './profiles'

const examples = import.meta.glob<{ default: Record<string, unknown> }>(
  '../../../examples/{siteCatalog,scientificRequest,scientificResponse.computed}.json',
  {
    eager: true,
  },
)
const example = (name: string) => {
  const hit = Object.entries(examples).find(([path]) => path.endsWith(`/${name}.json`))
  if (!hit) throw new Error(`No example ${name}`)
  return hit[1].default
}

const limits = { minSun: 70, maxNoSun: 72, minEarth: 40, maxNoEarth: 96 }
const start = Date.parse('2026-11-20T12:00:00Z')

test('profile, date, site and limit edits resolve into the bridge request without losing units or catalogue identities', async () => {
  const summaries = await Promise.all(MOON_SITES.map((site) => loadSummary(site.id)))
  for (const profile of PROFILES) {
    const selected = summaries.at(-1)
    if (!selected) throw new Error('No computed sites')
    const plan = resolvePlan(summaries, {
      profile: profile.id,
      sites: selected.site.id,
      day: profile.day,
      t: 780,
      stay: 9,
      minSun: 73,
      maxNoSun: 48,
      minEarth: 55,
      maxNoEarth: 36,
    })
    expect(plan.sites).toHaveLength(1)
    const request = buildRequest(plan.sites[0]!.data, plan.window, plan.requirements)
    expect(request).toMatchObject({
      site: SERVICE_SITE[selected.site.id],
      startUtc: `${profile.day}T13:00:00Z`,
      durationS: 9 * 86400,
      solarDefinition: 'anyDisk',
      earthDefinition: 'center',
      constraints: { minimumSolar: 0.73, minimumEarth: 0.55, maximumSolarOutageS: 48 * 3600, maximumEarthOutageS: 36 * 3600 },
    })
  }
})

test('live supported sites match catalog coordinates and unverified sites have no live request', async () => {
  const catalog = example('siteCatalog') as { sites: { canonicalId: string; latitudeDeg: number; longitudeDegEast: number }[] }
  for (const s of MOON_SITES) {
    const data = await loadSummary(s.id)
    if (!SERVICE_SITE[s.id]) {
      expect(SITE_CAPABILITIES[s.id]?.liveEvaluation).toBe('unverified')
      expect(buildRequest(data, { start, end: start + DAY_MS }, limits)).toBeNull()
      continue
    }
    const entry = catalog.sites.find((c) => c.canonicalId === SERVICE_SITE[s.id])
    expect(entry, s.id).toBeDefined()
    expect(Math.abs((entry?.latitudeDeg ?? 0) - data.site.lat_deg)).toBeLessThan(1e-3)
    expect(Math.abs((entry?.longitudeDegEast ?? 0) - data.site.lon_deg_east)).toBeLessThan(1e-3)
  }
})

test('a planned stay becomes a request with the same keys as the contract example', async () => {
  const data = await loadSummary('connecting-ridge')
  const req = buildRequest(data, { start, end: start + 7 * DAY_MS }, limits)
  expect(req).not.toBeNull()
  expect(Object.keys(req ?? {}).sort()).toEqual(Object.keys(example('scientificRequest')).sort())
  expect(req).toMatchObject({
    site: 'CR1',
    startUtc: '2026-11-20T12:00:00Z',
    durationS: 7 * 86400,
    cadenceS: 3600,
    solarDefinition: 'anyDisk',
    earthDefinition: 'center',
    constraints: { minimumSolar: 0.7, minimumEarth: 0.4, maximumSolarOutageS: 72 * 3600, maximumEarthOutageS: 96 * 3600 },
  })
  // The service admits at most 6000 sample intervals per request.
  expect((req?.durationS ?? 0) / (req?.cadenceS ?? 1)).toBeLessThanOrEqual(6000)
})

test('the computed contract example reads back as the planner’s four readings, with provenance', () => {
  const r = readResponse('connecting-ridge', example('scientificResponse.computed'))
  if ('error' in r) throw new Error(r.error)
  expect(r.serviceSite).toBe('CR1')
  expect(r.sunShare).toBe(1)
  expect(r.earthShare).toBeCloseTo(0.3626, 4)
  expect(r.noSun.hours).toBe(0)
  expect(r.noEarth.hours).toBeCloseTo(55073.8275 / 3600, 4)
  expect(r.noEarth.truncated).toBe(true)
  expect(r.provenance.algorithm).toBe((example('scientificResponse.computed').provenance as { algorithmVersion: string }).algorithmVersion)
  expect(r.provenance.kernels.length).toBeGreaterThan(0)
  expect(r.provenance.dems).toContain('LDEM_80S_80MPP_ADJ.TIF')
})

test('unavailable answers and broken bodies become errors, never readings', () => {
  const unavailable = {
    schemaVersion: 'skyline-scientific-response/1.0.0',
    dataState: 'unavailable',
    error: { code: 'busy', message: 'Scientific service is evaluating another request' },
  }
  expect(readResponse('x', unavailable)).toEqual({ error: 'Scientific service is evaluating another request' })
  expect('error' in readResponse('x', { hello: 1 })).toBe(true)
})

test('each site goes to the service in order, one call at a time, and each answer comes back to its own site', async () => {
  const data = await Promise.all(MOON_SITES.filter((s) => SERVICE_SITE[s.id]).map((s) => loadSummary(s.id)))
  const computed = example('scientificResponse.computed')
  const calls: { url: string; body: { site: string } }[] = []
  const envelope = (code: string) => ({
    schemaVersion: 'skyline-scientific-response/1.0.0',
    dataState: 'unavailable',
    error: { code, message: code },
  })
  const answers = [
    [200, computed],
    [503, { schemaVersion: 'skyline-scientific-response/1.0.0', dataState: 'unavailable' }],
    [502, envelope('mission_science_unavailable')],
  ] as const
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const [status, body] = answers[calls.length] ?? [500, {}]
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const got: Record<string, unknown> = {}
  try {
    await evaluateAll(data, { start, end: start + DAY_MS }, limits, (id, r) => {
      got[id] = r
    })
  } finally {
    globalThis.fetch = real
  }
  expect(calls).toHaveLength(data.length)
  expect(new Set(calls.map((c) => c.url))).toEqual(new Set(['/api/mission-science/v1/scientific-evaluations']))
  expect(calls.map((c) => c.body.site)).toEqual(data.map((d) => SERVICE_SITE[d.site.id]))
  expect(got[data[0]?.site.id ?? '']).toMatchObject({ serviceSite: 'CR1' })
  expect(got[data[1]?.site.id ?? '']).toEqual({ error: 'The service is busy with another evaluation (HTTP 503). Try again.' })
  expect(got[data[2]?.site.id ?? '']).toEqual({ error: 'The mission-science service is not reachable.' })
})

test('an unreachable bridge is reported for every site, never as a number', async () => {
  const data = await Promise.all(MOON_SITES.filter((s) => SERVICE_SITE[s.id]).map((s) => loadSummary(s.id)))
  const real = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  const got: unknown[] = []
  try {
    await evaluateAll(data, { start, end: start + DAY_MS }, limits, (_, r) => got.push(r))
  } finally {
    globalThis.fetch = real
  }
  expect(got).toEqual(data.map(() => ({ error: 'The API bridge is not reachable.' })))
})

test('a run cancelled while an answer is arriving reports nothing for the old plan', async () => {
  const data = await Promise.all(MOON_SITES.filter((s) => SERVICE_SITE[s.id]).map((s) => loadSummary(s.id)))
  const c = new AbortController()
  const real = globalThis.fetch
  globalThis.fetch = (async () =>
    ({
      status: 200,
      json: async () => {
        c.abort()
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
    }) as unknown as Response) as unknown as typeof fetch
  const got: unknown[] = []
  try {
    await expect(evaluateAll(data, { start, end: start + DAY_MS }, limits, (_, r) => got.push(r), undefined, c.signal)).rejects.toThrow()
  } finally {
    globalThis.fetch = real
  }
  expect(got).toEqual([])
})
