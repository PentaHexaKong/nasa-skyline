import { z } from 'zod'

/** Moon-centred Sun and Earth positions and body orientations from `pipeline.space` (SPICE, ECLIPJ2000, scene axes). */
export const SpaceSchema = z.object({
  start: z.string(),
  step_h: z.number().positive(),
  n: z.number().int().min(2),
  frame: z.string(),
  units: z.literal('km'),
  earth_km: z.array(z.number()),
  sun_km: z.array(z.number()),
  moon_q: z.array(z.number()),
  earth_q: z.array(z.number()),
  provenance: z.looseObject({}),
})
export type Space = z.infer<typeof SpaceSchema>

const file = import.meta.glob<string>('../data/generated/moon/space.json', { query: '?url', import: 'default' })

export async function loadSpace() {
  const url = file['../data/generated/moon/space.json']
  if (!url) throw new Error('space.json missing: run `uv run python -m pipeline.space ephemeris` and `pnpm sync-data`')
  return SpaceSchema.parse(await (await fetch(await url())).json())
}

export const R_MOON_KM = 1737.4
export const R_EARTH_KM = 6371.0
export const R_SUN_KM = 696_000

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

/** Hours since `start` covered by the file. */
export const spanHours = (s: Space) => (s.n - 1) * s.step_h

const lerp3 = (a: number[], i: number, f: number): Vec3 => [
  (a[3 * i] ?? 0) + ((a[3 * i + 3] ?? 0) - (a[3 * i] ?? 0)) * f,
  (a[3 * i + 1] ?? 0) + ((a[3 * i + 4] ?? 0) - (a[3 * i + 1] ?? 0)) * f,
  (a[3 * i + 2] ?? 0) + ((a[3 * i + 5] ?? 0) - (a[3 * i + 2] ?? 0)) * f,
]

/** Spherical interpolation between consecutive unit quaternions (x, y, z, w). */
function slerp(a: number[], i: number, f: number): Quat {
  const p = [a[4 * i] ?? 0, a[4 * i + 1] ?? 0, a[4 * i + 2] ?? 0, a[4 * i + 3] ?? 1]
  let q = [a[4 * i + 4] ?? 0, a[4 * i + 5] ?? 0, a[4 * i + 6] ?? 0, a[4 * i + 7] ?? 1]
  let d = p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]! + p[3]! * q[3]!
  if (d < 0) {
    q = q.map((v) => -v)
    d = -d
  }
  if (d > 0.9995) {
    const r = p.map((v, k) => v + (q[k]! - v) * f)
    const len = Math.hypot(...r)
    return r.map((v) => v / len) as Quat
  }
  const th = Math.acos(d)
  const s0 = Math.sin((1 - f) * th) / Math.sin(th)
  const s1 = Math.sin(f * th) / Math.sin(th)
  return p.map((v, k) => v * s0 + q[k]! * s1) as Quat
}

export type SpaceState = { earth: Vec3; sun: Vec3; moonQ: Quat; earthQ: Quat }

/** Interpolated state `hours` after `start` (clamped to the file): positions linearly, rotations by slerp. */
export function sampleSpace(s: Space, hours: number): SpaceState {
  const x = Math.min(s.n - 1, Math.max(0, hours / s.step_h))
  const i = Math.min(s.n - 2, Math.floor(x))
  const f = x - i
  return { earth: lerp3(s.earth_km, i, f), sun: lerp3(s.sun_km, i, f), moonQ: slerp(s.moon_q, i, f), earthQ: slerp(s.earth_q, i, f) }
}

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Distances, apparent sizes from the Moon, and lit fractions (Earth seen from the Moon, Moon seen from Earth). */
export function spaceReadouts({ earth, sun }: SpaceState) {
  const dE = len(earth)
  const dS = len(sun)
  // Phase angle at Earth: between the directions Earth->Sun and Earth->Moon.
  const eSun: Vec3 = [sun[0] - earth[0], sun[1] - earth[1], sun[2] - earth[2]]
  const cosE = dot(eSun, [-earth[0], -earth[1], -earth[2]]) / (len(eSun) * dE)
  // Phase angle at the Moon: between Moon->Sun and Moon->Earth.
  const cosM = dot(sun, earth) / (dS * dE)
  return {
    earthKm: dE,
    sunKm: dS,
    earthDeg: (2 * Math.asin(R_EARTH_KM / dE) * 180) / Math.PI,
    sunDeg: (2 * Math.asin(R_SUN_KM / dS) * 180) / Math.PI,
    /** Share of Earth's disc that is sunlit, seen from the Moon. */
    earthLit: (1 + cosE) / 2,
    /** Share of the Moon's disc that is sunlit, seen from Earth. */
    moonLit: (1 + cosM) / 2,
  }
}
