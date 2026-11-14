import * as THREE from 'three'
import { expect, test } from 'vitest'
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
