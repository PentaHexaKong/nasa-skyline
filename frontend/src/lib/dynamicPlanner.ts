import type { Plan } from '~/components/planner/plan'
import { evaluate, intersect, type Measure, REQUIREMENTS, type Span, type Touchdown } from './mission'
import { buildRequest, type ScientificRequest, scientificUnavailableReason } from './missionScience'
import { postScience } from './scienceRequest'
import { parseScientificResponse } from './scientificContract'
import type { ComputedResponse, Interval } from './scientificContract.generated'

export type PlannerInput = { siteId: string; request: ScientificRequest | null }
export type PlannerRow =
  | { state: 'computed'; response: ComputedResponse }
  | { state: 'loading' | 'unsupported' | 'not_computed' | 'unavailable' | 'failed'; message: string }
export type PlannerRows = Record<string, PlannerRow>

export function plannerInputs(plan: Plan): PlannerInput[] {
  return plan.sites.map((site) => ({ siteId: site.data.site.id, request: buildRequest(site.data, plan.window, plan.requirements) }))
}

export function initialPlannerRows(inputs: PlannerInput[], enabled: boolean): PlannerRows {
  return Object.fromEntries(
    inputs.map(({ siteId, request }) => [
      siteId,
      request
        ? {
            state: enabled ? 'loading' : 'not_computed',
            message: enabled ? 'Evaluating the selected mission with SPICE and LOLA.' : 'Waiting for the scientific evaluation.',
          }
        : { state: 'unsupported', message: scientificUnavailableReason(siteId) },
    ]),
  )
}

function sameFields(expected: object, actual: object): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const other = (actual as Record<string, unknown>)[key]
    return value !== null && typeof value === 'object'
      ? other !== null && typeof other === 'object' && sameFields(value, other)
      : value === other
  })
}

/** Reject a well-formed response for a different observer, mission or scientific profile. */
export function verifyPlannerResponse(request: ScientificRequest, response: ComputedResponse) {
  const { result, provenance } = response
  if (
    !sameFields(request, response.request) ||
    result.observer.siteId !== request.site ||
    result.observer.observerHeightM !== request.observerHeightM ||
    provenance.scientificProfile !== request.profile ||
    result.period.durationS !== request.durationS ||
    Math.abs(Date.parse(result.period.startUtc) - Date.parse(request.startUtc)) > 1 ||
    result.cadenceS !== request.cadenceS ||
    result.metrics.denominatorS !== request.durationS ||
    result.samples[0]?.elapsedS !== 0 ||
    result.samples.some((sample) => sample.scientificProfile !== request.profile)
  ) {
    throw new Error('Scientific response does not match the selected mission identity.')
  }
  if (result.skyline.coverage.missingData !== false || result.skyline.coverage.completeSearchRegion !== true) {
    throw new Error('Scientific response has incomplete terrain coverage.')
  }
}

/** Sequential admission, with generation checks before starting or publishing each request. */
export async function runPlannerRequests(
  inputs: PlannerInput[],
  publish: (siteId: string, row: PlannerRow) => void,
  isCurrent: () => boolean,
) {
  for (const { siteId, request } of inputs) {
    if (!isCurrent()) return
    if (!request) continue
    let row: PlannerRow
    try {
      const response = parseScientificResponse(await postScience('/mission-science/v1/scientific-evaluations', request))
      if (response.dataState === 'computed') {
        verifyPlannerResponse(request, response)
        row = { state: 'computed', response }
      } else {
        row = { state: response.dataState, message: response.error.message }
      }
    } catch (error) {
      row = { state: 'failed', message: error instanceof Error ? error.message : 'Scientific evaluation failed.' }
    }
    if (!isCurrent()) return
    publish(siteId, row)
  }
}

const utcSpans = (intervals: Interval[]): Span[] =>
  intervals.map((interval) => [Date.parse(interval.startUtc), Date.parse(interval.endUtc)])

/** Durations and fractions retain the engine's SPICE ET denominator. UTC spans serve presentation. */
export function scientificMeasure(response: ComputedResponse): Measure {
  const { period, metrics, sunlightIntervals, directEarthIntervals } = response.result
  const elapsedSun: Span[] = sunlightIntervals.available.map((interval) => [interval.startS, interval.endS])
  const elapsedEarth: Span[] = directEarthIntervals.available.map((interval) => [interval.startS, interval.endS])
  const sun = utcSpans(sunlightIntervals.available)
  const earth = utcSpans(directEarthIntervals.available)
  return {
    window: { start: Date.parse(period.startUtc), end: Date.parse(period.endUtc) },
    sun,
    earth,
    both: intersect(sun, earth),
    sunShare: metrics.sunlightAvailabilityFraction,
    earthShare: metrics.directEarthAvailabilityFraction,
    bothShare: intersect(elapsedSun, elapsedEarth).reduce((sum, [start, end]) => sum + end - start, 0) / metrics.denominatorS,
    noSun: { hours: metrics.longestDarkness.durationS / 3600, truncated: metrics.longestDarkness.touchesCoverageBoundary },
    noEarth: {
      hours: metrics.longestDirectEarthBlackout.durationS / 3600,
      truncated: metrics.longestDirectEarthBlackout.touchesCoverageBoundary,
    },
  }
}

export function scientificTouchdown(response: ComputedResponse): Touchdown {
  const sample = response.result.samples[0]!
  return sample.sun.sunlightVisible
    ? sample.earth.centerVisible
      ? 'both'
      : 'earth_hidden'
    : sample.earth.centerVisible
      ? 'sun_hidden'
      : 'neither'
}

export function plannerHeadline(rows: PlannerRows, plan: Plan) {
  const selected = plan.sites.map((site) => rows[site.data.site.id])
  if (selected.some((row) => !row || row.state === 'loading' || row.state === 'not_computed')) return 'Evaluating the selected mission…'
  const computed = selected.filter((row) => row?.state === 'computed')
  const works = computed.filter(
    (row) =>
      row?.state === 'computed' &&
      scientificTouchdown(row.response) === 'both' &&
      evaluate(scientificMeasure(row.response), plan.requirements).passed,
  ).length
  if (computed.length !== selected.length)
    return `${computed.length} of ${selected.length} sites evaluated. Review the remaining scientific states.`
  return `${works} of ${selected.length} sites meet the touchdown and mission requirements.`
}

/** Clear all annual-derived metrics, recommendations and slip comparisons before projecting current API results. */
export function scientificPlan(plan: Plan, rows: PlannerRows, focus?: string): Plan {
  const sites = plan.sites.map((site) => {
    const row = rows[site.data.site.id]
    const response = row?.state === 'computed' ? row.response : null
    const stay = response ? scientificMeasure(response) : null
    const checks = stay ? evaluate(stay, plan.requirements) : null
    const touchdown = response ? scientificTouchdown(response) : 'neither'
    const status = touchdown !== 'both' ? 'no' : checks?.passed ? 'go' : 'arrive'
    return {
      ...site,
      stay,
      checks,
      touchdown,
      was: null,
      wasGo: null,
      nextGo: null,
      goDays: checks?.passed && touchdown === 'both' ? 1 : 0,
      runs: response ? [{ from: plan.index, to: plan.index + 1, status: status as 'go' | 'arrive' | 'no' }] : [],
    }
  })
  return {
    ...plan,
    sites,
    baseline: { headline: plannerHeadline(rows, plan) },
    focus: sites.some((site) => site.data.site.id === focus)
      ? focus
      : (sites.find((site) => site.checks?.passed && site.touchdown === 'both') ?? sites[0])?.data.site.id,
  }
}

export function buildScientificBrief(plan: Plan, rows: PlannerRows): string {
  const lines = [
    '# SKYLINE mission brief',
    '',
    `Requested start ${new Date(plan.window.start).toISOString()}`,
    `Requested duration ${(plan.window.end - plan.window.start) / 1000} SPICE ET seconds`,
    '',
    plannerHeadline(rows, plan),
    '',
  ]
  for (const site of plan.sites) {
    const row = rows[site.data.site.id]
    lines.push(`## ${site.data.site.name}`, '')
    if (row?.state !== 'computed') {
      lines.push(`Scientific state ${row?.state ?? 'not_computed'}`, '', row && 'message' in row ? row.message : 'Evaluation pending.', '')
      continue
    }
    const { response } = row
    const { observer, period, metrics } = response.result
    const measure = scientificMeasure(response)
    lines.push(
      `Scenario ${response.scenarioId}`,
      '',
      `Evaluated UTC window [${period.startUtc}, ${period.endUtc})`,
      `Observer ${observer.siteId}, ${observer.latitudeDeg} deg latitude, ${observer.longitudeDegEast} deg east longitude, ${observer.observerHeightM} m above terrain, ${observer.frame}`,
      '',
    )
    for (const requirement of REQUIREMENTS) {
      lines.push(
        `- ${requirement.label} ${requirement.read(measure).toFixed(3)} ${requirement.unit}, required ${requirement.bound} ${plan.requirements[requirement.key]} ${requirement.unit}`,
      )
    }
    lines.push(
      '',
      `Mean visible solar-disk fraction ${metrics.meanVisibleSolarDiskFraction}`,
      `Longest darkness touches window boundary ${measure.noSun.truncated}`,
      `Longest direct-Earth blackout touches window boundary ${measure.noEarth.truncated}`,
      '',
      '### Scientific response and provenance',
      '',
      '```json',
      JSON.stringify(response, null, 2),
      '```',
      '',
    )
  }
  return lines.join('\n')
}
