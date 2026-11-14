import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { HORIZON_FOV, HORIZON_VIEW, horizonFrame, quarterHour, SPIN_DEG_S } from '~/components/horizon'
import { beginGlide, endGlide, moonBridge, plannerBridge, reaim, type SharedView } from '~/components/moonBridge'
import { halo, moonMaterial, toVec } from '~/components/moonGlobe'
import type { MoonEphemeris } from '~/lib/data'
import { bestHour, SYNODIC_HOURS, subPoints, whenAt } from '~/lib/moonLight'
import { minuteLabel, shortDate } from '~/lib/time'

/**
 * The one Moon behind the front door, Explore and Understand. MoonStage keeps it mounted across those pages and each
 * page only says where it should be (`MoonScene`), so moving between them is one Moon gliding to its new place, never
 * a second Moon drawn in its stead.
 *
 * - `horizon` (the front door): the disc rises from the bottom edge, past first quarter so the terminator crosses it,
 *   turning slowly on its axis (horizon.ts), and never reaches the text above it. Reduced motion holds it still.
 * - `tour` (Explore, Understand): the Moon stays on screen while the page scrolls and turns to the place each chapter
 *   talks about. Sunlight and the point under Earth come from the pipeline's SPICE ephemeris for a stated moment, so
 *   the lit side is the real one; only the camera moves with the scroll.
 *
 * - `planner` (Analyze): Analyze draws its own Moon, which the reader turns (MissionMoon). This Moon glides into that
 *   Moon's exact view and hands over to it, and on leaving glides on from it (plannerBridge in moonBridge.ts).
 *
 * When the scene changes, the frame on screen is kept and the Moon glides from it into the new scene's frame.
 */

/** Where the camera looks from, per chapter. Latitude and east longitude in degrees on the Moon, distance in Moon radii. */
export type MoonPose = {
  cam: [lat: number, lon: number, dist: number]
  /** The point the camera looks at: a direction on the Moon and a radius (0 = the centre). */
  look?: [lat: number, lon: number, r: number]
  /** Sites named on the globe for this chapter; every other site is a small dot. */
  sites?: string[]
  /** Sunlight sweeps through one lunar month while this chapter scrolls past. */
  sweep?: boolean
  /** Shows the point where Earth stands overhead, and its path over the month. */
  earth?: boolean
  /** How strongly the Moon shows behind this chapter, 0 to 1. */
  opacity?: number
  /**
   * Which side of the screen the Moon sits on (default right). The chapter's text takes the other side on wide screens;
   * on narrow ones the Moon stays above the text and only sways a little toward this side. `center` puts it in the
   * middle with no fade beside it, for an opening screen whose text sits above and below the Moon.
   */
  side?: 'left' | 'right' | 'center'
  /**
   * The true-scale scene's chapter. While the scene hands its Moon view over (moonBridge.ts), this pose is the scene's
   * own camera, so the Moon carries on into the scene instead of a second Moon being drawn there.
   */
  scene?: boolean
}

export type TourSite = { id: string; name: string; lat: number; lon: number }

/** What a page asks of the Moon. Keep the object stable between renders: a new one starts a glide. */
export type MoonScene =
  | {
      kind: 'horizon'
      /** The page box whose bottom edge the disc rises from. */
      frame: RefObject<HTMLElement | null>
      /** The content the disc must stay below. */
      clearOf: RefObject<HTMLElement | null>
    }
  | {
      kind: 'tour'
      poses: MoonPose[]
      sites: TourSite[]
      textPanels?: boolean
      /**
       * The Moon turns slowly on its axis under a still Sun, as on the front door: the view and the light keep the
       * chapter's framing while the ground turns beneath them. Chapters showing the point under Earth hold the near
       * side (see `tourSpin`).
       */
      spin?: boolean
    }
  | { kind: 'planner' }

const FOV = 30
/** The site header's height on the tour pages, in CSS px (h-14): the tour frames the Moon in the screen below it. */
const HEADER = 56
/** How far the Moon's centre sits off the screen's centre, as a share of the width: wide screens, then narrow ones. */
const SHIFT_WIDE = 0.2
const SHIFT_NARROW = 0.08
/** Sunlight and night-side fill: the tour's, and the front door's stronger Sun over a darker night side. */
const LIGHT = { tour: 3.2, horizon: 3.6 }
const AMBIENT = { tour: 0.03, horizon: 0.012 }
/** How long the Moon takes to glide from one page's place to the next, in seconds. */
const GLIDE_S = 1.6

/** A pose's side as a number: +1 right, -1 left, 0 centre, so two poses blend through the middle. */
export const sideOf = (p: MoonPose) => (p.side === 'left' ? -1 : p.side === 'center' ? 0 : 1)
const EARTH_HEX = 0x5cd0ea // --cyan-400, the Earth colour (docs/design.md)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Slow out of the old place, slow into the new: one move of one object. */
export const glideEase = (u: number) => {
  const t = Math.max(0, Math.min(1, u))
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/**
 * Blends two view-space Sun directions `k` of the way from `a` to `b`: the angle from the line of sight (+z, toward the
 * camera) linearly, and the direction around it the short way. The phase the camera sees changes steadily.
 */
export function phaseBlend(a: THREE.Vector3, b: THREE.Vector3, k: number) {
  const polar = (v: THREE.Vector3) => {
    const u = v.clone().normalize()
    return { theta: Math.acos(Math.max(-1, Math.min(1, u.z))), phi: Math.atan2(u.y, u.x) }
  }
  const pa = polar(a)
  const pb = polar(b)
  const theta = THREE.MathUtils.lerp(pa.theta, pb.theta, k)
  let dPhi = pb.phi - pa.phi
  dPhi -= Math.round(dPhi / (2 * Math.PI)) * 2 * Math.PI
  const phi = pa.phi + dPhi * k
  return new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta))
}

/** The chapter under the middle of the screen and how far through it the reader is, from the sections' boxes. */
export function scrollState(boxes: { top: number; height: number }[], mid: number) {
  let index = 0
  let progress = 0
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    if (!b) continue
    if (b.top <= mid) {
      index = i
      progress = Math.max(0, Math.min(1, (mid - b.top) / Math.max(1, b.height)))
    }
  }
  // Poses hold around each chapter's middle and blend across the boundary between two chapters.
  const x = Math.max(0, Math.min(boxes.length - 1, index + progress - 0.5))
  const from = Math.floor(x)
  return { index, progress, from, to: Math.min(boxes.length - 1, from + 1), blend: smooth(0.25, 0.75, x - from) }
}

/** The frame on screen when the scene changes: the glide starts from it. */
type Frame = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  projection: THREE.Matrix4
  sun: THREE.Vector3
  light: number
  ambient: number
  /** How much of the front door's tighter limb glow shows, 0 to 1. */
  thin: number
  opacity: number
}

export default function ParallaxMoon({ scene: moonScene, eph }: { scene: MoonScene; eph: MoonEphemeris }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dots = useRef<Record<string, HTMLDivElement | null>>({})
  const earthTag = useRef<HTMLDivElement>(null)
  const caption = useRef<HTMLParagraphElement>(null)
  const scrimLeft = useRef<HTMLDivElement>(null)
  const scrimRight = useRef<HTMLDivElement>(null)
  const latest = useRef(moonScene)
  latest.current = moonScene
  const [failed, setFailed] = useState(false)
  const sites = moonScene.kind === 'tour' ? moonScene.sites : []
  const stepNow = useRef<(() => void) | null>(null)
  // A new page draws its first frame before the browser paints it: leaving Analyze, its own Moon is gone from this
  // paint, so this one must be on screen in it.
  useLayoutEffect(() => {
    stepNow.current?.()
  }, [moonScene])

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
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)
    let dirty = true
    let ready = false
    const loader = new THREE.TextureLoader()
    const tex = (url: string, srgb = true, done?: () => void, failed?: () => void) => {
      const t = loader.load(
        url,
        () => {
          dirty = true
          done?.()
        },
        undefined,
        () => failed?.(),
      )
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return t
    }

    const sunDir = { value: new THREE.Vector3(1, 0, 0) }
    // Progressive: the first-look maps show the Moon early, and the full ones replace them as they arrive.
    const { material, capRot } = moonMaterial(
      tex,
      () => {
        ready = true
        moonBridge.ready = true
      },
      true,
    )
    // As finely divided as the scene's Moon, since it also draws the scene's fly-in down to 60 km above the ground.
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), material)
    // The limb glow adds light but never coverage, so on a light page it vanishes instead of drawing a grey ring. Two
    // glows, crossfaded by the scene: the tour's wide one and the front door's tight one.
    const glowK = { value: 1 }
    const thinK = { value: 0 }
    const glow = halo(1, 0.14, [1.0, 0.93, 0.84], 0.3, 4.5, sunDir, glowK)
    const thin = halo(1, 0.06, [1.0, 0.93, 0.84], 0.35, 4.5, sunDir, thinK)
    for (const g of [glow, thin]) {
      const m = g.material as THREE.ShaderMaterial
      m.blending = THREE.CustomBlending
      m.blendSrc = THREE.OneFactor
      m.blendDst = THREE.OneFactor
      m.blendSrcAlpha = THREE.ZeroFactor
      m.blendDstAlpha = THREE.OneFactor
      moon.add(g)
    }
    moon.updateMatrixWorld()
    capRot.value.setFromMatrix4(moon.matrixWorld)
    const light = new THREE.DirectionalLight(0xffffff, LIGHT.tour)
    // A faint fill so the night side still reads as a shape, as earthshine does.
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT.tour)
    scene.add(moon, light, ambient)

    // The front door's moment: just past first quarter (horizon.ts).
    const quarter = subPoints(eph, quarterHour(eph)).sun
    const quarterSun = toVec(quarter.lat, quarter.lon).normalize()

    // Where Earth stands overhead over the tour's month: it rocks a few degrees around the near side (libration).
    const trailMat = new THREE.LineBasicMaterial({ color: EARTH_HEX, transparent: true, opacity: 0, depthWrite: false })
    const trail = new THREE.Line(new THREE.BufferGeometry(), trailMat)
    // The point under Earth is a place on the ground, not a body: a thin ring and a pin lying flat on the surface, so
    // they foreshorten with the Moon's curve instead of reading as a small Earth in orbit.
    const markMat = new THREE.MeshBasicMaterial({
      color: EARTH_HEX,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
    const earthMark = new THREE.Group()
    earthMark.add(
      new THREE.Mesh(new THREE.RingGeometry(0.019, 0.025, 64), markMat),
      new THREE.Mesh(new THREE.CircleGeometry(0.0055, 24), markMat),
    )
    earthMark.visible = trail.visible = false
    scene.add(trail, earthMark)

    // The tour's moment: when the Sun stands highest over the page's polar sites in the first month of the data.
    let h0 = 0
    let h0For: TourSite[] | null = null
    const tourMoment = (sites: TourSite[]) => {
      if (sites === h0For) return
      h0For = sites
      h0 = bestHour(eph, sites)
      const pts: THREE.Vector3[] = []
      for (let h = h0; h <= h0 + SYNODIC_HOURS; h += 3) {
        const e = subPoints(eph, h).earth
        pts.push(toVec(e.lat, e.lon, 1.004))
      }
      trail.geometry.setFromPoints(pts)
    }

    // ---- the scene's night sky, drawn behind this Moon while the scene hands its Moon view over (moonBridge.ts)
    // Drawn last but under everything already on the canvas (it only fills what the Moon leaves uncovered), and only
    // inside the scene's box, whose top and bottom edges fade into the page as the scene's own frame does (--sky-fade).
    // The same NASA star map, tint and orientation as the scene's, so a crossfade between the two shows no seam.
    const skyBox = { value: new THREE.Vector4() }
    const skyFade = { value: 48 }
    const skyStars = { value: 0 }
    let starsArrived = false
    let skyFadePx = 48
    const skyMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      color: new THREE.Color(0.45, 0.45, 0.45),
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneMinusDstAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    skyMat.onBeforeCompile = (shader) => {
      shader.uniforms.skyBox = skyBox
      shader.uniforms.skyFade = skyFade
      shader.uniforms.skyStars = skyStars
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 skyBox;\nuniform float skyFade;\nuniform float skyStars;')
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          // skyBox: the scene's box in drawing-buffer pixels, x and y from the bottom left, then width and height.
          float inX = step(skyBox.x, gl_FragCoord.x) * step(gl_FragCoord.x, skyBox.x + skyBox.z);
          float edge = min(gl_FragCoord.y - skyBox.y, skyBox.y + skyBox.w - gl_FragCoord.y);
          float m = inX * smoothstep(0.0, skyFade, edge);
          gl_FragColor = vec4(gl_FragColor.rgb * skyStars * m, m);`,
        )
    }
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), skyMat)
    sky.scale.setScalar(50) // inside the far plane; it rides with the camera, so only its direction matters
    sky.renderOrder = 20
    sky.frustumCulled = false
    sky.visible = false
    const loadStars = () => {
      if (skyMat.map) return
      const t = tex('/space/stars-4k.jpg', true, () => {
        starsArrived = true
      })
      t.wrapS = THREE.RepeatWrapping
      t.repeat.x = -1
      skyMat.map = t
      skyMat.needsUpdate = true
    }
    // While the sky shows, the Moon's fade happens here instead of on the canvas, so the sky itself never dims: this
    // multiplies everything drawn so far by the Moon's opacity, before the sky goes underneath.
    const fadeK = { value: 1 }
    const fadeMat = new THREE.ShaderMaterial({
      uniforms: { k: fadeK },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float k; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, k); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.SrcAlphaFactor,
    })
    const fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat)
    fade.renderOrder = 10
    fade.frustumCulled = false
    fade.visible = false
    scene.add(sky, fade)

    // ---- size and framing. The canvas fills the screen; the tour frames the Moon in the part below the header.
    let w = 0
    let h = 0
    let wide = true
    let tourFov = FOV
    // Where the Moon sits across the screen, from -1 (left) to +1 (right); it eases toward the scrolled chapter's side.
    let side = 1
    // How much of the frame follows the true-scale scene's camera (moonBridge.ts), 0 to 1, from the scroll.
    let shared = 0
    // How much of the frame is still the previous page's, 1 to 0, while the Moon glides to its new place.
    let glideK = 0
    // Whether the page is a tour, so its fades, labels and caption may show (not on the front door).
    let tour = false
    // The scene's box on this canvas while its sky shows here (CSS px from the top left), else null.
    let skyRect: { x: number; y: number; w: number; h: number } | null = null
    const scrims = () => {
      // The fade keeps the text column clear of the Moon: it lies on the side away from the Moon. The scene has no
      // text column beside its Moon, so the fade goes as the scene takes over; it comes in as a glide lands.
      const k = (side + 1) / 2
      // A centred Moon has no text column beside it, so neither fade shows.
      const keep = (tour ? 1 : 0) * (1 - Math.max(shared, glideK)) * Math.min(1, Math.abs(side) * 1.5)
      // The fade is page colour, so it gives way to the sky's box: it thins out across the box's soft edge, as the sky
      // thickens there (above the box while it comes up, below it once it has passed the middle).
      let mask = 'none'
      if (skyRect && skyRect.y < h && skyRect.y + skyRect.h > 0) {
        const top = skyRect.y
        const bottom = skyRect.y + skyRect.h
        mask =
          top + skyRect.h / 2 > h / 2
            ? `linear-gradient(to bottom, #000 ${top.toFixed(1)}px, transparent ${(top + skyFadePx).toFixed(1)}px)`
            : `linear-gradient(to bottom, transparent ${(bottom - skyFadePx).toFixed(1)}px, #000 ${bottom.toFixed(1)}px)`
      }
      for (const [el, o] of [
        [scrimLeft.current, k * keep],
        [scrimRight.current, (1 - k) * keep],
      ] as const) {
        if (!el) continue
        el.style.opacity = o.toFixed(3)
        el.style.maskImage = mask
        el.style.setProperty('-webkit-mask-image', mask)
      }
      if (caption.current) caption.current.dataset.side = side < 0 ? 'left' : 'right'
    }
    /** The tour's lens: beside the text on wide screens (side by pose), above it on narrow ones, below the header. */
    const tourLens = () => {
      const vh = h - HEADER
      const shift = (wide ? SHIFT_WIDE : SHIFT_NARROW) * side
      camera.fov = tourFov
      camera.aspect = w / vh
      camera.setViewOffset(w, vh, -w * shift, (wide ? 0 : vh * 0.2) - HEADER, w, h)
      camera.updateProjectionMatrix()
    }
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      skyFadePx =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sky-fade')) *
          parseFloat(getComputedStyle(document.documentElement).fontSize) || 48
      wide = w >= 1024
      // Narrow screens: widen the lens so the whole disc fits the width.
      const tanHalf = Math.tan((FOV * Math.PI) / 360) * Math.max(1, 0.75 / (w / (h - HEADER)))
      tourFov = (2 * Math.atan(tanHalf) * 180) / Math.PI
      dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ---- the tour's pose from the scroll position
    const camGoal = new THREE.Vector3()
    const lookGoal = new THREE.Vector3()
    const cam = new THREE.Vector3()
    const look = new THREE.Vector3()
    let opacity = 0
    let earthK = 0
    const poseVec = (p: MoonPose) => {
      const [lat, lon, dist] = p.cam
      return toVec(lat, lon, dist)
    }
    const lookVec = (p: MoonPose) => (p.look ? toVec(p.look[0], p.look[1], p.look[2]) : new THREE.Vector3())
    let hours = 0
    let named = new Set<string>()

    const goal = (poses: MoonPose[]) => {
      const sections = [...document.querySelectorAll<HTMLElement>('[data-moon-chapter]')]
      const boxes = sections.map((s) => s.getBoundingClientRect())
      // The middle of the screen below the header. The canvas keeps its size while a phone's address bar slides
      // (window.innerHeight does not).
      const s = scrollState(boxes, canvas.getBoundingClientRect().top + HEADER + (h - HEADER) * 0.5)
      let a = poses[s.from] ?? poses[0]
      let b = poses[s.to] ?? a
      if (!a || !b) return
      // The scene's chapter follows the scene's camera while it hands over: its share of the frame is its share of the
      // blend, and the pose part comes from the chapter beside it.
      let sceneShare = 0
      if (moonBridge.view && (a.scene || b.scene)) {
        sceneShare = a.scene && b.scene ? 1 : a.scene ? 1 - s.blend : s.blend
        if (a.scene && !b.scene) a = b
        else if (b.scene && !a.scene) b = a
      }
      // Direction by slerp and distance by lerp, so the camera swings around the Moon rather than through it.
      const va = poseVec(a)
      const vb = poseVec(b)
      const q = new THREE.Quaternion().setFromUnitVectors(va.clone().normalize(), vb.clone().normalize())
      const dirV = va.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(q, s.blend))
      camGoal.copy(dirV).multiplyScalar(THREE.MathUtils.lerp(a.cam[2], b.cam[2], s.blend))
      // Narrow screens keep the whole disc a little further away.
      if (!wide) camGoal.multiplyScalar(1.08)
      lookGoal.lerpVectors(lookVec(a), lookVec(b), s.blend)
      const opGoal = THREE.MathUtils.lerp(THREE.MathUtils.lerp(a.opacity ?? 1, b.opacity ?? 1, s.blend), 1, sceneShare)
      const earthGoal = THREE.MathUtils.lerp(a.earth ? 1 : 0, b.earth ? 1 : 0, s.blend)
      const sideGoal = THREE.MathUtils.lerp(sideOf(a), sideOf(b), s.blend)
      const here = poses[s.index]
      // A sweep runs one synodic month, so the light ends almost where it began and the next chapter does not jump.
      const nextHours = here?.sweep ? h0 + smooth(0.12, 0.88, s.progress) * SYNODIC_HOURS : h0
      named = new Set((s.blend < 0.5 ? a.sites : b.sites) ?? [])
      return { opGoal, earthGoal, sideGoal, nextHours, sceneShare }
    }

    // ---- the tour's slow turn, in degrees: the camera circles the Moon's axis westward, so the Moon turns eastward
    let tourSpin = 0
    // The turn applied this frame, in radians; the Sun swings with the camera so the light keeps its side of the view.
    let tourTurn = 0
    // ---- the front door's frame: the disc rises from the bottom of `frame`, clear of `clearOf`, turning on its axis
    let spin = 0
    const horizonSun = new THREE.Vector3()
    const yAxis = new THREE.Vector3(0, 1, 0)
    let horizonKey = ''
    const horizonGoal = (sc: Extract<MoonScene, { kind: 'horizon' }>) => {
      const top = canvas.getBoundingClientRect().top
      const bottom = sc.frame.current?.getBoundingClientRect().bottom ?? top + h
      const content = sc.clearOf.current?.getBoundingClientRect()
      const free = content ? bottom - content.bottom : h * 0.34
      const { radius, rise } = horizonFrame(w, free)
      // The distance at which the disc's radius spans `radius` px on a canvas `h` px tall.
      const tanHalf = Math.tan((HORIZON_FOV * Math.PI) / 360)
      const dist = 1 / Math.sin(Math.atan((radius / (h / 2)) * tanHalf))
      // The Moon turns eastward under a still Sun; here the camera and the Sun swing west around a still Moon instead,
      // which looks the same.
      camGoal.copy(toVec(HORIZON_VIEW.lat, HORIZON_VIEW.lon - spin, dist))
      lookGoal.set(0, 0, 0)
      horizonSun.copy(quarterSun).applyAxisAngle(yAxis, (-spin * Math.PI) / 180)
      // The disc's centre sits `radius - rise` below the frame's bottom edge, in canvas px.
      const centreY = bottom - top + radius - rise
      const key = `${spin},${centreY},${radius},${w},${h}`
      if (key !== horizonKey) dirty = true
      horizonKey = key
      return centreY
    }
    const horizonLens = (centreY: number) => {
      camera.fov = HORIZON_FOV
      camera.aspect = w / h
      camera.setViewOffset(w, h, 0, h / 2 - centreY, w, h)
      camera.updateProjectionMatrix()
    }

    // ---- labels placed each frame from projected points
    const v3 = new THREE.Vector3()
    const project = (p: THREE.Vector3) => {
      v3.copy(p).project(camera)
      return { x: ((v3.x + 1) / 2) * w, y: ((1 - v3.y) / 2) * h }
    }
    // Labels and the caption show on a tour once the Moon has landed, and step aside while the scene takes over.
    const labelsOn = () => tour && opacity > 0.4 && shared < 0.1 && glideK < 0.1
    const place = () => {
      const sc = latest.current
      if (sc.kind !== 'tour') return
      // Named labels step down past each other, so the polar sites, a few pixels apart, still read.
      const boxes: [number, number, number, number][] = []
      const at = sc.sites
        .map((site) => {
          const p = toVec(site.lat, site.lon)
          return { site, facing: camera.position.clone().sub(p).dot(p) > 0.02, ...project(p) }
        })
        .sort((m, n) => m.y - n.y)
      for (const { site, facing, x, y } of at) {
        const node = dots.current[site.id]
        if (!node) continue
        const isNamed = named.has(site.id)
        // Labels point away from the text: outward when the Moon sits on a wide screen's left, else to the right; near
        // the screen's edge they turn back so they stay on screen.
        const left = wide && side < 0 ? x > w * 0.28 : x > w * 0.72
        const label = node.lastElementChild as HTMLElement | null
        const bw = label?.offsetWidth ?? 0
        const bh = label?.offsetHeight ?? 0
        let dy = -bh / 2
        if (facing && isNamed) {
          const x0 = left ? x - 10 - bw : x + 10
          for (let k = 0; k < 6 && boxes.some(([a, b, c, d]) => x0 < c && x0 + bw > a && y + dy < d && y + dy + bh > b); k++) dy += bh + 2
          boxes.push([x0, y + dy, x0 + bw, y + dy + bh])
        }
        node.style.transform = `translate(${(x - 4).toFixed(1)}px, ${(y - 4).toFixed(1)}px)`
        node.style.setProperty('--dy', `${dy.toFixed(1)}px`)
        // In the scene the scene's own site buttons take over, so these step aside as soon as the move toward it starts.
        node.style.opacity = facing && labelsOn() ? (isNamed ? '1' : '0.55') : '0'
        node.dataset.named = isNamed ? 'on' : 'off'
        node.dataset.side = left ? 'left' : 'right'
      }
      const tag = earthTag.current
      if (tag) {
        const facing = camera.position.clone().sub(earthMark.position).dot(earthMark.position) > 0.02
        const { x, y } = project(earthMark.position)
        tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        tag.style.opacity = facing && earthK > 0.5 && labelsOn() ? '1' : '0'
      }
    }

    // ---- the scene's frame mapped onto this canvas
    const poseSun = new THREE.Vector3(1, 0, 0)
    const sceneProj = new THREE.Matrix4()
    const sceneDir = new THREE.Vector3()
    let sceneKey = ''
    /** The scene's box on this canvas, in CSS px from its top left; it scrolls with the page. */
    const sceneBox = (view: Pick<SharedView, 'canvas'>) => {
      const rc = canvas.getBoundingClientRect()
      const rs = view.canvas.getBoundingClientRect()
      if (!w || !h || rs.width < 1 || rs.height < 1) return null
      return { x: rs.left - rc.left, y: rs.top - rc.top, w: rs.width, h: rs.height }
    }

    /**
     * Moves the camera `k` of the way toward another frame: direction by slerp and distance by lerp, as between two
     * poses, the turn by slerp, the lens element by element, the Sun by slerp as the camera sees it. At k = 1 this is
     * exactly that frame.
     */
    const toward = (v: { position: THREE.Vector3; quaternion: THREE.Quaternion; sun: THREE.Vector3 }, proj: THREE.Matrix4, k: number) => {
      // The Sun as each camera sees it, before the camera moves.
      const sunHere = sunDir.value.clone().applyQuaternion(camera.quaternion.clone().invert())
      const sunThere = v.sun.clone().applyQuaternion(v.quaternion.clone().invert())
      const d0 = camera.position.length()
      sceneDir.copy(v.position).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(camera.position.clone().normalize(), sceneDir)
      camera.position
        .normalize()
        .applyQuaternion(new THREE.Quaternion().slerp(q, k))
        .multiplyScalar(THREE.MathUtils.lerp(d0, v.position.length(), k))
      camera.quaternion.slerp(v.quaternion, k)
      const pe = camera.projectionMatrix.elements
      const se = proj.elements
      for (let i = 0; i < 16; i++) pe[i] = THREE.MathUtils.lerp(pe[i] ?? 0, se[i] ?? 0, k)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      // The Sun as the camera sees it: its angle from the line of sight (the phase) goes straight from one frame's to
      // the other's, and its direction around the line of sight turns the short way. The lit part of the face then
      // grows or shrinks steadily; turned on the Moon instead, the Sun would pass behind it between two lightings and
      // the face would go dark mid-move.
      sunDir.value
        .copy(phaseBlend(sunHere, sunThere, k))
        .applyQuaternion(camera.quaternion)
        .normalize()
    }

    // ---- page changes: keep the frame on screen and glide from it
    let shown: MoonScene | null = null
    let from: Frame | null = null
    let glideU = 0
    let drawn = false
    let snap = true
    // Analyze's own Moon was on screen as of the last frame (its unmount clears the bridge before the next page sets
    // its scene, so the glide out reads this instead).
    let plannerOn = false
    // How long a glide into Analyze has waited for Analyze's Moon to show up, in seconds.
    let plannerWait = 0
    let plannerVersion = -1
    const settle = () => {
      plannerBridge.cover = false
      if (!from) return
      from = null
      glideK = 0
      endGlide()
    }

    let frame = 0
    let last = performance.now()
    let lastHours = Number.NaN
    let sceneVersion = -1
    // One frame of the Moon. Its own loop runs it, except while the scene hands over: then the scene runs it right after
    // moving its camera, so the Moon and the scene's site buttons move in the same frame.
    const step = () => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const sc = latest.current
      if (sc !== shown) {
        // A new page: the glide starts from exactly what is on screen now, and the new page's own frame takes over at
        // once underneath (snap), so the glide is the only movement.
        // Leaving Analyze, its Moon was the one on screen, drawn from the view this Moon kept following unseen.
        const handing = shown?.kind === 'planner' && plannerOn
        if ((drawn || handing) && !reduced.matches && (opacity > 0.05 || handing)) {
          from = {
            position: camera.position.clone(),
            quaternion: camera.quaternion.clone(),
            projection: camera.projectionMatrix.clone(),
            sun: sunDir.value.clone(),
            light: light.intensity,
            ambient: ambient.intensity,
            thin: thinK.value,
            opacity: handing ? 1 : Number.parseFloat(canvas.style.opacity) || opacity,
          }
          plannerOn = false
          plannerWait = 0
          glideU = 0
          glideK = 1
          beginGlide()
        } else settle()
        shown = sc
        snap = true
        lastHours = Number.NaN
        dirty = true
      }
      tour = sc.kind === 'tour'

      // ---- the page's own frame
      let opGoal = 1
      let earthGoal = 0
      let sideGoal = 0
      let sceneShare = 0
      let centreY = 0
      const pv = sc.kind === 'planner' ? plannerBridge.view : null
      if (sc.kind === 'horizon') {
        // A lunar day, sped up. Reduced motion holds it still.
        if (!reduced.matches) spin = (spin + SPIN_DEG_S * dt) % 360
        centreY = horizonGoal(sc)
      } else if (sc.kind === 'planner') {
        // Analyze's Moon is the one on screen there: this one shows only while it glides in and waits for it, and
        // otherwise follows its view unseen, ready to glide on from it.
        plannerOn = plannerBridge.shown
        opGoal = from && pv && !plannerOn ? 1 : 0
        if (plannerBridge.version !== plannerVersion) {
          plannerVersion = plannerBridge.version
          dirty = true
        }
      } else {
        tourMoment(sc.sites)
        const g = goal(sc.poses)
        if (!g) return
        opGoal = g.opGoal
        earthGoal = g.earthGoal
        sideGoal = g.sideGoal
        sceneShare = g.sceneShare
        if (sc.spin) {
          // It turns only while no chapter needs the near side, so the turn waits there instead of swinging past.
          if (!reduced.matches && earthGoal < 0.001) tourSpin = (tourSpin + SPIN_DEG_S * dt) % 360
          // The point under Earth stays near the near side, so a chapter showing it brings the turn back to zero,
          // the short way round, blended by the scroll like the rest of the pose.
          const wrapped = ((((tourSpin + 180) % 360) + 360) % 360) - 180
          const turn = (-wrapped * (1 - earthGoal) * Math.PI) / 180
          camGoal.applyAxisAngle(yAxis, turn)
          lookGoal.applyAxisAngle(yAxis, turn)
          tourTurn = turn
        } else tourTurn = 0
        // Time follows the scroll directly: the scroll is already smooth, and a sweep ends one synodic month on, where
        // the light matches the start, so stepping back to the chapter's moment is invisible.
        hours = g.nextHours
      }

      // Ease toward the scroll pose; the front door's frame is smooth already; reduced motion and a new page snap.
      const k = snap || !tour || reduced.matches ? 1 : 1 - Math.exp(-dt * 7)
      const before = cam.clone()
      cam.lerp(camGoal, k)
      look.lerp(lookGoal, k)
      // Nothing shows until the colour map has arrived, then the Moon fades in; a new page takes its opacity at once
      // (the glide blends it).
      const opTarget = ready ? opGoal : 0
      if (sc.kind === 'planner') {
        // On and off at once: Analyze's Moon takes over in the same frame, with the same picture.
        if (opacity !== opTarget) dirty = true
        opacity = opTarget
      } else opacity = snap && drawn ? opTarget : opacity + (opTarget - opacity) * (reduced.matches ? 1 : Math.min(1, dt * 4))
      earthK += (earthGoal - earthK) * k
      const sideBefore = side
      side += (sideGoal - side) * k
      if (Math.abs(sideGoal - side) < 1e-4) side = sideGoal
      if (side !== sideBefore) dirty = true
      snap = false

      // ---- the glide from the previous page's frame
      if (from && ready) {
        if (sc.kind === 'planner' && !pv) {
          // Analyze's Moon has not drawn yet, so there is nowhere to go: hold the old frame. A step with no Moon of its
          // own (Result, Dates) never draws one, so after a moment the Moon fades out where it is.
          plannerWait += dt
          if (plannerWait > 0.6) {
            from.opacity = Math.max(0, from.opacity - dt * 3)
            if (from.opacity <= 0.01) settle()
          }
        } else {
          // By frame time, at most a 30th of a second a frame, so a busy frame on the arriving page pauses the glide
          // for a moment instead of skipping a stretch of it.
          glideU += Math.min(dt, 1 / 30) / GLIDE_S
          glideK = 1 - glideEase(glideU)
          if (glideU >= 1) {
            // Into Analyze, the glide ends when Analyze's Moon has taken over; until then this one holds its view.
            if (sc.kind !== 'planner' || plannerBridge.shown) settle()
            else plannerBridge.cover = true
          }
        }
        dirty = true
      }

      // The scene's share follows the scroll directly, as the scroll is already smooth.
      const view = tour ? moonBridge.view : null
      if (sceneShare !== shared) {
        shared = sceneShare
        dirty = true
      }
      moonBridge.weight = shared
      const box = view ? sceneBox(view) : null
      const skyOn = !!box && box.y < h && box.y + box.h > 0
      if (skyOn) loadStars()
      // The scene camera's projection, re-aimed at this canvas, so the Moon lands where the scene would draw it.
      const mapped = view && box && shared > 0 ? reaim(view.projection, box, { w, h }, camera.near, camera.far, sceneProj) : null
      const key = box ? `${box.x},${box.y},${box.w},${box.h},${w},${h}` : ''
      if (key !== sceneKey || (box && moonBridge.version !== sceneVersion) || skyOn !== sky.visible) dirty = true
      if (key !== sceneKey) skyRect = skyOn ? box : null
      sceneKey = key
      sceneVersion = moonBridge.version
      // The stars fade in once their map has arrived, over the sky's black ground.
      const starsGoal = starsArrived ? 1 : 0
      if (skyStars.value !== starsGoal) {
        skyStars.value = reduced.matches ? starsGoal : Math.min(starsGoal, skyStars.value + dt * 2)
        dirty = true
      }
      if (
        cam.distanceToSquared(before) > 1e-10 ||
        Math.abs(opTarget - opacity) > 1e-3 ||
        Math.abs(earthGoal - earthK) > 1e-3 ||
        (tour && hours !== lastHours)
      )
        dirty = true
      if (!dirty || !ready || !w || !h) return
      dirty = false

      if (!tour) poseSun.copy(horizonSun)
      else if (hours !== lastHours) {
        lastHours = hours
        const sub = subPoints(eph, hours)
        poseSun.copy(toVec(sub.sun.lat, sub.sun.lon)).normalize()
        earthMark.position.copy(toVec(sub.earth.lat, sub.earth.lon, 1.003))
        // Ring flat on the ground: its normal (+z) points straight up, away from the Moon's centre.
        earthMark.lookAt(earthMark.position.clone().multiplyScalar(2))
        const when = whenAt(eph, hours)
        if (caption.current)
          caption.current.textContent = `Sunlight as on ${shortDate(when.date)} ${when.date.slice(0, 4)}, ${minuteLabel(when.minute)} UTC`
      }
      camera.position.copy(cam)
      camera.up.set(0, 1, 0)
      camera.lookAt(look)
      if (tour) tourLens()
      else horizonLens(centreY)
      sunDir.value.copy(poseSun)
      // The camera circles the Moon's axis to turn it; the Sun circles with it, so the Moon turns under a still Sun.
      if (tour && tourTurn !== 0) sunDir.value.applyAxisAngle(yAxis, tourTurn)
      // Toward the scene's camera by its share.
      if (view && mapped) toward(view, mapped, shared)
      // Analyze: exactly its Moon's frame, its lens re-aimed at this canvas.
      const plannerBox = pv ? sceneBox(pv) : null
      if (pv && plannerBox) {
        toward(pv, reaim(pv.projection, plannerBox, { w, h }, camera.near, camera.far, sceneProj), 1)
        sunDir.value.copy(pv.sun)
      }
      // Toward the previous page's frame by what is left of the glide. Same canvas, so its lens applies as it was.
      let thinShown = tour || pv ? 0 : 1
      let lightShown = pv ? pv.light : tour ? LIGHT.tour : LIGHT.horizon
      let ambientShown = pv ? pv.ambient : tour ? AMBIENT.tour : AMBIENT.horizon
      let opacityShown = opacity
      if (from && glideK > 0) {
        toward(from, from.projection, glideK)
        thinShown = THREE.MathUtils.lerp(thinShown, from.thin, glideK)
        lightShown = THREE.MathUtils.lerp(lightShown, from.light, glideK)
        ambientShown = THREE.MathUtils.lerp(ambientShown, from.ambient, glideK)
        opacityShown = THREE.MathUtils.lerp(opacity, from.opacity, glideK)
      }
      light.position.copy(sunDir.value).multiplyScalar(10)
      light.intensity = lightShown
      ambient.intensity = ambientShown
      thinK.value = thinShown
      glowK.value = 1 - thinShown
      glow.visible = glowK.value > 0.001
      thin.visible = thinK.value > 0.001
      trailMat.opacity = 0.6 * earthK
      markMat.opacity = earthK
      trail.visible = earthMark.visible = tour && earthK > 0.01
      // The scene states its own moment, so the caption steps aside there too.
      if (caption.current) caption.current.style.opacity = labelsOn() ? '1' : '0'
      // With the sky on, the canvas stays opaque and the Moon fades inside it; otherwise the canvas itself fades.
      sky.visible = skyOn
      if (skyOn && box && view) {
        const pr = renderer.getPixelRatio()
        skyBox.value.set(box.x * pr, (h - box.y - box.h) * pr, box.w * pr, box.h * pr)
        skyFade.value = skyFadePx * pr
        sky.position.copy(camera.position)
        sky.quaternion.copy(view.stars)
      }
      fade.visible = skyOn && opacityShown < 0.999
      fadeK.value = opacityShown
      canvas.style.opacity = skyOn ? '1' : opacityShown.toFixed(3)
      scrims()
      if (opacityShown > 0.005 || skyOn) {
        renderer.render(scene, camera)
        drawn = true
      }
      place()
    }
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!moonBridge.view || latest.current.kind !== 'tour') step()
    }
    moonBridge.draw = step
    stepNow.current = step
    tick()

    return () => {
      cancelAnimationFrame(frame)
      stepNow.current = null
      ro.disconnect()
      settle()
      moonBridge.ready = false
      moonBridge.weight = 0
      if (moonBridge.draw === step) moonBridge.draw = null
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
  }, [eph])

  if (failed) return null
  return (
    // Sized to the large viewport (lvh): a phone's address bar sliding in and out never resizes the canvas, since a
    // resize clears the WebGL buffer and the Moon would blink on every scroll.
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-0 h-[100lvh] overflow-hidden ${
        moonScene.kind === 'tour' && moonScene.textPanels ? 'tour-reading-scene' : ''
      }`}
    >
      <canvas ref={canvasRef} className="size-full opacity-0" />
      {/* The fades that keep text off the Moon on wide screens, one per text side, under the labels so they never fade
          with them. Their opacity follows the Moon's side. */}
      <div ref={scrimLeft} className="tour-scrim absolute inset-0 hidden opacity-0 lg:block" />
      <div ref={scrimRight} className="tour-scrim tour-scrim-right absolute inset-0 hidden opacity-0 lg:block" />
      {sites.map((s) => (
        <div
          key={s.id}
          ref={(n) => {
            dots.current[s.id] = n
          }}
          className="tour-site absolute top-0 left-0 opacity-0"
        >
          <span className="tour-site-dot" />
          <span className="tour-site-label">{s.name}</span>
        </div>
      ))}
      <div ref={earthTag} className="tour-earth absolute top-0 left-0 opacity-0">
        <span className="tour-earth-label">Point under Earth</span>
      </div>
      <p
        ref={caption}
        className="tour-caption scene-text eyebrow absolute bottom-4 hidden text-ink-faint opacity-0 transition-opacity duration-300 lg:block"
      />
    </div>
  )
}
