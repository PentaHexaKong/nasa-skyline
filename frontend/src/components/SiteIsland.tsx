import { Button } from '@cloudflare/kumo/components/button'
import { ArrowCounterClockwiseIcon, CubeIcon, PersonSimpleIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { hasTerrain, loadTerrain, type SkyTarget, type Terrain, type Track } from '~/lib/data'
import type { SkyPoint } from '~/lib/moonLight'
import { reducedMotion } from '~/lib/motion'
import { blockedAt, direction, heightAt, runs } from '~/lib/sky'

type Sun = { az: number; el: number; fraction: number }
type Reference = { label: string; track: Track }

export type SiteIslandProps = {
  siteId: string
  place: string
  track?: Track
  references?: Reference[]
  now?: Sun
  /** Direct sun at this instant, from the pipeline's intervals. Shadows in the scene are decoration; this is the answer. */
  inSun: boolean
  horizon?: number
  comms?: SkyTarget
  /** The computed skyline (deg per azimuth step), terrain out to the pipeline's full range. */
  skyline: number[]
  azStep: number
  /** How far the computed skyline reaches, for the caption. */
  skylineKm: number
  label: string
  /** Fill the parent instead of a fixed hero height; also enables wheel zoom. */
  fill?: boolean
  /** Height classes for the stage when not filling its parent. */
  className?: string
  /** Extra buttons for the toolbar, such as the full-screen link. */
  tools?: ReactNode
  /** The Sun's and Earth's paths over a whole lunar month, below the horizon too. Pass a stable object: a new one redraws. */
  orbit?: { sun: SkyPoint[]; earth: SkyPoint[] }
  /** Turn the home view to face the Sun or Earth; a new `nonce` re-aims it. */
  focus?: { target: 'sun' | 'earth'; nonce: number }
}

// The sky sits on a sphere far beyond the terrain, so the Sun, Earth and their paths read as distant, as they are.
const SKY = 2000 // km
const SKY_DASH = 16 // km, dash length for lines drawn on the sky
// Sun and Earth are drawn larger than their true angular size so they stay visible; captions say by how much.
const SUN_SCALE = 3
const EARTH_SCALE = 2
// Island camera: a perspective view, its frame shifted up so the terrain sits low and the sky shows behind it.
const FRAME_SHOWN = 0.75

/** Resolves any CSS colour (tokens, light-dark(), oklch) to sRGB through a 1px canvas. */
export function palette() {
  const probe = document.createElement('span')
  document.body.append(probe)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const read = (expr: string) => {
    probe.style.color = expr
    const css = getComputedStyle(probe).color
    if (!ctx) return new THREE.Color(css)
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
  }
  const dark = document.documentElement.dataset.mode === 'dark'
  const p = {
    dark,
    ink: read('var(--color-ink)'),
    faint: read('var(--color-ink-faint)'),
    sun: read('var(--color-sun)'),
    comms: read('var(--color-comms)'),
    land: read(dark ? 'oklch(0.34 0 0)' : 'oklch(0.86 0 0)'),
    side: read(dark ? 'oklch(0.16 0 0)' : 'oklch(0.74 0 0)'),
  }
  probe.remove()
  return p
}
export type Palette = ReturnType<typeof palette>

function line(
  points: THREE.Vector3[],
  color: THREE.Color,
  width: number,
  opts: { dashed?: boolean; dash?: number; opacity?: number; depthTest?: boolean } = {},
) {
  const g = new LineGeometry()
  g.setPositions(points.flatMap((p) => [p.x, p.y, p.z]))
  const m = new LineMaterial({
    color,
    linewidth: width,
    dashed: !!opts.dashed,
    dashSize: opts.dash ?? 0.35,
    gapSize: (opts.dash ?? 0.35) * 0.8,
    transparent: opts.opacity != null,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
  })
  const l = new Line2(g, m)
  l.computeLineDistances()
  return l
}

export function terrainMesh(t: Terrain, p: Palette) {
  const { n, radius_km: r, ground_height_m: g, min_m } = t.meta
  const base = (min_m - g) / 1000 - 0.6
  const geo = new THREE.PlaneGeometry(2 * r, 2 * r, n - 1, n - 1)
  geo.rotateX(-Math.PI / 2) // row 0 (north) lands at z = -r
  const pos = geo.attributes.position as THREE.BufferAttribute
  const cell = (2 * r) / (n - 1)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    // Outside the disc, flatten to the base so cut-away corners cast no shadows.
    pos.setY(i, Math.hypot(x, z) > r + cell ? base : ((t.heights[i] ?? 0) - g) / 1000)
  }
  geo.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({ color: p.land, roughness: 0.95, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uR = { value: r }
    shader.uniforms.uContour = { value: p.ink.clone() }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform float uR;\nuniform vec3 uContour;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (length(vLocal.xz) > uR) discard;
        float k = vLocal.y * 4.0; // a contour every 250 m
        float w = abs(fract(k + 0.5) - 0.5) / max(fwidth(k), 1e-4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uContour, (1.0 - min(w, 1.0)) * 0.07);`,
      )
  }
  const land = new THREE.Mesh(geo, mat)
  land.castShadow = true
  land.receiveShadow = true

  // Skirt and underside, so the disc reads as a cut-out floating in space.
  const seg = 360
  const rim: THREE.Vector3[] = []
  const skirt = new Float32Array((seg + 1) * 6)
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const x = Math.sin(a) * r
    const z = -Math.cos(a) * r
    const y = sample(t, x, z)
    rim.push(new THREE.Vector3(x, y, z))
    skirt.set([x, y, z, x, base, z], i * 6)
  }
  const index: number[] = []
  for (let i = 0; i < seg; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(skirt, 3))
  sg.setIndex(index)
  const side = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: p.side, side: THREE.DoubleSide }))
  const cap = new THREE.Mesh(new THREE.CircleGeometry(r, seg), new THREE.MeshBasicMaterial({ color: p.side }))
  cap.rotateX(Math.PI / 2)
  cap.position.y = base
  const group = new THREE.Group()
  group.add(land, side, cap, line(rim, p.ink, 1.25, { opacity: 0.9 }))
  return { group, base, skirt: [side, cap] }
}

/**
 * The coarse terrain around the detailed disc, veiled: desaturated, hazed toward the edge with value noise and faded
 * out, so the eye reads "data is coarser here" without a hard cut. Heights share the inner tile's origin and curvature.
 */
export function surroundMesh(outer: Terrain, inner: Terrain, p: Palette) {
  const { n, radius_km: r } = outer.meta
  const R = inner.meta.radius_km
  const g = inner.meta.ground_height_m
  const geo = new THREE.PlaneGeometry(2 * r, 2 * r, n - 1, n - 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) pos.setY(i, ((outer.heights[i] ?? 0) - g) / 1000 - 0.004)
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: p.land, roughness: 1, metalness: 0, transparent: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uR = { value: R }
    shader.uniforms.uMist = { value: p.faint.clone() }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLocal;
        uniform float uR;
        uniform vec3 uMist;
        float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 q) {
          vec2 i = floor(q), f = fract(q);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 q) { return 0.5 * vnoise(q) + 0.3 * vnoise(q * 2.1) + 0.2 * vnoise(q * 4.3); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rr = length(vLocal.xz);
        if (rr < uR) discard;
        float k = smoothstep(uR, uR * 2.4, rr);
        float cloud = fbm(vLocal.xz * 0.35);
        float grey = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(grey), uMist, 0.25 + 0.5 * k * cloud);`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.a *= (1.0 - smoothstep(0.15, 0.95, k + 0.35 * (cloud - 0.5))) * 0.85;`,
      )
  }
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  return mesh
}

function sample(t: Terrain, x: number, z: number) {
  const { n, radius_km: r, ground_height_m: g } = t.meta
  const c = Math.min(n - 1, Math.max(0, ((x + r) / (2 * r)) * (n - 1)))
  const row = Math.min(n - 1, Math.max(0, ((z + r) / (2 * r)) * (n - 1)))
  return ((t.heights[Math.round(row) * n + Math.round(c)] ?? g) - g) / 1000
}

/** A soft radial glow for the Sun. */
export function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (g) {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, 'rgba(255,255,255,0.9)')
    r.addColorStop(0.18, 'rgba(255,255,255,0.35)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
  }
  return new THREE.CanvasTexture(c)
}

/** Earth as a lit sphere: its phase comes from the real Sun direction, with a thin atmosphere rim. */
/**
 * Earth's disc, lit by the Sun. With `under`, the part of the disc below the horizon (world y < 0) is drawn as a ghost in
 * the ground's colour with an Earth-tinted rim, so a half-set Earth reads as cut by the surface, not as clipped.
 */
export function earthMaterial(sunDir: THREE.Vector3, under?: { ground: THREE.Color; tint: THREE.Color }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: sunDir },
      fade: { value: 1 },
      split: { value: under ? 1 : 0 },
      ground: { value: under?.ground ?? new THREE.Color() },
      tint: { value: under?.tint ?? new THREE.Color() },
      ocean: { value: new THREE.Color(0x2f6fd0) },
      air: { value: new THREE.Color(0xa8dcff) },
    },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunDir;
      uniform float fade;
      uniform float split;
      uniform vec3 ground;
      uniform vec3 tint;
      uniform vec3 ocean;
      uniform vec3 air;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        #include <logdepthbuf_fragment>
        float lit = max(dot(vN, sunDir), 0.0);
        float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
        vec3 sky = (ocean * (0.07 + 1.15 * lit) + air * rim * (0.2 + 0.8 * lit)) * fade;
        vec3 ghost = mix(ground, tint, 0.035 + 0.45 * pow(1.0 - max(dot(vN, vV), 0.0), 3.0));
        gl_FragColor = vec4(split > 0.5 && vY < 0.0 ? ghost : sky, 1.0);
        #include <colorspace_fragment>
      }`,
  })
}

/** Frees a group's line geometry and materials; shared meshes (markers, dots) are freed with the scene. */
function dispose(g: THREE.Group) {
  g.traverse((o) => {
    if (o instanceof Line2 || o instanceof THREE.Points) {
      o.geometry.dispose()
      o.material.dispose()
    }
  })
}

const onDome = (d: number, az: number, el: number) => new THREE.Vector3(...direction(az, el)).multiplyScalar(d)

function pathLines(d: number, track: Track, color: THREE.Color, width: number, dash: number) {
  const group = new THREE.Group()
  const at = (i: number) => onDome(d, track.az_deg[i] ?? 0, Math.max(0, track.el_deg[i] ?? 0))
  const up = track.el_deg.map((e) => e > -0.5)
  for (const run of runs(track.t_min.length, (i) => (track.direct_fraction[i] ?? 0) > 0)) {
    const pts: THREE.Vector3[] = []
    for (let i = run.from; i <= run.to; i++) if (up[i]) pts.push(at(i))
    // Blocked stretches draw through terrain: at eye level you see the path run behind the ridge.
    if (pts.length > 1)
      group.add(line(pts, color, run.on ? width : width * 0.6, { dashed: !run.on, dash, opacity: run.on ? 1 : 0.75, depthTest: run.on }))
  }
  return group
}

/**
 * A body's path over the lunar month: thin and faint above the horizon, dashed below it. Both draw through the
 * ground, so a Sun or Earth under the surface still shows where it is. A dot marks every 24 h.
 */
function orbitLines(d: number, pts: SkyPoint[], color: THREE.Color) {
  const group = new THREE.Group()
  for (const run of runs(pts.length, (i) => (pts[i]?.el ?? 0) >= 0)) {
    const seg = pts.slice(run.from, run.to + 1).map((q) => onDome(d, q.az, q.el))
    if (seg.length > 1)
      group.add(line(seg, color, 1, { dashed: !run.on, dash: SKY_DASH * 0.6, opacity: run.on ? 0.45 : 0.4, depthTest: false }))
  }
  const days = pts.filter((_, i) => i % 24 === 0).flatMap((q) => onDome(d, q.az, q.el).toArray())
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(days, 3))
  const dots = new THREE.Points(
    g,
    new THREE.PointsMaterial({ color, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.55, depthTest: false }),
  )
  group.add(dots)
  return group
}

/** Dashed drop from the horizon straight down to a body under it: how far below the surface it is. */
function dropLine(d: number, az: number, el: number, color: THREE.Color) {
  return line([onDome(d, az, 0), onDome(d, az, el)], color, 1, { dashed: true, dash: SKY_DASH * 0.4, opacity: 0.7, depthTest: false })
}

type LabelKey =
  | 'sun'
  | 'comms'
  | 'hit'
  | 'sunFar'
  | 'commsFar'
  | 'site'
  | 'sky'
  | 'scale'
  | 'rim'
  | 'veil'
  | 'hi'
  | 'lo'
  | 'N'
  | 'E'
  | 'S'
  | 'W'
type Labels = Record<LabelKey, HTMLElement | null>
// Placement order: earlier labels win, later ones step down past them.
const KEYS: LabelKey[] = [
  'sun',
  'comms',
  'sunFar',
  'commsFar',
  'hit',
  'site',
  'sky',
  'scale',
  'rim',
  'veil',
  'hi',
  'lo',
  'N',
  'E',
  'S',
  'W',
]
const COMPASS = { N: 0, E: 90, S: 180, W: 270 } as const
type View = 'island' | 'eye'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const rad = (d: number) => (d * Math.PI) / 180

export default function SiteIsland(props: SiteIslandProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const labels = useRef<Labels>(Object.fromEntries(KEYS.map((k) => [k, null])) as Labels)
  const [terrain, setTerrain] = useState<Terrain>()
  const [outer, setOuter] = useState<Terrain>()
  const [failed, setFailed] = useState<string>()
  const [theme, setTheme] = useState(0)
  const [view, setView] = useState<View>('island')
  const api = useRef<{ set: (p: SiteIslandProps) => void; reset: () => void; view: (v: View) => void }>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    let live = true
    setTerrain(undefined)
    setView('island')
    setOuter(undefined)
    const outerTile = hasTerrain(props.siteId, 'outer') ? loadTerrain(props.siteId, 'outer') : Promise.resolve(undefined)
    Promise.all([loadTerrain(props.siteId), outerTile]).then(
      ([t, o]) => {
        if (!live) return
        setOuter(o)
        setTerrain(t)
      },
      (e: Error) => live && setFailed(e.message),
    )
    return () => {
      live = false
    }
  }, [props.siteId])

  useEffect(() => {
    const mo = new MutationObserver(() => setTheme((v) => v + 1))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] })
    return () => mo.disconnect()
  }, [])

  // Scene: built once per terrain and theme; per-instant updates go through api.set.
  useEffect(() => {
    const canvas = canvasRef.current
    const el = host.current
    const layer = overlay.current
    if (!terrain || !canvas || !el || !layer) return
    let renderer: THREE.WebGLRenderer
    try {
      // Log depth: the scene spans metres (eye level) to the 2000 km sky.
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true })
    } catch {
      setFailed('This browser cannot draw 3D (WebGL is unavailable).')
      return
    }
    const p = palette()
    const { fill, skyline, azStep, place: placeName } = latest.current
    const R = terrain.meta.radius_km
    const D = SKY
    const eye = terrain.meta.observer_height_m / 1000
    const ground = terrain.meta.ground_height_m
    const ridgeAt = (az: number) => skyline[Math.round((((az % 360) + 360) % 360) / azStep) % skyline.length] ?? 0
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.localClippingEnabled = true

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(64, 1, 0.05, SKY * 3)
    const home = new THREE.Vector3(...direction(20, 16)).multiplyScalar(R * 3.2)
    camera.position.copy(home)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    // Wheel zoom only in the full view; in the page hero the wheel scrolls the page.
    controls.enableZoom = !!fill
    controls.minDistance = R * 1.2
    controls.maxDistance = R * 7
    controls.minPolarAngle = 0.12
    controls.maxPolarAngle = Math.PI / 2 - 0.03
    controls.target.set(0, R * 0.08, 0)
    controls.update()

    // Eye level: a perspective camera 2 m above the site.
    const eyeCam = new THREE.PerspectiveCamera(70, 1, 0.0015, SKY * 3)
    eyeCam.position.set(0, eye, 0)
    let mode: View = 'island'
    let active: THREE.Camera = camera
    let yaw = 180
    let pitch = 15
    let hfov = 95

    const { group: island, skirt } = terrainMesh(terrain, p)
    scene.add(island)
    if (outer) {
      // With real terrain around it the disc no longer floats: drop the cut-away sides, veil the surround.
      for (const m of skirt) m.visible = false
      scene.add(surroundMesh(outer, terrain, p))
    }
    const moon = terrain.meta.body === 'moon'

    // Sky dome: horizon ring, 30 and 60 degree altitude rings, and the cardinal meridians, all faint.
    const dome = new THREE.Group()
    const meridians = new THREE.Group()
    for (const alt of [0, 30, 60]) {
      const pts = Array.from({ length: 121 }, (_, i) => onDome(D, i * 3, alt))
      dome.add(line(pts, p.faint, alt === 0 ? 1 : 0.75, { opacity: alt === 0 ? 0.55 : 0.28 }))
    }
    for (const az of [0, 90]) {
      // One meridian from horizon to horizon through the zenith.
      const pts = Array.from({ length: 61 }, (_, i) => (i * 3 <= 90 ? onDome(D, az, i * 3) : onDome(D, az + 180, 180 - i * 3)))
      meridians.add(line(pts, p.faint, 0.75, { opacity: 0.22 }))
    }
    // Meridians read as stray vertical lines from the island camera; they only help at eye level.
    meridians.visible = false
    scene.add(dome, meridians)

    // Below the horizon is ground: a shaded lower hemisphere behind everything, so the Sun or Earth under it reads as
    // under the surface, not floating in the dark.
    const underground = new THREE.Mesh(
      new THREE.SphereGeometry(D * 1.05, 96, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: p.side, side: THREE.BackSide, depthWrite: false }),
    )
    underground.renderOrder = -1
    scene.add(underground)

    // The computed skyline (terrain out to the pipeline's full range) traced on the dome: what the village actually sees.
    const ringPts = skyline.map((e, i) => onDome(D * 0.998, i * azStep, e))
    if (ringPts[0]) ringPts.push(ringPts[0].clone())
    const ring = line(ringPts, p.ink, 1.25, { opacity: 0.8, depthTest: false })
    ring.visible = false
    scene.add(ring)
    const top = skyline.indexOf(Math.max(...skyline))
    const skyAnchor = onDome(D, top * azStep, skyline[top] ?? 0)
    // At eye level, fill the skyline down to the horizon so ridges beyond the 12 km model still read as land.
    const band = (() => {
      const pos: number[] = []
      for (let i = 0; i <= skyline.length; i += 2) {
        const az = i * azStep
        pos.push(...onDome(D, az, -2).toArray(), ...onDome(D, az, ridgeAt(az)).toArray())
      }
      const index: number[] = []
      for (let i = 0; i < pos.length / 6 - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(index)
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: p.side, side: THREE.DoubleSide }))
      mesh.visible = false
      return mesh
    })()
    scene.add(band)

    // 5 km ruler just outside the north rim.
    const z = -R * 1.04
    const ruler = new THREE.Group()
    ruler.add(
      line([new THREE.Vector3(-7.5, 0, z), new THREE.Vector3(-2.5, 0, z)], p.ink, 1.25, { depthTest: false }),
      line([new THREE.Vector3(-7.5, 0, z), new THREE.Vector3(-7.5, 0.35, z)], p.ink, 1.25, { depthTest: false }),
      line([new THREE.Vector3(-2.5, 0, z), new THREE.Vector3(-2.5, 0.35, z)], p.ink, 1.25, { depthTest: false }),
    )
    scene.add(ruler)

    const ambient = new THREE.HemisphereLight(0xffffff, 0x404040, 1)
    const light = new THREE.DirectionalLight(0xffffff, 2.2)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    const sc = light.shadow.camera
    sc.left = sc.bottom = -R * 1.05
    sc.right = sc.top = R * 1.05
    sc.near = 1
    sc.far = 120
    light.shadow.bias = -0.001
    light.shadow.normalBias = 0.06
    scene.add(ambient, light, light.target)

    // True angular radii: Sun ~0.27°, Earth from the Moon ~0.95°; the GEO marker is symbolic.
    const sunR = D * Math.tan(rad(0.267)) * SUN_SCALE
    // Sun and Earth draw over the sky lines (depthTest off, drawn last; transparent so renderOrder applies), so no path or sight line cuts through a disc.
    // The Sun is two halves split at the horizon: as it is above, and a ghost in the ground's colour below.
    const above = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
    const below = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)]
    const sunGeo = new THREE.SphereGeometry(sunR, 32, 16)
    const sunMat = new THREE.MeshBasicMaterial({ color: p.sun.clone(), transparent: true, depthTest: false, clippingPlanes: above })
    const sunMesh = new THREE.Mesh(sunGeo, sunMat)
    sunMesh.renderOrder = 10
    const sunUnder = new THREE.Mesh(
      sunGeo,
      new THREE.MeshBasicMaterial({ color: p.side.clone().lerp(p.sun, 0.14), transparent: true, depthTest: false, clippingPlanes: below }),
    )
    sunUnder.renderOrder = 10
    sunMesh.add(sunUnder)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: p.sun, transparent: true, depthWrite: false, clippingPlanes: above }),
    )
    glow.scale.setScalar(sunR * 9)
    sunMesh.add(glow)
    const sunHalo = new THREE.Mesh(
      new THREE.RingGeometry(sunR * 1.5, sunR * 1.75, 48),
      // Drawn through terrain, so a Sun behind the ridge still shows where it is.
      new THREE.MeshBasicMaterial({ color: p.sun, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false }),
    )
    sunHalo.renderOrder = 11
    scene.add(sunMesh, sunHalo)

    const pinMat = new THREE.MeshBasicMaterial({ color: p.ink })
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), pinMat)
    pin.position.set(0, eye + 0.05, 0)
    const pinStem = line([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, eye + 0.05, 0)], p.ink, 1)
    scene.add(pin, pinStem)

    const earthGeo = new THREE.SphereGeometry(D * Math.tan(rad(0.95)) * EARTH_SCALE, 48, 24)
    const earthSun = new THREE.Vector3(0, 1, 0)
    const earthMat = earthMaterial(earthSun, { ground: p.side, tint: p.comms })
    // Transparent (at full alpha) so it sorts with the lines by renderOrder; opaque objects always draw before them.
    earthMat.depthTest = false
    earthMat.transparent = true
    let paths = new THREE.Group()
    let ray = new THREE.Group()
    scene.add(paths, ray)
    let hours: { node: HTMLSpanElement; at: THREE.Vector3 }[] = []
    let sig = ''
    let lastOrbit: SiteIslandProps['orbit']
    let dirty = true
    let anchors: Partial<Record<LabelKey, THREE.Vector3>> = {}
    let peaks: { hi?: THREE.Vector3; lo?: THREE.Vector3 } = {}
    let lastSun: Sun | undefined
    const from = new THREE.Vector3(0, eye, 0)

    /** A sight line from the eye toward az/el: solid to the dome when clear, else solid to where terrain cuts it and dashed beyond. */
    const sight = (az: number, el: number, clear: boolean, color: THREE.Color, to: THREE.Vector3) => {
      const g = new THREE.Group()
      if (clear) {
        g.add(line([from, to], color, 1.5, { opacity: 0.9 }))
        return { group: g, hitKm: undefined, hit: undefined }
      }
      const hitKm = blockedAt(terrain, az, el)
      const hit = new THREE.Vector3(...direction(az, el)).multiplyScalar((hitKm ?? R) / Math.cos(rad(el))).add(from)
      g.add(line([from, hit], color, 1.5), line([hit, to], color, 1, { dashed: true, dash: SKY_DASH, opacity: 0.45 }))
      return { group: g, hitKm, hit }
    }

    const set = (q: SiteIslandProps) => {
      const key = `${q.track?.t_min[0]}|${q.track?.az_deg.length}|${(q.references ?? []).map((r) => r.label).join()}|${q.comms?.kind}|${q.comms?.arc.length}|${q.comms?.arc[0]?.az_deg}`
      if (key !== sig || q.orbit !== lastOrbit) {
        sig = key
        lastOrbit = q.orbit
        scene.remove(paths)
        dispose(paths)
        paths = new THREE.Group()
        for (const h of hours) h.node.remove()
        hours = []
        if (q.orbit) paths.add(orbitLines(D, q.orbit.sun, p.sun), orbitLines(D, q.orbit.earth, p.comms))
        if (q.track) {
          paths.add(pathLines(D, q.track, p.sun, 2, SKY_DASH))
          // Hour marks every 3 h of UTC while the Sun is up. Not on the Moon: its day lasts ~29.5 Earth days, so the
          // Sun barely moves in 24 h and the marks would pile onto one spot.
          const dot = new THREE.SphereGeometry(0.1, 10, 8)
          const dotMat = new THREE.MeshBasicMaterial({ color: p.sun })
          q.track.t_min.forEach((t, i) => {
            const e = q.track?.el_deg[i] ?? -1
            if (moon || t % 180 !== 0 || e < 1) return
            const at = onDome(D, q.track?.az_deg[i] ?? 0, e)
            const m = new THREE.Mesh(dot, dotMat)
            m.scale.setScalar(D * 0.03)
            m.position.copy(at)
            paths.add(m)
            const node = document.createElement('span')
            node.className = 'island-label absolute top-0 left-0 text-sun opacity-0'
            node.textContent = `${String(t / 60).padStart(2, '0')}:00`
            layer.append(node)
            hours.push({ node, at })
          })
        }
        const refs = (q.references ?? []).map((r) => {
          const i = r.track.el_deg.indexOf(Math.max(...r.track.el_deg))
          const pts = r.track.el_deg.flatMap((e, j) => (e > -0.5 ? [onDome(D, r.track.az_deg[j] ?? 0, Math.max(0, e))] : []))
          if (pts.length > 1) paths.add(line(pts, p.faint, 1, { dashed: true, dash: SKY_DASH, opacity: 0.6 }))
          return { label: r.label, el: r.track.el_deg[i] ?? 0, at: onDome(D, r.track.az_deg[i] ?? 180, r.track.el_deg[i] ?? 0) }
        })
        refs.sort((a, b) => b.el - a.el)
        const [hi, lo] = refs
        setText('hi', hi && refs.length > 1 ? `Highest Sun · ${hi.label}` : hi ? hi.label : '')
        setText('lo', lo ? `Lowest Sun · ${lo.label}` : '')
        peaks = { hi: hi?.at, lo: lo?.at }
        if (q.comms) {
          const arc = q.comms.arc.filter((a) => a.el_deg > 0)
          for (const run of runs(arc.length, (i) => (arc[i]?.clearance_deg ?? 0) > 0)) {
            const pts = arc.slice(run.from, run.to + 1).map((a) => onDome(D, a.az_deg, a.el_deg))
            if (pts.length > 1)
              paths.add(
                line(pts, p.comms, run.on ? 1.75 : 1.1, { dashed: !run.on, dash: SKY_DASH, opacity: run.on ? 1 : 0.7, depthTest: run.on }),
              )
          }
        }
        scene.add(paths)
      }

      const next: typeof anchors = { ...peaks }
      if (mode === 'island') {
        next.site = new THREE.Vector3(0, eye + 0.05, 0)
        next.scale = new THREE.Vector3(-5, 0, z)
        if (outer) {
          const [rx, , rz] = direction(335, 0)
          next.rim = new THREE.Vector3(rx * R, sample(terrain, rx * R, rz * R), rz * R)
          next.veil = new THREE.Vector3(...direction(35, 0)).multiplyScalar(R * 1.55)
        }
        for (const [k, az] of Object.entries(COMPASS)) next[k as LabelKey] = new THREE.Vector3(...direction(az, 0)).multiplyScalar(R * 1.1)
      } else {
        next.sky = skyAnchor
        for (const [k, az] of Object.entries(COMPASS)) next[k as LabelKey] = onDome(D, az, ridgeAt(az) + 3)
      }
      setText('site', `${placeName} · ${Math.round(ground)} m`)
      setText('sky', 'Skyline seen from the site', 'Skyline')
      setText('scale', '5 km')
      // Standard mean distances, so the reader knows these are not hovering over the site.
      setText('sunFar', 'about 150 million km away')
      setText('commsFar', q.comms ? 'about 384,000 km away' : '')
      if (outer) {
        setText('rim', `Detailed terrain · ${Math.round(terrain.meta.cell_m)} m grid · ${R} km`, `Detailed · ${R} km`)
        setText('veil', `Coarser terrain · ${Math.round(outer.meta.cell_m)} m grid, veiled`, 'Coarser, veiled')
      }
      for (const k of Object.keys(COMPASS)) setText(k as LabelKey, k)

      if (q.comms) {
        const ref = q.comms.reference
        next.comms = onDome(D, ref.az_deg, ref.el_deg)
        next.commsFar = next.comms
        const by = Math.abs(ref.clearance_deg).toFixed(1)
        const under = Math.abs(ref.el_deg).toFixed(1)
        setText(
          'comms',
          ref.el_deg < 0 && !ref.visible
            ? `Earth · ${under}° below the horizon`
            : `Earth · ${ref.visible ? `in view, ${by}° above the ridge` : `${by}° below the ridge`}`,
          ref.el_deg < 0 && !ref.visible ? `Earth · ${under}° below` : `Earth · ${ref.visible ? 'in view' : 'below the ridge'}`,
        )
      }

      scene.remove(ray)
      dispose(ray)
      ray = new THREE.Group()
      if (q.comms) {
        // Earth moves (libration), so it lives with the per-instant marks.
        const ref = q.comms.reference
        const at = onDome(D, ref.az_deg, ref.el_deg)
        const mark = new THREE.Mesh(earthGeo, earthMat)
        mark.renderOrder = 10
        mark.position.copy(at)
        // Above the horizon but behind the ridge: dimmed, never shown as in view.
        earthMat.uniforms.fade!.value = ref.visible ? 1 : 0.5
        ray.add(mark, sight(ref.az_deg, ref.el_deg, ref.visible, p.comms, at).group)
        if (ref.el_deg < 0) ray.add(dropLine(D, ref.az_deg, ref.el_deg, p.comms))
      }
      const s = q.now
      lastSun = s
      if (s) earthSun.set(...direction(s.az, s.el))
      const sunUp = !!s && s.el > -0.27
      sunMesh.visible = sunHalo.visible = !!s
      pinMat.color.copy(q.inSun ? p.sun : p.ink)
      setText('hit', '')
      if (s) {
        const at = onDome(D, s.az, s.el)
        sunMesh.position.copy(at)
        sunHalo.position.copy(at)
        // The Sun shines either way; dim it when the site can't see it, so the scene never implies direct sun.
        // Dimmed, not see-through: lines behind the disc stay hidden.
        sunMat.color.copy(p.sun).multiplyScalar(q.inSun ? 1 : 0.45)
        glow.material.opacity = q.inSun ? 1 : sunUp ? 0.25 : 0
        if (!sunUp) ray.add(dropLine(D, s.az, s.el, p.sun))
        next.sun = at
        next.sunFar = at
        if (sunUp) {
          const r = sight(s.az, s.el, q.inSun, p.sun, at)
          ray.add(r.group)
          if (r.hit) {
            next.hit = r.hit
            if (r.hitKm != null) {
              // Right triangle under the cut: how far the ridge is, and how far it rises above the eye.
              const above = Math.round((heightAt(terrain, r.hit.x, r.hit.z) - eye) * 1000)
              const base = new THREE.Vector3(r.hit.x, eye, r.hit.z)
              ray.add(line([from, base], p.faint, 1, { dashed: true, opacity: 0.8 }), line([base, r.hit], p.faint, 1, { opacity: 0.8 }))
              const far = r.hitKm < 1 ? `${Math.max(10, Math.round((r.hitKm * 1000) / 10) * 10)} m` : `${r.hitKm.toFixed(1)} km`
              const what = r.hitKm < 0.3 ? 'Slope' : 'Ridge'
              setText('hit', `${what} ${far} away, ${above} m above you`, `${what} ${far} · +${above} m`)
            } else setText('hit', `Blocked by terrain beyond ${R} km`, `Ridge beyond ${R} km`)
          }
        }
        const ridge = q.horizon != null ? `, ridge ${q.horizon.toFixed(1)}°` : ''
        const up = `Sun ${s.el.toFixed(1)}° up`
        setText(
          'sun',
          !sunUp
            ? `Sun ${Math.abs(s.el).toFixed(1)}° below the horizon`
            : q.inSun
              ? `${up} · in direct sun${ridge}`
              : `${up} · hidden by the ridge${ridge}`,
          !sunUp ? `Sun ${Math.abs(s.el).toFixed(1)}° below` : `${up} · ${q.inSun ? 'in sun' : 'hidden'}`,
        )
      } else setText('sun', '')
      scene.add(ray)

      if (sunUp && s) {
        light.position.copy(new THREE.Vector3(...direction(s.az, s.el)).multiplyScalar(60))
        // On Earth, low sunlight is dimmed by the air; on the Moon it arrives at full strength at any angle.
        light.intensity = moon ? 2.6 : 2.4 * Math.min(1, Math.max(0.15, Math.sin(rad(s.el)) * 3))
        // No air on the Moon: shadows are near black, so the fill light stays low there.
        ambient.intensity = moon ? 0.3 : p.dark ? 0.55 : 0.9
      } else {
        light.intensity = 0
        // Lunar night is lit only by earthshine; a dim fill stands in for it so the ground stays readable.
        ambient.intensity = moon ? 0.4 : p.dark ? 0.35 : 0.7
      }
      anchors = next
      dirty = true
    }

    // Each label keeps a long and a short form; place() shows the short one on narrow screens.
    function setText(k: LabelKey, text: string, short = text) {
      const node = labels.current[k]
      if (!node) return
      node.dataset.long = text
      node.dataset.short = short
      const t = w < 640 ? short : text
      if (node.textContent !== t) node.textContent = t
    }

    const v = new THREE.Vector3()
    const project = (a: THREE.Vector3) => {
      v.copy(a).project(active)
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 || v.z < -1 }
    }
    const place = () => {
      const boxes: { x0: number; y0: number; x1: number; y1: number }[] = []
      // The toolbar sits over the canvas; labels step down past it like any other label.
      const bar = toolbar.current
      if (bar)
        boxes.push({
          x0: bar.offsetLeft,
          y0: bar.offsetTop,
          x1: bar.offsetLeft + bar.offsetWidth,
          y1: bar.offsetTop + bar.offsetHeight + 4,
        })
      // The floating hint is fixed text; a scene label that would print over it gives way instead.
      const note = hintRef.current
      const hidden = note?.offsetParent
        ? {
            x0: note.offsetLeft - 4,
            y0: note.offsetTop - 4,
            x1: note.offsetLeft + note.offsetWidth + 4,
            y1: note.offsetTop + note.offsetHeight + 4,
          }
        : undefined
      for (const k of KEYS) {
        const node = labels.current[k]
        if (!node) continue
        const a = anchors[k]
        const t = (w < 640 ? node.dataset.short : node.dataset.long) ?? ''
        if (node.textContent !== t) node.textContent = t
        if (!a || !t) {
          node.style.opacity = '0'
          continue
        }
        const { x, y, behind } = project(a)
        // A body out of frame has nothing on screen to label: clamped to the edge, its label would sit on the page's text.
        const outside = x < 0 || x > w || y < 0 || y > h
        const bw = node.offsetWidth
        const bh = node.offsetHeight
        const compass = k.length === 1
        const centred = compass || k === 'hit' || k === 'scale'
        // Labels on sky paths sit above their line, so the line never runs through the text.
        const onPath = k === 'sun' || k === 'comms' || k === 'hi' || k === 'lo'
        // Clears Earth's drawn disc.
        const gap = k === 'sun' ? 18 : k === 'comms' ? 40 : 12
        let x0 = centred ? x - bw / 2 : x > w - bw - 40 || k === 'site' ? x - gap - bw : x + gap
        const lift = k === 'sun' ? 12 : 6
        let y0 =
          k === 'hit' || k === 'scale'
            ? y + 10
            : onPath
              ? // No room above the frame's top edge: flip below the line instead.
                y - bh - lift < 4 && y >= 0
                ? y + lift
                : y - bh - lift
              : compass && mode === 'eye'
                ? y - bh
                : y - bh / 2
        x0 = clamp(x0, 4, w - bw - 4)
        const covers = (b: (typeof boxes)[number]) => x0 < b.x1 && x0 + bw > b.x0 && y0 < b.y1 && y0 + bh > b.y0
        if (outside) {
          node.style.opacity = '0'
          continue
        }
        if (!compass) {
          for (let moved = true; moved; ) {
            moved = false
            for (const b of boxes) {
              if (covers(b)) {
                y0 = b.y1 + 2
                moved = true
              }
            }
          }
          boxes.push({ x0, y0, x1: x0 + bw, y1: y0 + bh })
        }
        // Compass letters are placed last and give way to any label they would print over.
        node.style.opacity = behind || (compass && boxes.some(covers)) || (hidden && covers(hidden)) ? '0' : '1'
        node.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`
      }
      for (const { node, at } of hours) {
        const { x, y, behind } = project(at)
        const x0 = x - node.offsetWidth / 2
        const y0 = y + 8
        // Hour marks are the least important text: they give way to any label they would sit under.
        const under = [...boxes, ...(hidden ? [hidden] : [])].some(
          (b) => x0 < b.x1 && x0 + node.offsetWidth > b.x0 && y0 < b.y1 && y0 + node.offsetHeight > b.y0,
        )
        node.style.opacity = behind || under ? '0' : '0.85'
        node.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`
      }
    }

    let w = 0
    let h = 0
    const aimEye = () => {
      const aspect = w / h
      eyeCam.aspect = aspect
      eyeCam.fov = Math.min(80, (2 * Math.atan(Math.tan(rad(hfov) / 2) / aspect) * 180) / Math.PI)
      eyeCam.updateProjectionMatrix()
      eyeCam.lookAt(from.clone().add(new THREE.Vector3(...direction(yaw, pitch))))
      dirty = true
    }
    const resize = () => {
      w = el.clientWidth
      h = el.clientHeight
      renderer.setSize(w, h, false)
      // The full (taller) frame's aspect: the view offset then shows its top part without stretching.
      camera.aspect = (w / h) * FRAME_SHOWN
      // Show the top part of a taller frame (a lens shift): terrain low, sky above, no extra distortion.
      camera.setViewOffset(w, h / FRAME_SHOWN, 0, 0, w, h)
      camera.updateProjectionMatrix()
      aimEye()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const faceSun = () => {
      const s = lastSun
      // A Sun just under the horizon is still worth facing: you see where it is below the ground.
      yaw = s && s.el > -12 ? s.az : 180
      // Aim a little above the ridge in that direction, so the sky and the Sun's path fill the frame.
      pitch = clamp(ridgeAt(yaw) + 6, 8, 50)
      aimEye()
    }
    const switchTo = (next: View) => {
      if (next === mode) return
      mode = next
      const eyeOn = next === 'eye'
      active = eyeOn ? eyeCam : camera
      controls.enabled = !eyeOn
      band.visible = ring.visible = eyeOn
      meridians.visible = eyeOn
      pin.visible = pinStem.visible = ruler.visible = !eyeOn
      canvas.style.cursor = ''
      if (eyeOn) faceSun()
      set(latest.current)
    }

    // Double-click eases back to the home view (or faces the Sun at eye level).
    /**
     * Home view: from behind the site, looking toward the Sun (or the comms target when the Sun is down), the way the
     * panorama faces it, high enough to see the terrain and with the vertical field sized so the target stays in frame.
     */
    const frameHome = () => {
      const s = lastSun
      const ref = latest.current.comms?.reference
      const up = !!s && s.el > -12
      // Face the Sun (even a little under the horizon); with a comms target, face between the two when both fit in one view.
      let face = up && s ? s.az : ref ? ref.az_deg : 180
      let top = Math.max(8, up && s ? s.el : (ref?.el_deg ?? 0))
      const focus = latest.current.focus?.target
      if (focus === 'earth' && ref) {
        face = ref.az_deg
        top = Math.max(8, ref.el_deg)
      } else if (focus === 'sun' && up && s) {
        face = s.az
        top = Math.max(8, s.el)
      } else if (up && s && ref) {
        const gap = ((ref.az_deg - s.az + 540) % 360) - 180
        if (Math.abs(gap) < 60) {
          face = s.az + gap / 2
          top = Math.max(top, ref.el_deg)
        }
      }
      // Headroom for the labels that sit above the Sun and the comms target.
      top += 5
      const half = clamp(top + 7, 28, 44)
      camera.fov = 2 * half
      const camEl = clamp(half - top, 6, 24)
      const narrow = Math.max(1, 1.3 / (w / h))
      home.copy(controls.target).add(new THREE.Vector3(...direction(face + 180, camEl)).multiplyScalar(R * 2.2 * narrow))
      camera.updateProjectionMatrix()
    }
    let tween: { from: THREE.Vector3; start: number } | undefined
    const reset = () => {
      if (mode === 'eye') {
        hfov = 95
        return faceSun()
      }
      // Flush leftover drag momentum first, or damping keeps turning the camera after the tween lands.
      controls.enableDamping = false
      controls.update()
      frameHome()
      if (reducedMotion().matches) {
        camera.position.copy(home)
        controls.enableDamping = true
        dirty = true
        return
      }
      tween = { from: camera.position.clone(), start: performance.now() }
    }
    canvas.addEventListener('dblclick', reset)

    // Look around at eye level: drag the view, wheel to change the field of view (full view only).
    let drag: { x: number; y: number } | undefined
    const down = (e: PointerEvent) => {
      if (mode !== 'eye') return
      drag = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag || mode !== 'eye') return
      yaw -= ((e.clientX - drag.x) / w) * hfov
      pitch = clamp(pitch + ((e.clientY - drag.y) / h) * eyeCam.fov, -15, 85)
      drag = { x: e.clientX, y: e.clientY }
      aimEye()
    }
    const up = () => {
      drag = undefined
    }
    const wheel = (e: WheelEvent) => {
      if (mode !== 'eye' || !fill) return
      e.preventDefault()
      hfov = clamp(hfov + e.deltaY * 0.05, 30, 110)
      aimEye()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })

    const ease = (x: number) => 1 - (1 - x) ** 4
    let frame = 0
    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
    })
    io.observe(el)
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!visible) return
      if (tween) {
        const k = ease(Math.min(1, (performance.now() - tween.start) / 450))
        camera.position.lerpVectors(tween.from, home, k)
        if (k === 1) {
          tween = undefined
          controls.enableDamping = true
        }
        dirty = true
      }
      const moved = mode === 'island' && controls.update()
      if (moved || dirty) {
        sunHalo.lookAt(active.position)
        scene.traverse((o) => {
          if (o instanceof Line2) o.material.resolution.set(w, h)
        })
        renderer.render(scene, active)
        place()
        dirty = false
      }
    }
    controls.addEventListener('change', () => {
      dirty = true
    })
    api.current = { set, reset, view: switchTo }
    set(latest.current)
    frameHome()
    camera.position.copy(home)
    controls.update()
    tick()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('dblclick', reset)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      for (const hr of hours) hr.node.remove()
      controls.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof Line2) {
          o.geometry.dispose()
          const m = o.material as THREE.Material | THREE.Material[]
          for (const x of Array.isArray(m) ? m : [m]) x.dispose()
        }
      })
      renderer.dispose()
      api.current = null
    }
  }, [terrain, outer, theme])

  useEffect(() => {
    api.current?.set(props)
  })

  // "Look at the Sun / Earth": re-aim the home view each time the focus is asked for again.
  useEffect(() => {
    if (props.focus) api.current?.reset()
  }, [props.focus?.nonce])

  const toggleView = () => {
    const next = view === 'eye' ? 'island' : 'eye'
    api.current?.view(next)
    setView(next)
  }

  const share = terrain?.meta.skyline_inside_share
  const L = (k: LabelKey, className: string) => (
    <span
      key={k}
      ref={(n) => {
        labels.current[k] = n
      }}
      className={`island-label absolute top-0 left-0 opacity-0 ${className}`}
    />
  )
  const hint =
    view === 'eye'
      ? `Eye level at the site, 2 m up. Drag to look around; double-click to face the Sun. The white line is the computed skyline, terrain out to ${props.skylineKm} km.`
      : `Real terrain, ${terrain?.meta.radius_km ?? ''} km around the site, at true height. Drag to orbit${props.fill ? ', scroll to zoom' : ''}; double-click to reset. The Sun is drawn ${SUN_SCALE}× and Earth ${EARTH_SCALE}× their apparent size.${
          props.orbit ? ' Faint lines trace the whole lunar month, a dot a day; dashed where it runs under the ground.' : ''
        }${
          share != null && share < 0.995
            ? ` ${Math.round(share * 100)}% of the skyline’s ridges are inside this model; the white line includes the rest.`
            : ''
        }`

  return (
    <figure className={`relative m-0 ${props.fill ? 'h-full' : ''}`}>
      <div
        ref={host}
        className={`relative select-none ${props.fill ? 'h-full touch-none' : `touch-pan-y border-y border-line ${props.className ?? 'h-[520px]'}`}`}
      >
        {failed ? (
          <p className="grid h-full place-items-center px-6 text-center text-sm text-ink-muted">
            {failed} The panorama shows the same sky.
          </p>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={props.label}
              className={`size-full transition-opacity duration-500 ${view === 'eye' ? 'cursor-move' : 'cursor-grab active:cursor-grabbing'} ${terrain ? 'opacity-100' : 'opacity-0'}`}
            />
            <div ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              {L('sun', 'text-sun')}
              {L('hit', 'text-sun')}
              {L('comms', 'text-comms')}
              {L('site', 'text-ink')}
              {L('sky', 'text-ink-muted')}
              {L('scale', 'text-ink-muted')}
              {L('rim', 'text-ink')}
              {L('veil', 'text-ink-faint')}
              {L('hi', 'text-ink-faint')}
              {L('lo', 'text-ink-faint')}
              {(['N', 'E', 'S', 'W'] as const).map((k) => L(k, 'text-ink-muted'))}
            </div>
            <div
              ref={toolbar}
              className={`absolute right-4 flex items-center gap-1.5 ${props.fill ? 'bottom-44 sm:top-4 sm:right-(--page-edge) sm:bottom-auto' : 'top-4 sm:right-6'}`}
            >
              <Button
                variant="secondary"
                size="sm"
                icon={view === 'eye' ? CubeIcon : PersonSimpleIcon}
                onClick={toggleView}
                disabled={!terrain}
              >
                {view === 'eye' ? 'Island view' : 'Stand here'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                shape="square"
                icon={ArrowCounterClockwiseIcon}
                aria-label={view === 'eye' ? 'Face the Sun' : 'Reset view'}
                onClick={() => api.current?.reset()}
                disabled={!terrain}
              />
              {props.tools}
            </div>
          </>
        )}
      </div>
      {!failed &&
        (props.fill ? (
          <p
            ref={hintRef}
            className="scene-text pointer-events-none absolute bottom-24 left-4 hidden max-w-[44ch] text-xs text-ink sm:left-(--page-edge) md:block"
          >
            {hint}
          </p>
        ) : (
          <figcaption className="mx-auto mt-3 max-w-7xl px-4 text-xs leading-relaxed text-ink-faint text-pretty sm:px-6">{hint}</figcaption>
        ))}
    </figure>
  )
}
