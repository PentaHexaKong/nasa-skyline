import type { Terrain } from './data'
import { stepToward } from './landscape'

const MOON_RADIUS_M = 1_737_400

/**
 * Where a point sits on the site's terrain tile, in metres east and north of the site. Moon tiles are laid out by
 * great-circle distance and bearing from the site (ds/pipeline/terrain.py, `curvature=True`), so this inverts that.
 */
export function offsetFromSite(lat0: number, lon0: number, lat: number, lon: number): { east: number; north: number } {
  const r = Math.PI / 180
  const p1 = lat0 * r
  const p2 = lat * r
  const dl = (lon - lon0) * r
  const angle = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2))
  const bearing = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))
  const d = angle * MOON_RADIUS_M
  return { east: d * Math.sin(bearing), north: d * Math.cos(bearing) }
}

/** Bilinear height at fractional tile coordinates (columns east, rows south), clamped to the tile. */
function heightAt({ meta, heights }: Terrain, col: number, row: number) {
  const n = meta.n
  const c = Math.max(0, Math.min(n - 1.001, col))
  const rr = Math.max(0, Math.min(n - 1.001, row))
  const c0 = Math.floor(c)
  const r0 = Math.floor(rr)
  const fc = c - c0
  const fr = rr - r0
  const h = (i: number, j: number) => heights[(r0 + j) * n + c0 + i] ?? 0
  return (h(0, 0) * (1 - fc) + h(1, 0) * fc) * (1 - fr) + (h(0, 1) * (1 - fc) + h(1, 1) * fc) * fr
}

/**
 * A square of terrain `halfM` metres either side of the site, `px` samples across, lit by the Sun at `azDeg`, `elDeg`:
 * Lambert relief, and cast shadow where higher terrain inside the tile stands between the ground and the Sun. Values
 * 0 to 1, rows north to south. Terrain beyond the tile's edge casts no shadow here.
 */
export function shadedWindow(terrain: Terrain, halfM: number, px: number, azDeg: number, elDeg: number): Float32Array {
  const { meta } = terrain
  const half = ((meta.n - 1) * meta.cell_m) / 2
  const toCol = (east: number) => (east + half) / meta.cell_m
  const toRow = (north: number) => (half - north) / meta.cell_m
  const [dc, dr] = stepToward(azDeg)
  const el = (elDeg * Math.PI) / 180
  const lx = dc * Math.cos(el)
  const ly = -dr * Math.cos(el)
  const lz = Math.sin(el)
  const rise = Math.tan(el) * meta.cell_m
  const out = new Float32Array(px * px)
  if (elDeg <= 0) return out
  for (let y = 0; y < px; y++) {
    const row = toRow(halfM - ((y + 0.5) / px) * 2 * halfM)
    for (let x = 0; x < px; x++) {
      const col = toCol(-halfM + ((x + 0.5) / px) * 2 * halfM)
      const dzdx = (heightAt(terrain, col + 1, row) - heightAt(terrain, col - 1, row)) / (2 * meta.cell_m)
      const dzdy = (heightAt(terrain, col, row - 1) - heightAt(terrain, col, row + 1)) / (2 * meta.cell_m)
      const lambert = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / Math.hypot(dzdx, dzdy, 1))
      let z = heightAt(terrain, col, row) + 0.5
      let c = col
      let r = row
      let lit = true
      while (lit) {
        c += dc
        r += dr
        z += rise
        if (c < 0 || r < 0 || c > meta.n - 1 || r > meta.n - 1 || z > meta.max_m) break
        if (heightAt(terrain, c, r) > z) lit = false
      }
      out[y * px + x] = lit ? lambert : 0
    }
  }
  return out
}
