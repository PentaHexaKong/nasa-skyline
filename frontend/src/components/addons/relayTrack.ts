import { DAY_MS, HOUR_MS, type MissionWindow, type Span } from '~/lib/mission'
import { contactSpans, type RelayLadder, type RelayTrack } from '~/lib/relayLive'

export const COUNT = ['No relays', 'One relay', 'Two relays', 'Three relays', 'Four relays']
export const pct = (x: number) => `${(x * 100).toFixed(1)} %`
/** A stretch of time as hours, or days once it passes two of them. */
export const duration = (s: number) => (s === 0 ? 'None' : s < 48 * 3600 ? `${Math.round(s / 3600)} h` : `${(s / 86400).toFixed(1)} days`)
export const hoursOf = ([a, b]: Span) => (b - a) / HOUR_MS

/** The comparison's window: one cadence step per sample, from the first sample. */
export const windowOf = (track: RelayTrack): MissionWindow => ({
  start: track.startMs,
  end: track.startMs + track.direct.length * track.cadenceS * 1000,
})

/** The parts of the window not covered by `spans`. */
export function gapsOf(spans: Span[], w: MissionWindow): Span[] {
  const out: Span[] = []
  let t = w.start
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (a > t) out.push([t, Math.min(a, w.end)])
    t = Math.max(t, b)
  }
  if (t < w.end) out.push([t, w.end])
  return out
}

/** The parts of `a` that `b` does not cover. */
export const minus = (a: Span[], b: Span[]) => a.flatMap((s) => gapsOf(b, { start: s[0], end: s[1] })).filter(([p, q]) => q > p)

export type Rung = { relays: number; label: string; share: number; spans: Span[]; gaps: Span[]; longest?: Span }

/** One rung per relay count, 0 to all: its contact spans, the gaps it leaves, and the longest of them. */
export function rungsOf(ladder: RelayLadder): Rung[] {
  const w = windowOf(ladder.track)
  return ladder.steps.map((step) => {
    const spans = contactSpans(ladder.track, step.relays)
    const gaps = gapsOf(spans, w)
    const longest = [...gaps].sort((a, b) => hoursOf(b) - hoursOf(a))[0]
    return { relays: step.relays, label: COUNT[step.relays] ?? `${step.relays} relays`, share: step.share, spans, gaps, longest }
  })
}

export const inContact = (r: Rung, t: number) => r.spans.some(([a, b]) => t >= a && t < b)

const STEPS_MS = [6 * HOUR_MS, 12 * HOUR_MS, DAY_MS, 2 * DAY_MS, 5 * DAY_MS, 7 * DAY_MS]

/** Evenly spaced moments across the window, at most `most` of them, on a round step of hours or days. */
export function ticksOf(w: MissionWindow, most = 7) {
  const span = w.end - w.start
  const step = STEPS_MS.find((s) => span / s <= most) ?? (STEPS_MS.at(-1) as number)
  return Array.from({ length: Math.ceil(span / step) }, (_, i) => ({
    t: w.start + i * step,
    label: i === 0 ? null : step >= DAY_MS ? `+${(i * step) / DAY_MS} d` : `+${(i * step) / HOUR_MS} h`,
  }))
}

/** Index of the sample in force at `ms` after the first one, clamped to the track. */
export const sampleAt = (track: RelayTrack, ms: number) =>
  Math.min(track.direct.length - 1, Math.max(0, Math.floor(ms / (track.cadenceS * 1000))))

/** A position `ms` after the first sample, straight-line between the two samples either side; clamped to the ends. */
export function lerpSamples(samples: number[][], cadenceS: number, ms: number): [number, number, number] {
  const last = samples.length - 1
  const x = Math.min(last, Math.max(0, ms / (cadenceS * 1000)))
  const i = Math.min(Math.max(0, last - 1), Math.floor(x))
  const f = x - i
  const a = samples[i] ?? [0, 0, 0]
  const b = samples[i + 1] ?? a
  return [0, 1, 2].map((k) => (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * f) as [number, number, number]
}

export type Vec3 = [number, number, number]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** The mean orbit normal of a run of positions: the sum of each step's r × r', so a near-circular or eccentric orbit both work. */
export function orbitNormal(points: Vec3[]): Vec3 {
  const n: Vec3 = [0, 0, 0]
  for (let j = 1; j < points.length; j++) {
    const c = cross(points[j - 1] as Vec3, points[j] as Vec3)
    n[0] += c[0]
    n[1] += c[1]
    n[2] += c[2]
  }
  return unit(n)
}

/**
 * A camera that looks back along `dir` and fits every point inside a perspective view of vertical `fovDeg` and `aspect`,
 * with `margin` to spare: the target is the middle of the points as seen from that side, the distance the nearest that
 * keeps them all in frame both ways. Axes follow three.js lookAt with y up.
 */
export function fitView(points: Vec3[], dir: Vec3, fovDeg: number, aspect: number, margin = 1.1) {
  const z = unit(dir)
  const up: Vec3 = Math.abs(z[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]
  const x = unit(cross(up, z))
  const y = cross(z, x)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  const local = points.map((p) => [dot(p, x), dot(p, y), dot(p, z)] as Vec3)
  for (const p of local)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] as number, p[k] as number)
      hi[k] = Math.max(hi[k] as number, p[k] as number)
    }
  const mid = [0, 1, 2].map((k) => ((lo[k] as number) + (hi[k] as number)) / 2) as Vec3
  const tanV = Math.tan((fovDeg * Math.PI) / 360) / margin
  const tanH = tanV * aspect
  let d = 0
  for (const p of local) {
    const dz = p[2] - mid[2]
    d = Math.max(d, dz + Math.abs(p[0] - mid[0]) / tanH, dz + Math.abs(p[1] - mid[1]) / tanV)
  }
  const target = [0, 1, 2].map((k) => mid[0] * x[k as 0] + mid[1] * y[k as 0] + mid[2] * z[k as 0]) as Vec3
  const eye = [0, 1, 2].map((k) => (target[k] as number) + z[k as 0] * d) as Vec3
  return { eye, target }
}
