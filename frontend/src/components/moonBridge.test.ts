import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { reaim } from './moonBridge'

/** Pixel of a world point through a camera's matrices and a projection, for a canvas of the given size. */
function pixel(cam: THREE.PerspectiveCamera, projection: THREE.Matrix4, p: THREE.Vector3, w: number, h: number) {
  const v = p.clone().applyMatrix4(cam.matrixWorldInverse).applyMatrix4(projection)
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z }
}

test('re-aimed projection: a point lands on the same screen pixel through the scene box and the page canvas', () => {
  // The scene: 1200×700 px, its frame slid right as on wide screens, camera 3.9 Moon radii out.
  const scene = new THREE.PerspectiveCamera(40, 1200 / 700, 1e-4, 1e7)
  scene.setViewOffset(1200, 700, -1200 * 0.14, 0, 1200, 700)
  scene.updateProjectionMatrix()
  scene.position.set(1.2, -2.8, 2.4)
  scene.lookAt(0, 0, 0)
  scene.updateMatrixWorld()
  // The page canvas is 1440×844; the scene's box sits 120 px in and 60 px up from its top (scrolled part way).
  const box = { x: 120, y: -60, w: 1200, h: 700 }
  const out = reaim(scene.projectionMatrix, box, { w: 1440, h: 844 }, 0.01, 100, new THREE.Matrix4())
  for (const p of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, -0.9, 0.2), new THREE.Vector3(-0.7, 0.1, 0.6)]) {
    const inScene = pixel(scene, scene.projectionMatrix, p, 1200, 700)
    const onPage = pixel(scene, out, p, 1440, 844)
    expect(onPage.x).toBeCloseTo(inScene.x + box.x, 6)
    expect(onPage.y).toBeCloseTo(inScene.y + box.y, 6)
    // In front of the camera, inside the page camera's own depth range.
    expect(Math.abs(onPage.z)).toBeLessThan(1)
  }
})

test('the glide gate: work waits while the Moon glides, then runs; with no glide it runs on the next frame', async () => {
  const { afterGlide, beginGlide, endGlide } = await import('./moonBridge')
  const frames: (() => void)[] = []
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const ran: string[] = []
  const flush = () => {
    for (const f of frames.splice(0)) f()
  }

  afterGlide(() => ran.push('idle'))
  flush()
  expect(ran).toEqual(['idle'])

  beginGlide()
  afterGlide(() => ran.push('trace'))
  const cancel = afterGlide(() => ran.push('cancelled'))
  cancel()
  flush()
  expect(ran).toEqual(['idle'])
  endGlide()
  flush()
  expect(ran).toEqual(['idle', 'trace'])
  vi.unstubAllGlobals()
})

test('the glide eases out of the old place and into the new, and ends exactly there', async () => {
  const { glideEase: entryEase } = await import('./ParallaxMoon')
  expect(entryEase(0)).toBe(0)
  expect(entryEase(1)).toBe(1)
  expect(entryEase(0.5)).toBeCloseTo(0.5, 6)
  expect(entryEase(2)).toBe(1)
  let prev = -1
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const e = entryEase(u)
    expect(e).toBeGreaterThanOrEqual(prev)
    prev = e
  }
  // Slow at both ends: the first and last tenth move far less than a tenth of the way.
  expect(entryEase(0.1)).toBeLessThan(0.02)
  expect(1 - entryEase(0.9)).toBeLessThan(0.02)
})

test('the light between two pages: exact at both ends, and the phase the camera sees moves one way only', async () => {
  const { phaseBlend } = await import('./ParallaxMoon')
  // The front door's quarter light (from the side, a little behind) and a tour's crescent (from behind and below).
  const a = new THREE.Vector3(1, 0, -0.1).normalize()
  const b = new THREE.Vector3(-0.3, -0.5, -0.8).normalize()
  expect(phaseBlend(a, b, 0).distanceTo(a)).toBeLessThan(1e-9)
  expect(phaseBlend(a, b, 1).distanceTo(b)).toBeLessThan(1e-9)
  // The lit share of the face follows the Sun's angle from the line of sight (z): it must shrink steadily here, never
  // dipping below where it ends (the dark flash a blend on the Moon itself gave).
  let prev = Number.POSITIVE_INFINITY
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const z = phaseBlend(a, b, k).z
    expect(z).toBeLessThanOrEqual(prev + 1e-12)
    expect(z).toBeGreaterThanOrEqual(b.z - 1e-12)
    prev = z
    expect(phaseBlend(a, b, k).length()).toBeCloseTo(1, 9)
  }
})
