import type { Plan } from '~/components/planner/plan'
import { evaluate, intersect, type Measure, REQUIREMENTS, type Span, type Touchdown } from './mission'
import { buildRequest, liveTerrainIsCoarser, type ScientificRequest, scientificUnavailableReason } from './missionScience'
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

/** Whether a site's live answer replaces its precomputed stay: it must have answered, on terrain no coarser than the file's. */
const replacesPrecomputed = (siteId: string, row: PlannerRow | undefined) => row?.state === 'computed' && !liveTerrainIsCoarser(siteId)

export function plannerHeadline(rows: PlannerRows, plan: Plan) {
  const selected = plan.sites.map((site) => rows[site.data.site.id])
  if (selected.some((row) => !row || row.state === 'loading' || row.state === 'not_computed'))
    return 'Checking the selected stay with the live engine…'
  const computed = plan.sites
    .filter((site) => replacesPrecomputed(site.data.site.id, rows[site.data.site.id]))
    .map((site) => rows[site.data.site.id])
  const works = computed.filter(
    (row) =>
      row?.state === 'computed' &&
      scientificTouchdown(row.response) === 'both' &&
      evaluate(scientificMeasure(row.response), plan.requirements).passed,
  ).length
  if (computed.length !== selected.length)
    return `${computed.length} of ${selected.length} sites use the live engine’s numbers, and ${works} of those meet the touchdown and mission requirements. ${selected.length - computed.length === 1 ? 'The other uses its precomputed file.' : 'The others use precomputed files.'}`
  return `${works} of ${selected.length} sites meet the touchdown and mission requirements.`
}

export type LiveSummary = {
  /**
   * checking: a reply is pending; live: every site's numbers are live; partial: some are; crosscheck: the engine answered, but only
   * for sites where its terrain is coarser than the precomputed file, so none replaced it; offline: no site could be checked.
   */
  state: 'checking' | 'live' | 'partial' | 'crosscheck' | 'offline'
  /** Sites whose numbers come from the live engine. */
  live: number
  total: number
}

export function liveSummary(rows: PlannerRows, plan: Plan): LiveSummary {
  const selected = plan.sites.map((site) => rows[site.data.site.id])
  const live = plan.sites.filter((site) => replacesPrecomputed(site.data.site.id, rows[site.data.site.id])).length
  const answered = selected.filter((row) => row?.state === 'computed').length
  const total = selected.length
  const checking = selected.some((row) => !row || row.state === 'loading' || row.state === 'not_computed')
  const state = checking ? 'checking' : live === total ? 'live' : live > 0 ? 'partial' : answered > 0 ? 'crosscheck' : 'offline'
  return { state, live, total }
}

/** A failure message short and plain enough to show; schema dumps and stack-like text become a generic phrase. */
export function readableReason(message: string) {
  const text = message.trim().replace(/\.$/, '')
  return text.length > 120 || /^[[{]/.test(text) ? 'it sent back an unexpected reply' : text.charAt(0).toLowerCase() + text.slice(1)
}

/** One site's live state in the reader's words. */
export function liveLabel(row: PlannerRow | undefined, siteId: string): { short: string; detail: string } {
  if (!row || row.state === 'loading' || row.state === 'not_computed')
    return { short: 'Checking', detail: 'Asking the live engine about this stay. The numbers shown meanwhile are precomputed.' }
  if (row.state === 'computed' && liveTerrainIsCoarser(siteId)) {
    const { sunlightAvailabilityFraction: sun, directEarthAvailabilityFraction: earth } = row.response.result.metrics
    const share = (value: number) => `${(value * 100).toFixed(1)} %`
    return {
      short: 'Cross-check',
      detail: `The live engine has only 1.9 km global terrain here, coarser than the precomputed file, which misses small ridges. The numbers above are precomputed. Live answer: Sun ${share(sun)}, Earth ${share(earth)}.`,
    }
  }
  if (row.state === 'computed') return { short: 'Live', detail: 'Computed for this exact stay by the live engine.' }
  if (row.state === 'unsupported')
    return { short: 'Precomputed', detail: `The live engine doesn’t cover this site yet, so its precomputed file is shown. ${row.message}` }
  return {
    short: 'Precomputed',
    detail: `The live engine couldn’t check this stay (${readableReason(row.message)}), so the site’s precomputed file is shown.`,
  }
}

/**
 * The plan with each site's selected stay taken from the live engine where it answered on terrain at least as sharp as the
 * precomputed file's. Other sites keep their precomputed numbers and say so (`source`). A live stay drops the slip comparison, which would compare two different models.
 */
export function scientificPlan(plan: Plan, rows: PlannerRows): Plan {
  const sites = plan.sites.map((site) => {
    const row = rows[site.data.site.id]
    if (row?.state !== 'computed' || !replacesPrecomputed(site.data.site.id, row)) return { ...site, source: 'precomputed' as const }
    const stay = scientificMeasure(row.response)
    return {
      ...site,
      source: 'live' as const,
      stay,
      checks: evaluate(stay, plan.requirements),
      touchdown: scientificTouchdown(row.response),
      was: null,
      wasGo: null,
    }
  })
  return { ...plan, sites, live: liveSummary(rows, plan) }
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
    if (row?.state !== 'computed' || !replacesPrecomputed(site.data.site.id, row)) {
      lines.push(
        `Source: precomputed site file, pipeline ${site.data.provenance.algorithm_version}. ${liveLabel(row, site.data.site.id).detail}`,
        '',
      )
      if (row?.state === 'computed') lines.push(`Live engine cross-check: scenario ${row.response.scenarioId}`, '')
      if (site.stay) {
        const stay = site.stay
        for (const requirement of REQUIREMENTS) {
          lines.push(
            `- ${requirement.label} ${requirement.read(stay).toFixed(3)} ${requirement.unit}, required ${requirement.bound} ${plan.requirements[requirement.key]} ${requirement.unit}`,
          )
        }
        lines.push('')
      }
      continue
    }
    lines.push('Source: live mission-science engine', '')
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
