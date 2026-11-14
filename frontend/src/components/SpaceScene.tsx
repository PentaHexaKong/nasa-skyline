import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { moonBridge, type SharedView } from '~/components/moonBridge'
import { halo, moonMaterial, toVec } from '~/components/moonGlobe'
import { R_EARTH_KM, R_MOON_KM, R_SUN_KM, type Space, sampleSpace } from '~/lib/space'

export type GlobeSite = { id: string; name: string; lat: number; lon: number; note: string }
export type SpaceView = 'moon' | 'earth' | 'pair' | 'orbit' | 'fromEarth' | 'sun'

export type SpaceSceneProps = {
  space: Space
  /** Hours after `space.start`. */
  hours: number
  view: SpaceView
  /** Earth drawn at a tenth of its true distance; sizes and directions stay true. */
  closer: boolean
  sites: GlobeSite[]
  /** Start close above this site and fly out (coming back from a site). */
  from?: string
  /** A fly-in started: the page pauses time. */
  onFlight: () => void
  /** A fly-in landed: the page navigates to the site. */
  onArrive: (id: string) => void
  label: string
  /**
   * `page`: the scene sits inside a scrolling page, so the wheel scrolls the page instead of zooming, and on touch
   * screens a swipe scrolls too (site markers stay tappable). `all` (default): every gesture drives the camera.
   */
  gestures?: 'all' | 'page'
  /**
   * The scene hands its Moon view to the page's own Moon (moonBridge.ts), or takes it back. While it hands over, it
   * draws no frame of its own: no box, no second Moon.
   */
  onHandoff?: (shared: boolean) => void
}

// Scene unit: one Moon radius. Moon at the origin; axes are ECLIPJ2000 mapped as SPICE (x, z, -y).
const U = R_MOON_KM
const RE = R_EARTH_KM / U
const RS = R_SUN_KM / U
const LAND = 1.035 // fly-in ends ~60 km above the surface
const UP = new THREE.Vector3(0, 1, 0)
// The solar disc in the SDO/HMI image, from public/space/textures.json (pipeline.space): centre and radius in UV
// units, v flipped to three's bottom-up convention.
const SUN_DISC = { u: 0.4997, v: 0.4995, r: 0.4622 }

const inOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2)
const outQuart = (x: number) => 1 - (1 - x) ** 4

export default function SpaceScene(props: SpaceSceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dots = useRef<Record<string, HTMLButtonElement | null>>({})
  const bodyLabels = useRef<Record<'moon' | 'earth' | 'sun', HTMLDivElement | null>>({ moon: null, earth: null, sun: null })
  const api = useRef<{ fly: (id: string) => void }>(null)
  const latest = useRef(props)
  latest.current = props
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string>()
  const [fading, setFading] = useState(false)
  const [shared, setShared] = useState(false)

  // The scene is built once per mount; props reach it through `latest`, read every frame.
  useEffect(() => {
    const canvas = canvasRef.current
    const el = host.current
    if (!canvas || !el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
    } catch {
      setFailed('This browser cannot draw 3D (WebGL is unavailable).')
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 1e-4, 1e7)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    let dirty = true
    const redraw = () => {
      dirty = true
    }
    const loader = new THREE.TextureLoader()
    const tex = (url: string, srgb = true, done?: () => void) => {
      const t = loader.load(url, () => {
        redraw()
        done?.()
      })
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return t
    }
    const sunDir = { value: new THREE.Vector3(1, 0, 0) }

    // Moon: shared with the landing page (moonGlobe.ts); `capRot` turns the baked polar relief with the Moon.
    const { material: moonMat, capRot } = moonMaterial(tex, () => setReady(true))
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), moonMat)
    // The Moon has no air: this halo is a camera effect, the way a lens renders a bright limb against black.
    moon.add(halo(1, 0.14, [1.0, 0.93, 0.84], 0.3, 4.5, sunDir))

    // Earth, all NASA: Blue Marble Next Generation ground (graded for display), Black Marble lights on the night side,
    // smooth water so the Sun glints, the Blue Marble cloud map, and air as an edge glow plus a haze over the disc.
    const earthMat = new THREE.MeshStandardMaterial({
      map: tex('/space/earth-day-4k.jpg'),
      roughnessMap: tex('/space/earth-rough-2k.jpg', false),
      emissiveMap: tex('/space/earth-night-4k.jpg'),
      emissive: new THREE.Color(1.0, 0.85, 0.62),
      emissiveIntensity: 1.6,
      roughness: 1,
      metalness: 0,
    })
    earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.sunDirW = sunDir
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vNW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNW = normalize(mat3(modelMatrix) * normal);')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 sunDirW;\nvarying vec3 vNW;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float lum = max(max(totalEmissiveRadiance.r, totalEmissiveRadiance.g), totalEmissiveRadiance.b);
          totalEmissiveRadiance *= smoothstep(0.16, 0.5, lum) * smoothstep(0.05, -0.2, dot(normalize(vNW), sunDirW));`,
        )
    }
    const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 256, 128), earthMat)
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(RE * 1.004, 256, 128),
      new THREE.MeshStandardMaterial({
        color: 0xeef2f7,
        alphaMap: tex('/space/earth-clouds-4k.jpg', false),
        opacity: 0.9,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
      }),
    )
    const haze = new THREE.Mesh(
      new THREE.SphereGeometry(RE * 1.006, 128, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { sunDir },
        vertexShader: `varying vec3 vN; varying vec3 vW;
          void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
          void main(){ vec3 v = normalize(cameraPosition - vW); float f = pow(1.0 - max(0.0, dot(v, vN)), 1.7);
            float lit = smoothstep(-0.15, 0.45, dot(vN, sunDir));
            gl_FragColor = vec4(vec3(0.28,0.5,1.0) * (0.10 + 1.25 * f) * lit * 0.85, 1.0); }`,
      }),
    )
    earth.add(clouds, haze, halo(RE, 0.03, [0.25, 0.5, 1.0], 1.1, 4, sunDir))

    // Sun: the SDO/HMI disc at its true radius and distance, billboarded, plus a soft glow.
    const sunTex = tex('/space/sun-2k.jpg')
    const sunSize = (2 * RS) / (2 * SUN_DISC.r)
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(sunSize, sunSize),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: sunTex } },
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform sampler2D map; varying vec2 vUv;
          void main(){ if (length(vUv - vec2(${SUN_DISC.u}, ${SUN_DISC.v})) > ${SUN_DISC.r}) discard;
            float g = texture2D(map, vUv).r; gl_FragColor = vec4(mix(vec3(1.0,0.78,0.45), vec3(1.0,0.97,0.9), g) * (0.6 + 0.9 * g), 1.0); }`,
      }),
    )
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = glowCanvas.height = 256
    const g2 = glowCanvas.getContext('2d')
    if (g2) {
      const grad = g2.createRadialGradient(128, 128, 0, 128, 128, 128)
      grad.addColorStop(0, 'rgba(255,220,160,0.55)')
      grad.addColorStop(0.25, 'rgba(255,190,110,0.18)')
      grad.addColorStop(1, 'rgba(255,170,80,0)')
      g2.fillStyle = grad
      g2.fillRect(0, 0, 256, 256)
    }
    const glowTex = new THREE.CanvasTexture(glowCanvas)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    )
    glow.scale.setScalar(RS * 8)

    // Stars: NASA SVS Deep Star Maps 2020 in J2000 equatorial coordinates, tilted into the ecliptic frame. RA grows
    // to the left in the map, so u is flipped. The sphere rides with the camera and is drawn first, behind everything.
    const starTex = tex('/space/stars-4k.jpg')
    starTex.wrapS = THREE.RepeatWrapping
    starTex.repeat.x = -1
    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 48),
      new THREE.MeshBasicMaterial({
        map: starTex,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        color: new THREE.Color(0.45, 0.45, 0.45),
      }),
    )
    const obl = (23.4392911 * Math.PI) / 180
    stars.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().set(1, 0, 0, 0, 0, Math.cos(obl), Math.sin(obl), 0, 0, -Math.sin(obl), Math.cos(obl), 0, 0, 0, 0, 1),
    )
    stars.scale.setScalar(1e5)
    stars.renderOrder = -1
    stars.frustumCulled = false

    // The Moon's path around Earth over the whole window, drawn around Earth's current position.
    const sp = latest.current.space
    const pts = new Float32Array(sp.n * 3)
    for (let i = 0; i < sp.n * 3; i++) pts[i] = -(sp.earth_km[i] ?? 0) / U
    const pathGeo = new THREE.BufferGeometry()
    pathGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const path = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.16 }))
    path.frustumCulled = false
    const pathGroup = new THREE.Group()
    pathGroup.add(path)

    const light = new THREE.DirectionalLight(0xffffff, 3.2)
    // A faint fill so the Moon's night side reads as a shape, as earthshine does.
    scene.add(stars, moon, earth, sun, glow, pathGroup, light, light.target, new THREE.AmbientLight(0xffffff, 0.03))

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.7, 0.7)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.rotateSpeed = 0.5
    controls.zoomSpeed = 0.8

    // ---- world state for the current time
    const earthP = new THREE.Vector3()
    const sunP = new THREE.Vector3()
    const moonQ = new THREE.Quaternion()
    const prevMoonQ = new THREE.Quaternion()
    const tmpQ = new THREE.Quaternion()
    let lastHours = Number.NaN
    let lastCloser: boolean | undefined
    const applyTime = () => {
      const { space, hours, closer } = latest.current
      if (hours === lastHours && closer === lastCloser) return false
      const s = sampleSpace(space, hours)
      const k = closer ? 0.1 : 1
      earthP.set(s.earth[0], s.earth[1], s.earth[2]).multiplyScalar(k / U)
      sunP.set(s.sun[0], s.sun[1], s.sun[2]).divideScalar(U)
      prevMoonQ.copy(moonQ)
      moonQ.set(...s.moonQ)
      if (Number.isNaN(lastHours)) prevMoonQ.copy(moonQ)
      moon.quaternion.copy(moonQ)
      moon.updateMatrixWorld()
      capRot.value.setFromMatrix4(moon.matrixWorld)
      earth.position.copy(earthP)
      earth.quaternion.set(...s.earthQ)
      sun.position.copy(sunP)
      glow.position.copy(sunP)
      sunDir.value.copy(sunP).normalize()
      light.position.copy(sunDir.value).multiplyScalar(10)
      pathGroup.position.copy(earthP)
      pathGroup.scale.setScalar(k)
      lastHours = hours
      lastCloser = closer
      return true
    }
    applyTime()

    // ---- camera rig: each view has an anchor that moves with the bodies, and a camera offset from it
    const off = new THREE.Vector3()
    const anchor = (v: SpaceView, out = new THREE.Vector3()) => {
      if (v === 'earth' || v === 'orbit') return out.copy(earthP)
      if (v === 'pair') return out.copy(earthP).multiplyScalar(0.5)
      if (v === 'sun') return out.copy(sunP).multiplyScalar(0.5)
      return out.set(0, 0, 0)
    }
    /** Where the camera sits for a view, relative to its anchor, and the lens (wider on tall phone screens). */
    let lens = 1
    const pose = (v: SpaceView) => {
      const sd = sunDir.value
      const fov = 40 * lens
      // Narrow screens: back off until the frame is as wide as a 16:10 desktop frame.
      const half = Math.atan(Math.tan((fov * Math.PI) / 360) * camera.aspect)
      const wide = Math.max(1, 0.58 / Math.tan(half))
      if (v === 'earth')
        return {
          off: sd
            .clone()
            .applyAxisAngle(UP, -0.6)
            .add(new THREE.Vector3(0, 0.25, 0))
            .normalize()
            .multiplyScalar(RE * 3.6 * wide),
          fov,
        }
      if (v === 'pair') {
        const d = earthP.length()
        return {
          off: new THREE.Vector3()
            .crossVectors(earthP, UP)
            .normalize()
            .multiplyScalar(d * 1.6 * wide)
            .addScaledVector(UP, d * 0.2),
          fov,
        }
      }
      if (v === 'orbit')
        return { off: new THREE.Vector3(0, 1.05e6, 0.55e6).multiplyScalar(((latest.current.closer ? 0.1 : 1) * wide) / U), fov }
      if (v === 'sun') {
        const d = sunP.length()
        return {
          off: new THREE.Vector3()
            .crossVectors(sd, UP)
            .normalize()
            .multiplyScalar(d * 1.45 * wide)
            .addScaledVector(UP, d * 0.12),
          fov,
        }
      }
      if (v === 'fromEarth')
        return {
          off: earthP
            .clone()
            .normalize()
            .multiplyScalar(earthP.length() - RE * 1.3),
          fov: 4 * lens,
        }
      // Moon: from the sunlit side, tilted toward the south pole where most sites are.
      const sb = sd.clone().applyQuaternion(tmpQ.copy(moonQ).invert())
      const lon = (Math.atan2(-sb.z, sb.x) * 180) / Math.PI
      return { off: toVec(-58, lon, 3.9).applyQuaternion(moonQ), fov }
    }
    const limits: Record<SpaceView, [number, number]> = {
      moon: [1.15, 40],
      earth: [RE * 1.05, RE * 40],
      pair: [RE * 2, 5e4],
      orbit: [RE * 2, 5e4],
      fromEarth: [1, 1e6],
      sun: [RS * 3, 1e6],
    }

    let view = latest.current.view
    let tween: { from: THREE.Vector3; fromOff: THREE.Vector3; fromFov: number; t0: number; ms: number } | undefined
    const target = new THREE.Vector3()
    const setView = (v: SpaceView, animate: boolean) => {
      const prevTarget = controls.target.clone()
      const prevOff = camera.position.clone().sub(controls.target)
      view = v
      const p = pose(v)
      controls.enabled = v !== 'fromEarth'
      ;[controls.minDistance, controls.maxDistance] = limits[v]
      if (animate && !reduced) tween = { from: prevTarget, fromOff: prevOff, fromFov: camera.fov, t0: performance.now(), ms: 1400 }
      else {
        anchor(v, target)
        controls.target.copy(target)
        camera.position.copy(target).add(p.off)
        camera.fov = p.fov
        camera.updateProjectionMatrix()
      }
      off.copy(p.off)
      redraw()
    }

    // ---- fly to a site (Moon view only) and back out
    let flight: { from: THREE.Vector3; to: THREE.Vector3; t0: number; ms: number; id?: string } | undefined
    const landing = (id: string) => {
      const s = latest.current.sites.find((x) => x.id === id)
      return s && toVec(s.lat, s.lon, LAND).applyQuaternion(moonQ)
    }
    const fly = (id: string) => {
      const to = landing(id)
      if (!to || view !== 'moon') return
      latest.current.onFlight()
      if (reduced) {
        latest.current.onArrive(id)
        return
      }
      controls.enabled = false
      flight = { from: camera.position.clone(), to, t0: performance.now(), ms: 2400, id }
    }
    setView(view, false)
    const start = latest.current.from && landing(latest.current.from)
    if (start && view === 'moon') {
      if (reduced) camera.position.copy(off)
      else {
        camera.position.copy(start)
        controls.enabled = false
        flight = { from: start.clone(), to: off.clone(), t0: performance.now() + 250, ms: 2200 }
      }
    }

    // ---- size
    let w = 0
    let h = 0
    const resize = () => {
      w = el.clientWidth
      h = el.clientHeight
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      composer.setPixelRatio(Math.min(2, window.devicePixelRatio))
      bloom.resolution.set(w, h)
      camera.aspect = w / h
      const nextLens = w / h < 0.8 ? 1.35 : 1
      if (nextLens !== lens) {
        lens = nextLens
        if (!tween && !flight) camera.fov = pose(view).fov
      }
      // On wide screens, slide the scene right so the headline sits on black space.
      if (w / h > 1.25) camera.setViewOffset(w, h, -w * 0.14, 0, w, h)
      else camera.clearViewOffset()
      camera.updateProjectionMatrix()
      redraw()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    // ---- labels: site dots on the Moon (Moon view), and the bodies themselves in the outside views
    const v3 = new THREE.Vector3()
    const toCam = new THREE.Vector3()
    const look = new THREE.Vector3()
    const project = (p: THREE.Vector3) => {
      v3.copy(p).project(camera)
      const inFront = camera.position.clone().sub(p).dot(camera.getWorldDirection(look)) < 0
      return { x: ((v3.x + 1) / 2) * w, y: ((1 - v3.y) / 2) * h, on: inFront && Math.abs(v3.x) <= 1.02 && Math.abs(v3.y) <= 1.02 }
    }
    const place = () => {
      const near = view === 'moon' && !tween && camera.position.length() < 12 && aligned
      const at = latest.current.sites.map((s) => {
        const p = toVec(s.lat, s.lon).applyQuaternion(moonQ)
        toCam.copy(camera.position).sub(p)
        const { x, y } = project(p)
        return { s, facing: near && toCam.dot(p) > 0, x, y }
      })
      // Every visible dot is an obstacle for every label, so no label covers another site.
      const boxes: [number, number, number, number][] = at.filter((d) => d.facing).map(({ x, y }) => [x - 7, y - 7, x + 7, y + 7])
      const labels: { id: string; box: [number, number, number, number] }[] = []
      for (const { s, facing, x, y } of at) {
        const node = dots.current[s.id]
        if (!node) continue
        const label = node.lastElementChild as HTMLElement | null
        const bw = label?.offsetWidth ?? 0
        const bh = label?.offsetHeight ?? 0
        const hits = (x0: number, y0: number) =>
          x0 < 0 || x0 + bw > w || boxes.some(([a, b, c, d]) => x0 < c && x0 + bw > a && y0 < d && y0 + bh > b)
        // Beside the dot first, then stepped below and above it: right, left, then slid inside the edge on narrow screens.
        const xs = [x + 11, x - 11 - bw, Math.max(4, Math.min(w - bw - 4, x - bw / 2))]
        let pick = { x0: x + 11, y0: y - 8 }
        search: for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
          const y0 = y - 8 + k * (bh + 3)
          for (const x0 of xs)
            if (!hits(x0, y0)) {
              pick = { x0, y0 }
              break search
            }
        }
        const { x0, y0 } = pick
        boxes.push([x0, y0, x0 + bw, y0 + bh])
        labels.push({ id: s.id, box: [x0, y0, x0 + bw, y0 + bh] })
        node.style.setProperty('--dx', `${(x0 - x).toFixed(1)}px`)
        node.style.setProperty('--dy', `${(y0 - y).toFixed(1)}px`)
        // A label moved off its dot gets a leader line to the label's nearest edge, so a cluster still reads.
        const lx = Math.max(x0, Math.min(x0 + bw, x)) - x
        const ly = Math.max(y0, Math.min(y0 + bh, y)) - y
        const lead = Math.hypot(lx, ly)
        node.style.setProperty('--lead', `${lead.toFixed(1)}px`)
        node.style.setProperty('--lead-a', `${Math.atan2(ly, lx).toFixed(3)}rad`)
        node.dataset.lead = lead > 12 ? 'on' : 'off'
        node.dataset.side = x0 < x ? 'left' : 'right'
        node.style.transform = `translate(${(x - 5).toFixed(1)}px, ${(y - 5).toFixed(1)}px)`
        const show = facing && !flight
        node.style.opacity = show ? '1' : '0'
        node.style.pointerEvents = show ? 'auto' : 'none'
        node.tabIndex = show ? 0 : -1
      }
      // The polar sites sit a few pixels apart, so a touch target only grows into space no other site or label claims.
      for (const d of at.filter((a) => a.facing)) {
        const room = Math.min(
          12,
          ...at.filter((o) => o.facing && o !== d).map((o) => (Math.max(Math.abs(o.x - d.x), Math.abs(o.y - d.y)) - 10) / 2),
          ...labels.filter((l) => l.id !== d.s.id).map(({ box: [a, b, c, e] }) => Math.max(a - d.x, d.x - c, b - d.y, d.y - e) - 5),
        )
        dots.current[d.s.id]?.style.setProperty('--hit', `${Math.max(0, room).toFixed(1)}px`)
      }

      // Body labels. When Earth and the Moon are closer on screen than a label, one label names the pair.
      const pe = project(earthP)
      const pm = project(new THREE.Vector3())
      const ps = project(sunP)
      const merged = Math.hypot(pe.x - pm.x, pe.y - pm.y) < 48
      const radiusPx = (c: THREE.Vector3, r: number) =>
        (r / Math.max(1e-9, camera.position.distanceTo(c)) / Math.tan((camera.fov * Math.PI) / 360)) * (h / 2)
      const set = (key: 'moon' | 'earth' | 'sun', p: { x: number; y: number; on: boolean }, show: boolean, text?: string) => {
        const node = bodyLabels.current[key]
        if (!node) return
        // Big on screen: name beside the visible disc instead of a ring on its centre.
        const rp = radiusPx(
          key === 'earth' ? earthP : key === 'sun' ? sunP : new THREE.Vector3(),
          key === 'earth' ? RE : key === 'sun' ? RS : 1,
        )
        node.style.setProperty('--r', `${Math.min(rp, w).toFixed(1)}px`)
        node.dataset.big = rp > 5 ? 'on' : 'off'
        // Near the right edge the name goes on the left of the body.
        const textW = (node.dataset.text ?? '').length * 7.5 + Math.min(rp, w) * 0.72 + 14
        node.dataset.flip = p.x + textW > w - 8 ? 'on' : 'off'
        // Handed over, the scene draws none of the bodies, so it names none.
        node.style.opacity = show && p.on && !flight && !handoff ? '1' : '0'
        node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
        if (text) node.dataset.text = text
      }
      const outside = view !== 'moon'
      set('earth', pe, view !== 'earth', merged ? 'Earth and Moon' : 'Earth')
      set('moon', pm, outside && view !== 'fromEarth' && !merged)
      set('sun', ps, true)
    }

    // ---- hand-off of the Moon view to the page's Moon (moonBridge.ts)
    // Embedded in the page and settled in the Moon view, the scene stops drawing: the page Moon draws the Moon from this
    // camera instead, so it is rendered once and carries on from the chapters above. The other views, the moves between
    // views, and full screen keep the scene's own frame. Each switch crossfades the canvas over the page Moon, which
    // holds this camera until the fade is over, so both show the same Moon at that moment.
    let handoff: boolean | undefined
    let fadeUntil = 0
    let aligned = false
    const invQ = new THREE.Quaternion()
    const bridgeView: SharedView = {
      canvas,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      projection: new THREE.Matrix4(),
      sun: new THREE.Vector3(),
      stars: new THREE.Quaternion(),
    }
    const FADE_MS = 800

    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const moved = applyTime()
      if (latest.current.view !== view && !flight) setView(latest.current.view, true)
      const now = performance.now()

      if (flight) {
        const raw = (now - flight.t0) / flight.ms
        if (raw >= 0) {
          const k = inOut(Math.min(1, raw))
          // Great-circle path over the surface while the distance eases, so the camera arcs instead of cutting through.
          const a = flight.from.clone().normalize()
          const b = flight.to.clone().normalize()
          const q = new THREE.Quaternion().setFromUnitVectors(a, b)
          const dir = a.applyQuaternion(new THREE.Quaternion().slerp(q, k))
          const dist = THREE.MathUtils.lerp(flight.from.length(), flight.to.length(), k) + Math.sin(k * Math.PI) * 0.35
          camera.position.copy(dir).multiplyScalar(dist)
          controls.target.set(0, 0, 0)
          camera.lookAt(0, 0, 0)
          dirty = true
          if (raw >= 1) {
            const id = flight.id
            flight = undefined
            controls.enabled = true
            off.copy(camera.position)
            if (id) {
              // Fade to black, then hand over to the site view.
              setFading(true)
              window.setTimeout(() => latest.current.onArrive(id), 280)
            }
          }
        }
      } else {
        // The Moon view turns with the Moon, so the sites stay under the camera as time runs.
        if (view === 'moon' && moved) off.applyQuaternion(tmpQ.copy(moonQ).multiply(prevMoonQ.clone().invert()))
        if (view === 'fromEarth') off.copy(pose('fromEarth').off)
        anchor(view, target)
        if (tween) {
          const k = outQuart(Math.min(1, (now - tween.t0) / tween.ms))
          const goal = pose(view)
          // Direction by slerp and distance in log space, so a jump from the Moon out to the Sun stays smooth.
          const d0 = Math.max(1e-6, tween.fromOff.length())
          const d1 = goal.off.length()
          const q = new THREE.Quaternion().setFromUnitVectors(tween.fromOff.clone().normalize(), goal.off.clone().normalize())
          const dir = tween.fromOff.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(q, k))
          // Between far-apart anchors, rise out mid-move so both stay in frame instead of crossing empty space.
          const hop = Math.sin(Math.PI * k) * tween.from.distanceTo(target) * 0.9
          off.copy(dir).multiplyScalar(Math.exp(THREE.MathUtils.lerp(Math.log(d0), Math.log(d1), k)) + hop)
          target.lerpVectors(tween.from, target, k)
          camera.fov = THREE.MathUtils.lerp(tween.fromFov, goal.fov, k)
          camera.updateProjectionMatrix()
          if (k >= 1) tween = undefined
          dirty = true
        }
        // Gestures follow the page mode; flights and the fixed From Earth lens keep the camera to themselves.
        const page = latest.current.gestures === 'page'
        controls.enabled = view !== 'fromEarth' && !(page && coarse)
        controls.enableZoom = !page
        canvas.style.touchAction = page && coarse ? 'pan-y' : 'none'
        controls.target.copy(target)
        camera.position.copy(target).add(off)
        if (controls.update() || moved) dirty = true
        off.copy(camera.position).sub(controls.target)
      }

      const nextHandoff = moonBridge.ready && moonBridge.draw != null && latest.current.gestures === 'page' && view === 'moon' && !tween
      if (nextHandoff !== handoff) {
        // The first decision shows at once; later ones crossfade.
        if (handoff !== undefined) fadeUntil = now + FADE_MS
        handoff = nextHandoff
        setShared(nextHandoff)
        latest.current.onHandoff?.(nextHandoff)
        dirty = true
      }
      const crossfading = now < fadeUntil
      if (handoff || crossfading) {
        // The camera in the Moon's body frame, which is the page Moon's world.
        invQ.copy(moonQ).invert()
        bridgeView.position.copy(camera.position).applyQuaternion(invQ)
        bridgeView.quaternion.copy(invQ).multiply(camera.quaternion)
        bridgeView.projection.copy(camera.projectionMatrix)
        bridgeView.sun.copy(sunDir.value).applyQuaternion(invQ)
        bridgeView.stars.copy(invQ).multiply(stars.quaternion)
        moonBridge.view = bridgeView
        if (dirty) moonBridge.version++
        moonBridge.draw?.()
      } else if (moonBridge.view === bridgeView) moonBridge.view = null
      // Site buttons sit on the drawn Moon only once the page Moon fully follows this camera (not mid-scroll).
      const nowAligned = !handoff || moonBridge.weight > 0.98
      if (nowAligned !== aligned) {
        aligned = nowAligned
        dirty = true
      }
      if (crossfading) dirty = true

      if (!dirty) return
      dirty = false
      sun.quaternion.copy(camera.quaternion)
      stars.position.copy(camera.position)
      // Through a narrow lens the star map is magnified past its resolution: leave the sky black.
      stars.visible = camera.fov > 10
      pathGroup.visible = view === 'pair' || view === 'orbit'
      if (!handoff || crossfading) composer.render()
      place()
    }
    controls.addEventListener('change', redraw)
    api.current = { fly }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      if (moonBridge.view === bridgeView) moonBridge.view = null
      controls.dispose()
      composer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
          mat.dispose()
        }
      })
      glowTex.dispose()
      renderer.dispose()
      api.current = null
    }
  }, [])

  return (
    <div ref={host} className={`relative h-full select-none ${props.gestures === 'page' ? 'touch-pan-y' : 'touch-none'}`}>
      {failed ? (
        <p className="grid h-full place-items-center px-6 text-center text-sm text-ink-muted">{failed}</p>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={props.label}
            // Full screen opens on black at once, so the frame shows at once too; in the page it crossfades.
            className={`size-full cursor-grab active:cursor-grabbing ${props.gestures === 'page' ? 'sky-edges transition-opacity duration-700' : ''} ${ready && !shared ? 'opacity-100' : 'opacity-0'}`}
          />
          {/* Labels stay on dark chips in either theme: they sit on the Moon's imagery, and on the page when it shows. */}
          <div data-mode="dark" className="pointer-events-none absolute inset-0 overflow-hidden">
            {(['moon', 'earth', 'sun'] as const).map((k) => (
              <div
                key={k}
                aria-hidden
                ref={(n) => {
                  bodyLabels.current[k] = n
                }}
                data-body={k}
                data-text={k === 'moon' ? 'Moon' : k === 'earth' ? 'Earth' : 'Sun'}
                className="space-body absolute top-0 left-0 opacity-0"
              />
            ))}
            {props.sites.map((s) => (
              <button
                key={s.id}
                type="button"
                ref={(n) => {
                  dots.current[s.id] = n
                }}
                onClick={() => api.current?.fly(s.id)}
                className="globe-site group absolute top-0 left-0 opacity-0"
              >
                <span aria-hidden className="globe-site-lead" />
                <span aria-hidden className="globe-site-dot" />
                <span className="globe-site-label">
                  <span className="text-white">{s.name}</span>
                  <span className="text-white/60">{s.note}</span>
                </span>
              </button>
            ))}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-300 ${fading ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      )}
    </div>
  )
}
