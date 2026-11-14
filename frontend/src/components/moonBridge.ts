import * as THREE from 'three'

/**
 * The hand-off between the landing page's fixed Moon (ParallaxMoon) and the true-scale scene (SpaceScene).
 *
 * In the scene's Moon view, embedded in the page, the page Moon draws the Moon from the scene's camera: the Moon is
 * rendered once, never clipped by the scene's box, and the reader sees the same Moon carry on from the chapters above.
 * The scene keeps the camera controls, the site buttons and the fly-in, and draws its own frame (space, stars, Earth,
 * the Sun) only in the other views and in full screen. In the Moon view the page draws the scene's starry sky too,
 * behind its Moon and only inside the scene's box, so the box keeps its sky while the Moon is still drawn once.
 *
 * A plain object read and written every frame by both render loops, not React state.
 */
export type SharedView = {
  /** The scene's canvas: the page Moon maps the scene's frame onto its own through this box. */
  canvas: HTMLCanvasElement
  /** Camera position and orientation in the Moon's body frame (moonGlobe's `toVec` frame, the page Moon's world). */
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  /** The scene camera's projection, for the scene's canvas. */
  projection: THREE.Matrix4
  /** Unit vector toward the Sun, same frame. */
  sun: THREE.Vector3
  /** The star sphere's orientation in the same frame, so the page draws the scene's sky behind its Moon. */
  stars: THREE.Quaternion
}

export const moonBridge = {
  /** The page Moon can draw: WebGL works and its colour map has arrived. Set by ParallaxMoon. */
  ready: false,
  /** How much of the page Moon's frame follows the scene, 0 to 1, from the scroll position. Set by ParallaxMoon. */
  weight: 0,
  /** The scene's camera while the scene hands its Moon view over; null otherwise. Set by SpaceScene. */
  view: null as SharedView | null,
  /** Counts changes to `view`, so the page Moon redraws only when something moved. */
  version: 0,
  /**
   * Draws one frame of the page Moon. While the scene hands over, the scene calls it right after moving its camera,
   * so the Moon and the scene's site buttons always move in the same frame. Set by ParallaxMoon.
   */
  draw: null as (() => void) | null,
}

const toBox = new THREE.Matrix4()

/**
 * A projection for one canvas, re-aimed at another that contains it: `box` is the first canvas's place inside the
 * second (`canvas`), in CSS px from its top left. Clip space is scaled and shifted to the box (x' = a·x + b·w), so a point
 * lands on the same screen pixel through either; depth is rebuilt for `near` and `far`. Writes into `out`.
 */
export function reaim(
  projection: THREE.Matrix4,
  box: { x: number; y: number; w: number; h: number },
  canvas: { w: number; h: number },
  near: number,
  far: number,
  out: THREE.Matrix4,
) {
  toBox
    .makeScale(box.w / canvas.w, box.h / canvas.h, 1)
    .setPosition((2 * box.x + box.w) / canvas.w - 1, 1 - (2 * box.y + box.h) / canvas.h, 0)
  out.copy(projection)
  const e = out.elements
  e[10] = -(far + near) / (far - near)
  e[14] = (-2 * far * near) / (far - near)
  return out.premultiply(toBox)
}

/**
 * The Moon glides from one page's place to the next (ParallaxMoon, kept by MoonStage across the pages that show it).
 * Heavy work on the arriving page (a terrain trace) waits for the glide, so it never stalls the Moon mid-move.
 */
const glide = { on: false, waiting: [] as (() => void)[] }

/** Runs `fn` on the next frame, or once the Moon has settled if it is gliding. Returns a cancel. */
export function afterGlide(fn: () => void) {
  let raf = 0
  const run = () => {
    raf = requestAnimationFrame(fn)
  }
  if (glide.on) glide.waiting.push(run)
  else run()
  return () => {
    glide.waiting = glide.waiting.filter((f) => f !== run)
    cancelAnimationFrame(raf)
  }
}

/** The Moon has started gliding to a new page's place. */
export function beginGlide() {
  glide.on = true
}

/** The Moon has settled (or stopped drawing): run what waited for it. */
export function endGlide() {
  if (!glide.on) return
  glide.on = false
  const waiting = glide.waiting
  glide.waiting = []
  for (const f of waiting) f()
}
