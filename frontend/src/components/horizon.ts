import type { MoonEphemeris } from '~/lib/data'
import { SYNODIC_HOURS, subPoints } from '~/lib/moonLight'

/**
 * The front door's Moon: the same globe as Explore, rising from the bottom edge of the screen. The Sun starts where the
 * pipeline's SPICE ephemeris puts it at a first-quarter moment, so the terminator crosses the visible face, and the
 * Moon turns on its own axis under it: a lunar day, sped up. ParallaxMoon draws it in its horizon mode.
 */

export const HORIZON_FOV = 30
/** The near side, slightly from the north, so the face is the familiar one. */
export const HORIZON_VIEW = { lat: 12, lon: 0 }
/**
 * Where the Sun should stand east of the view, in degrees: just past first quarter, so the terminator runs across the
 * face and the craters near it throw long shadows.
 */
export const SUN_EAST = 95
/** How fast the Moon turns, in degrees a second: slow, but visibly moving. Eastward, as the real Moon turns. */
export const SPIN_DEG_S = 2

/** The first moment in the data when the Sun stands closest to `SUN_EAST` of the near side, in hours from its start. */
export function quarterHour(eph: MoonEphemeris) {
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
  let best = 0
  let miss = Number.POSITIVE_INFINITY
  for (let h = 0; h <= SYNODIC_HOURS; h += eph.step_h) {
    const m = Math.abs(wrap(subPoints(eph, h).sun.lon - (HORIZON_VIEW.lon + SUN_EAST)))
    if (m < miss) {
      miss = m
      best = h
    }
  }
  return best
}

/** How far the disc may rise into the page, in CSS px: at least this much, so it is always there, and at most this. */
export const RISE = { min: 140, max: 360 }
/** The gap kept between the content above and the top of the disc, in CSS px. */
const GAP = 20

/**
 * The largest radius, in CSS px. The colour map is 4096 px around the equator, so near the disc's centre this keeps it
 * at about one texel per CSS pixel; any larger and its softness shows.
 */
export const MAX_RADIUS = 560

/**
 * How big the disc is and how far it rises, in CSS px, for a canvas `w` px wide with `free` px clear below the content.
 * The disc rises into the clear space without ever reaching the text, within `RISE`, and never shows more than three
 * quarters of its height.
 */
export function horizonFrame(w: number, free: number) {
  const radius = Math.min(MAX_RADIUS, Math.max(w * 0.38, 280))
  const rise = Math.max(RISE.min, Math.min(RISE.max, radius * 1.5, free - GAP))
  return { radius, rise }
}
