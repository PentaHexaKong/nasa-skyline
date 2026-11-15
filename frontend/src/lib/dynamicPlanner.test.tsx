import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { type Plan, planSearch } from '~/components/planner/plan'
import { resolvePlan } from '~/components/planner/resolvePlan'
import { ScientificBaseline } from '~/components/planner/ScientificBaseline'
import { siteAnswer } from '~/components/planner/SiteSelector'
import computedExample from '../../../examples/scientificResponse.computed.json'
import { loadSummary, MOON_SITES, type Summary } from './data'
import {
  buildScientificBrief,
  initialPlannerRows,
  type PlannerRow,
  type PlannerRows,
  plannerHeadline,
  plannerInputs,
  runPlannerRequests,
  scientificMeasure,
  scientificPlan,
  scientificTouchdown,
  verifyPlannerResponse,
} from './dynamicPlanner'
import type { ScientificRequest } from './missionScience'
import { parseScientificResponse } from './scientificContract'
import type { ComputedResponse } from './scientificContract.generated'

let all: Summary[]
let selected: Plan
const response = () => parseScientificResponse(structuredClone(computedExample)) as ComputedResponse
const request = () => response().request as ScientificRequest
const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))

beforeAll(async () => {
  all = await Promise.all(MOON_SITES.map((site) => loadSummary(site.id)))
  selected = resolvePlan(all, planSearch.parse({ sites: 'connecting-ridge', stay: 1 }))
})
afterEach(() => vi.unstubAllGlobals())

test('pending, failed and unsupported missions clear every annual baseline value', () => {
  for (const state of ['loading', 'not_computed', 'unsupported', 'unavailable', 'failed'] as const) {
    const rows: PlannerRows = { 'connecting-ridge': { state, message: 'Scientific state fixture' } }
    const plan = scientificPlan(selected, rows)
    const site = plan.sites[0]!
    expect(site).toMatchObject({ stay: null, checks: null, was: null, wasGo: null, nextGo: null, goDays: 0, runs: [] })
    const html = renderToStaticMarkup(<ScientificBaseline plan={plan} rows={rows} refresh={() => {}} />)
    expect(html).toContain(state)
    expect(html).toContain('Scientific state fixture')
    expect(html).not.toContain('0.0 %')
    expect(buildScientificBrief(plan, rows)).toContain(`Scientific state ${state}`)
    expect(buildScientificBrief(plan, rows)).not.toContain('```json')
  }
})

test('request identity covers date, duration, observer height, site, profile and user limits', () => {
  const baseline = plannerInputs(selected)
  const changedDate = plannerInputs({
    ...selected,
    window: { start: selected.window.start + 86400000, end: selected.window.end + 86400000 },
  })
  expect(JSON.stringify(changedDate)).not.toBe(JSON.stringify(baseline))
  const changedHeight = {
    ...selected,
    sites: selected.sites.map((site) => ({
      ...site,
      data: { ...site.data, site: { ...site.data.site, observer_height_m: site.data.site.observer_height_m + 1 } },
    })),
  }
  expect(plannerInputs(changedHeight)[0]!.request!.observerHeightM).not.toBe(baseline[0]!.request!.observerHeightM)
  const changedLimits = plannerInputs({ ...selected, requirements: { ...selected.requirements, minSun: 33 } })
  expect(changedLimits[0]!.request!.constraints.minimumSolar).toBe(0.33)
  expect(baseline[0]!.request).toMatchObject({
    profile: 'geometric',
    localResolutionM: 80,
    eventToleranceS: 1,
    earthDefinition: 'center',
    solarDefinition: 'anyDisk',
  })
})

test('unverified sites remain visible, unsupported and never call the scientific API', async () => {
  const plan = resolvePlan(all, planSearch.parse({ sites: 'apollo11,shackleton-ridge' }))
  const inputs = plannerInputs(plan)
  const rows = initialPlannerRows(inputs, true)
  expect(Object.values(rows).map((row) => row.state)).toEqual(['unsupported', 'unsupported'])
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await runPlannerRequests(inputs, vi.fn(), () => true)
  expect(fetch).not.toHaveBeenCalled()
})

test('API fractions and blackout durations retain their SPICE ET denominator and boundary flags', () => {
  const result = response()
  verifyPlannerResponse(request(), result)
  const measure = scientificMeasure(result)
  expect(measure.sunShare).toBe(result.result.metrics.sunlightAvailabilityFraction)
  expect(measure.earthShare).toBe(result.result.metrics.directEarthAvailabilityFraction)
  expect(measure.noSun.hours).toBe(result.result.metrics.longestDarkness.durationS / 3600)
  expect(measure.noEarth.truncated).toBe(result.result.metrics.longestDirectEarthBlackout.touchesCoverageBoundary)
  expect(measure.window.end - measure.window.start).not.toBe(result.result.period.durationS * 1000)
  expect(measure.sun[0]).toEqual([
    Date.parse(result.result.sunlightIntervals.available[0]!.startUtc),
    Date.parse(result.result.sunlightIntervals.available[0]!.endUtc),
  ])
  expect(scientificTouchdown(result)).toBe(result.result.samples[0]!.sun.sunlightVisible ? 'earth_hidden' : 'neither')
})

test.each([
  'site',
  'startUtc',
  'durationS',
  'observerHeightM',
  'profile',
  'cadenceS',
  'localResolutionM',
  'solarDefinition',
  'horizonOffsetDeg',
  'eventToleranceS',
] as const)('rejects a mismatched response %s even when its JSON schema is valid', (field) => {
  const changed = response()
  Object.assign(changed.request, { [field]: 'mismatch' })
  expect(() => verifyPlannerResponse(request(), changed)).toThrow('identity')
})

test('rejects different constraints, observer realization, period, profile and missing terrain', () => {
  const mutations: ((value: ComputedResponse) => void)[] = [
    (value) => {
      value.request.constraints!.minimumSolar = 0.42
    },
    (value) => {
      value.result.observer.siteId = 'GR1'
    },
    (value) => {
      value.result.observer.observerHeightM = 20
    },
    (value) => {
      value.result.period.durationS = 90000
    },
    (value) => {
      value.result.metrics.denominatorS = 90000
    },
    (value) => {
      value.provenance.scientificProfile = 'apparent'
    },
    (value) => {
      value.result.skyline.coverage.missingData = true
    },
    (value) => {
      value.result.samples = []
    },
  ]
  for (const mutate of mutations) {
    const changed = response()
    mutate(changed)
    expect(() => verifyPlannerResponse(request(), changed)).toThrow()
  }
})

test('sequential API responses populate the baseline, verdict and complete provenance brief', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => reply(computedExample))
  vi.stubGlobal('fetch', fetch)
  const rows: PlannerRows = {}
  await runPlannerRequests(
    [{ siteId: 'connecting-ridge', request: request() }],
    (id, row) => {
      rows[id] = row
    },
    () => true,
  )
  expect(rows['connecting-ridge']!.state).toBe('computed')
  expect(fetch.mock.calls[0]![0]).toBe('/api/mission-science/v1/scientific-evaluations')
  const plan = scientificPlan(selected, rows)
  expect(plan.sites[0]!.stay).toEqual(scientificMeasure(response()))
  expect(plan.sites[0]!.was).toBeNull()
  expect(plan.sites[0]!.runs).toHaveLength(1)
  expect(siteAnswer(plan.sites[0]!, plan, plan.index + 1)).toMatchObject({ computed: false })
  const html = renderToStaticMarkup(<ScientificBaseline plan={plan} rows={rows} refresh={() => {}} />)
  expect(html).toContain(computedExample.scenarioId)
  expect(html).toContain('SPICE ET seconds')
  const brief = buildScientificBrief(plan, rows)
  expect(brief).toContain(computedExample.provenance.algorithmVersion)
  expect(brief).toContain('"independentlyValidated": false')
  for (const hash of Object.values(computedExample.provenance.kernels)) expect(brief).toContain(hash)
})

test('late replies from superseded missions cannot publish or start another site', async () => {
  let resolveReply!: (value: Response) => void
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolveReply = resolve
      }),
  )
  vi.stubGlobal('fetch', fetch)
  let current = true
  const publish = vi.fn()
  const pending = runPlannerRequests(
    [
      { siteId: 'connecting-ridge', request: request() },
      { siteId: 'de-gerlache-rim', request: { ...request(), site: 'GR1' } },
    ],
    publish,
    () => current,
  )
  current = false
  resolveReply(new Response(JSON.stringify(computedExample)))
  await pending
  expect(publish).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('service downtime produces an explicit failed state and no annual fallback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))
  const rows: PlannerRows = {}
  await runPlannerRequests(
    [{ siteId: 'connecting-ridge', request: request() }],
    (id, row) => {
      rows[id] = row
    },
    () => true,
  )
  expect(rows['connecting-ridge']).toEqual({ state: 'failed', message: 'Connection refused' })
  expect(scientificPlan(selected, rows).sites[0]!.stay).toBeNull()
  expect(plannerHeadline(rows, selected)).toContain('0 of 1 sites evaluated')
})

test.each(['unsupported', 'not_computed', 'unavailable', 'failed'] as const)('preserves the API %s state', async (state) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      reply({
        schemaVersion: computedExample.schemaVersion,
        dataState: state,
        scenarioId: null,
        request: request(),
        units: computedExample.units,
        result: null,
        provenance: null,
        coverage: null,
        error: { code: 'fixture', message: 'Authoritative state fixture' },
      }),
    ),
  )
  const publish = vi.fn()
  await runPlannerRequests([{ siteId: 'connecting-ridge', request: request() }], publish, () => true)
  expect(publish).toHaveBeenCalledWith('connecting-ridge', { state, message: 'Authoritative state fixture' })
})

test('re-evaluating an identical mission fetches a fresh response after the inflight call completes', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => reply(computedExample))
  vi.stubGlobal('fetch', fetch)
  const input = [{ siteId: 'connecting-ridge', request: request() }]
  await runPlannerRequests(input, vi.fn(), () => true)
  await runPlannerRequests(input, vi.fn(), () => true)
  expect(fetch).toHaveBeenCalledTimes(2)
})

const liveUrl = import.meta.env.VITE_PLANNER_LIVE_URL as string | undefined
test.runIf(Boolean(liveUrl)).each(['CR1', 'GR1', 'SR1'])(
  'live Go-to-Python planner evaluates %s at two dates',
  async (site) => {
    const nativeFetch = globalThis.fetch
    vi.stubGlobal('fetch', (url: string, options: RequestInit) => nativeFetch(new URL(url, liveUrl), options))
    const states: PlannerRow[] = []
    for (const startUtc of ['2026-11-20T00:00:00Z', '2026-12-05T00:00:00Z']) {
      const mission = { ...request(), site, startUtc, observerHeightM: 2 }
      await runPlannerRequests(
        [{ siteId: site, request: mission }],
        (_, row) => {
          states.push(row)
        },
        () => true,
      )
    }
    expect(states.map((row) => row.state)).toEqual(['computed', 'computed'])
    const computed = states.filter((row) => row.state === 'computed')
    expect(computed[0]!.response.scenarioId).not.toBe(computed[1]!.response.scenarioId)
    for (const row of computed) {
      const measure = scientificMeasure(row.response)
      expect(measure.sunShare).toBeGreaterThanOrEqual(0)
      expect(measure.sunShare).toBeLessThanOrEqual(1)
      expect(row.response.provenance.dems.length).toBeGreaterThan(0)
    }
  },
  180000,
)
