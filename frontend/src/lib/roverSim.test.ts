import { describe, expect, test } from 'vitest'
import binUrl from '../../data/terrain/connecting-ridge.bin?inline'
import metaJson from '../../data/terrain/connecting-ridge.json'
import stuck from '../../fixtures/rover/cr1-2026-11-20T12-cannot-start.json'
import served from '../../fixtures/rover/cr1-2026-11-27T12.json'
import tracksJson from '../data/generated/connecting-ridge.tracks.json'
import { type Terrain, TerrainSchema, type Track } from './data'
import { ROVER_TERMS } from './roverLive'
import { AZ_BINS, buildModel, cellOf, horizons, type RoverSimInput, type SkySample, simulateRover } from './roverSim'

const HOUR = 3600

function synthetic(id: string, n: number, cellM: number, height: (col: number, row: number) => number): Terrain {
  const heights = new Int16Array(n * n)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = height(c, r)
  const meta = TerrainSchema.parse({
    site_id: id,
    file: `${id}.bin`,
    n,
    radius_km: ((n - 1) * cellM) / 2000,
    cell_m: cellM,
    ground_height_m: 0,
    observer_height_m: 0,
    min_m: 0,
    max_m: 0,
    skyline_inside_share: 1,
  })
  return { meta, heights }
}

const high: SkySample[] = [{ tMs: 0, azDeg: 0, elDeg: 45 }]
const flatInput = (id: string, over: Partial<RoverSimInput> = {}): RoverSimInput => ({
  terrain: synthetic(id, 65, 10, () => 0),
  startMs: 0,
  stayS: 100,
  sun: high,
  earth: high,
  speedMps: 1,
  maxSlopeDeg: 20,
  stride: 1,
  ...over,
})
/** Arrival at the cell `k` cells east of the landing. */
const eastOf = (r: ReturnType<typeof simulateRover>, k: number) => r.arrivalS[r.landing + k] as number

describe('on flat ground, always lit and in contact', () => {
  test('reach grows as speed times time', () => {
    for (const stayS of [100, 200]) {
      const r = simulateRover(flatInput('flat', { stayS }))
      expect(r.startAdmitted).toBe(true)
      expect(r.summary.farthestKm).toBeCloseTo(stayS / 1000, 6)
      expect(r.summary.waitingH).toBeCloseTo(0, 9)
      expect(eastOf(r, 5)).toBeCloseTo(50, 3)
    }
  })
})

test('a steep wall blocks the rover', () => {
  const wall = 32 + 5
  const r = simulateRover(flatInput('wall', { stayS: 1000, terrain: synthetic('wall', 65, 10, (c) => (c === wall ? 1000 : 0)) }))
  const row = Math.floor(r.landing / r.g)
  // Central differences put the steep ground on either side of a one-cell wall.
  expect(r.steep[row * r.g + wall - 1]).toBe(1)
  expect(r.steep[row * r.g + wall + 1]).toBe(1)
  expect(eastOf(r, 3)).toBeCloseTo(30, 3)
  for (let rr = 0; rr < r.g; rr++) for (let c = wall; c < r.g; c++) expect(r.arrivalS[rr * r.g + c]).toBe(Number.POSITIVE_INFINITY)
  // West of the wall is open as far as the time allows.
  expect(r.arrivalS[row * r.g + 32 - 30]).toBeCloseTo(300, 3)
})

test('a dark hour stops driving and the rover waits it out', () => {
  // 10 m edges at 1 cm/s take 1000 s; the second hour has the Sun below the horizon.
  const sun: SkySample[] = [
    { tMs: 0.5 * HOUR * 1000, azDeg: 0, elDeg: 45 },
    { tMs: 1.5 * HOUR * 1000, azDeg: 0, elDeg: -10 },
    { tMs: 2.5 * HOUR * 1000, azDeg: 0, elDeg: 45 },
  ]
  const lit = simulateRover(flatInput('dark', { stayS: 3 * HOUR, speedMps: 0.01 }))
  const dark = simulateRover(flatInput('dark', { stayS: 3 * HOUR, speedMps: 0.01, sun }))
  expect(eastOf(lit, 5)).toBeCloseTo(5000, 3)
  // Four edges start in the first hour; the fifth waits for the third.
  expect(eastOf(dark, 4)).toBeCloseTo(4000, 3)
  expect(eastOf(dark, 5)).toBeCloseTo(2 * HOUR + 1000, 3)
  expect(dark.summary.waitingH).toBeGreaterThan(0)
  // No contact (Earth below every horizon) has the same effect, and a relay restores it.
  const quiet: SkySample[] = sun.map((s) => ({ ...s }))
  const noEarth = simulateRover(flatInput('dark', { stayS: 3 * HOUR, speedMps: 0.01, earth: quiet }))
  expect(eastOf(noEarth, 5)).toBeCloseTo(2 * HOUR + 1000, 3)
  const relayed = simulateRover(flatInput('dark', { stayS: 3 * HOUR, speedMps: 0.01, earth: quiet, relaySpans: [[0, 3 * HOUR * 1000]] }))
  expect(eastOf(relayed, 5)).toBeCloseTo(5000, 3)
})

// --- The real site ----------------------------------------------------------------------------------------------

const bytes = Uint8Array.from(atob(binUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
const ridge: Terrain = { meta: TerrainSchema.parse(metaJson), heights: new Int16Array(bytes.buffer) }
const tracks = tracksJson as Record<string, Track>
const SITE = { lat: -89.4679, lon: 222.589 }

/** The site's Sun and Earth samples from the day before `startMs` through `days` days. */
function sky(startMs: number, days: number) {
  const sun: SkySample[] = []
  const earth: SkySample[] = []
  for (let d = -1; d <= days; d++) {
    const day = new Date(Math.floor(startMs / 86_400_000 + d) * 86_400_000).toISOString().slice(0, 10)
    const tr = tracks[day]
    if (!tr) continue
    const base = Date.parse(`${day}T00:00:00Z`)
    tr.t_min.forEach((t, i) => sun.push({ tMs: base + t * 60_000, azDeg: tr.az_deg[i] as number, elDeg: tr.el_deg[i] as number }))
    tr.earth?.t_min.forEach((t, i) =>
      earth.push({ tMs: base + t * 60_000, azDeg: tr.earth?.az_deg[i] as number, elDeg: tr.earth?.el_deg[i] as number }),
    )
  }
  return { sun, earth }
}

/** A point on the Moon to full-resolution terrain column and row: the tile places cells by great-circle distance and bearing from the site. */
function colRow(lat: number, lon: number) {
  const rad = Math.PI / 180
  const [p1, p2, dl] = [SITE.lat * rad, lat * rad, (lon - SITE.lon) * rad]
  const bearing = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  const d = 2 * 1_737_400 * Math.asin(Math.sqrt(h))
  const { cell_m, radius_km } = ridge.meta
  return { col: (radius_km * 1000 + d * Math.sin(bearing)) / cell_m, row: (radius_km * 1000 - d * Math.cos(bearing)) / cell_m }
}

const ridgeInput = (startUtc: string, stayS: number, stride?: number): RoverSimInput => {
  const startMs = Date.parse(startUtc)
  return {
    terrain: ridge,
    startMs,
    stayS,
    ...sky(startMs, Math.ceil(stayS / 86400)),
    speedMps: ROVER_TERMS.speedMps,
    maxSlopeDeg: ROVER_TERMS.maximumSlopeDeg,
    stride,
  }
}

test('a 28-day stay over the whole tile runs in a few seconds', () => {
  const model = buildModel(ridge)
  let t0 = performance.now()
  horizons(ridge, model)
  const horizonMs = performance.now() - t0
  t0 = performance.now()
  const r = simulateRover(ridgeInput('2026-11-27T12:00:00Z', 28 * 86400))
  const totalMs = performance.now() - t0
  t0 = performance.now()
  const coarse = simulateRover(ridgeInput('2026-11-27T12:00:00Z', 28 * 86400, 8))
  const coarseMs = performance.now() - t0
  console.info(
    `rover sim: ${r.g ** 2} cells, ${AZ_BINS} bins, ${r.hours} h; horizons ${horizonMs.toFixed(0)} ms, full run ${totalMs.toFixed(0)} ms;` +
      ` stride 8: ${coarse.g ** 2} cells ${coarseMs.toFixed(0)} ms; reached ${r.summary.cellsReached} cells,` +
      ` ${r.summary.areaKm2.toFixed(1)} km², farthest ${r.summary.farthestKm.toFixed(2)} km, driving ${r.summary.drivingH.toFixed(1)} h, waiting ${r.summary.waitingH.toFixed(1)} h`,
  )
  expect(r.g ** 2).toBeGreaterThan(16_000)
  expect(totalMs).toBeLessThan(10_000)
  expect(r.summary.cellsReached).toBeGreaterThan(1)
})

type Kind = 'landing' | 'reached' | 'not-reached' | 'too-steep'

/** The service's answer per square, row-major, and the sim's at the same nine square centres. */
function compare(fixture: typeof served, stride: number) {
  const { grid, directOnly } = fixture.result
  const r = simulateRover(ridgeInput(fixture.request.startUtc, ROVER_TERMS.durationS, stride))
  const model = buildModel(ridge, stride)
  return grid.cellPointIndices.map((p, i) => {
    const row = Math.floor(i / 3)
    const col = i % 3
    const point = grid.points[p] as (typeof grid.points)[number]
    const at = colRow(point.latitudeDeg, point.longitudeDegEast)
    const cell = cellOf(model, at.col, at.row)
    const service: Kind =
      i === grid.startCell
        ? 'landing'
        : !grid.terrainTraversableMask[row]?.[col]
          ? 'too-steep'
          : directOnly.reachableMask?.[row]?.[col]
            ? 'reached'
            : 'not-reached'
    const sim: Kind =
      cell === r.landing ? 'landing' : r.steep[cell] ? 'too-steep' : Number.isFinite(r.arrivalS[cell] as number) ? 'reached' : 'not-reached'
    return { service, sim, admitted: r.startAdmitted, serviceAdmitted: directOnly.startAdmitted }
  })
}

/**
 * Stride 2 makes 78 m sim cells, close to the service's 80 m squares; at the default 156 m the nine squares land on four
 * sim cells. The service's rows follow its polar stereographic grid, not north: squares 0, 1, 2 lie east, south-east and
 * south of the landing, 6, 7, 8 north, north-west and west.
 *
 * 2026-11-27 12:00, landing admitted in both, 7 of 9 squares agree. The two that differ, 6 (north) and 8 (west), are
 * reached here and not by the service. The Sun is 1.4° up; the sim puts these cells' horizon toward it at 0.4° and 0.5°,
 * so a one-degree difference in horizon (the service's 80 m float DEM and 2-minute steps against these whole-metre
 * heights, horizons from 120 m out and hourly steps) decides them. Square 7 (north-west) is not reached in either; here it is in shade.
 * 2026-11-20 12:00: neither admits the landing, and the sim reaches nothing in the 2 hours.
 */
describe('against the rover service, 2 h direct to Earth at Connecting Ridge', () => {
  test('2026-11-27 12:00: the landing is admitted and most squares agree', () => {
    const rows = compare(served, 2)
    expect(rows[4]).toMatchObject({ service: 'landing', sim: 'landing', admitted: true, serviceAdmitted: true })
    expect(rows.filter((x) => x.service === x.sim).length).toBeGreaterThanOrEqual(7)
    expect(rows.map((x) => x.sim)).toEqual([
      'reached',
      'reached',
      'reached',
      'reached',
      'landing',
      'reached',
      'reached',
      'not-reached',
      'reached',
    ])
  })
  test('2026-11-20 12:00: the landing is not admitted in either', () => {
    const rows = compare(stuck as unknown as typeof served, 2)
    expect(rows[4]).toMatchObject({ sim: 'landing', admitted: false, serviceAdmitted: false })
    expect(rows.filter((x) => x.sim === 'reached')).toHaveLength(0)
  })
})
