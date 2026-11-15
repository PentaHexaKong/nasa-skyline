import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { DynamicSiteReference, ReferenceVisibilityLanes } from '~/components/dynamicSiteReference'
import backendRequest from '../../../contracts/referenceRequest.schema.json'
import backendWindow from '../../../contracts/referenceWindow.schema.json'
import computedExample from '../../../examples/scientificResponse.computed.json'
import { loadReferenceSite, loadSummary, type Summary } from './data'
import frontendRequest from './referenceRequest.schema.json'
import {
  annualSummary,
  annualWindows,
  evaluateReference,
  queueReference,
  type ReferenceData,
  referenceDays,
  referenceEarth,
  referenceRequest,
  referenceSource,
  referenceTrack,
  utc,
  utcDayMs,
} from './referenceScience'
import frontendWindow from './referenceWindow.schema.json'
import { parseScientificResponse } from './scientificContract'
import type { ComputedResponse, Interval } from './scientificContract.generated'

let site: Summary
beforeAll(async () => {
  site = await loadSummary('connecting-ridge')
})
afterEach(() => vi.unstubAllGlobals())
const response = () => parseScientificResponse(structuredClone(computedExample)) as ComputedResponse
const payload = () => {
  const value = response()
  value.provenance.sampling.referenceWindow = {
    schemaVersion: 'skyline-reference-window/1.0.0',
    startUtc: '2025-01-06T00:00:00Z',
    endUtc: '2025-01-07T00:00:00Z',
    startEt: 0,
    endEt: 86400,
    days: [{ date: '2025-01-06', startS: 0, endS: 86400 }],
  }
  return value
}
const input = () =>
  referenceRequest(
    { ...site, site: { ...site.site, observer_height_m: 0 } },
    Date.parse('2025-01-06T00:00:00Z'),
    Date.parse('2025-01-07T00:00:00Z'),
  )!

function syntheticYear(year: number): ReferenceData[] {
  const origin = Date.UTC(year, 0, 1)
  const final = Date.UTC(year + 1, 0, 1)
  const duration = (final - origin) / 1000
  return annualWindows(year).map((window) => {
    const start = (window.start - origin) / 1000
    const end = (window.end - origin) / 1000
    const value = response()
    const intervals = (bounds: [number, number][]): Interval[] =>
      bounds.flatMap(([left, right]) => {
        const clippedStart = Math.max(start, left)
        const clippedEnd = Math.min(end, right)
        return clippedEnd > clippedStart
          ? [
              {
                startS: clippedStart - start,
                endS: clippedEnd - start,
                startUtc: utc(origin + clippedStart * 1000),
                endUtc: utc(origin + clippedEnd * 1000),
                startClipped: clippedStart === start,
                endClipped: clippedEnd === end,
              },
            ]
          : []
      })
    value.result.sunlightIntervals.available = intervals([
      [0, 5 * 86400],
      [30 * 86400, duration],
    ])
    value.result.sunlightIntervals.unavailable = intervals([[5 * 86400, 30 * 86400]])
    value.result.directEarthIntervals.available = intervals([[40 * 86400, duration]])
    value.result.directEarthIntervals.unavailable = intervals([[0, 40 * 86400]])
    value.result.metrics.sunlightDurationS = value.result.sunlightIntervals.available.reduce(
      (sum, interval) => sum + interval.endS - interval.startS,
      0,
    )
    value.result.metrics.directEarthDurationS = value.result.directEarthIntervals.available.reduce(
      (sum, interval) => sum + interval.endS - interval.startS,
      0,
    )
    const days = Array.from({ length: (window.end - window.start) / utcDayMs }, (_, index) => ({
      date: utc(window.start + index * utcDayMs).slice(0, 10),
      startS: index * 86400,
      endS: (index + 1) * 86400,
    }))
    return {
      response: value,
      window: {
        schemaVersion: 'skyline-reference-window/1.0.0',
        startUtc: utc(window.start),
        endUtc: utc(window.end),
        startEt: start,
        endEt: end,
        days,
      },
    }
  })
}

test('published request and exact-UTC metadata schemas match the authoritative backend', () => {
  expect(frontendRequest).toEqual(backendRequest)
  expect(frontendWindow).toEqual(backendWindow)
})

test.each([2026, 2028])('annual %i windows are bounded, contiguous and include every UTC calendar day', (year) => {
  const windows = annualWindows(year)
  expect(windows).toHaveLength(27)
  expect(windows[0]!.start).toBe(Date.UTC(year, 0, 1))
  expect(windows.at(-1)!.end).toBe(Date.UTC(year + 1, 0, 1))
  windows.forEach((window, index) => {
    expect(window.end - window.start).toBeLessThanOrEqual(14 * utcDayMs)
    if (index) expect(window.start).toBe(windows[index - 1]!.end)
  })
  expect(windows.reduce((sum, window) => sum + (window.end - window.start) / utcDayMs, 0)).toBe(year === 2028 ? 366 : 365)
})

test('unsupported sites do not acquire scientific mappings', async () => {
  expect(referenceRequest(await loadSummary('apollo11'), Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2))).toBeNull()
})

test('reference request retains height, epoch and scientific settings', () => {
  const request = input()
  expect(request).toMatchObject({
    site: 'CR1',
    observerHeightM: 0,
    profile: 'geometric',
    localResolutionM: 80,
    cadenceS: 3600,
    startUtc: '2025-01-06T00:00:00Z',
    endUtc: '2025-01-07T00:00:00Z',
  })
})

test('full schema and exact ET metadata validate before using a computed reference', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload())))),
  )
  const result = await evaluateReference(input())
  expect(result.state).toBe('computed')
  if (result.state !== 'computed') throw new Error('Expected computed fixture')
  expect(referenceDays(result.data)[0]!.durationS).toBe(86400)
  expect(referenceDays(result.data)[0]!.sunlightDurationS).toBe(computedExample.result.metrics.sunlightDurationS)
  expect(referenceTrack(result.data).earth).toBeUndefined()
  expect(referenceEarth(result.data, result.data.response).reference.visible).toBe(
    result.data.response.result.samples[0]!.earth.centerVisible,
  )
})

test.each(['wrongDate', 'gap', 'wrongEnd', 'wrongDuration', 'wrongObserver'] as const)(
  'rejects %s in a reference response',
  async (kind) => {
    const changed = payload()
    const window = changed.provenance.sampling.referenceWindow as ReferenceData['window']
    if (kind === 'wrongDate') window.days[0]!.date = '2025-01-05'
    if (kind === 'gap') window.days[0]!.startS = 1
    if (kind === 'wrongEnd') window.endUtc = '2025-01-08T00:00:00Z'
    if (kind === 'wrongDuration') window.endEt += 1
    if (kind === 'wrongObserver') changed.result.observer.observerHeightM = 2
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(changed)))),
    )
    await expect(evaluateReference(input())).rejects.toThrow()
  },
)

test('annual metrics use complete coverage and join blackouts across chunk boundaries', () => {
  const chunks = syntheticYear(2026)
  const summary = annualSummary(chunks, 2026)!
  expect(summary.durationS).toBe(365 * 86400)
  expect(summary.sunlightAvailabilityFraction).toBeCloseTo(340 / 365)
  expect(summary.directEarthAvailabilityFraction).toBeCloseTo(325 / 365)
  expect(summary.longestDarkness).toEqual({ durationS: 25 * 86400, touchesCoverageBoundary: false })
  expect(summary.longestDirectEarthBlackout).toEqual({ durationS: 40 * 86400, touchesCoverageBoundary: true })
  expect(annualSummary(chunks.slice(0, -1), 2026)).toBeNull()
  expect(annualSummary([], 2026)).toBeNull()
  expect(chunks.flatMap(referenceDays)).toHaveLength(365)
})

test('leap-year totals include February 29 with the actual denominator', () => {
  const chunks = syntheticYear(2028)
  expect(chunks.flatMap(referenceDays).some((day) => day.date === '2028-02-29')).toBe(true)
  expect(annualSummary(chunks, 2028)!.durationS).toBe(366 * 86400)
})

test.each(['gap', 'overlap', 'kernel', 'observer', 'horizon', 'cadence'] as const)('rejects mixed or discontinuous annual %s', (kind) => {
  const chunks = syntheticYear(2026)
  if (kind === 'gap') chunks[1]!.window.startEt += 1
  if (kind === 'overlap') chunks[1]!.window.startEt -= 1
  if (kind === 'kernel') chunks[1]!.response.provenance.kernels['naif0012.tls'] = '0'.repeat(64)
  if (kind === 'observer') chunks[1]!.response.result.observer.observerHeightM += 1
  if (kind === 'horizon') chunks[1]!.response.result.skyline.terrainElevationDeg[0]! += 1
  if (kind === 'cadence') chunks[1]!.response.request.cadenceS = 600
  expect(() => annualSummary(chunks, 2026)).toThrow()
})

test('source consistency distinguishes physical identity from sampling settings', () => {
  const first = response()
  const second = response()
  second.request.cadenceS = 600
  expect(referenceSource(first)).not.toBe(referenceSource(second))
  expect(referenceSource(first, false)).toBe(referenceSource(second, false))
  second.provenance.kernels['naif0012.tls'] = '0'.repeat(64)
  expect(referenceSource(first, false)).not.toBe(referenceSource(second, false))
})

test('pending interactive queries run ahead of the next background chunk', async () => {
  const order: string[] = []
  let finish!: () => void
  const first = queueReference(
    async () => {
      order.push('first')
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return 1
    },
    () => true,
    true,
  )
  const background = queueReference(
    async () => {
      order.push('background')
      return 2
    },
    () => true,
    true,
  )
  const interactive = queueReference(
    async () => {
      order.push('interactive')
      return 3
    },
    () => true,
  )
  finish()
  expect(await Promise.all([first, background, interactive])).toEqual([1, 2, 3])
  expect(order).toEqual(['first', 'interactive', 'background'])
})

test('obsolete queued requests are dropped before starting a scientific evaluation', async () => {
  const run = vi.fn(async () => 1)
  expect(await queueReference(run, () => false)).toBeNull()
  expect(run).not.toHaveBeenCalled()
})

test('the actual annual report renders pending states and unknown days before hydration', () => {
  const html = renderToStaticMarkup(createElement(DynamicSiteReference, { site, search: {}, go: () => {}, onSite: () => {} }))
  expect(html).toContain('UTC annual report')
  expect(html).toContain('not computed')
  expect(html).toContain('0 / 27 bounded windows')
  expect(html).not.toContain('Annual sunlight</dt>')
  expect(html).not.toContain('0.0 %')
})

test('an unsupported annual observer stays visible without percentages or a flat horizon', async () => {
  const unsupported = await loadSummary('apollo11')
  const html = renderToStaticMarkup(createElement(DynamicSiteReference, { site: unsupported, search: {}, go: () => {}, onSite: () => {} }))
  expect(html).toContain('unsupported')
  expect(html).toContain('verified equatorial terrain')
  expect(html).not.toContain('Annual sunlight</dt>')
  expect(html).not.toContain('Live scientific skyline')
})

test('calendar construction preserves years below 100 and delegates uncovered epochs to the engine', () => {
  expect(annualWindows(1)[0]!.start).toBe(Date.parse('0001-01-01T00:00:00Z'))
  expect(annualWindows(2099)[0]!.start).toBe(Date.parse('2099-01-01T00:00:00Z'))
  expect(() => annualWindows(0)).toThrow()
})

test('live reference routes load catalog metadata without annual scientific fields', async () => {
  const reference = await loadReferenceSite('connecting-ridge')
  expect(reference.site.id).toBe('connecting-ridge')
  expect(reference.site.observer_height_m).toBe(site.site.observer_height_m)
  expect(reference).not.toHaveProperty('days')
  expect(reference).not.toHaveProperty('skyline')
  expect(reference).not.toHaveProperty('intervals')
  await expect(loadReferenceSite('unknown')).rejects.toThrow('catalogue')
})

test('elapsed track and communication coordinates preserve leap-second samples', () => {
  const value = response()
  value.result.samples[0]!.timestampUtc = '2016-12-31T23:59:60.000000Z'
  value.result.samples[0]!.elapsedS = 86400
  const data: ReferenceData = {
    response: value,
    window: {
      schemaVersion: 'skyline-reference-window/1.0.0',
      startUtc: '2016-12-31T00:00:00Z',
      endUtc: '2017-01-01T00:00:00Z',
      startEt: 0,
      endEt: 86401,
      days: [{ date: '2016-12-31', startS: 0, endS: 86401 }],
    },
  }
  expect(referenceTrack(data).t_min[0]).toBe(1440)
  expect(referenceTrack(data).t_min.every(Number.isFinite)).toBe(true)
  expect(referenceEarth(data, value).lane!.flat().every(Number.isFinite)).toBe(true)
})

test('visibility lanes keep original leap-second UTC bounds and exact elapsed duration', () => {
  const value = response()
  value.result.period.durationS = 86401
  value.result.sunlightIntervals.available = [
    {
      startUtc: '2016-12-31T23:59:60.000000Z',
      endUtc: '2017-01-01T00:00:00.000000Z',
      startS: 86400,
      endS: 86401,
      startClipped: false,
      endClipped: true,
    },
  ]
  const html = renderToStaticMarkup(createElement(ReferenceVisibilityLanes, { response: value }))
  expect(html).toContain('2016-12-31T23:59:60.000000Z')
  expect(html).toContain('24.000278')
  expect(html).not.toContain('NaN')
})
