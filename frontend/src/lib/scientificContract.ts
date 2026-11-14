import { z } from 'zod'
import mastRequestSchema from './mastPowerRequest.schema.json'
import mastResponseSchema from './mastPowerResponse.schema.json'
import type { MastPowerRequest, MastPowerResponse, ScientificRequest, ScientificResponse } from './scientificContract.generated'
import requestSchema from './scientificRequest.schema.json'
import responseSchema from './scientificResponse.schema.json'

export type { MastPowerRequest, MastPowerResponse, ScientificRequest, ScientificResponse } from './scientificContract.generated'

const requestValidator = z.fromJSONSchema(requestSchema as Parameters<typeof z.fromJSONSchema>[0])
const responseValidator = z.fromJSONSchema(responseSchema as Parameters<typeof z.fromJSONSchema>[0])

export function parseScientificResponse(value: unknown): ScientificResponse {
  return responseValidator.parse(value) as ScientificResponse
}

export async function evaluateScientificScenario(request: ScientificRequest, signal?: AbortSignal): Promise<ScientificResponse> {
  const validatedRequest = requestValidator.parse(request)
  const response = await fetch('/api/mission-science/v1/scientific-evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedRequest),
    signal,
  })
  const result = parseScientificResponse(await response.json())
  if (!response.ok && result.dataState === 'computed') throw new Error('Computed scientific response has a failing HTTP status')
  return result
}

export async function loadScientificFeed(scenarioId: string): Promise<ScientificResponse> {
  if (!/^scenario-[0-9a-f]{64}$/.test(scenarioId)) throw new Error('A complete scenario identity is required')
  const response = await fetch(`/scientificFeeds/${scenarioId}.json`)
  if (!response.ok) throw new Error('Scientific scenario feed is unavailable')
  const result = parseScientificResponse(await response.json())
  if (result.dataState !== 'computed' || result.scenarioId !== scenarioId) throw new Error('Scientific scenario feed identity mismatch')
  return result
}

export const secondsToHours = (seconds: number) => seconds / 3600
export const fractionToPercent = (fraction: number) => fraction * 100

export function scientificPresentationMetrics(response: ScientificResponse) {
  if (response.dataState !== 'computed') return null
  const metrics = response.result.metrics
  return {
    sunlightHours: secondsToHours(metrics.sunlightDurationS),
    directEarthHours: secondsToHours(metrics.directEarthDurationS),
    sunlightPercent: fractionToPercent(metrics.sunlightAvailabilityFraction),
    directEarthPercent: fractionToPercent(metrics.directEarthAvailabilityFraction),
    meanVisibleDiskPercent: fractionToPercent(metrics.meanVisibleSolarDiskFraction),
    longestDarknessHours: secondsToHours(metrics.longestDarkness.durationS),
    longestDirectEarthBlackoutHours: secondsToHours(metrics.longestDirectEarthBlackout.durationS),
  }
}

const mastRequestValidator = z.fromJSONSchema(mastRequestSchema as Parameters<typeof z.fromJSONSchema>[0])
const mastResponseValidator = z.fromJSONSchema(mastResponseSchema as Parameters<typeof z.fromJSONSchema>[0])

export async function evaluateMastPowerScenario(request: MastPowerRequest, signal?: AbortSignal): Promise<MastPowerResponse> {
  const response = await fetch('/api/mission-science/v1/mast-power-evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mastRequestValidator.parse(request)),
    signal,
  })
  const result = mastResponseValidator.parse(await response.json()) as MastPowerResponse
  if (!response.ok && result.dataState === 'computed') throw new Error('Computed mast response has a failing HTTP status')
  return result
}

export async function evaluateMastPlacementScenario(
  request: import('./scientificContract.generated').MastPlacementRequest,
  signal?: AbortSignal,
): Promise<import('./scientificContract.generated').MastPlacementResponse> {
  const { default: requestSchema } = await import('./mastPlacementRequest.schema.json')
  const { default: responseSchema } = await import('./mastPlacementResponse.schema.json')
  const requestValidator = z.fromJSONSchema(requestSchema as Parameters<typeof z.fromJSONSchema>[0])
  const responseValidator = z.fromJSONSchema(responseSchema as Parameters<typeof z.fromJSONSchema>[0])
  const response = await fetch('/api/mission-science/v1/mast-placement-evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestValidator.parse(request)),
    signal,
  })
  const result = responseValidator.parse(await response.json()) as import('./scientificContract.generated').MastPlacementResponse
  if (!response.ok && result.dataState === 'computed') throw new Error('Computed placement response has a failing HTTP status')
  return result
}
