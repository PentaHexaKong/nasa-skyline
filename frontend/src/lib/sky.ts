import type { Terrain } from './data'

/** Scene frame: x east, y up, z south, in km, origin at the site's ground. Azimuth is clockwise from north. */
export function direction(azDeg: number, elDeg: number): [number, number, number] {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
}

/** Terrain height (km, relative to the site's ground) at scene x/z, bilinear; NaN outside the grid. */
export function heightAt({ meta, heights }: Terrain, x: number, z: number) {
  const { n, radius_km: r, ground_height_m: g } = meta
  const c = ((x + r) / (2 * r)) * (n - 1)
  const row = ((z + r) / (2 * r)) * (n - 1)
  if (c < 0 || row < 0 || c > n - 1 || row > n - 1) return Number.NaN
  const c0 = Math.min(Math.floor(c), n - 2)
  const r0 = Math.min(Math.floor(row), n - 2)
  const fc = c - c0
  const fr = row - r0
  const h = (i: number, j: number) => heights[i * n + j] ?? 0
  const top = h(r0, c0) * (1 - fc) + h(r0, c0 + 1) * fc
  const bot = h(r0 + 1, c0) * (1 - fc) + h(r0 + 1, c0 + 1) * fc
  return (top * (1 - fr) + bot * fr - g) / 1000
}

/** Horizontal distance (km) at which a sight line from the observer's eye meets the terrain, or undefined if it leaves the model clear. */
export function blockedAt(terrain: Terrain, azDeg: number, elDeg: number, stepKm = 0.03) {
  const eye = terrain.meta.observer_height_m / 1000
  const az = (azDeg * Math.PI) / 180
  const rise = Math.tan((elDeg * Math.PI) / 180)
  for (let d = stepKm; d < terrain.meta.radius_km; d += stepKm) {
    if (heightAt(terrain, Math.sin(az) * d, -Math.cos(az) * d) > eye + d * rise) return d
  }
  return undefined
}

/** Splits a path into runs where `on(i)` holds or not; each run shares its edge point with the next so lines stay continuous. */
export function runs(count: number, on: (i: number) => boolean) {
  const out: { on: boolean; from: number; to: number }[] = []
  for (let i = 0; i < count; i++) {
    const v = on(i)
    const last = out.at(-1)
    if (last && last.on === v) last.to = i
    else out.push({ on: v, from: last ? last.to : i, to: i })
  }
  return out
}
