import type { Terrain } from './data'

/**
 * The flat landscape behind Explore's "What makes a good place to land?". Everything is read from the site's LOLA
 * heightmap (`data/terrain/<site>.bin`: rows north to south, columns west to east, metres, curvature drop already
 * applied) and from the pipeline's Sun and Earth directions for one stated moment. Shadows and Earth line of sight are
 * traced inside this tile only: terrain beyond its edge is not in it, so the tile is an illustration of the effect, and
 * the site's own answer still comes from its computed skyline.
 */

/** Unit step across the grid toward an azimuth (clockwise from north): columns grow east, rows grow south. */
export function stepToward(azDeg: number): [dCol: number, dRow: number] {
  const a = (azDeg * Math.PI) / 180
  return [Math.sin(a), -Math.cos(a)]
}

/** Lambert shading from a light at `azDeg`, `elDeg`, per cell, 0 to 1. */
export function relief({ meta, heights }: Terrain, azDeg: number, elDeg: number): Float32Array {
  const n = meta.n
  const c = meta.cell_m
  const out = new Float32Array(n * n)
  const [sx, sy] = stepToward(azDeg)
  const el = (elDeg * Math.PI) / 180
  // Light direction in (east, north, up).
  const lx = sx * Math.cos(el)
  const ly = -sy * Math.cos(el)
  const lz = Math.sin(el)
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) {
      const w = heights[r * n + Math.max(0, k - 1)] ?? 0
      const e = heights[r * n + Math.min(n - 1, k + 1)] ?? 0
      const north = heights[Math.max(0, r - 1) * n + k] ?? 0
      const south = heights[Math.min(n - 1, r + 1) * n + k] ?? 0
      const dzdx = (e - w) / (2 * c)
      const dzdy = (north - south) / (2 * c)
      const len = Math.hypot(dzdx, dzdy, 1)
      out[r * n + k] = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / len)
    }
  }
  return out
}

/** Slope in degrees per cell, from the same central differences. */
export function slopes({ meta, heights }: Terrain): Float32Array {
  const n = meta.n
  const c = meta.cell_m
  const out = new Float32Array(n * n)
  for (let r = 0; r < n; r++)
    for (let k = 0; k < n; k++) {
      const dzdx = ((heights[r * n + Math.min(n - 1, k + 1)] ?? 0) - (heights[r * n + Math.max(0, k - 1)] ?? 0)) / (2 * c)
      const dzdy = ((heights[Math.max(0, r - 1) * n + k] ?? 0) - (heights[Math.min(n - 1, r + 1) * n + k] ?? 0)) / (2 * c)
      out[r * n + k] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
    }
  return out
}

/**
 * Which cells have a clear line toward a direction (1) and which are blocked by higher terrain inside the tile (0).
 * Each cell marches toward the target one cell at a time; the line rises by tan(elevation) per metre travelled.
 */
export function lineOfSight({ meta, heights }: Terrain, azDeg: number, elDeg: number, observerM = 0): Uint8Array {
  const n = meta.n
  const out = new Uint8Array(n * n)
  const [dc, dr] = stepToward(azDeg)
  const rise = Math.tan((elDeg * Math.PI) / 180) * meta.cell_m
  let top = -Infinity
  for (const h of heights) top = Math.max(top, h)
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) {
      let z = (heights[r * n + k] ?? 0) + observerM
      let x = k + 0.5
      let y = r + 0.5
      let clear = 1
      for (;;) {
        x += dc
        y += dr
        z += rise
        if (x < 0 || y < 0 || x >= n || y >= n) break
        if (z > top) break
        if ((heights[Math.floor(y) * n + Math.floor(x)] ?? -Infinity) > z) {
          clear = 0
          break
        }
      }
      out[r * n + k] = clear
    }
  }
  return out
}

export type Spot = { row: number; col: number; height: number }

/** The highest and lowest ground within `share` of the tile's half-width of the site, for the Ground pins. */
export function extremes({ meta, heights }: Terrain, share = 0.6): { high: Spot; low: Spot; site: Spot } {
  const n = meta.n
  const mid = (n - 1) / 2
  const reach = mid * share
  let high: Spot = { row: mid, col: mid, height: -Infinity }
  let low: Spot = { row: mid, col: mid, height: Infinity }
  for (let r = 0; r < n; r++)
    for (let k = 0; k < n; k++) {
      if (Math.hypot(r - mid, k - mid) > reach) continue
      const h = heights[r * n + k] ?? 0
      if (h > high.height) high = { row: r, col: k, height: h }
      if (h < low.height) low = { row: r, col: k, height: h }
    }
  return { high, low, site: { row: mid, col: mid, height: heights[mid * n + mid] ?? 0 } }
}

/** The cell nearest the site whose mask value is `want`, to pin "lit" or "in shadow" where it is true. */
export function nearest(mask: Uint8Array, n: number, want: 0 | 1, minDist = 0): Spot | null {
  const mid = (n - 1) / 2
  let best: Spot | null = null
  let bestD = Infinity
  for (let r = 0; r < n; r += 2)
    for (let k = 0; k < n; k += 2) {
      if (mask[r * n + k] !== want) continue
      const d = Math.hypot(r - mid, k - mid)
      if (d >= minDist && d < bestD) {
        bestD = d
        best = { row: r, col: k, height: 0 }
      }
    }
  return best
}

/** Every `k`-th cell, for the line-of-sight traces, which cost one march per cell. */
export function downsample(t: Terrain, k: number): Terrain {
  const n = Math.floor((t.meta.n - 1) / k) + 1
  const heights = new Int16Array(n * n)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = t.heights[r * k * t.meta.n + c * k] ?? 0
  return { meta: { ...t.meta, n, cell_m: t.meta.cell_m * k }, heights }
}

/** Share of the tile with a clear line, 0 to 1. */
export const clearShare = (mask: Uint8Array) => mask.reduce((a, v) => a + v, 0) / mask.length
