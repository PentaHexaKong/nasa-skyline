import { z } from 'zod'
import type { Summary } from './data'
import type { MissionWindow, Requirements } from './mission'

/**
 * The browser side of the mission-science service (`services/missionScience`, `POST /v1/scientific-evaluations`),
 * reached through the Go backend's pass-through (`backend/missionScience.go`, `/api/mission-science/v1/...`). The service
 * evaluates one request at a time, so the sites are sent one after another.
 *
 * The main planner uses the complete versioned response through dynamicPlanner.ts. This older reduced
 * client remains available to reference pages that explicitly compare their annual files with a live evaluation.
 *
 * Contract: `contracts/scientificRequest.schema.json` and `contracts/scientificResponse.schema.json` (v1.0.0). Only the
 * fields the app reads are parsed here; anything else in the response is ignored.
 */

/**
 * Where the API bridge answers. Nginx (frontend/nginx.conf) and the dev and preview servers (vite.config.ts) send `/api`
 * to it; a build served elsewhere sets VITE_API_URL.
 */
export const API_URL: string = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api'

/**
 * The service's catalogue identifiers for the app's sites (`examples/siteCatalog.json`, canonicalId). Both name
 * the same De Rosa et al. 2012 points; `catalogMatches` in the tests checks the coordinates agree.
 */
export const SERVICE_SITE: Record<string, string> = {
  'connecting-ridge': 'CR1',
  'de-gerlache-rim': 'GR1',
  'shackleton-rim': 'SR1',
}

/** Hourly search samples, refined to 1 s at each event: inside the service's 6000-interval and 3600 s cadence limits for any stay up to 60 days. */
export const CADENCE_S = 3600

export const SITE_CAPABILITIES: Record<
  string,
  { liveEvaluation: 'supported' | 'unverified'; staticDataState: 'computed'; reason: string | null }
> = {
  'connecting-ridge': { liveEvaluation: 'supported', staticDataState: 'computed', reason: null },
  'de-gerlache-rim': { liveEvaluation: 'supported', staticDataState: 'computed', reason: null },
  'shackleton-rim': { liveEvaluation: 'supported', staticDataState: 'computed', reason: null },
  'shackleton-ridge': {
    liveEvaluation: 'unverified',
    staticDataState: 'computed',
    reason:
      'The hill-top observer has static pipeline data. Its coordinate realization and live terrain capabilities require verification.',
  },
  apollo11: {
    liveEvaluation: 'unverified',
    staticDataState: 'computed',
    reason:
      'Apollo 11 has static pipeline data. The live engine requires a verified equatorial terrain profile and coordinate realization.',
  },
}

export function scientificUnavailableReason(siteId: string) {
  return SITE_CAPABILITIES[siteId]?.reason ?? 'This site has no verified live scientific mapping.'
}

const scientificRequest = z.object({
  schemaVersion: z.literal('skyline-scientific-request/1.0.0'),
  site: z.string(),
  startUtc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  durationS: z.number().min(60).max(31_536_000),
  cadenceS: z.number().min(30).max(3600),
  profile: z.literal('geometric'),
  solarDefinition: z.literal('anyDisk'),
  earthDefinition: z.literal('center'),
  horizonOffsetDeg: z.number(),
  localResolutionM: z.literal(80),
  eventToleranceS: z.number(),
  constraints: z.object({
    minimumSolar: z.number().min(0).max(1),
    minimumEarth: z.number().min(0).max(1),
    maximumSolarOutageS: z.number().min(0),
    maximumEarthOutageS: z.number().min(0),
  }),
  observerHeightM: z.number().min(0),
})
export type ScientificRequest = z.infer<typeof scientificRequest>

/**
 * One planned stay at one site as a scientific request. The visibility rules are the app's own: a partly visible Sun
 * counts as in view (`anyDisk`), Earth counts when its centre clears the skyline (`center`), no horizon margin,
 * geometric (airless) directions. The user's limits travel as the request's constraints, converted to fractions and seconds.
 */
export function buildRequest(
  site: { site: Pick<Summary['site'], 'id' | 'observer_height_m'> },
  window: MissionWindow,
  requirements: Requirements,
): ScientificRequest | null {
  const id = SERVICE_SITE[site.site.id]
  if (!id) return null
  const durationS = Math.round((window.end - window.start) / 1000)
  return scientificRequest.parse({
    schemaVersion: 'skyline-scientific-request/1.0.0',
    site: id,
    startUtc: new Date(window.start).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    durationS,
    cadenceS: Math.min(CADENCE_S, durationS),
    profile: 'geometric',
    solarDefinition: 'anyDisk',
    earthDefinition: 'center',
    horizonOffsetDeg: 0,
    localResolutionM: 80,
    eventToleranceS: 1,
    constraints: {
      minimumSolar: requirements.minSun / 100,
      minimumEarth: requirements.minEarth / 100,
      maximumSolarOutageS: requirements.maxNoSun * 3600,
      maximumEarthOutageS: requirements.maxNoEarth * 3600,
    },
    observerHeightM: site.site.observer_height_m,
  })
}

const interval = z.object({
  startUtc: z.string(),
  endUtc: z.string(),
  startS: z.number(),
  endS: z.number(),
  startClipped: z.boolean(),
  endClipped: z.boolean(),
})

const longest = z.object({ durationS: z.number(), interval: interval.nullable(), touchesCoverageBoundary: z.boolean() })

const intervals = z.object({
  available: z.array(interval),
  unavailable: z.array(interval),
  detection: z.object({ possibleMissedEvents: z.boolean() }).loose(),
})

export const ScientificResponseSchema = z.object({
  schemaVersion: z.literal('skyline-scientific-response/1.0.0'),
  dataState: z.enum(['computed', 'unavailable', 'failed']),
  scenarioId: z.string().nullable().optional(),
  result: z
    .object({
      period: z.object({ startUtc: z.string(), endUtc: z.string(), durationS: z.number() }),
      observer: z.object({ siteId: z.string(), latitudeDeg: z.number(), longitudeDegEast: z.number(), frame: z.string() }).loose(),
      sunlightIntervals: intervals,
      directEarthIntervals: intervals,
      metrics: z.object({
        sunlightDurationS: z.number(),
        sunlightAvailabilityFraction: z.number(),
        directEarthDurationS: z.number(),
        directEarthAvailabilityFraction: z.number(),
        longestDarkness: longest,
        longestDirectEarthBlackout: longest,
      }),
      cadenceS: z.number(),
    })
    .loose()
    .nullable()
    .optional(),
  provenance: z
    .object({
      engineVersion: z.string(),
      algorithmVersion: z.string(),
      kernels: z.record(z.string(), z.string()),
      dems: z.array(z.object({ filename: z.string(), sha256: z.string() }).loose()),
      execution: z.string(),
      computedAtUtc: z.string().nullable().optional(),
      validationStatus: z.string(),
      independentlyValidated: z.boolean(),
    })
    .loose()
    .nullable()
    .optional(),
  error: z.object({ code: z.string(), message: z.string() }).loose().nullable().optional(),
})
export type ScientificResponse = z.infer<typeof ScientificResponseSchema>

/** What the app shows from a computed response: the same four readings the planner checks, in the planner's units. */
export type LiveReading = {
  siteId: string
  serviceSite: string
  sunShare: number
  earthShare: number
  /** Longest stretch without sunlight / without Earth, hours, and whether it runs into the window's edge. */
  noSun: { hours: number; truncated: boolean }
  noEarth: { hours: number; truncated: boolean }
  possibleMissedEvents: boolean
  scenarioId: string | null
  provenance: {
    engine: string
    algorithm: string
    kernels: string[]
    dems: string[]
    computedAt: string | null
    execution: string
    validated: boolean
  }
}

/** Unavailable and failed answers carry no result; only their state and error are read. */
const stateOnly = z.object({
  schemaVersion: z.literal('skyline-scientific-response/1.0.0'),
  dataState: z.enum(['computed', 'unavailable', 'failed']),
  error: z.object({ code: z.string(), message: z.string() }).loose().nullable().optional(),
})

export function readResponse(siteId: string, raw: unknown): LiveReading | { error: string } {
  const state = stateOnly.safeParse(raw)
  if (!state.success) return { error: 'The service answered, but not in the v1.0.0 response contract.' }
  if (state.data.dataState !== 'computed')
    return { error: state.data.error?.message ?? `The service could not compute this stay (${state.data.dataState}).` }
  const parsed = ScientificResponseSchema.safeParse(raw)
  if (!parsed.success) return { error: 'The service answered, but not in the v1.0.0 response contract.' }
  const r = parsed.data
  if (!r.result || !r.provenance) return { error: 'The service marked the stay computed but sent no result.' }
  const m = r.result.metrics
  return {
    siteId,
    serviceSite: r.result.observer.siteId,
    sunShare: m.sunlightAvailabilityFraction,
    earthShare: m.directEarthAvailabilityFraction,
    noSun: { hours: m.longestDarkness.durationS / 3600, truncated: m.longestDarkness.touchesCoverageBoundary },
    noEarth: { hours: m.longestDirectEarthBlackout.durationS / 3600, truncated: m.longestDirectEarthBlackout.touchesCoverageBoundary },
    possibleMissedEvents:
      r.result.sunlightIntervals.detection.possibleMissedEvents || r.result.directEarthIntervals.detection.possibleMissedEvents,
    scenarioId: r.scenarioId ?? null,
    provenance: {
      engine: r.provenance.engineVersion,
      algorithm: r.provenance.algorithmVersion,
      kernels: Object.keys(r.provenance.kernels),
      dems: r.provenance.dems.map((d) => d.filename),
      computedAt: r.provenance.computedAtUtc ?? null,
      execution: r.provenance.execution,
      validated: r.provenance.independentlyValidated,
    },
  }
}

export type ServiceHealth = { reachable: true } | { reachable: false; reason: string }

/** Whether the backend and the service behind it both answer. This checks presence only; each evaluation checks its own data. */
export async function checkHealth(base = API_URL, signal?: AbortSignal): Promise<ServiceHealth> {
  try {
    const res = await fetch(`${base}/mission-science/v1/capabilities`, { signal })
    return res.ok ? { reachable: true } : { reachable: false, reason: `HTTP ${res.status}` }
  } catch (e) {
    return { reachable: false, reason: e instanceof Error ? e.message : 'network error' }
  }
}

/** One site's forwarded answer: the HTTP status, the body, and a transport error when the service never answered. */
const runResult = z.object({
  site: z.string(),
  status: z.number(),
  response: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
})

/** Reads one forwarded answer as a reading, or as the reason there is none. */
export function readRunResult(siteId: string, r: z.infer<typeof runResult>): LiveReading | { error: string } {
  if (r.error) return { error: r.error.code === 'unreachable' ? 'The mission-science service is not reachable.' : r.error.message }
  if (r.status === 422) return { error: 'The service refused the request as invalid (HTTP 422).' }
  if (r.status === 503) return { error: 'The service is busy with another evaluation (HTTP 503). Try again.' }
  return readResponse(siteId, r.response)
}

/**
 * Sends every site's stay to the service, one at a time and in order (it evaluates one request at a time), and reports
 * each site's answer to `onEach`. A site the app cannot name for the service, or a failed call, is an error, never a number.
 */
export async function evaluateAll(
  sites: Summary[],
  window: MissionWindow,
  requirements: Requirements,
  onEach: (siteId: string, r: LiveReading | { error: string }) => void,
  base = API_URL,
  signal?: AbortSignal,
) {
  const sendable = sites.flatMap((s) => {
    const request = buildRequest(s, window, requirements)
    if (!request) {
      onEach(s.site.id, { error: scientificUnavailableReason(s.site.id) })
      return []
    }
    return [{ id: s.site.id, request }]
  })
  for (const [i, s] of sendable.entries()) {
    let res: Response
    try {
      res = await fetch(`${base}/mission-science/v1/scientific-evaluations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s.request),
        signal,
      })
    } catch (e) {
      if (signal?.aborted) throw e
      for (const rest of sendable.slice(i)) onEach(rest.id, { error: 'The API bridge is not reachable.' })
      return
    }
    const response: unknown = await res.json().catch(() => undefined)
    // A run cancelled while the body was still arriving belongs to an older plan: never report it against the new one.
    signal?.throwIfAborted()
    // The backend answers in the contract's own envelope; this code means it could not reach the service at all.
    const code = (response as { error?: { code?: unknown } } | undefined)?.error?.code
    const error = code === 'mission_science_unavailable' ? { code: 'unreachable', message: '' } : null
    onEach(s.id, readRunResult(s.id, { site: s.request.site, status: res.status, response, error }))
  }
}
