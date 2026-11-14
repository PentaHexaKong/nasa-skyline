import { expect, test } from 'vitest'
import {
  buildBrief,
  clip,
  evaluate,
  goWindows,
  HOUR_MS,
  intersect,
  landingDay,
  landingRuns,
  longestGap,
  type Measure,
  measure,
  measureStay,
  paretoFront,
  type Requirements,
  type SiteSpans,
  type Span,
  STUDY_OBJECTIVES,
  siteResult,
  smallestMeeting,
  studyRows,
  touchdown,
  verdict,
  whyNote,
} from './mission'

const h = (n: number) => n * HOUR_MS
const window10 = { start: 0, end: h(10) }

test('intersect keeps only the overlap of two sorted span lists', () => {
  expect(
    intersect(
      [
        [h(0), h(4)],
        [h(6), h(9)],
      ],
      [
        [h(2), h(7)],
        [h(8), h(12)],
      ],
    ),
  ).toEqual([
    [h(2), h(4)],
    [h(6), h(7)],
    [h(8), h(9)],
  ])
})

test('clip trims spans to the window and drops those outside it', () => {
  expect(
    clip(
      [
        [-h(2), h(1)],
        [h(3), h(4)],
        [h(11), h(12)],
      ],
      window10,
    ),
  ).toEqual([
    [0, h(1)],
    [h(3), h(4)],
  ])
})

test('longestGap flags a gap that touches the window edge, and not an inner one', () => {
  expect(
    longestGap(
      [
        [h(1), h(2)],
        [h(6), h(10)],
      ],
      window10,
    ),
  ).toEqual({ hours: 4, truncated: false })
  expect(longestGap([[h(0), h(3)]], window10)).toEqual({ hours: 7, truncated: true })
  expect(longestGap([], window10)).toEqual({ hours: 10, truncated: true })
})

const spans: SiteSpans = {
  sun: [[0, h(8)]],
  earth: [[h(4), h(10)]],
  both: [[h(4), h(8)]],
  coverage: { start: 0, end: h(100) },
}

test('measure reports shares, the overlap and both longest gaps', () => {
  const m = measure(spans, window10)
  expect(m.sunShare).toBeCloseTo(0.8)
  expect(m.earthShare).toBeCloseTo(0.6)
  expect(m.bothShare).toBeCloseTo(0.4)
  expect(m.noSun).toEqual({ hours: 2, truncated: true })
  expect(m.noEarth).toEqual({ hours: 4, truncated: true })
})

test('a stay past the computed range has no totals, and one inside it does', () => {
  expect(measureStay(spans, { start: h(90), end: h(110) })).toBe(null)
  expect(measureStay(spans, window10)?.sunShare).toBeCloseTo(0.8)
})

const loose: Requirements = { minSun: 50, maxNoSun: 5, minEarth: 50, maxNoEarth: 5 }

test('evaluate reports each requirement, and a missed bound fails only that check', () => {
  const e = evaluate(measure(spans, window10), { ...loose, minEarth: 70 })
  expect(e.checks.map((c) => [c.key, c.pass])).toEqual([
    ['minSun', true],
    ['maxNoSun', true],
    ['minEarth', false],
    ['maxNoEarth', true],
  ])
  expect(e.met).toBe(3)
  expect(e.passed).toBe(false)
})

test('landingDay needs Sun and Earth at touchdown, then the requirements over the stay', () => {
  expect(landingDay(spans, h(5), h(5), { ...loose, minSun: 0, minEarth: 0 })).toBe('go')
  expect(landingDay(spans, h(5), h(5), { ...loose, minSun: 90 })).toBe('arrive')
  expect(landingDay(spans, h(1), h(5), loose)).toBe('no')
  expect(landingDay(spans, h(98), h(5), loose)).toBe('outside')
})

test('landingRuns merges neighbouring days with the same status', () => {
  expect(landingRuns(['no', 'no', 'go', 'go', 'arrive'])).toEqual([
    { from: 0, to: 2, status: 'no' },
    { from: 2, to: 4, status: 'go' },
    { from: 4, to: 5, status: 'arrive' },
  ])
})

const candidate = (id: string, relay_count: number, a: [number, number], b: [number, number]) => ({
  id,
  label: id,
  relay_count,
  family: 'test',
  by_site: { a: { contact_share: a[0], longest_gap_h: a[1] }, b: { contact_share: b[0], longest_gap_h: b[1] } },
})

const candidates = [
  candidate('one', 1, [0.8, 40], [0.7, 50]),
  candidate('one-worse', 1, [0.6, 60], [0.6, 60]),
  candidate('two', 2, [0.95, 10], [0.9, 12]),
  candidate('three-same', 3, [0.95, 10], [0.9, 12]),
]

test('studyRows judges a candidate by its worst chosen site', () => {
  expect(studyRows(candidates, ['a', 'b'])[0]).toMatchObject({ relays: 1, share: 0.7, gapH: 50 })
  expect(studyRows(candidates, ['a', 'missing'])).toEqual([])
})

test('paretoFront drops a dominated candidate and one equal on all but relay count', () => {
  expect(paretoFront(studyRows(candidates, ['a', 'b']), STUDY_OBJECTIVES).map((r) => r.candidate.id)).toEqual(['one', 'two'])
})

test('smallestMeeting picks the fewest relays that meet the target, or nothing', () => {
  const rows = studyRows(candidates, ['a', 'b'])
  expect(smallestMeeting(rows, { minShare: 0.65, maxGapH: 55 })?.candidate.id).toBe('one')
  expect(smallestMeeting(rows, { minShare: 0.85, maxGapH: 20 })?.candidate.id).toBe('two')
  expect(smallestMeeting(rows, { minShare: 0.99, maxGapH: 1 })).toBeUndefined()
})

test('the brief states the window, flags truncated gaps and carries the claims limit', () => {
  const noSpan: Span[] = []
  const m: Measure = measure({ ...spans, sun: noSpan, both: noSpan }, window10)
  const brief = buildBrief({
    window: window10,
    requirements: loose,
    sites: [
      {
        name: 'Test ridge',
        lat: -89,
        lon: 10,
        measure: m,
        touchdown: 'sun_hidden',
        algorithm: '0.4.0',
        datasets: ['LDEM_80S_20MPP_ADJ.TIF'],
        kernels: ['de440s.bsp'],
      },
    ],
  })
  expect(brief).toContain('Window: 1970-01-01 00:00 to 1970-01-01 10:00 UTC')
  expect(brief).toContain('10.0 h or more')
  expect(brief).toContain('| Sun hidden |')
  expect(brief).toContain('2 of 4 (misses Sun in view, Longest without Sun)')
  expect(brief).toContain('Terrain: LDEM_80S_20MPP_ADJ.TIF')
  expect(brief).toContain('Geometry kernels: de440s.bsp')
  expect(brief).toContain('not delivered power')
})

test('the brief marks a stay past the computed range as not computed', () => {
  const brief = buildBrief({
    window: { start: h(90), end: h(110) },
    requirements: loose,
    sites: [{ name: 'Test ridge', lat: -89, lon: 10, measure: null, touchdown: 'both', algorithm: '0.4.0', datasets: [], kernels: [] }],
  })
  expect(brief).toContain(
    '| Test ridge | -89, 10 °E | Sun and Earth | not computed | not computed | not computed | not computed | not computed | not computed | not computed |',
  )
  expect(brief).toContain('Not computed: the stay runs past the computed year.')
})

test('touchdown says which body is hidden at the landing instant', () => {
  expect(touchdown(spans, h(5))).toBe('both')
  expect(touchdown(spans, h(9))).toBe('sun_hidden')
  expect(touchdown(spans, h(1))).toBe('earth_hidden')
  expect(touchdown(spans, h(20))).toBe('neither')
})

test('goWindows lists good runs that have not ended, as dates', () => {
  const dates = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']
  const runs = [
    { from: 0, to: 2, status: 'go' as const },
    { from: 2, to: 3, status: 'no' as const },
    { from: 3, to: 5, status: 'go' as const },
  ]
  expect(goWindows(runs, dates, 1)).toEqual([
    { from: '2026-11-14', to: '2026-11-15', days: 2 },
    { from: '2026-11-17', to: '2026-11-18', days: 2 },
  ])
  expect(goWindows(runs, dates, 2)).toEqual([{ from: '2026-11-17', to: '2026-11-18', days: 2 }])
})

const stayChecks = (missed: string[] = []) =>
  evaluate(measure(spans, window10), {
    minSun: missed.includes('Sun in view') ? 90 : 0,
    maxNoSun: missed.includes('Longest without Sun') ? 1 : 99,
    minEarth: missed.includes('Earth in view') ? 90 : 0,
    maxNoEarth: missed.includes('Longest without Earth') ? 1 : 99,
  })

test('verdict says when every site passes the stay but none can land', () => {
  expect(
    verdict(
      [
        { name: 'IM-2 Athena', touchdown: 'sun_hidden', checks: stayChecks(), nextGo: '2026-11-28' },
        { name: 'Malapert Massif', touchdown: 'earth_hidden', checks: stayChecks(), nextGo: '2026-11-30' },
        { name: 'Shackleton ridge', touchdown: 'earth_hidden', checks: stayChecks(), nextGo: '2026-11-30' },
      ],
      0,
    ),
  ).toEqual({
    headline: 'All 3 sites meet your stay requirements, but none has both the Sun and Earth at touchdown.',
    detail: 'IM-2 Athena has no direct Sun at touchdown. Malapert Massif and Shackleton ridge have no Earth at touchdown.',
    next: 'The first days that work are 28 Nov at IM-2 Athena and 30 Nov at Malapert Massif and Shackleton ridge.',
  })
})

test('verdict names the slip when every site fails after one', () => {
  const v = verdict(
    [
      {
        name: 'IM-2 Athena',
        touchdown: 'sun_hidden',
        checks: stayChecks(['Sun in view', 'Longest without Sun', 'Earth in view', 'Longest without Earth']),
        nextGo: null,
      },
      {
        name: 'Malapert Massif',
        touchdown: 'earth_hidden',
        checks: stayChecks(['Earth in view', 'Longest without Earth']),
        nextGo: '2026-11-30',
      },
    ],
    -7,
  )
  expect(v.headline).toBe('Landing 7 days early fails at every site.')
  expect(v.detail).toBe('IM-2 Athena misses all 4 requirements. Malapert Massif misses Earth in view and Longest without Earth.')
  expect(v.next).toBe('The first day that works is 30 Nov at Malapert Massif. No later day works at IM-2 Athena.')
})

test('verdict counts the sites that work and explains only the others', () => {
  expect(
    verdict(
      [
        { name: 'IM-2 Athena', touchdown: 'both', checks: stayChecks(), nextGo: '2026-11-28' },
        { name: 'Malapert Massif', touchdown: 'earth_hidden', checks: stayChecks(), nextGo: '2026-11-30' },
      ],
      1,
    ),
  ).toEqual({
    headline: '1 of 2 sites works for this landing.',
    detail: 'Malapert Massif has no Earth at touchdown.',
    next: 'The first day that works is 30 Nov at Malapert Massif.',
  })
})

test('verdict is plain when everything works, and refuses when a stay is not computed', () => {
  expect(verdict([{ name: 'A', touchdown: 'both', checks: stayChecks(), nextGo: '2026-11-28' }], 0)).toEqual({
    headline: 'A works for this landing.',
    detail: 'The Sun and Earth are in view at touchdown and every requirement holds over the stay.',
    next: '',
  })
  expect(verdict([{ name: 'A', touchdown: 'both', checks: null, nextGo: null }], 0).headline).toBe('This stay runs past the computed data.')
})

test('whyNote explains only the readings that look wrong', () => {
  expect(whyNote({ sunEl: -0.3, horizon: -1.6, inSun: true, earthEl: -0.1, earthVisible: false })).toBe(
    "The Sun is at −0.3° and still shines here: this site's horizon dips below level.",
  )
  expect(whyNote({ sunEl: 1.4, horizon: 3, inSun: false, earthEl: 0.3, earthVisible: true })).toBe(
    'The Sun is 1.4° up, but the terrain in that direction rises to about 3.0°.',
  )
  expect(whyNote({ sunEl: 1.4, horizon: 0, inSun: true, earthEl: -4.5, earthVisible: false })).toBe(
    'Earth is 4.5° below level at touchdown, so this site cannot see it yet.',
  )
  expect(whyNote({ sunEl: 5, horizon: 0, inSun: true, earthEl: 20, earthVisible: true })).toBe(null)
})

test('site result: every stay limit met is still no landing when Earth or the Sun is hidden at touchdown', () => {
  // The case from review: 4 of 4 stay limits, Earth behind the ridge at touchdown.
  expect(siteResult({ touchdown: 'earth_hidden', checks: stayChecks() })).toEqual({ works: false, why: 'No Earth at touchdown' })
  expect(siteResult({ touchdown: 'both', checks: stayChecks() })).toEqual({ works: true, why: '' })
  expect(siteResult({ touchdown: 'both', checks: stayChecks(['Earth in view']) })).toEqual({ works: false, why: 'Misses Earth in view' })
  expect(siteResult({ touchdown: 'neither', checks: stayChecks(['Sun in view', 'Longest without Sun']) })).toEqual({
    works: false,
    why: 'Neither the Sun nor Earth at touchdown; misses 2 stay limits',
  })
  expect(siteResult({ touchdown: 'both', checks: stayChecks(['Longest without Sun']) }).why).toBe('Misses longest without Sun')
  expect(siteResult({ touchdown: 'both', checks: null })).toEqual({ works: false, why: 'Stay not computed' })
})
