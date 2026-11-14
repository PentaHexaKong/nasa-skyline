import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { earthMaterial, glowTexture, type Palette, palette, surroundMesh, terrainMesh } from '~/components/SiteIsland'
import type { Terrain } from '~/lib/data'
import { direction } from '~/lib/sky'
import type { SkyNow } from './sky'
import { type Rgb, useDark } from './terrain'

export type Vec = [number, number, number]
/** Fills `root` with the scene. May return a function to run every frame, given the camera. */
export type Build = (root: THREE.Group, dark: boolean) => undefined | ((camera: THREE.PerspectiveCamera) => void)

/** The sky sits on a sphere far beyond the terrain, as in Visualize, so the Sun and Earth read as distant. */
const SKY_KM = 400
// Drawn larger than their true angular size so they stay visible, by the same factors as Visualize.
export const SUN_SCALE = 3
export const EARTH_SCALE = 2
const onDome = (az: number, el: number, d = SKY_KM) => new THREE.Vector3(...direction(az, el)).multiplyScalar(d)

/** Where the camera starts: `dist` km from the site, `el` degrees up, looking `turn` degrees off the Sun's azimuth. */
export function facing(sunAz: number, dist: number, el: number, turn = 20): Vec {
  return new THREE.Vector3(...direction(sunAz + 180 + turn, el)).multiplyScalar(dist).toArray() as Vec
}

/**
 * Sunlight and sky for a site scene, the way Visualize draws them: altitude rings on a far dome, the Sun (dimmed when
 * terrain hides it from the site), Earth with its real phase, and one shadow-casting light from the Sun.
 * `box` is the half-width of the terrain and its lowest point below the site, in km: the shadow map covers all of it,
 * so the surround has no edge where shadows stop.
 */
function siteSky(scene: THREE.Scene, box: { half: number; low: number }) {
  const p = palette()
  const sky = new THREE.Group()
  for (const alt of [0, 30, 60]) {
    const ring = Array.from({ length: 121 }, (_, i) => onDome(i * 3, alt))
    sky.add(polyline(ring, p.faint, { opacity: alt === 0 ? 0.55 : 0.25 }))
  }
  const sunR = SKY_KM * Math.tan((0.267 * Math.PI) / 180) * SUN_SCALE
  const sunMat = new THREE.MeshBasicMaterial({ color: p.sun, transparent: true })
  const sun = new THREE.Mesh(new THREE.SphereGeometry(sunR, 32, 16), sunMat)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: p.sun, transparent: true, depthWrite: false }))
  glow.scale.setScalar(sunR * 9)
  sun.add(glow)
  // Drawn through terrain, so a Sun behind the ridge still shows where it is.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(sunR * 1.5, sunR * 1.75, 48),
    new THREE.MeshBasicMaterial({ color: p.sun, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false }),
  )
  const earthSun = new THREE.Vector3(0, 1, 0)
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_KM * Math.tan((0.95 * Math.PI) / 180) * EARTH_SCALE, 48, 24),
    earthMaterial(earthSun),
  )
  sky.add(sun, halo, earth)

  const ambient = new THREE.HemisphereLight(0xffffff, 0x404040, 0.4)
  const light = new THREE.DirectionalLight(0xffffff, 2.6)
  light.castShadow = true
  light.shadow.mapSize.set(4096, 4096)
  light.shadow.bias = -0.0005
  light.shadow.normalBias = 0.04
  const mid = box.low / 2
  light.target.position.set(0, mid, 0)
  scene.add(sky, ambient, light, light.target)

  const set = (now: SkyNow) => {
    const s = now.sun
    // Terrain is curved (the drop d²/2R), so a Sun a little below the flat horizon still lights a hilltop.
    const up = !!s && s.el > -3
    sun.visible = halo.visible = !!s
    if (s) {
      sun.position.copy(onDome(s.az, Math.max(-1, s.el)))
      halo.position.copy(sun.position)
      // The Sun shines either way; dim it when the site can't see it, so the scene never implies direct sun.
      sunMat.opacity = now.inSun ? 1 : 0.4
      glow.material.opacity = now.inSun ? 1 : 0.25
      earthSun.set(...direction(s.az, s.el))
    }
    const e = now.earth
    earth.visible = !!e && e.el > -2
    if (e) earth.position.copy(onDome(e.az, e.el))
    if (up && s) {
      const el = (Math.max(0.3, Math.abs(s.el)) * Math.PI) / 180
      light.position
        .set(...direction(s.az, s.el))
        .multiplyScalar(box.half * 2.5)
        .add(light.target.position)
      // At a low Sun the ground squeezes into a thin band of the shadow map; fit the band so the map keeps its detail.
      const cam = light.shadow.camera
      cam.left = cam.bottom = -box.half
      cam.right = cam.top = box.half
      const band = (-box.low / 2) * Math.cos(el) + box.half * Math.sin(el) + 0.4
      cam.bottom = -band
      cam.top = band
      cam.near = 1
      cam.far = box.half * 5
      cam.updateProjectionMatrix()
      light.intensity = 2.6
      // No air on the Moon, so shadows are near black; the fill stays just high enough to read the data drawn on them.
      ambient.intensity = 0.55
    } else {
      light.intensity = 0
      // Lunar night is lit only by earthshine; a dim fill stands in for it so the ground stays readable.
      ambient.intensity = 0.6
    }
  }
  const remove = () => {
    scene.remove(sky, ambient, light, light.target)
    light.dispose()
    sky.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      for (const m of [mesh.material].flat()) m?.dispose()
    })
  }
  return { set, halo, remove }
}

/** A three.js canvas with orbit controls. The camera survives rebuilds, so changing a control never resets the view. */
export function Stage({
  build,
  deps,
  label,
  eye,
  aim = [0, 0, 0],
  far = 400,
  fov = 32,
  sky,
  shadowBox,
  lights = true,
}: {
  build: Build
  deps: unknown[]
  label: string
  eye: Vec
  aim?: Vec
  far?: number
  fov?: number
  /** Lights the scene from the real Sun and draws the sky. Without it the build brings its own light, or `lights` adds a plain one. */
  sky?: SkyNow
  shadowBox?: { half: number; low: number }
  lights?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const dark = useDark()
  const live = useRef<{
    root: THREE.Group
    scene: THREE.Scene
    controls: OrbitControls
    frame?: (camera: THREE.PerspectiveCamera) => void
    sky?: ReturnType<typeof siteSky>
  }>(null)
  const skyRef = useRef(sky)
  skyRef.current = sky

  useEffect(() => {
    const el = host.current
    if (!el) return
    // Log depth: the scenes span metres of mast to a sky hundreds of kilometres away.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'absolute inset-0 size-full'
    el.append(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(fov, 1, far / 1e6, far)
    camera.position.set(...eye)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(...aim)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.95
    const root = new THREE.Group()
    scene.add(root)
    if (skyRef.current) controls.maxPolarAngle = Math.PI / 2 - 0.02
    else if (lights) {
      const sun = new THREE.DirectionalLight(0xffffff, 2.4)
      sun.position.set(-3, 4, -2)
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x222222, 0.9))
    }
    live.current = { root, scene, controls }
    const size = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    size.observe(el)
    let raf = 0
    const loop = () => {
      controls.update()
      live.current?.frame?.(camera)
      live.current?.sky?.halo.lookAt(camera.position)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      size.disconnect()
      controls.dispose()
      clear(root)
      live.current?.sky?.remove()
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
        for (const m of [mesh.material].flat()) m?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
      live.current = null
    }
  }, [])

  useEffect(() => {
    const stage = live.current
    if (!stage) return
    clear(stage.root)
    stage.frame = build(stage.root, dark)
  }, [dark, ...deps])

  // The sky takes its colours from the theme, so it is rebuilt with it.
  useEffect(() => {
    const stage = live.current
    if (!stage || !skyRef.current || !shadowBox) return
    const made = siteSky(stage.scene, shadowBox)
    made.set(skyRef.current)
    stage.sky = made
    return () => {
      made.remove()
      stage.sky = undefined
    }
  }, [dark])

  useEffect(() => {
    if (sky) live.current?.sky?.set(sky)
  }, [sky?.sun?.az, sky?.sun?.el, sky?.inSun, sky?.earth?.az, sky?.earth?.el, sky?.earth?.visible])

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className="relative aspect-[4/3] w-full cursor-grab touch-none outline -outline-offset-1 outline-line active:cursor-grabbing"
    />
  )
}

function clear(root: THREE.Group) {
  // A build may leave `stop` behind to cancel work still loading.
  root.userData.stop?.()
  root.userData.stop = undefined
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.userData.shared) return
    mesh.geometry?.dispose()
    for (const m of [mesh.material].flat()) m?.dispose()
  })
  root.clear()
}

const loader = new GLTFLoader().setDRACOLoader(
  // ponytail: the Draco decoder comes from Google's CDN; copy it into the app if a model with Draco is kept.
  new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'),
)
const models = new Map<string, Promise<THREE.Object3D>>()

/** A glTF model, centred on its base and scaled so its longest side is 1. Loaded once; callers clone it. */
export function loadModel(url: string) {
  let hit = models.get(url)
  if (!hit) {
    hit = loader.loadAsync(url).then(({ scene }) => {
      const box = new THREE.Box3().setFromObject(scene)
      const span = box.getSize(new THREE.Vector3())
      const mid = box.getCenter(new THREE.Vector3())
      scene.position.set(-mid.x, -box.min.y, -mid.z)
      const unit = new THREE.Group().add(scene)
      unit.scale.setScalar(1 / Math.max(span.x, span.y, span.z))
      unit.traverse((o) => {
        o.userData.shared = true
      })
      return new THREE.Group().add(unit)
    })
    models.set(url, hit)
  }
  return hit.then((m) => m.clone())
}

export const rgb = (c: Rgb) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace)

/**
 * The terrain exactly as Visualize draws it (the same mesh, contours and rim), in kilometres: x east, y up
 * from the site's ground, z south. `tint(col, row)` may colour a vertex; untinted ground keeps the land colour.
 * With `outer`, the coarse terrain around the disc is drawn veiled, as in Visualize, and casts shadows onto it.
 */
export function sharedTerrain(t: Terrain, p: Palette, tint?: (col: number, row: number) => THREE.Color | undefined, outer?: Terrain) {
  const made = terrainMesh(t, p)
  if (tint) {
    const land = made.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    const { n } = t.meta
    const colors = new Float32Array(n * n * 3)
    for (let i = 0; i < n * n; i++) (tint(i % n, Math.floor(i / n)) ?? p.land).toArray(colors, i * 3)
    land.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    land.material.color.set(0xffffff)
    land.material.vertexColors = true
  }
  if (outer) {
    for (const m of made.skirt) m.visible = false
    made.group.add(surroundMesh(outer, t, p), shadowCaster(outer, t))
  }
  return made.group
}

/**
 * The surround as an invisible shadow caster, so ridges beyond the detailed disc shade it, as they do the real site.
 * Inside the disc it drops away, so the coarse grid never shades the detailed one.
 */
function shadowCaster(outer: Terrain, inner: Terrain) {
  const { n, radius_km: r } = outer.meta
  const R = inner.meta.radius_km
  const g = inner.meta.ground_height_m
  const geo = new THREE.PlaneGeometry(2 * r, 2 * r, n - 1, n - 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const inside = Math.hypot(pos.getX(i), pos.getZ(i)) < R
    pos.setY(i, inside ? -20 : ((outer.heights[i] ?? 0) - g) / 1000 - 0.01)
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
  mesh.castShadow = true
  return mesh
}

/** Half-width and lowest point of all the terrain drawn, in km from the site: what the shadow map must cover. */
export const shadowBoxOf = (t: Terrain, outer?: Terrain) => {
  const m = (outer ?? t).meta
  return { half: m.radius_km * 1.02, low: (Math.min(m.min_m, t.meta.min_m) - t.meta.ground_height_m) / 1000 }
}

export function polyline(points: THREE.Vector3[], color: THREE.Color, opts: { dashed?: boolean; opacity?: number } = {}) {
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  const mat = opts.dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.1, transparent: true, opacity: opts.opacity ?? 1 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 1 })
  const line = new THREE.Line(geo, mat)
  if (opts.dashed) line.computeLineDistances()
  return line
}
