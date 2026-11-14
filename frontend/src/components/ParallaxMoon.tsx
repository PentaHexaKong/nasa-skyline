import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { moonBridge, reaim, type SharedView } from '~/components/moonBridge'
import { halo, moonMaterial, toVec } from '~/components/moonGlobe'
import type { MoonEphemeris } from '~/lib/data'
import { bestHour, SYNODIC_HOURS, subPoints, whenAt } from '~/lib/moonLight'
import { minuteLabel, shortDate } from '~/lib/time'

/**
 * The Moon behind the landing page. It stays on screen while the page scrolls and turns to the place each chapter
 * talks about. Sunlight and the point under Earth come from the pipeline's SPICE ephemeris for a stated moment, so
 * the lit side is the real one; only the camera moves with the scroll.
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
   * on narrow ones the Moon stays above the text and only sways a little toward this side.
   */
  side?: 'left' | 'right'
  /**
   * The true-scale scene's chapter. While the scene hands its Moon view over (moonBridge.ts), this pose is the scene's
   * own camera, so the Moon carries on into the scene instead of a second Moon being drawn there.
   */
  scene?: boolean
}

export type TourSite = { id: string; name: string; lat: number; lon: number }

const FOV = 30
/** How far the Moon's centre sits off the screen's centre, as a share of the width: wide screens, then narrow ones. */
const SHIFT_WIDE = 0.2
const SHIFT_NARROW = 0.08

/** A pose's side as a number: +1 right, -1 left, so two poses blend through the middle. */
export const sideOf = (p: MoonPose) => (p.side === 'left' ? -1 : 1)
const EARTH_HEX = 0x5cd0ea // --cyan-400, the Earth colour (docs/design.md)

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
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

export default function ParallaxMoon({ poses, sites, eph }: { poses: MoonPose[]; sites: TourSite[]; eph: MoonEphemeris }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dots = useRef<Record<string, HTMLDivElement | null>>({})
  const earthTag = useRef<HTMLDivElement>(null)
  const caption = useRef<HTMLParagraphElement>(null)
  const scrimLeft = useRef<HTMLDivElement>(null)
  const scrimRight = useRef<HTMLDivElement>(null)
  const latest = useRef({ poses, sites })
  latest.current = { poses, sites }
  const [failed, setFailed] = useState(false)

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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
    // The limb glow adds light but never coverage, so on a light page it vanishes instead of drawing a grey ring.
    const glow = halo(1, 0.14, [1.0, 0.93, 0.84], 0.3, 4.5, sunDir)
    const glowMat = glow.material as THREE.ShaderMaterial
    glowMat.blending = THREE.CustomBlending
    glowMat.blendSrc = THREE.OneFactor
    glowMat.blendDst = THREE.OneFactor
    glowMat.blendSrcAlpha = THREE.ZeroFactor
    glowMat.blendDstAlpha = THREE.OneFactor
    moon.add(glow)
    moon.updateMatrixWorld()
    capRot.value.setFromMatrix4(moon.matrixWorld)
    const light = new THREE.DirectionalLight(0xffffff, 3.2)
    // A faint fill so the night side still reads as a shape, as earthshine does.
    scene.add(moon, light, new THREE.AmbientLight(0xffffff, 0.03))

    // The moment the page shows: when the Sun stands highest over the polar sites in the first month of the data.
    const h0 = bestHour(eph, latest.current.sites)

    // Where Earth stands overhead over that month: it rocks a few degrees around the near side (libration).
    const trailPts: THREE.Vector3[] = []
    for (let h = h0; h <= h0 + SYNODIC_HOURS; h += 3) {
      const e = subPoints(eph, h).earth
      trailPts.push(toVec(e.lat, e.lon, 1.004))
    }
    const trailMat = new THREE.LineBasicMaterial({ color: EARTH_HEX, transparent: true, opacity: 0, depthWrite: false })
    const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trailPts), trailMat)
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
    scene.add(trail, earthMark)

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
          float m = inX * clamp(edge / skyFade, 0.0, 1.0);
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

    // ---- size and framing: the Moon sits beside the text on wide screens (side by pose), above it on narrow ones
    let w = 0
    let h = 0
    let wide = true
    // Where the Moon sits across the screen, from -1 (left) to +1 (right); it eases toward the scrolled chapter's side.
    let side = 1
    // How much of the frame follows the true-scale scene's camera (moonBridge.ts), 0 to 1, from the scroll.
    let shared = 0
    // The scene's box on this canvas while its sky shows here (CSS px from the top left), else null.
    let skyRect: { x: number; y: number; w: number; h: number } | null = null
    const scrims = () => {
      // The fade keeps the text column clear of the Moon: it lies on the side away from the Moon. The scene has no
      // text column beside its Moon, so the fade goes as the scene takes over.
      const k = (side + 1) / 2
      const keep = 1 - shared
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
    const frameMoon = () => {
      if (!w || !h) return
      const shift = (wide ? SHIFT_WIDE : SHIFT_NARROW) * side
      if (wide) camera.setViewOffset(w, h, -w * shift, 0, w, h)
      else camera.setViewOffset(w, h, -w * shift, h * 0.2, w, h)
      camera.updateProjectionMatrix()
      scrims()
    }
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      skyFadePx =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sky-fade')) *
          parseFloat(getComputedStyle(document.documentElement).fontSize) || 48
      camera.aspect = w / h
      wide = w >= 1024
      // Narrow screens: widen the lens so the whole disc fits the width.
      const tanHalf = Math.tan((FOV * Math.PI) / 360) * Math.max(1, 0.75 / camera.aspect)
      camera.fov = (2 * Math.atan(tanHalf) * 180) / Math.PI
      frameMoon()
      dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ---- pose from the scroll position
    const camGoal = new THREE.Vector3()
    const lookGoal = new THREE.Vector3()
    const cam = new THREE.Vector3()
    const look = new THREE.Vector3()
    let opacity = 0
    let earthK = 0
    let first = true
    const poseVec = (p: MoonPose) => {
      const [lat, lon, dist] = p.cam
      return toVec(lat, lon, dist)
    }
    const lookVec = (p: MoonPose) => (p.look ? toVec(p.look[0], p.look[1], p.look[2]) : new THREE.Vector3())
    let hours = h0
    let named = new Set<string>()

    const goal = () => {
      const sections = [...document.querySelectorAll<HTMLElement>('[data-moon-chapter]')]
      const boxes = sections.map((s) => s.getBoundingClientRect())
      // The middle of the canvas, which keeps its size while a phone's address bar slides (window.innerHeight does not).
      const s = scrollState(boxes, canvas.getBoundingClientRect().top + h * 0.5)
      const ps = latest.current.poses
      let a = ps[s.from] ?? ps[0]
      let b = ps[s.to] ?? a
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
      const here = ps[s.index]
      // A sweep runs one synodic month, so the light ends almost where it began and the next chapter does not jump.
      const nextHours = here?.sweep ? h0 + smooth(0.12, 0.88, s.progress) * SYNODIC_HOURS : h0
      named = new Set((s.blend < 0.5 ? a.sites : b.sites) ?? [])
      return { opGoal, earthGoal, sideGoal, nextHours, sceneShare }
    }

    // ---- labels placed each frame from projected points
    const v3 = new THREE.Vector3()
    const project = (p: THREE.Vector3) => {
      v3.copy(p).project(camera)
      return { x: ((v3.x + 1) / 2) * w, y: ((1 - v3.y) / 2) * h }
    }
    const place = () => {
      // Named labels step down past each other, so the polar sites, a few pixels apart, still read.
      const boxes: [number, number, number, number][] = []
      const at = latest.current.sites
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
        node.style.opacity = facing && opacity > 0.4 && shared < 0.1 ? (isNamed ? '1' : '0.55') : '0'
        node.dataset.named = isNamed ? 'on' : 'off'
        node.dataset.side = left ? 'left' : 'right'
      }
      const tag = earthTag.current
      if (tag) {
        const facing = camera.position.clone().sub(earthMark.position).dot(earthMark.position) > 0.02
        const { x, y } = project(earthMark.position)
        tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        tag.style.opacity = facing && earthK > 0.5 && opacity > 0.4 && shared < 0.1 ? '1' : '0'
      }
    }

    // ---- the scene's frame mapped onto this canvas
    const poseSun = new THREE.Vector3(1, 0, 0)
    const sceneProj = new THREE.Matrix4()
    const sceneDir = new THREE.Vector3()
    let sceneKey = ''
    /** The scene's box on this canvas, in CSS px from its top left; it scrolls with the page. */
    const sceneBox = (view: SharedView) => {
      const rc = canvas.getBoundingClientRect()
      const rs = view.canvas.getBoundingClientRect()
      if (!w || !h || rs.width < 1 || rs.height < 1) return null
      return { x: rs.left - rc.left, y: rs.top - rc.top, w: rs.width, h: rs.height }
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
      const g = goal()
      if (!g) return
      // Ease toward the scroll pose; reduced motion snaps to it.
      const k = first || reduced ? 1 : 1 - Math.exp(-dt * 7)
      first = false
      const before = cam.clone()
      cam.lerp(camGoal, k)
      look.lerp(lookGoal, k)
      // Nothing shows until the colour map has arrived, then the Moon fades in.
      const opGoal = ready ? g.opGoal : 0
      opacity += (opGoal - opacity) * (reduced ? 1 : Math.min(1, dt * 4))
      earthK += (g.earthGoal - earthK) * k
      const sideBefore = side
      side += (g.sideGoal - side) * k
      if (Math.abs(g.sideGoal - side) < 1e-4) side = g.sideGoal
      if (side !== sideBefore) {
        frameMoon()
        dirty = true
      }
      // The scene's share follows the scroll directly, as the scroll is already smooth.
      const view = moonBridge.view
      if (g.sceneShare !== shared) {
        shared = g.sceneShare
        scrims()
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
      if (key !== sceneKey) {
        skyRect = skyOn ? box : null
        scrims()
      }
      sceneKey = key
      sceneVersion = moonBridge.version
      // The stars fade in once their map has arrived, over the sky's black ground.
      const starsGoal = starsArrived ? 1 : 0
      if (skyStars.value !== starsGoal) {
        skyStars.value = reduced ? starsGoal : Math.min(starsGoal, skyStars.value + dt * 2)
        dirty = true
      }
      // Time follows the scroll directly: the scroll is already smooth, and a sweep ends one synodic month on, where
      // the light matches the start, so stepping back to the chapter's moment is invisible.
      hours = g.nextHours
      if (
        cam.distanceToSquared(before) > 1e-10 ||
        Math.abs(opGoal - opacity) > 1e-3 ||
        Math.abs(g.earthGoal - earthK) > 1e-3 ||
        hours !== lastHours
      )
        dirty = true
      if (!dirty || !ready) return
      dirty = false

      if (hours !== lastHours) {
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
      camera.updateProjectionMatrix()
      sunDir.value.copy(poseSun)
      if (view && mapped) {
        // Toward the scene's camera by its share: direction by slerp and distance by lerp, as between two poses, the
        // turn by slerp, the lens element by element. At a full share this is exactly the scene's frame.
        const d0 = camera.position.length()
        sceneDir.copy(view.position).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(camera.position.clone().normalize(), sceneDir)
        camera.position
          .normalize()
          .applyQuaternion(new THREE.Quaternion().slerp(q, shared))
          .multiplyScalar(THREE.MathUtils.lerp(d0, view.position.length(), shared))
        camera.quaternion.slerp(view.quaternion, shared)
        const pe = camera.projectionMatrix.elements
        const se = mapped.elements
        for (let i = 0; i < 16; i++) pe[i] = THREE.MathUtils.lerp(pe[i] ?? 0, se[i] ?? 0, shared)
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
        sunDir.value.lerp(view.sun, shared).normalize()
      }
      light.position.copy(sunDir.value).multiplyScalar(10)
      trailMat.opacity = 0.6 * earthK
      markMat.opacity = earthK
      trail.visible = earthMark.visible = earthK > 0.01
      canvas.style.opacity = opacity.toFixed(3)
      // The scene states its own moment, so the caption steps aside there too.
      if (caption.current) caption.current.style.opacity = opacity > 0.4 && shared < 0.1 ? '1' : '0'
      // With the sky on, the canvas stays opaque and the Moon fades inside it; otherwise the canvas itself fades.
      sky.visible = skyOn
      if (skyOn && box && view) {
        const pr = renderer.getPixelRatio()
        skyBox.value.set(box.x * pr, (h - box.y - box.h) * pr, box.w * pr, box.h * pr)
        skyFade.value = skyFadePx * pr
        sky.position.copy(camera.position)
        sky.quaternion.copy(view.stars)
      }
      fade.visible = skyOn && opacity < 0.999
      fadeK.value = opacity
      canvas.style.opacity = skyOn ? '1' : opacity.toFixed(3)
      if (opacity > 0.005 || skyOn) renderer.render(scene, camera)
      place()
    }
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!moonBridge.view) step()
    }
    moonBridge.draw = step
    // Start from the first pose so the first frame is already framed.
    const g0 = goal()
    if (g0) {
      cam.copy(camGoal)
      look.copy(lookGoal)
      side = g0.sideGoal
      frameMoon()
      opacity = 0
      hours = g0.nextHours
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
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
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-14 z-0 h-[calc(100lvh-3.5rem)] overflow-hidden">
      <canvas ref={canvasRef} className="size-full opacity-0" />
      {/* The fades that keep text off the Moon on wide screens, one per text side, under the labels so they never fade
          with them. Their opacity follows the Moon's side. */}
      <div ref={scrimLeft} className="tour-scrim absolute inset-0 hidden lg:block" />
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
