import type { Summary } from './data'
import type { StudyCandidate } from './feed-schemas'
import { dataEnd, shortDate } from './time'

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** A time span [start, end) in epoch milliseconds. */
export type Span = readonly [number, number]
export type MissionWindow = { start: number; end: number }

export const toSpans = (intervals: [string, string][]): Span[] => intervals.map(([a, b]) => [Date.parse(a), Date.parse(b)])

export const clip = (spans: Span[], w: MissionWindow): Span[] =>
  spans.flatMap(([a, b]) => {
    const s = Math.max(a, w.start)
    const e = Math.min(b, w.end)
    return e > s ? [[s, e] as const] : []
  })

export function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const x = a[i] as Span
    const y = b[j] as Span
    const s = Math.max(x[0], y[0])
    const e = Math.min(x[1], y[1])
    if (e > s) out.push([s, e])
    if (x[1] < y[1]) i++
    else j++
  }
  return out
}

const total = (spans: Span[]) => spans.reduce((sum, [a, b]) => sum + (b - a), 0)
export const contains = (spans: Span[], t: number) => spans.some(([a, b]) => t >= a && t < b)

/** Longest stretch of the window not covered by `spans`. `truncated` means it touches an edge, so the true gap may be longer. */
export function longestGap(spans: Span[], w: MissionWindow) {
  let at = w.start
  let hours = 0
  let truncated = false
  for (const [a, b] of [...spans, [w.end, w.end] as const]) {
    const gap = (a - at) / HOUR_MS
    if (gap > hours) {
      hours = gap
      truncated = at === w.start || a === w.end
    }
    at = Math.max(at, b)
  }
  return { hours, truncated }
}

export type SiteSpans = { sun: Span[]; earth: Span[]; both: Span[]; coverage: MissionWindow }

export function siteSpans(s: Summary): SiteSpans {
  const sun = toSpans(s.intervals)
  const earth = toSpans(s.earth_intervals ?? [])
  const start = Date.parse(`${s.params.start}T00:00:00Z`)
  return { sun, earth, both: intersect(sun, earth), coverage: { start, end: dataEnd(s.params) } }
}

export type Measure = ReturnType<typeof measure>

/** What a site gets over one mission window, which must lie inside the computed range. */
export function measure(spans: SiteSpans, w: MissionWindow) {
  const length = w.end - w.start
  const sun = clip(spans.sun, w)
  const earth = clip(spans.earth, w)
  const both = clip(spans.both, w)
  return {
    window: w,
    sun,
    earth,
    both,
    sunShare: total(sun) / length,
    earthShare: total(earth) / length,
    bothShare: total(both) / length,
    noSun: longestGap(sun, w),
    noEarth: longestGap(earth, w),
  }
}

/** A stay's totals, or null when it leaves the computed range: time we never computed is not time without Sun or Earth. */
export const measureStay = (spans: SiteSpans, w: MissionWindow): Measure | null =>
  w.start >= spans.coverage.start && w.end <= spans.coverage.end ? measure(spans, w) : null

export type Requirements = { minSun: number; maxNoSun: number; minEarth: number; maxNoEarth: number }

export const REQUIREMENTS = [
  { key: 'minSun', label: 'Sun in view', short: 'Sun', unit: '%', bound: 'at least', read: (m: Measure) => m.sunShare * 100 },
  { key: 'maxNoSun', label: 'Longest without Sun', short: 'No Sun', unit: 'h', bound: 'at most', read: (m: Measure) => m.noSun.hours },
  { key: 'minEarth', label: 'Earth in view', short: 'Earth', unit: '%', bound: 'at least', read: (m: Measure) => m.earthShare * 100 },
  {
    key: 'maxNoEarth',
    label: 'Longest without Earth',
    short: 'No Earth',
    unit: 'h',
    bound: 'at most',
    read: (m: Measure) => m.noEarth.hours,
  },
] as const

export function evaluate(m: Measure, r: Requirements) {
  const checks = REQUIREMENTS.map((q) => {
    const value = q.read(m)
    const limit = r[q.key]
    return { ...q, value, limit, pass: q.bound === 'at least' ? value >= limit : value <= limit }
  })
  return { checks, met: checks.filter((c) => c.pass).length, passed: checks.every((c) => c.pass) }
}

/**
 * For a landing on this day:
 * `go`: Sun and Earth in view at touchdown and every requirement met over the stay.
 * `arrive`: Sun and Earth in view at touchdown, but the stay misses a requirement.
 * `no`: Sun or Earth hidden at touchdown.
 * `outside`: the stay runs past the computed range.
 */
export type LandingStatus = 'go' | 'arrive' | 'no' | 'outside'

export function landingDay(spans: SiteSpans, start: number, stayMs: number, r: Requirements): LandingStatus {
  const m = measureStay(spans, { start, end: start + stayMs })
  if (!m) return 'outside'
  if (!contains(spans.both, start)) return 'no'
  return evaluate(m, r).passed ? 'go' : 'arrive'
}

export type LandingRun = { from: number; to: number; status: LandingStatus }

/** One status per date, merged into [from, to) runs of date indexes. */
export function landingRuns(statuses: LandingStatus[]): LandingRun[] {
  const out: LandingRun[] = []
  statuses.forEach((status, i) => {
    const last = out.at(-1)
    if (last?.status === status) last.to = i + 1
    else out.push({ from: i, to: i + 1, status })
  })
  return out
}

export type Touchdown = 'both' | 'sun_hidden' | 'earth_hidden' | 'neither'

export const TOUCHDOWN_LABEL: Record<Touchdown, string> = {
  both: 'Sun and Earth',
  sun_hidden: 'Sun hidden',
  earth_hidden: 'Earth hidden',
  neither: 'Sun and Earth hidden',
}

export function touchdown(spans: SiteSpans, t: number): Touchdown {
  const sun = contains(spans.sun, t)
  const earth = contains(spans.earth, t)
  if (sun) return earth ? 'both' : 'earth_hidden'
  return earth ? 'sun_hidden' : 'neither'
}

export type GoWindow = { from: string; to: string; days: number }

/** The good runs that have not ended by `fromIndex`, as dates. */
export function goWindows(runs: LandingRun[], dates: string[], fromIndex: number): GoWindow[] {
  return runs
    .filter((r) => r.status === 'go' && r.to > fromIndex)
    .map((r) => ({ from: dates[r.from] ?? '', to: dates[r.to - 1] ?? '', days: r.to - r.from }))
}

export const shortName = (s: Summary) => s.site.name.split(',')[0] ?? s.site.name

/** Near a pole the Sun skims the horizon and terrain decides the light; elsewhere it rises high and sets for two weeks. */
export const isPolar = (s: Summary) => Math.abs(s.site.lat_deg) >= 75

export type Evaluation = ReturnType<typeof evaluate>

/** Everything the planner shows about one site for the current mission. Every step reads this, so they cannot disagree. */
export type SitePlan = {
  data: Summary
  elRange: [number, number]
  stay: Measure | null
  was: Measure | null
  /** Whether a landing on the slip's original day worked, by the same rule as now; null without a slip. */
  wasGo: boolean | null
  checks: Evaluation | null
  touchdown: Touchdown
  runs: LandingRun[]
  nextGo: string | null
  goDays: number
}

export function planSite(
  data: Summary,
  spans: SiteSpans,
  elRange: [number, number],
  mission: { dates: string[]; index: number; minute: number; stayMs: number; requirements: Requirements; baseIndex: number | null },
): SitePlan {
  const { dates, index, minute, stayMs, requirements, baseIndex } = mission
  const startOf = (i: number) => Date.parse(`${dates[i]}T00:00:00Z`) + minute * 60_000
  const stayFrom = (i: number) => measureStay(spans, { start: startOf(i), end: startOf(i) + stayMs })
  const statuses = dates.map((_, i) => landingDay(spans, startOf(i), stayMs, requirements))
  const stay = stayFrom(index)
  const next = statuses.findIndex((s, i) => i >= index && s === 'go')
  return {
    data,
    elRange,
    stay,
    was: baseIndex == null ? null : stayFrom(baseIndex),
    wasGo: baseIndex == null ? null : statuses[baseIndex] === 'go',
    checks: stay && evaluate(stay, requirements),
    touchdown: touchdown(spans, startOf(index)),
    runs: landingRuns(statuses),
    nextGo: next >= 0 ? (dates[next] ?? null) : null,
    goDays: statuses.filter((s) => s === 'go').length,
  }
}

const listed = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

function grouped<T>(items: T[], key: (x: T) => string) {
  const groups = new Map<string, T[]>()
  for (const x of items) groups.set(key(x), [...(groups.get(key(x)) ?? []), x])
  return [...groups.entries()]
}

export type VerdictRow = { name: string; touchdown: Touchdown; checks: Evaluation | null; nextGo: string | null }

/** "The first days that work are 15 Nov at A and 17 Nov at B and C." */
export function nextDays(rows: Pick<VerdictRow, 'name' | 'nextGo'>[]) {
  const dated = grouped(
    rows.filter((r) => r.nextGo),
    (r) => r.nextGo ?? '',
  ).map(([day, group]) => `${shortDate(day)} at ${listed(group.map((r) => r.name))}`)
  const none = rows.filter((r) => !r.nextGo).map((r) => r.name)
  return [
    dated.length === 1
      ? `The first day that works is ${dated[0]}.`
      : dated.length > 1
        ? `The first days that work are ${listed(dated)}.`
        : '',
    none.length > 0 ? `No later day works at ${listed(none)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

const HIDDEN_AT_TOUCHDOWN: Record<Touchdown, string> = {
  both: '',
  sun_hidden: 'no direct Sun at touchdown',
  earth_hidden: 'no Earth at touchdown',
  neither: 'neither the Sun nor Earth at touchdown',
}

function reason(r: VerdictRow, checks: Evaluation) {
  const missed = checks.checks.filter((c) => !c.pass).map((c) => c.label)
  if (missed.length === 0) return { one: 'has', many: 'have', what: HIDDEN_AT_TOUCHDOWN[r.touchdown] }
  return {
    one: 'misses',
    many: 'miss',
    what: missed.length === checks.checks.length ? `all ${missed.length} requirements` : listed(missed),
  }
}

const works = (r: Pick<VerdictRow, 'touchdown' | 'checks'>) => r.touchdown === 'both' && r.checks?.passed === true

/**
 * One site's answer for this landing, by the same rule as the headline: it works only with the Sun and Earth in view at
 * touchdown and every stay limit met. `why` says what fails, so a full count of stay limits never reads as a pass.
 */
export function siteResult(r: Pick<VerdictRow, 'touchdown' | 'checks'>): { works: boolean; why: string } {
  if (!r.checks) return { works: false, why: 'Stay not computed' }
  if (works(r)) return { works: true, why: '' }
  const missed = r.checks.checks.filter((c) => !c.pass)
  const parts = [
    ...(r.touchdown === 'both' ? [] : [HIDDEN_AT_TOUCHDOWN[r.touchdown]]),
    ...(missed.length === 0
      ? []
      : [`misses ${missed.length === 1 ? (missed[0]?.label ?? '').replace(/^Longest/, 'longest') : `${missed.length} stay limits`}`]),
  ]
  const why = parts.join('; ')
  return { works: false, why: why.charAt(0).toUpperCase() + why.slice(1) }
}

/** The answer, in words, before any table. `slipDays` is the shift from the original date. */
export function verdict(rows: VerdictRow[], slipDays: number) {
  if (rows.some((r) => !r.checks)) {
    return {
      headline: 'This stay runs past the computed data.',
      detail: 'Its totals are not computed. Choose an earlier day or a shorter stay.',
      next: '',
    }
  }
  const n = rows.length
  const only = rows[0]?.name ?? ''
  const working = rows.filter(works).length
  const staying = rows.filter((r) => r.checks?.passed).length
  const others = rows.filter((r) => !works(r))
  const days = Math.abs(slipDays)

  let headline: string
  if (working === n) headline = n === 1 ? `${only} works for this landing.` : `All ${n} sites work for this landing.`
  else if (working > 0) headline = `${working} of ${n} sites ${working === 1 ? 'works' : 'work'} for this landing.`
  else if (staying === n)
    headline =
      n === 1
        ? `${only} meets your stay requirements, but does not have both the Sun and Earth at touchdown.`
        : `All ${n} sites meet your stay requirements, but none has both the Sun and Earth at touchdown.`
  else if (staying > 0) headline = `None of the ${n} sites work for this landing.`
  else if (slipDays !== 0)
    headline = `Landing ${days} day${days === 1 ? '' : 's'} ${slipDays < 0 ? 'early' : 'late'} fails at ${n === 1 ? only : 'every site'}.`
  else headline = n === 1 ? `${only} does not meet your requirements.` : 'No site meets your requirements.'

  if (others.length === 0) {
    return { headline, detail: 'The Sun and Earth are in view at touchdown and every requirement holds over the stay.', next: '' }
  }
  const detail = grouped(others, (r) => (r.checks ? reason(r, r.checks).what : ''))
    .map(([, group]) => {
      const first = group[0] as VerdictRow
      const { one, many, what } = reason(first, first.checks as Evaluation)
      return `${listed(group.map((r) => r.name))} ${group.length > 1 ? many : one} ${what}.`
    })
    .join(' ')
  return { headline, detail, next: nextDays(others) }
}

const degrees = (x: number) => `${Math.abs(x).toFixed(1)}°`
const signed = (x: number) => `${x < 0 ? '−' : ''}${degrees(x)}`

/** A plain-language line for a reading that looks wrong at first sight, or null when nothing needs explaining. */
export function whyNote({
  sunEl,
  horizon,
  inSun,
  earthEl,
  earthVisible,
}: {
  sunEl?: number
  horizon?: number
  inSun: boolean
  earthEl?: number
  earthVisible?: boolean
}) {
  if (sunEl != null && inSun && sunEl < 0)
    return `The Sun is at ${signed(sunEl)} and still shines here: this site's horizon dips below level.`
  if (sunEl != null && horizon != null && !inSun && sunEl > 0 && horizon > sunEl) {
    return `The Sun is ${degrees(sunEl)} up, but the terrain in that direction rises to about ${degrees(horizon)}.`
  }
  if (earthEl == null) return null
  if (earthVisible && earthEl < 0) return `Earth is at ${signed(earthEl)} and still in view: this site's horizon dips below level.`
  if (!earthVisible && earthEl < 0) return `Earth is ${degrees(earthEl)} below level at touchdown, so this site cannot see it yet.`
  if (!earthVisible && earthEl > 0) return `Earth is ${degrees(earthEl)} up, but the terrain hides it at touchdown.`
  return null
}

export type Objective<T> = { read: (x: T) => number; better: 'low' | 'high' }

export function dominates<T>(a: T, b: T, objectives: Objective<T>[]) {
  const signed = (o: Objective<T>, x: T) => (o.better === 'high' ? o.read(x) : -o.read(x))
  return objectives.every((o) => signed(o, a) >= signed(o, b)) && objectives.some((o) => signed(o, a) > signed(o, b))
}

export const paretoFront = <T>(items: T[], objectives: Objective<T>[]) =>
  items.filter((x) => !items.some((y) => y !== x && dominates(y, x, objectives)))

export type StudyRow = { candidate: StudyCandidate; relays: number; share: number; gapH: number }

/** A candidate judged by its worst chosen site: the lowest contact share and the longest gap. */
export function studyRows(candidates: StudyCandidate[], siteIds: string[]): StudyRow[] {
  return candidates.flatMap((candidate) => {
    const results = siteIds.flatMap((id) => candidate.by_site[id] ?? [])
    if (results.length !== siteIds.length || results.length === 0) return []
    return [
      {
        candidate,
        relays: candidate.relay_count,
        share: Math.min(...results.map((r) => r.contact_share)),
        gapH: Math.max(...results.map((r) => r.longest_gap_h)),
      },
    ]
  })
}

export const STUDY_OBJECTIVES: Objective<StudyRow>[] = [
  { read: (r) => r.relays, better: 'low' },
  { read: (r) => r.share, better: 'high' },
  { read: (r) => r.gapH, better: 'low' },
]

/** The fewest relays among tested configurations that meet the target; ties go to more contact, then shorter gaps. */
export function smallestMeeting(rows: StudyRow[], target: { minShare: number; maxGapH: number }) {
  return rows
    .filter((r) => r.share >= target.minShare && r.gapH <= target.maxGapH)
    .sort((a, b) => a.relays - b.relays || b.share - a.share || a.gapH - b.gapH)[0]
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`
const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ')

export function buildBrief(input: {
  window: MissionWindow
  requirements: Requirements
  sites: {
    name: string
    lat: number
    lon: number
    measure: Measure | null
    touchdown: Touchdown
    algorithm: string
    datasets: string[]
    kernels: string[]
  }[]
}) {
  const { window: w, requirements: r, sites } = input
  const lines = [
    '# Skyline mission brief',
    '',
    `Window: ${iso(w.start)} to ${iso(w.end)} UTC`,
    `Requirements: ${REQUIREMENTS.map((q) => `${q.label} ${q.bound} ${r[q.key]} ${q.unit}`).join('; ')}`,
    '',
    '| Site | Coordinates | At touchdown | Sun | Earth centre | Both | Longest without Sun | Longest without Earth | Stay limits met | This landing |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...sites.map((s) => {
      const place = `| ${s.name} | ${s.lat}, ${s.lon} °E | ${TOUCHDOWN_LABEL[s.touchdown]} |`
      if (!s.measure) return `${place} ${Array(7).fill('not computed').join(' | ')} |`
      const e = evaluate(s.measure, r)
      const result = siteResult({ touchdown: s.touchdown, checks: e })
      const gap = (g: { hours: number; truncated: boolean }) => `${g.hours.toFixed(1)} h${g.truncated ? ' or more' : ''}`
      const missed = e.checks.filter((c) => !c.pass).map((c) => c.label)
      return `${place} ${pct(s.measure.sunShare)} | ${pct(s.measure.earthShare)} | ${pct(s.measure.bothShare)} | ${gap(s.measure.noSun)} | ${gap(s.measure.noEarth)} | ${e.met} of ${e.checks.length}${missed.length > 0 ? ` (misses ${missed.join(', ')})` : ''} | ${result.works ? 'Works' : `No: ${result.why}`} |`
    }),
    '',
    ...(sites.some((s) => !s.measure) ? ['Not computed: the stay runs past the computed year.', ''] : []),
    `Computed with Skyline algorithm ${[...new Set(sites.map((s) => s.algorithm))].join(', ')} from LOLA terrain and NAIF SPICE geometry.`,
    `Terrain: ${[...new Set(sites.flatMap((s) => s.datasets))].join(', ')}`,
    `Geometry kernels: ${[...new Set(sites.flatMap((s) => s.kernels))].join(', ')}`,
    'A partly visible Sun counts as in view. Earth counts as in view when its centre clears the skyline.',
    '',
    'These are geometric opportunities under stated assumptions. They are not delivered power, a working radio link, or guaranteed contact.',
    'Verify before any decision: terrain and landing hazards, power and storage, thermal limits, communications link budget.',
    '',
  ]
  return lines.join('\n')
}
