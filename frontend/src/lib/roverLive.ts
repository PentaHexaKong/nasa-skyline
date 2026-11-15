import { useHydrated } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SERVICE_SITE, scientificUnavailableReason } from './missionScience'
import type { RoverRequest, RoverResponse } from './roverContract.proposed'
import { postScience } from './scienceRequest'

/** The model's terms, shown beside the result: what the rover is assumed to do. */
export const ROVER_TERMS = {
  cellM: 80,
  durationS: 7200,
  speedMps: 0.2,
  maximumSlopeDeg: 20,
} as const

/** A square's centre on the Moon (degrees, east longitude) and what the rover does there. */
export type ReachCell = { lat: number; lon: number } & (
  | { kind: 'landing'; slopeDeg: number | null }
  | { kind: 'reached'; arrivalS: number; slopeDeg: number | null }
  | { kind: 'not-reached'; slopeDeg: number | null }
  | { kind: 'too-steep'; slopeDeg: number | null }
  | { kind: 'no-terrain' }
)

export type RoverReach =
  /** Nine cells, row-major as the service returns them, the landing cell in the middle. */
  | { kind: 'reach'; cells: ReachCell[]; reached: number }
  /** The landing cell itself fails the rules at landing, so the rover never sets off. */
  | { kind: 'cannot-start' }

export type RoverLoad = { status: 'loading' } | { status: 'ready'; reach: RoverReach } | { status: 'unavailable'; message: string }

/** The service's request for a mobile 3 by 3 grid around the site, from the landing moment, on the service's 2-minute steps. */
export function roverRequest(siteId: string, landingMs: number): RoverRequest | null {
  const site = SERVICE_SITE[siteId]
  if (!site) return null
  const start = new Date(landingMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return {
    schemaVersion: 'skyline-rover-request/0.1.0',
    site,
    startUtc: start,
    durationS: ROVER_TERMS.durationS,
    timeStepS: 120,
    terrainDemId: 'LDEM_80S_80MPP_ADJ.TIF',
    projectionId: 'LOLA-south-polar-stereographic-DE421',
    gridRadiusCells: 1,
    gridResolutionM: ROVER_TERMS.cellM,
    observerHeightM: 0,
    speedMps: ROVER_TERMS.speedMps,
    maximumSlopeDeg: ROVER_TERMS.maximumSlopeDeg,
    movementRule: 'four-neighbor-no-diagonals',
    allowWaiting: true,
    movementRequiresSunlight: true,
    movementRequiresCommunication: true,
    stoppingRequiresSunlight: true,
    stoppingRequiresCommunication: true,
    solarDefinition: 'anyDisk',
    profile: 'geometric',
    horizonOffsetDeg: 0,
    communicationMode: 'direct-only',
    // 9 cells and 12 edge midpoints; one graph node per cell per time level (61 levels over 2 hours).
    budget: { maxGeometryEvaluations: 21, maxGraphNodes: 9 * 61, maxTransitions: 10_000, maxWallTimeS: 300 },
  }
}

/** The reply as the page reads it, or null when it is not a computed direct-only result. */
export function parseRoverReach(response: RoverResponse): RoverReach | null {
  if (response.dataState !== 'computed') return null
  const { grid, directOnly } = response.result
  if (directOnly.dataState !== 'computed' || grid.rows !== 3 || grid.columns !== 3) return null
  if (directOnly.startAdmitted === false) return { kind: 'cannot-start' }
  const cells: ReachCell[] = []
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3)
    const column = i % 3
    const point = grid.points[grid.cellPointIndices[i] ?? -1]
    if (!point) return null
    const at = { lat: point.latitudeDeg, lon: point.longitudeDegEast }
    const slopeDeg = point.estimatedSlopeDeg
    if (!grid.terrainValidMask[row]?.[column]) cells.push({ ...at, kind: 'no-terrain' })
    else if (i === grid.startCell) cells.push({ ...at, kind: 'landing', slopeDeg })
    else if (!grid.terrainTraversableMask[row]?.[column]) cells.push({ ...at, kind: 'too-steep', slopeDeg })
    else {
      const arrivalS = directOnly.reachableMask?.[row]?.[column] ? directOnly.earliestArrivalS?.[row]?.[column] : null
      cells.push(arrivalS == null ? { ...at, kind: 'not-reached', slopeDeg } : { ...at, kind: 'reached', arrivalS, slopeDeg })
    }
  }
  return { kind: 'reach', cells, reached: cells.filter((c) => c.kind === 'reached').length }
}

/** Asks the rover service once per site and landing moment; a result for an older ask is dropped. */
export function useRoverReach(siteId: string, landingMs: number): RoverLoad {
  const [load, setLoad] = useState<RoverLoad>({ status: 'loading' })
  // Before hydration the planner renders its default plan; asking for it would hold the one-at-a-time service.
  const hydrated = useHydrated()
  useEffect(() => {
    if (!hydrated) return
    const body = roverRequest(siteId, landingMs)
    if (!body) {
      setLoad({ status: 'unavailable', message: scientificUnavailableReason(siteId) })
      return
    }
    let current = true
    setLoad({ status: 'loading' })
    postScience('/rover-science/v1/reachability-evaluations', body)
      .then((reply) => {
        if (!current) return
        const response = reply as RoverResponse
        const reach = response ? parseRoverReach(response) : null
        setLoad(
          reach
            ? { status: 'ready', reach }
            : { status: 'unavailable', message: response?.error?.message ?? 'The rover service returned no result for this landing.' },
        )
      })
      .catch((error: unknown) => {
        if (current)
          setLoad({ status: 'unavailable', message: error instanceof Error ? error.message : 'The rover service could not be reached.' })
      })
    return () => {
      current = false
    }
  }, [hydrated, siteId, landingMs])
  return load
}
