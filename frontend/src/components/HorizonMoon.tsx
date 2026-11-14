import { type RefObject, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { halo, moonMaterial, toVec } from '~/components/moonGlobe'
import type { MoonEphemeris } from '~/lib/data'
import { SYNODIC_HOURS, subPoints } from '~/lib/moonLight'

/**
 * The front door's Moon: the same globe as Explore (NASA colour and relief, true-scale LOLA relief south of 75°S), rising
 * from the bottom edge of the screen. The Sun starts where the pipeline's SPICE ephemeris puts it at a first-quarter
 * moment, so the terminator crosses the visible face, and the Moon turns on its own axis under it: a lunar day, sped up.
 * Reduced motion holds it still; it stops drawing off screen and in a hidden tab.
 */

const FOV = 30
/** The near side, slightly from the north, so the face is the familiar one. */
const VIEW = { lat: 12, lon: 0 }
/**
 * Where the Sun should stand east of the view, in degrees: just past first quarter, so the terminator runs across the
 * face and the craters near it throw long shadows.
 */
export const SUN_EAST = 95
/** How fast the Moon turns, in degrees a second: slow, but visibly moving. Eastward, as the real Moon turns. */
const SPIN_DEG_S = 2

/** The first moment in the data when the Sun stands closest to `SUN_EAST` of the near side, in hours from its start. */
export function quarterHour(eph: MoonEphemeris) {
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
  let best = 0
  let miss = Number.POSITIVE_INFINITY
  for (let h = 0; h <= SYNODIC_HOURS; h += eph.step_h) {
    const m = Math.abs(wrap(subPoints(eph, h).sun.lon - (VIEW.lon + SUN_EAST)))
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

/** `clearOf`: the content the disc must stay below. Its bottom edge sets how far the disc rises. */
export default function HorizonMoon({ eph, clearOf }: { eph: MoonEphemeris; clearOf: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shown, setShown] = useState(false)
  const [failed, setFailed] = useState(false)
  const hours = quarterHour(eph)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.setClearColor(0x000000, 0)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let disposed = false
    let onScreen = true
    let last = 0
    const spinning = () => !reduced.matches && onScreen && !document.hidden
    const draw = (t: number) => {
      frame = 0
      if (disposed) return
      if (spinning()) {
        // At most a tenth of a second per frame, so a stalled tab does not jump.
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 0
        last = t
        moon.rotation.y += (SPIN_DEG_S * Math.PI * dt) / 180
        moon.updateMatrixWorld()
        capRot.value.setFromMatrix4(moon.matrixWorld)
      } else last = 0
      renderer.render(scene, camera)
      if (spinning()) request()
    }
    const request = () => {
      if (!disposed && !frame && onScreen && !document.hidden) frame = requestAnimationFrame(draw)
    }

    const loader = new THREE.TextureLoader()
    const tex = (url: string, srgb = true, done?: () => void, onFail?: () => void) => {
      const t = loader.load(
        url,
        () => {
          request()
          done?.()
        },
        undefined,
        () => onFail?.(),
      )
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return t
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)
    const sun = subPoints(eph, hours).sun
    const sunDir = { value: toVec(sun.lat, sun.lon).normalize() }
    const { material, capRot } = moonMaterial(tex, () => setShown(true), true)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), material)
    moon.add(halo(1, 0.06, [1.0, 0.93, 0.84], 0.35, 4.5, sunDir))
    moon.updateMatrixWorld()
    capRot.value.setFromMatrix4(moon.matrixWorld)
    const light = new THREE.DirectionalLight(0xffffff, 3.6)
    light.position.copy(sunDir.value).multiplyScalar(10)
    // The barest fill, so the night side is near black but the limb still closes the shape, as earthshine does.
    scene.add(moon, light, new THREE.AmbientLight(0xffffff, 0.012))

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      const content = clearOf.current?.getBoundingClientRect()
      // Measured on the parent: the canvas itself slides in with a transform, which its own box would include.
      const bottom = (canvas.parentElement ?? canvas).getBoundingClientRect().bottom
      const free = content ? bottom - content.bottom : h * 0.34
      const { radius, rise } = horizonFrame(w, free)
      // The distance at which the disc's radius spans `radius` px on a canvas `h` px tall.
      const tanHalf = Math.tan((FOV * Math.PI) / 360)
      const alpha = Math.atan((radius / (h / 2)) * tanHalf)
      const dist = 1 / Math.sin(alpha)
      camera.position.copy(toVec(VIEW.lat, VIEW.lon, dist))
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      camera.aspect = w / h
      // Move the frame up so the disc's centre sits `radius - rise` below the bottom edge.
      const centreY = h + radius - rise
      camera.setViewOffset(w, h, 0, h / 2 - centreY, w, h)
      camera.updateProjectionMatrix()
      request()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    if (clearOf.current) ro.observe(clearOf.current)
    resize()

    const onVisible = () => request()
    document.addEventListener('visibilitychange', onVisible)
    reduced.addEventListener('change', onVisible)
    const io = new IntersectionObserver(([e]) => {
      onScreen = e?.isIntersecting ?? true
      request()
    })
    io.observe(canvas)
    const onLost = (e: Event) => {
      e.preventDefault()
      setFailed(true)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
      reduced.removeEventListener('change', onVisible)
      canvas.removeEventListener('webglcontextlost', onLost)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
          mat.dispose()
        }
      })
      renderer.dispose()
    }
  }, [eph, hours, clearOf])

  if (failed) return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 size-full transition-[opacity,translate] duration-1000 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    />
  )
}
