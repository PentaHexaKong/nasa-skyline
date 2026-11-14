import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { afterGlide } from '~/components/moonBridge'
import { palette } from '~/components/SiteIsland'
import type { Summary, Terrain, Track } from '~/lib/data'
import { hasTerrain, loadTerrain } from '~/lib/data'
import { clearShare, downsample, extremes, lineOfSight, nearest, type Spot } from '~/lib/landscape'
import { reducedMotion } from '~/lib/motion'
import { longDate, minuteLabel } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

export type LandscapeMode = 'ground' | 'sun' | 'earth'

/** Where the Sun and Earth stand at the moment the landscape is lit for, from the pipeline's tracks. */
export type Moment = { date: string; minute: number; sun: { az: number; el: number }; earth: { az: number; el: number } | null }

/**
 * The lowest Sun of the first lunar month that still reaches the site: long shadows, so the tile shows light and shadow
 * side by side. Earth is read at the same hour from the hourly Earth track.
 */
export function pickMoment(tracks: Record<string, Track>): Moment | null {
  let best: Moment | null = null
  for (const date of Object.keys(tracks).sort().slice(0, 30)) {
    const tr = tracks[date]
    if (!tr) continue
    tr.t_min.forEach((t, i) => {
      const el = tr.el_deg[i] ?? -90
      const lit = (tr.direct_fraction[i] ?? 0) > 0.5
      if (!lit || el < 0.3 || t % 60 !== 0) return
      if (best && el >= best.sun.el) return
      const e = tr.earth?.t_min.indexOf(t) ?? -1
      const earth = tr.earth && e >= 0 ? { az: tr.earth.az_deg[e] ?? 0, el: tr.earth.el_deg[e] ?? 0 } : null
      best = { date, minute: t, sun: { az: tr.az_deg[i] ?? 0, el }, earth }
    })
  }
  return best
}

type Pin = { spot: Spot; label: string }

/** What the trace found: which ground sees the Sun and Earth at the moment, and the places worth pointing at. */
type Traced = {
  /** 1 where the Sun is in view, 0 where terrain inside the tile hides it, on a grid `cn` cells across. */
  sunMask: Uint8Array
  earthMask: Uint8Array | null
  cn: number
  pins: Record<LandscapeMode, Pin[]>
  sunShare: number
  earthShare: number | null
  /** The tile's width, km, from the terrain's metadata. */
  km: number
}

function trace(t: Terrain, m: Moment): Traced {
  const coarse = downsample(t, 2)
  const cn = coarse.meta.n
  const sunMask = lineOfSight(coarse, m.sun.az, m.sun.el)
  const earthMask = m.earth ? lineOfSight(coarse, m.earth.az, m.earth.el) : null
  const { high, low, site } = extremes(t)
  const rel = (h: number) => `${h >= site.height ? '+' : '−'}${Math.round(Math.abs(h - site.height))} m`
  const scale = (s: Spot | null) => s && { ...s, row: s.row * 2, col: s.col * 2 }
  const shadow = scale(nearest(sunMask, cn, 0, 6))
  const bright = scale(nearest(sunMask, cn, 1, 6))
  const hidden = earthMask ? scale(nearest(earthMask, cn, 0, 6)) : null
  const seen = earthMask ? scale(nearest(earthMask, cn, 1, 6)) : null
  return {
    sunMask,
    earthMask,
    cn,
    km: 2 * t.meta.radius_km,
    sunShare: clearShare(sunMask),
    earthShare: earthMask ? clearShare(earthMask) : null,
    pins: {
      ground: [
        { spot: high, label: `Higher ground · ${rel(high.height)}` },
        { spot: low, label: `Lower ground · ${rel(low.height)}` },
      ],
      sun: [
        ...(shadow ? [{ spot: shadow, label: 'In shadow at this moment' }] : []),
        ...(bright ? [{ spot: bright, label: 'In sunlight at this moment' }] : []),
      ],
      earth: [
        ...(seen ? [{ spot: seen, label: 'Earth in view' }] : []),
        ...(hidden ? [{ spot: hidden, label: 'Earth behind terrain' }] : []),
      ],
    },
  }
}

/** A unit vector toward an azimuth (clockwise from north) and elevation, in the scene's frame: x east, y up, z south. */
function toward(azDeg: number, elDeg: number) {
  const a = (azDeg * Math.PI) / 180
  const e = (elDeg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
}

/** A traced mask as a texture: row 0 (north) at v = 0, filtered so shadow edges come out soft. */
function maskTexture(mask: Uint8Array, n: number) {
  const tex = new THREE.DataTexture(
    mask.map((v) => v * 255),
    n,
    n,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  )
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** A heightmap as a mesh, km, heights from the site's own ground (x east, z south: row 0 lands at z = -r). */
function surface(t: Terrain, ground: number, drop = 0) {
  const { n, radius_km: r } = t.meta
  const geo = new THREE.PlaneGeometry(2 * r, 2 * r, n - 1, n - 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) pos.setY(i, ((t.heights[i] ?? 0) - ground) / 1000 - drop)
  geo.computeVertexNormals()
  return geo
}

const VERTEX = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying float vDist;
  void main() {
    vPos = position;
    vNormal = normal;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vDist = -view.z;
    gl_Position = projectionMatrix * view;
  }
`

/**
 * Regolith lit per pixel. Three looks blend by `uW` (ground, sunlight, Earth) so a change of question crossfades:
 * - ground: a reading light from the north-west, for the shape only;
 * - sunlight: the Sun where it really stands at the moment, its light cut by the traced shadow mask;
 * - Earth: the shape, dimmed, with the ground that has Earth in direct view washed in the comms colour.
 * The masks only cover the detailed tile; the coarse ring around it shows shape only, and fades where its data ends.
 */
const FRAGMENT = /* glsl */ `
  uniform vec3 uW;
  uniform float uExposure;
  uniform vec3 uRead;
  uniform vec3 uSun;
  uniform vec3 uSunTint;
  uniform vec3 uComms;
  uniform float uR;
  uniform float uOuterR;
  uniform float uOuter;
  uniform sampler2D uSunMask;
  uniform sampler2D uEarthMask;
  uniform float uHasEarth;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying float vDist;

  void main() {
    vec3 N = normalize(vNormal);
    vec2 t = (vPos.xz + uR) / (2.0 * uR);
    float inside = step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0);
    // The ring underneath gives way to the detailed tile wherever the tile has data, overlapping it by a cell so no
    // crack opens along the seam (the ring sits a few metres lower there).
    float core = step(0.004, t.x) * step(t.x, 0.996) * step(0.004, t.y) * step(t.y, 0.996);
    if (uOuter > 0.5 && core > 0.5) discard;

    float albedo = 0.62;
    float read = max(dot(N, uRead), 0.0);
    vec3 ground = vec3(albedo * (0.05 + 1.05 * read));

    // Grazing light: ground that faces the Sun at all reads bright, as the eye adapts to it at the pole.
    float facing = dot(N, uSun);
    float lit = smoothstep(-0.02, 0.18, facing) * (0.6 + 0.4 * clamp(facing * 3.0, 0.0, 1.0));
    float clear = mix(1.0, texture2D(uSunMask, t).r, inside);
    vec3 sun = uSunTint * albedo * (0.025 + 1.25 * lit * clear);

    float seen = inside * uHasEarth * texture2D(uEarthMask, t).r;
    // A glaze over the shaded ground, not a fill, so the relief still reads where Earth is in view.
    vec3 earth = mix(ground * 0.4, ground * (0.35 + 0.9 * uComms), smoothstep(0.25, 0.75, seen) * 0.85);

    vec3 c = uW.x * ground + uW.y * sun + uW.z * earth;
    // Where the coarse ring's data ends, the ground goes to black instead of stopping at an edge.
    float edge = max(abs(vPos.x), abs(vPos.z));
    c *= 1.0 - smoothstep(uOuterR * 0.6, uOuterR * 0.97, edge);
    gl_FragColor = vec4(pow(c * uExposure, vec3(1.0 / 2.2)), 1.0);
  }
`

/**
 * The azimuth (deg, clockwise from north) in which the ground falls furthest within the tile: the camera looks that way,
 * across the site, so the relief that matters (for Shackleton Rim, the crater) fills the view.
 */
export function fallAzimuth({ meta, heights }: Terrain): number {
  const n = meta.n
  const c = (n - 1) / 2
  const site = heights[Math.round(c) * n + Math.round(c)] ?? 0
  let best = 0
  let low = Infinity
  for (let az = 0; az < 360; az += 10) {
    const a = (az * Math.PI) / 180
    let sum = 0
    let k = 0
    // From a fifth of the way out to nine tenths: the near ground and the tile's edge say little about the view.
    for (let f = 0.2; f <= 0.9; f += 0.05) {
      const row = Math.round(c - Math.cos(a) * f * c)
      const col = Math.round(c + Math.sin(a) * f * c)
      sum += (heights[row * n + col] ?? site) - site
      k++
    }
    if (sum / k < low) {
      low = sum / k
      best = az
    }
  }
  return best
}

const SITE_ALT_START = 80 // km: high enough to see the crater whole, low enough that it fills the view
const SITE_ALT_END = 3.2 // km
const BACK_END = 9 // km back from the site, once the camera has come down
const FOV = 34

/**
 * The site's real terrain as a lit 3D landscape that fills the screen. The parent sets `--reveal` (the camera comes down
 * from orbit onto the site, 0 to 1), `--exit` (it climbs back out) and `--p` (a slow turn while the questions scroll past).
 */
export function Landscape({
  site,
  mode,
  onMoment,
}: {
  site: Summary
  mode: LandscapeMode
  onMoment?: (m: Moment, l: Pick<Traced, 'sunShare' | 'earthShare' | 'km'>) => void
}) {
  const tracks = useTracks(site.site.id)
  const [tiles, setTiles] = useState<{ inner: Terrain; outer?: Terrain }>()
  const [traced, setTraced] = useState<Traced>()
  const [ready, setReady] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pinRefs = useRef<(HTMLSpanElement | null)[]>([])
  const modeRef = useRef(mode)
  modeRef.current = mode
  const moment = useMemo(() => (tracks ? pickMoment(tracks) : null), [tracks])

  useEffect(() => {
    let live = true
    const id = site.site.id
    const outer = hasTerrain(id, 'outer') ? loadTerrain(id, 'outer') : Promise.resolve(undefined)
    Promise.all([loadTerrain(id), outer]).then(([inner, o]) => live && setTiles({ inner, outer: o }))
    return () => {
      live = false
    }
  }, [site.site.id])

  useEffect(() => {
    if (!tiles || !moment) return
    // One frame after the page has painted, and after the Moon arriving from the front door has settled, so the trace
    // never holds up the first scroll or the Moon's glide.
    return afterGlide(() => {
      const l = trace(tiles.inner, moment)
      setTraced(l)
      onMoment?.(moment, l)
    })
  }, [tiles, moment, onMoment])

  const pins = traced?.pins[mode] ?? []
  const pinsRef = useRef(pins)
  pinsRef.current = pins

  useEffect(() => {
    const el = canvas.current
    const box = root.current
    if (!el || !box || !tiles || !traced || !moment) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, powerPreference: 'high-performance' })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setClearColor(0x000000, 1)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000)
    const { inner, outer } = tiles
    const g = inner.meta.ground_height_m
    const r = inner.meta.radius_km
    const p = palette()
    const fall = fallAzimuth(inner)
    const weights = new THREE.Vector3(1, 0, 0)
    // A little dimmer from orbit, brightening as the camera lands.
    const exposure = { value: 0.8 }
    const goalOf = (m: LandscapeMode) => new THREE.Vector3(m === 'ground' ? 1 : 0, m === 'sun' ? 1 : 0, m === 'earth' ? 1 : 0)
    const sunTex = maskTexture(traced.sunMask, traced.cn)
    const earthTex = traced.earthMask ? maskTexture(traced.earthMask, traced.cn) : sunTex
    const uniforms = (isOuter: boolean) => ({
      uW: { value: weights },
      uExposure: exposure,
      // Raking across the view from the side, so relief reads as relief.
      uRead: { value: toward(fall - 75, 24) },
      uSun: { value: toward(moment.sun.az, moment.sun.el) },
      uSunTint: { value: new THREE.Color(1, 0.96, 0.88) },
      uComms: { value: p.comms.clone() },
      uR: { value: r },
      uOuterR: { value: outer?.meta.radius_km ?? r },
      uOuter: { value: isOuter ? 1 : 0 },
      uSunMask: { value: sunTex },
      uEarthMask: { value: earthTex },
      uHasEarth: { value: traced.earthMask ? 1 : 0 },
    })
    const material = (isOuter: boolean) =>
      new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: uniforms(isOuter) })
    const meshes = [new THREE.Mesh(surface(inner, g), material(false))]
    // The coarse ring sits a few metres lower, so where both have data the detailed tile always wins.
    if (outer) meshes.push(new THREE.Mesh(surface(outer, g, 0.006), material(true)))
    for (const m of meshes) scene.add(m)

    let w = 0
    let h = 0
    const resize = () => {
      w = el.clientWidth
      h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      last = ''
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const point = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const target = new THREE.Vector3()
    let last = ''
    let visible = true
    let raf = 0
    let then = performance.now()
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting
      if (visible && !raf) raf = requestAnimationFrame(frame)
    })
    io.observe(box)

    // Whether the ground hides a point from the camera: march the sight line over the heightmap.
    const hidden = (to: THREE.Vector3) => {
      const n = inner.meta.n
      const from = camera.position
      for (let k = 1; k < 64; k++) {
        const f = k / 64
        const x = from.x + (to.x - from.x) * f
        const y = from.y + (to.y - from.y) * f
        const z = from.z + (to.z - from.z) * f
        const col = Math.round(((x + r) / (2 * r)) * (n - 1))
        const row = Math.round(((z + r) / (2 * r)) * (n - 1))
        if (col < 0 || row < 0 || col >= n || row >= n) continue
        // A few tens of metres of slack, so a pin on a crest is not hidden by its own cell.
        if (((inner.heights[row * n + col] ?? -Infinity) - g) / 1000 > y + 0.03) return true
      }
      return false
    }

    const placePins = () => {
      const list = pinsRef.current
      const cell = (2 * r) / (inner.meta.n - 1)
      const wide = w >= 1024
      const placed: [number, number][] = []
      list.forEach((pin, i) => {
        const node = pinRefs.current[i]
        if (!node) return
        const at = new THREE.Vector3(-r + pin.spot.col * cell, (pin.spot.height - g) / 1000, -r + pin.spot.row * cell)
        point.copy(at).project(camera)
        const x = ((point.x + 1) / 2) * w
        const y = ((1 - point.y) / 2) * h
        // A pin behind the camera, off screen, behind a ridge, under the reading shade (left on wide screens, top on
        // narrow ones), or on top of another pin would only show as a smudge or a pointer at the wrong ground.
        const off =
          point.z > 1 ||
          x < 0 ||
          x > w ||
          y < 0 ||
          y > h ||
          (wide ? x < w * 0.45 : y < h * 0.5) ||
          placed.some(([px, py]) => Math.abs(px - x) < 200 && Math.abs(py - y) < 64) ||
          hidden(at)
        if (!off) placed.push([x, y])
        node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        node.style.visibility = off ? 'hidden' : 'visible'
      })
    }

    function frame(now: number) {
      raf = 0
      if (!visible) return
      const dt = Math.min(0.1, (now - then) / 1000)
      then = now
      const css = getComputedStyle(box as HTMLElement)
      // Down while the ground blooms in, back up while it dissolves on the way out.
      const reveal =
        (Number.parseFloat(css.getPropertyValue('--reveal')) || 0) * (1 - (Number.parseFloat(css.getPropertyValue('--exit')) || 0))
      const pScroll = Number.parseFloat(css.getPropertyValue('--p')) || 0.5
      const reduced = reducedMotion().matches
      // The question's look crossfades rather than cuts.
      const goal = goalOf(modeRef.current)
      weights.lerp(goal, reduced ? 1 : Math.min(1, dt * 5))
      if (weights.distanceTo(goal) < 0.002) weights.copy(goal)

      // Down from orbit: the height falls on a log scale, so the descent feels even, and the camera tips from looking
      // straight down to looking across the ground as it comes in.
      const k = reveal * reveal * (3 - 2 * reveal)
      const alt = Math.exp(THREE.MathUtils.lerp(Math.log(SITE_ALT_START), Math.log(SITE_ALT_END), k))
      const back = BACK_END * k * k
      const heading = ((fall + (pScroll - 0.5) * (reduced ? 0 : 24)) * Math.PI) / 180
      forward.set(Math.sin(heading), 0, -Math.cos(heading))
      camera.position.copy(forward).multiplyScalar(-back).setY(alt)
      // Aimed past the site and a little down into the fall, so the far rim sits near the top of the frame.
      target
        .copy(forward)
        .multiplyScalar(6 * k * k)
        .setY(-1.2 * k * k)
      camera.up
        .copy(forward)
        .lerp(new THREE.Vector3(0, 1, 0), k)
        .normalize()
      camera.lookAt(target)
      exposure.value = THREE.MathUtils.lerp(0.8, 1, k)
      // Narrow screens: a wider lens, so the tile still fills the width.
      const fov = w < h ? FOV * 1.45 : FOV
      if (camera.fov !== fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }

      const key = `${w},${h},${reveal.toFixed(4)},${pScroll.toFixed(4)},${weights.x.toFixed(3)},${weights.y.toFixed(3)},${modeRef.current},${pinsRef.current.length}`
      if (key !== last) {
        last = key
        renderer.render(scene, camera)
        placePins()
      }
      raf = requestAnimationFrame(frame)
    }
    resize()
    raf = requestAnimationFrame(frame)
    setReady(true)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      for (const m of meshes) {
        m.geometry.dispose()
        m.material.dispose()
      }
      sunTex.dispose()
      earthTex.dispose()
      renderer.dispose()
      setReady(false)
    }
  }, [tiles, traced, moment])

  return (
    <div ref={root} aria-hidden className="absolute inset-0 overflow-hidden bg-black">
      <canvas ref={canvas} className={`size-full transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`} />
      {pins.map((p, i) => (
        <span
          key={p.label}
          ref={(n) => {
            pinRefs.current[i] = n
          }}
          className="landscape-pin invisible absolute top-0 left-0"
        >
          <span className="absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center gap-1">
            <span className="rounded-full border border-white/25 bg-black/80 px-3 py-1 text-sm whitespace-nowrap text-white">
              {p.label}
            </span>
            <span className="h-5 w-px bg-white/70" />
            <span className="size-1.5 translate-y-[3px] rounded-full bg-white" />
          </span>
        </span>
      ))}
    </div>
  )
}

export const momentLabel = (m: Moment) => `${longDate(m.date)}, ${minuteLabel(m.minute)} UTC`
