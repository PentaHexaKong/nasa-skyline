import { z } from 'zod'
import type { ReferenceSite, SkyTarget, Track } from './data'
import { verifyPlannerResponse } from './dynamicPlanner'
import type { ScientificRequest } from './missionScience'
import { SERVICE_SITE, scientificUnavailableReason } from './missionScience'
import requestSchema from './referenceRequest.schema.json'
import windowSchema from './referenceWindow.schema.json'
import { postScience } from './scienceRequest'
import { parseScientificResponse } from './scientificContract'
import type { ComputedResponse } from './scientificContract.generated'

export type ReferenceRequest = {
  schemaVersion: 'skyline-reference-request/1.0.0'
  site: string
  startUtc: string
  endUtc: string
  observerHeightM: number
  profile: 'geometric'
  solarDefinition: 'anyDisk'
  earthDefinition: 'center'
  horizonOffsetDeg: number
  localResolutionM: 80
  cadenceS: number
  eventToleranceS: number
}
export type ReferenceWindow = {
  schemaVersion: 'skyline-reference-window/1.0.0'
  startUtc: string
  endUtc: string
  startEt: number
  endEt: number
  days: { date: string; startS: number; endS: number }[]
}
export type ReferenceData = { response: ComputedResponse; window: ReferenceWindow }
export type ReferenceState =
  | { state: 'computed'; data: ReferenceData }
  | { state: 'loading' | 'not_computed' | 'unsupported' | 'unavailable' | 'failed'; message: string }
const requestValidator = z.fromJSONSchema(requestSchema as Parameters<typeof z.fromJSONSchema>[0])
const windowValidator = z.fromJSONSchema(windowSchema as Parameters<typeof z.fromJSONSchema>[0])
export const utcDayMs = 86400000
export const utc = (value: number) => new Date(value).toISOString().replace('.000Z', 'Z')

export function referenceRequest(site: ReferenceSite, start: number, end: number, cadenceS = 3600): ReferenceRequest | null {
  const canonical = SERVICE_SITE[site.site.id]
  if (!canonical) return null
  return requestValidator.parse({
    schemaVersion: 'skyline-reference-request/1.0.0',
    site: canonical,
    startUtc: utc(start),
    endUtc: utc(end),
    observerHeightM: site.site.observer_height_m,
    profile: 'geometric',
    solarDefinition: 'anyDisk',
    earthDefinition: 'center',
    horizonOffsetDeg: 0,
    localResolutionM: 80,
    cadenceS,
    eventToleranceS: 1,
  }) as ReferenceRequest
}

export function annualWindows(year: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9998)
    throw new Error('Choose a valid UTC calendar year. Kernel and terrain coverage are checked on evaluation.')
  const end = Date.parse(`${String(year + 1).padStart(4, '0')}-01-01T00:00:00Z`)
  const windows: { start: number; end: number }[] = []
  for (let start = Date.parse(`${String(year).padStart(4, '0')}-01-01T00:00:00Z`); start < end; start += 14 * utcDayMs)
    windows.push({ start, end: Math.min(end, start + 14 * utcDayMs) })
  return windows
}

export async function evaluateReference(request: ReferenceRequest): Promise<ReferenceState> {
  const response = parseScientificResponse(await postScience('/mission-science/v1/reference-evaluations', request))
  if (response.dataState !== 'computed') return { state: response.dataState, message: response.error.message }
  const window = windowValidator.parse(response.provenance.sampling.referenceWindow) as ReferenceWindow
  const durationS = window.endEt - window.startEt
  const { schemaVersion: ignored, endUtc, ...settings } = request
  void ignored
  const expected: ScientificRequest = {
    ...settings,
    schemaVersion: 'skyline-scientific-request/1.0.0',
    durationS,
    constraints: { minimumSolar: 0, minimumEarth: 0, maximumSolarOutageS: 31536000, maximumEarthOutageS: 31536000 },
  }
  verifyPlannerResponse(expected, response)
  if (
    window.startUtc !== request.startUtc ||
    window.endUtc !== endUtc ||
    Math.abs(Date.parse(response.result.period.endUtc) - Date.parse(endUtc)) > 1 ||
    window.days[0]?.startS !== 0 ||
    window.days.at(-1)?.endS !== durationS ||
    window.days.length !== (Date.parse(endUtc) - Date.parse(request.startUtc)) / utcDayMs ||
    window.days.some(
      (day, index) =>
        day.endS <= day.startS ||
        day.date !== utc(Date.parse(request.startUtc) + index * utcDayMs).slice(0, 10) ||
        (index > 0 && day.startS !== window.days[index - 1]!.endS),
    )
  ) {
    throw new Error('Reference response has inconsistent UTC coverage or ET day boundaries.')
  }
  return { state: 'computed', data: { response, window } }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object')
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, stable(entry)]),
      ),
    )
  return JSON.stringify(value)
}

export function referenceSource(response: ComputedResponse, includeSampling = true) {
  const { provenance, result, request } = response
  return stable({
    observer: result.observer,
    skyline: result.skyline,
    kernels: provenance.kernels,
    dems: provenance.dems,
    implementation: provenance.implementation,
    algorithm: provenance.algorithmVersion,
    engine: provenance.engineVersion,
    profile: provenance.scientificProfile,
    cadenceS: includeSampling ? request.cadenceS : null,
    solarDefinition: request.solarDefinition,
    earthDefinition: request.earthDefinition,
    eventToleranceS: request.eventToleranceS,
  })
}

export function referenceDays(data: ReferenceData) {
  const covered = (intervals: { startS: number; endS: number }[], start: number, end: number) =>
    intervals.reduce((sum, interval) => sum + Math.max(0, Math.min(end, interval.endS) - Math.max(start, interval.startS)), 0)
  return data.window.days.map((day) => ({
    date: day.date,
    durationS: day.endS - day.startS,
    sunlightDurationS: covered(data.response.result.sunlightIntervals.available, day.startS, day.endS),
    directEarthDurationS: covered(data.response.result.directEarthIntervals.available, day.startS, day.endS),
  }))
}

export function annualSummary(chunks: ReferenceData[], year: number) {
  if (!chunks.length) return null
  const ordered = [...chunks].sort((a, b) => a.window.startEt - b.window.startEt)
  const source = referenceSource(ordered[0]!.response)
  if (
    ordered.some(
      (chunk, index) =>
        referenceSource(chunk.response) !== source || (index > 0 && chunk.window.startEt !== ordered[index - 1]!.window.endEt),
    )
  )
    throw new Error('Annual evaluations have incompatible sources or discontinuous coverage.')
  if (
    ordered[0]!.window.startUtc !== `${String(year).padStart(4, '0')}-01-01T00:00:00Z` ||
    ordered.at(-1)!.window.endUtc !== `${String(year + 1).padStart(4, '0')}-01-01T00:00:00Z`
  )
    return null
  const startEt = ordered[0]!.window.startEt
  const endEt = ordered.at(-1)!.window.endEt
  const durationS = endEt - startEt
  const longest = (body: 'sunlightIntervals' | 'directEarthIntervals') => {
    const intervals: [number, number][] = []
    for (const chunk of ordered)
      for (const interval of chunk.response.result[body].unavailable) {
        const start = chunk.window.startEt + interval.startS
        const end = chunk.window.startEt + interval.endS
        const last = intervals.at(-1)
        if (last && last[1] === start) last[1] = end
        else intervals.push([start, end])
      }
    const interval = intervals.reduce<[number, number] | null>(
      (best, next) => (!best || next[1] - next[0] > best[1] - best[0] ? next : best),
      null,
    )
    return {
      durationS: interval ? interval[1] - interval[0] : 0,
      touchesCoverageBoundary: !!interval && (interval[0] === startEt || interval[1] === endEt),
    }
  }
  return {
    durationS,
    sunlightAvailabilityFraction: ordered.reduce((sum, chunk) => sum + chunk.response.result.metrics.sunlightDurationS, 0) / durationS,
    directEarthAvailabilityFraction:
      ordered.reduce((sum, chunk) => sum + chunk.response.result.metrics.directEarthDurationS, 0) / durationS,
    longestDarkness: longest('sunlightIntervals'),
    longestDirectEarthBlackout: longest('directEarthIntervals'),
    sourceScenarioIds: ordered.map((chunk) => chunk.response.scenarioId),
  }
}

export function referenceTrack(data: ReferenceData): Track {
  return {
    t_min: data.response.result.samples.map((sample) => sample.elapsedS / 60),
    az_deg: data.response.result.samples.map((sample) => sample.sun.azimuthDeg),
    el_deg: data.response.result.samples.map((sample) => sample.sun.elevationDeg),
    direct_fraction: data.response.result.samples.map((sample) => sample.sun.visibleDiskFraction),
  }
}

export function referenceEarth(data: ReferenceData, instant: ComputedResponse): SkyTarget {
  const sample = instant.result.samples[0]!
  return {
    kind: 'earth',
    label: 'Earth center',
    margin_deg: 0,
    arc: data.response.result.samples.map((sample) => ({
      az_deg: sample.earth.azimuthDeg,
      el_deg: sample.earth.elevationDeg,
      clearance_deg: sample.earth.clearanceDeg,
    })),
    reference: {
      name: 'Earth center',
      az_deg: sample.earth.azimuthDeg,
      el_deg: sample.earth.elevationDeg,
      clearance_deg: sample.earth.clearanceDeg,
      visible: sample.earth.centerVisible,
    },
    lane: data.response.result.directEarthIntervals.available.map((interval) => [interval.startS / 60, interval.endS / 60]),
  }
}

// Pending interactive requests run before the next bounded annual chunk.
type QueueItem = {
  background: boolean
  current: () => boolean
  run: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}
const queue: QueueItem[] = []
let running = false
async function drain() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const index = queue.findIndex((item) => !item.background)
      const item = queue.splice(index < 0 ? 0 : index, 1)[0]!
      if (!item.current()) {
        item.resolve(null)
        continue
      }
      try {
        item.resolve(await item.run())
      } catch (error) {
        item.reject(error)
      }
    }
  } finally {
    running = false
  }
}
export function queueReference<T>(run: () => Promise<T>, current: () => boolean, background = false): Promise<T | null> {
  return new Promise((resolve, reject) => {
    queue.push({ run, current, background, resolve: resolve as (value: unknown) => void, reject })
    void drain()
  })
}
export function referenceInitial(site: ReferenceSite): ReferenceState {
  return SERVICE_SITE[site.site.id]
    ? { state: 'loading', message: 'Evaluating SPICE geometry and LOLA terrain.' }
    : { state: 'unsupported', message: scientificUnavailableReason(site.site.id) }
}
