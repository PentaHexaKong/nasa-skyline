import type { Terrain } from './data'
import { stepToward } from './landscape'
import type { Span } from './mission'

/**
 * How far a rover gets over the whole terrain tile during a stay. Computed from LOLA terrain, not validated: the rover
 * service answers nine 80 m squares around the landing; this covers the 20 km tile on a coarser grid with simpler rules.
 *
 * Rules: every hour of the stay, a cell is usable when the Sun is above its horizon and it has contact (Earth above its
 * horizon, or a relay link). The rover drives off a cell only in an hour when both that cell and the next are usable,
 * never onto ground steeper than the limit, at a fixed speed, and may wait anywhere.
 */

/** Full-resolution terrain cells per sim cell. 4 gives ~16,600 cells on a 513 tile; 8 is the coarse setting for phones. */
export const STRIDE = 4
const MOON_R = 1_737_400
/** Angular radius of the Sun's disc: lit when any part of the disc clears the horizon, as the service's `anyDisk`. */
const SUN_RADIUS_DEG = 0.2666
// ponytail: 64 azimuth bins (5.6° apart, linear between bins); 128 if hourly lighting flickers at bin edges.
export const AZ_BINS = 64
/**
 * Horizons start this far out. The terrain stores whole metres, and nearer than this the rounding alone moves a
 * horizon by more than a quarter degree, as much as the Sun's height decides at a polar site.
 * ponytail: ground nearer than 120 m only counts through the slope limit, not as shade.
 */
const NEAR_M = 120

export type Model = { g: number; stride: number; cell: number; half: number; height: Float32Array; slope: Float32Array }

const heightAt = ({ meta, heights }: Terrain, col: number, row: number) =>
  heights[Math.max(0, Math.min(meta.n - 1, row)) * meta.n + Math.max(0, Math.min(meta.n - 1, col))] ?? 0

/** Ground slope in degrees over a baseline of `step` cells each way. */
export function slopeDeg(t: Terrain, col: number, row: number, step = 1) {
  const run = 2 * step * t.meta.cell_m
  const dx = (heightAt(t, col + step, row) - heightAt(t, col - step, row)) / run
  const dy = (heightAt(t, col, row - step) - heightAt(t, col, row + step)) / run
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI
}

/** Every `stride`-th terrain cell with its height and slope; rows north to south, like the terrain. */
export function buildModel(t: Terrain, stride = STRIDE): Model {
  const g = Math.floor((t.meta.n - 1) / stride) + 1
  const height = new Float32Array(g * g)
  const slope = new Float32Array(g * g)
  for (let r = 0; r < g; r++)
    for (let c = 0; c < g; c++) {
      height[r * g + c] = heightAt(t, c * stride, r * stride)
      slope[r * g + c] = slopeDeg(t, c * stride, r * stride, stride)
    }
  return { g, stride, cell: t.meta.cell_m * stride, half: t.meta.radius_km * 1000, height, slope }
}

/** The sim cell holding a full-resolution terrain cell. */
export const cellOf = (m: Model, col: number, row: number) =>
  Math.min(m.g - 1, Math.round(row / m.stride)) * m.g + Math.min(m.g - 1, Math.round(col / m.stride))

/** Sorted-insert queue of [key, cell], smallest key last. ponytail: a binary heap if the grid grows past a few hundred cells a side. */
function push(queue: [number, number][], key: number, cell: number) {
  let lo = 0
  let hi = queue.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((queue[mid] as [number, number])[0] > key) lo = mid + 1
    else hi = mid
  }
  queue.splice(lo, 0, [key, cell])
}

const centre = (m: Model) => ((m.g - 1) >> 1) * m.g + ((m.g - 1) >> 1)

export type Field = { dist: Float32Array; prev: Int32Array }

/** Shortest driving distance in km from the site to every cell, over cells under the slope limit and inside `ok`. */
export function drive(m: Model, maxSlope: number, ok: Uint8Array): Field {
  const { g } = m
  const dist = new Float32Array(g * g).fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(g * g).fill(-1)
  const start = centre(m)
  dist[start] = 0
  const queue: [number, number][] = [[0, start]]
  while (queue.length) {
    const [d, i] = queue.pop() as [number, number]
    if (d > (dist[i] as number)) continue
    const r = Math.floor(i / g)
    const c = i % g
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if ((!dr && !dc) || rr < 0 || cc < 0 || rr >= g || cc >= g) continue
        const j = rr * g + cc
        if (!ok[j] || (m.slope[j] as number) > maxSlope) continue
        const nd = d + Math.hypot(Math.hypot(dr, dc) * m.cell, (m.height[j] as number) - (m.height[i] as number)) / 1000
        if (nd < (dist[j] as number)) {
          dist[j] = nd
          prev[j] = i
          push(queue, nd, j)
        }
      }
  }
  return { dist, prev }
}

/**
 * Per cell, per azimuth bin, the tangent of the horizon's elevation angle, from terrain inside the tile only.
 * Rays march half a sim cell at a time over the full-resolution heights, from NEAR_M out. The heightmap carries the
 * curvature drop as seen from the site; for an observer at p looking along u, the true drop works out to adding (u·p)/R
 * to every ray's tangent.
 * ponytail: terrain beyond the tile's edge is not in it, so cells near the edge see an open horizon outward.
 */
export function horizons(t: Terrain, m: Model, onProgress?: (share: number) => void): Float32Array {
  const { n, cell_m } = t.meta
  const { g, stride } = m
  const out = new Float32Array(g * g * AZ_BINS)
  let top = -Infinity
  for (const h of t.heights) top = Math.max(top, h)
  const step = stride / 2
  const dirs = Array.from({ length: AZ_BINS }, (_, b) => {
    const [dc, dr] = stepToward((b * 360) / AZ_BINS)
    return { dc: dc * step, dr: dr * step, east: dc, north: -dr }
  })
  const run = step * cell_m
  const first = Math.max(1, Math.ceil(NEAR_M / run))
  for (let r = 0; r < g; r++) {
    for (let c = 0; c < g; c++) {
      const i = r * g + c
      const h0 = m.height[i] as number
      const east = c * m.cell - m.half
      const north = m.half - r * m.cell
      for (let b = 0; b < AZ_BINS; b++) {
        const { dc, dr, east: ue, north: un } = dirs[b] as (typeof dirs)[number]
        const x0 = c * stride + 0.5
        const y0 = r * stride + 0.5
        let best = -Infinity
        for (let k = first; ; k++) {
          const x = x0 + k * dc
          const y = y0 + k * dr
          if (x < 0 || y < 0 || x >= n || y >= n) break
          const d = k * run
          // Nothing further along can rise above what is already found.
          if ((top - h0) / d <= best) break
          const tan = ((t.heights[Math.floor(y) * n + Math.floor(x)] as number) - h0) / d
          if (tan > best) best = tan
        }
        // A ray that leaves the tile at once sees level ground beyond it.
        out[i * AZ_BINS + b] = (best === -Infinity ? 0 : best) + (ue * east + un * north) / MOON_R
      }
    }
    onProgress?.((r + 1) / g)
  }
  return out
}

const horizonCache = new Map<string, Float32Array>()
function cachedHorizons(t: Terrain, m: Model, onProgress?: (share: number) => void) {
  const key = `${t.meta.site_id}:${t.meta.tier}:${t.meta.n}:${m.stride}`
  let found = horizonCache.get(key)
  if (!found) {
    found = horizons(t, m, onProgress)
    if (horizonCache.size > 3) horizonCache.clear()
    horizonCache.set(key, found)
  }
  return found
}

/** Tangent of the horizon at azimuth `azDeg` for cell `i`, linear between bins. */
function horizonTan(h: Float32Array, i: number, azDeg: number) {
  const f = ((((azDeg % 360) + 360) % 360) / 360) * AZ_BINS
  const b = Math.floor(f) % AZ_BINS
  const w = f - Math.floor(f)
  return (h[i * AZ_BINS + b] as number) * (1 - w) + (h[i * AZ_BINS + ((b + 1) % AZ_BINS)] as number) * w
}

export type SkySample = { tMs: number; azDeg: number; elDeg: number }

/** Direction at `tMs`, linear between samples (azimuth the short way round), held at the ends. */
export function skyAt(samples: SkySample[], tMs: number): { azDeg: number; elDeg: number } | undefined {
  if (samples.length === 0) return undefined
  let lo = 0
  let hi = samples.length - 1
  if (tMs <= (samples[0] as SkySample).tMs) return samples[0]
  if (tMs >= (samples[hi] as SkySample).tMs) return samples[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((samples[mid] as SkySample).tMs <= tMs) lo = mid
    else hi = mid
  }
  const a = samples[lo] as SkySample
  const b = samples[hi] as SkySample
  const w = (tMs - a.tMs) / (b.tMs - a.tMs || 1)
  const dAz = ((((b.azDeg - a.azDeg) % 360) + 540) % 360) - 180
  return { azDeg: a.azDeg + dAz * w, elDeg: a.elDeg + (b.elDeg - a.elDeg) * w }
}

export type RoverSimInput = {
  terrain: Terrain
  /** Landing in full-resolution terrain columns and rows; the tile's centre (the site) when left out. */
  landing?: { col: number; row: number }
  startMs: number
  stayS: number
  /**
   * The site's Sun and Earth directions over the stay.
   * ponytail: used for every cell; across a 20 km tile the directions differ by under 0.7°, ignored.
   */
  sun: SkySample[]
  earth: SkySample[]
  /**
   * When a relay links the landing site to Earth (relay only, not direct contact).
   * ponytail: taken at the landing site and applied to every cell; a relay's footprint is far wider than the tile.
   */
  relaySpans?: Span[]
  speedMps: number
  maxSlopeDeg: number
  /** Full-resolution cells per sim cell: STRIDE by default, 2 × STRIDE for phones. */
  stride?: number
}

export type RoverSimResult = {
  g: number
  stride: number
  cellM: number
  halfM: number
  landing: number
  /** Seconds from the stay's start the rover first reaches each cell, row-major north to south; Infinity for never. */
  arrivalS: Float32Array
  /** 1 where the ground is steeper than the limit. */
  steep: Uint8Array
  /** The landing cell is within the slope limit, lit and in contact in the first hour. */
  startAdmitted: boolean
  hours: number
  summary: {
    cellsReached: number
    areaKm2: number
    farthestKm: number
    /** On the way to the farthest cell reached. */
    drivingH: number
    waitingH: number
  }
}

/** Earliest arrival at every cell over the stay, hour by hour. Pure; `onProgress` gets 0 to 1. */
export function simulateRover(input: RoverSimInput, onProgress?: (share: number) => void): RoverSimResult {
  const { terrain, startMs, stayS, sun, earth, relaySpans = [], speedMps, maxSlopeDeg } = input
  const m = buildModel(terrain, input.stride ?? STRIDE)
  const { g } = m
  const cells = g * g
  const landing = input.landing ? cellOf(m, input.landing.col, input.landing.row) : centre(m)
  const horizon = cachedHorizons(terrain, m, (s) => onProgress?.(s * 0.7))

  // ponytail: lighting and contact are sampled once per hour, at its middle; a pass shorter than an hour can be missed.
  const hours = Math.max(1, Math.ceil(stayS / 3600))
  const usable = new Uint8Array(cells * hours)
  for (let h = 0; h < hours; h++) {
    const t = startMs + (h + 0.5) * 3_600_000
    const s = skyAt(sun, t)
    const e = skyAt(earth, t)
    const relay = relaySpans.some(([a, b]) => t >= a && t < b)
    const sunTan = s ? Math.tan(((s.elDeg + SUN_RADIUS_DEG) * Math.PI) / 180) : -Infinity
    const earthTan = e ? Math.tan((e.elDeg * Math.PI) / 180) : -Infinity
    for (let i = 0; i < cells; i++) {
      const lit = s !== undefined && sunTan > horizonTan(horizon, i, s.azDeg)
      const contact = relay || (e !== undefined && earthTan > horizonTan(horizon, i, e.azDeg))
      if (lit && contact) usable[i * hours + h] = 1
    }
    onProgress?.(0.7 + (0.1 * (h + 1)) / hours)
  }

  const steep = Uint8Array.from(m.slope, (s) => (s > maxSlopeDeg ? 1 : 0))
  const arrival = new Float64Array(cells).fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(cells).fill(-1)
  arrival[landing] = 0
  const queue: [number, number][] = [[0, landing]]
  let settled = 0
  while (queue.length) {
    const [t, i] = queue.pop() as [number, number]
    if (t > (arrival[i] as number)) continue
    if (++settled % 512 === 0) onProgress?.(0.8 + (0.2 * settled) / cells)
    const r = Math.floor(i / g)
    const c = i % g
    const h0 = Math.floor(t / 3600)
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if ((!dr && !dc) || rr < 0 || cc < 0 || rr >= g || cc >= g) continue
        const j = rr * g + cc
        if (steep[j]) continue
        // ponytail: an edge begun in a usable hour is finished even if the hour ends on the way (one edge is 13 to 26 min).
        let h = h0
        while (h < hours && !(usable[i * hours + h] && usable[j * hours + h])) h++
        if (h >= hours) continue
        const leg = Math.hypot(Math.hypot(dr, dc) * m.cell, (m.height[j] as number) - (m.height[i] as number)) / speedMps
        const at = Math.max(t, h * 3600) + leg
        if (at <= stayS && at < (arrival[j] as number)) {
          arrival[j] = at
          prev[j] = i
          push(queue, at, j)
        }
      }
  }

  let reached = 0
  let far = landing
  let farM = 0
  const lr = Math.floor(landing / g)
  const lc = landing % g
  for (let i = 0; i < cells; i++) {
    if (!Number.isFinite(arrival[i] as number)) continue
    reached++
    const d = Math.hypot(Math.floor(i / g) - lr, (i % g) - lc) * m.cell
    if (d > farM) {
      farM = d
      far = i
    }
  }
  let drivingS = 0
  for (let i = far; prev[i] !== -1; i = prev[i] as number) {
    const j = prev[i] as number
    drivingS +=
      Math.hypot(
        Math.hypot(Math.floor(i / g) - Math.floor(j / g), (i % g) - (j % g)) * m.cell,
        (m.height[i] as number) - (m.height[j] as number),
      ) / speedMps
  }
  onProgress?.(1)
  return {
    g,
    stride: m.stride,
    cellM: m.cell,
    halfM: m.half,
    landing,
    arrivalS: Float32Array.from(arrival),
    steep,
    startAdmitted: !steep[landing] && usable[landing * hours] === 1,
    hours,
    summary: {
      cellsReached: reached,
      areaKm2: (reached * m.cell * m.cell) / 1e6,
      farthestKm: farM / 1000,
      drivingH: drivingS / 3600,
      waitingH: ((arrival[far] as number) - drivingS) / 3600,
    },
  }
}
