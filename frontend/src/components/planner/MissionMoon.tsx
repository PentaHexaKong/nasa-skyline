import { ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { loadMoonEphemeris } from '~/lib/data'
import { ephemerisHours, subPoints, whenAt } from '~/lib/moonLight'
import { minuteLabel, shortDate } from '~/lib/time'

export type MarkerStatus = 'works' | 'fails' | 'not-computed' | 'not-selected'
export type MoonMarker = { id: string; name: string; lat: number; lon: number; selected: boolean; status: MarkerStatus }

/** What a site's label says. Green and red only ever come with a tick or a cross (docs/design.md). */
const STATUS: Record<MarkerStatus, { mark: string; word: string; tone: string }> = {
  works: { mark: '✓', word: 'Works', tone: 'text-go' },
  fails: { mark: '×', word: 'Doesn’t work', tone: 'text-miss' },
  'not-computed': { mark: '', word: 'Not computed', tone: 'text-ink-muted' },
  'not-selected': { mark: '', word: 'Not in this plan', tone: 'text-ink-faint' },
}

const FOV = 30
/** Camera distance in Moon radii: the disc fills about two thirds of the frame, with room for the labels beside it. */
const DIST = 5.2
/** Boxes narrower than this put the labels in a row under the disc, so the camera stands further back and lifts it. */
const NARROW = 560
const DIST_NARROW = 6
const LIFT = 44
const NO_AIM = [0, 0] as const
/** `sway`: the camera turns back and forth around the polar axis by this much, over this period. */
const SWAY_DEG = 26
const SWAY_S = 24
/** `spin`: one full turn around the polar axis, this long. */
const SPIN_MS = 1500
/** The camera looks up at the south pole from this latitude, so the polar sites sit in the lower half of the disc. */
const VIEW_LAT = -52
/** And this far west of the Sun, so the lit side faces the reader while the terminator still throws shadows. */
const SUN_OFFSET = 35
const PAD = 12
const GAP = 8

/**
 * The planner's Moon: the same globe as Explore and Understand (NASA colour and relief, true-scale LOLA relief south of
 * 75°S, the limb glow), lit by the Sun where the pipeline's SPICE ephemeris puts it at `at`, the landing moment. Site
 * dots sit on the pipeline coordinates; their labels are spread beside the disc, since the polar sites are a few pixels
 * apart at this scale. It draws only on a change and stops off screen or in a hidden tab.
 *
 * `onToggle` makes the labels buttons that add or remove a site; without it they only report. `controls` adds the
 * labelled rotate and reset buttons for keyboards. `labels={false}` keeps only the dots. `zoom` (camera distance as a
 * share of the usual one) and `aim` (where the disc's centre moves, as shares of the box's width and height) ease the
 * camera in the render loop, so a zoom stays sharp instead of scaling the picture.
 */
export default function MissionMoon({
  markers,
  at,
  onToggle,
  controls = true,
  labels: showLabels = true,
  zoom = 1,
  aim = NO_AIM,
  sway = false,
  spin = 0,
  footClassName = 'right-3 bottom-2.5 left-3 justify-between',
  className = '',
}: {
  markers: MoonMarker[]
  at: number
  onToggle?: (id: string) => void
  controls?: boolean
  labels?: boolean
  zoom?: number
  aim?: readonly [number, number]
  /**
   * The Moon seems to turn: the camera sways around the polar axis, and each change of `spin` turns it once all the way
   * round. The camera moves, not the Moon, so the sunlit side stays the SPICE one for the landing time.
   */
  sway?: boolean
  spin?: number
  /** Where the caption line sits in the box. */
  footClassName?: string
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLParagraphElement>(null)
  const pins = useRef<Record<string, HTMLSpanElement | null>>({})
  const lines = useRef<Record<string, SVGLineElement | null>>({})
  const labels = useRef<Record<string, HTMLElement | null>>({})
  const latest = useRef({ markers, at, showLabels, zoom, aim, sway })
  latest.current = { markers, at, showLabels, zoom, aim, sway }
  const api = useRef({ redraw: () => {}, light: () => {}, turn: (_: string) => {}, spin: () => {} })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [caption, setCaption] = useState('')

  useEffect(() => {
    api.current.redraw()
  }, [markers])
  useEffect(() => {
    api.current.light()
  }, [at])
  const spun = useRef(spin)
  useEffect(() => {
    if (spin === spun.current) return
    spun.current = spin
    api.current.spin()
  }, [spin])
  // A new zoom, aim or label mode only needs the render loop to run.
  useEffect(() => {
    api.current.redraw()
  }, [zoom, aim[0], aim[1], showLabels, sway])

  useEffect(() => {
    const box = host.current
    const surface = canvas.current
    if (!box || !surface) return
    let disposed = false
    let visible = false
    let started = false
    let release = () => {}
    let wake = () => {}

    const start = async () => {
      const [THREE, { OrbitControls }, { halo, moonMaterial, toVec }, eph] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
        import('~/components/moonGlobe'),
        loadMoonEphemeris().catch(() => null),
      ])
      if (disposed) return
      let renderer: InstanceType<typeof THREE.WebGLRenderer>
      try {
        renderer = new THREE.WebGLRenderer({ canvas: surface, alpha: true, antialias: true })
      } catch {
        setFailed(true)
        return
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      renderer.setClearColor(0x000000, 0)
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50)
      camera.position.copy(toVec(VIEW_LAT, 0, DIST))
      const orbit = new OrbitControls(camera, surface)
      orbit.enableDamping = !motion.matches
      orbit.dampingFactor = 0.12
      orbit.enablePan = false
      orbit.enableZoom = false
      orbit.rotateSpeed = 0.6
      // A single finger still scrolls the page. Mouse drag or a two-finger gesture turns the Moon.
      orbit.touches.ONE = null
      orbit.touches.TWO = THREE.TOUCH.ROTATE
      surface.style.touchAction = 'pan-y'

      let frame = 0
      let last = 0
      const requestDraw = () => {
        if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw)
      }
      wake = requestDraw

      const textures: InstanceType<typeof THREE.Texture>[] = []
      const loader = new THREE.TextureLoader()
      const tex = (url: string, srgb = true, done?: () => void, fail?: () => void) => {
        const map = loader.load(
          url,
          () => {
            if (disposed) return
            done?.()
            requestDraw()
          },
          undefined,
          () => fail?.(),
        )
        if (srgb) map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = renderer.capabilities.getMaxAnisotropy()
        textures.push(map)
        return map
      }
      // Progressive, as on Understand: the first-look maps show the Moon early and the full ones replace them.
      const { material, capRot } = moonMaterial(tex, () => !disposed && setReady(true), true)
      const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), material)
      const sunDir = { value: new THREE.Vector3(1, 0, 0) }
      // The limb glow adds light but never coverage, as on the story pages.
      const glow = halo(1, 0.14, [1.0, 0.93, 0.84], 0.3, 4.5, sunDir)
      const glowMat = glow.material as InstanceType<typeof THREE.ShaderMaterial>
      glowMat.blending = THREE.CustomBlending
      glowMat.blendSrc = THREE.OneFactor
      glowMat.blendDst = THREE.OneFactor
      glowMat.blendSrcAlpha = THREE.ZeroFactor
      glowMat.blendDstAlpha = THREE.OneFactor
      moon.add(glow)
      moon.updateMatrixWorld()
      capRot.value.setFromMatrix4(moon.matrixWorld)
      const sun = new THREE.DirectionalLight(0xffffff, 3.2)
      // A faint fill, as earthshine gives, so the night side still reads as a shape.
      scene.add(moon, sun, new THREE.AmbientLight(0xffffff, 0.06))

      // ---- the Sun at the landing moment, and a camera that follows it until the reader turns the Moon
      let follow = true
      let narrow = false
      const distance = () => (narrow && latest.current.showLabels ? DIST_NARROW : DIST)
      // The eased zoom and aim, and the box they are measured in.
      let curZoom = latest.current.zoom
      const curAim: [number, number] = [latest.current.aim[0], latest.current.aim[1]]
      let boxW = 0
      let boxH = 0
      const frameView = () => {
        if (!boxW || !boxH) return
        // Narrow boxes with labels: the disc moves up to leave a band for the row of labels under it.
        const lift = narrow && latest.current.showLabels ? LIFT : 0
        const ox = -curAim[0] * boxW
        const oy = -curAim[1] * boxH + lift
        if (ox || oy) camera.setViewOffset(boxW, boxH, ox, oy, boxW, boxH)
        else camera.clearViewOffset()
        camera.updateProjectionMatrix()
      }
      let sunLon = 0
      const t0 = eph ? Date.parse(eph.start.length === 10 ? `${eph.start}T00:00:00Z` : eph.start) : 0
      const facing = () => toVec(VIEW_LAT, sunLon - SUN_OFFSET, distance())
      // While following, the camera is `base` (facing the sunlit side) turned around the polar axis by the sway and spin.
      const base = camera.position.clone()
      const Y = new THREE.Vector3(0, 1, 0)
      let swayGain = 0
      let spinT0: number | null = null
      let tween: {
        from: InstanceType<typeof THREE.Vector3>
        turn: InstanceType<typeof THREE.Quaternion>
        d0: number
        t: number
        onBase: boolean
      } | null = null
      const aim = (goal: InstanceType<typeof THREE.Vector3>, snap = false) => {
        const target = follow ? base : camera.position
        if (snap || motion.matches) {
          tween = null
          target.copy(goal)
          if (!follow) orbit.update()
        } else {
          const from = target.clone().normalize()
          tween = {
            from,
            turn: new THREE.Quaternion().setFromUnitVectors(from, goal.clone().normalize()),
            d0: follow ? base.length() : camera.position.length() / curZoom,
            t: 0,
            onBase: follow,
          }
        }
        requestDraw()
      }
      /** Back to following from wherever the camera is now, with no jump: the sway eases in again from zero. */
      const rejoin = () => {
        if (follow) return
        follow = true
        swayGain = 0
        base.copy(camera.position).setLength(distance())
      }
      const light = (snap = false) => {
        if (!eph) {
          // No ephemeris: an even side light, and the caption says it is not the real one.
          sunDir.value.set(-0.6, 0.15, 0.8).normalize()
          sunLon = -127
          setCaption('Illustrative lighting')
        } else {
          const span = ephemerisHours(eph)
          const raw = (latest.current.at - t0) / 3_600_000
          const hours = Math.max(0, Math.min(span, raw))
          const sub = subPoints(eph, hours)
          sunDir.value.copy(toVec(sub.sun.lat, sub.sun.lon)).normalize()
          sunLon = sub.sun.lon
          const when = whenAt(eph, hours)
          const stamp = `${shortDate(when.date)} ${when.date.slice(0, 4)}, ${minuteLabel(when.minute)} UTC`
          setCaption(raw === hours ? `Sunlight at landing · ${stamp}` : `Sunlight as on ${stamp}`)
        }
        sun.position.copy(sunDir.value).multiplyScalar(10)
        if (follow) aim(facing(), snap)
        requestDraw()
      }

      // ---- labels beside the disc, placed each frame from the projected sites
      const v = new THREE.Vector3()
      const placeLabels = (w: number, h: number) => {
        const list = latest.current.markers
        const points = list.map((m) => {
          const p = toVec(m.lat, m.lon)
          v.copy(p).project(camera)
          return { m, x: ((v.x + 1) * w) / 2, y: ((1 - v.y) * h) / 2, seen: camera.position.clone().sub(p).dot(p) > 0 }
        })
        if (!latest.current.showLabels) {
          for (const { m, x, y, seen } of points) {
            const pin = pins.current[m.id]
            if (!pin) continue
            pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
            pin.style.opacity = seen ? '1' : '0'
          }
          if (overlay.current) overlay.current.style.opacity = '1'
          return
        }
        const sorted = [...points].sort((a, b) => a.x - b.x)
        // Labels stay clear of the caption line along the bottom, however many lines it wraps to.
        const bottom = h - (foot.current?.offsetHeight ?? 16) - 14
        // The disc's radius on screen, from its angular size.
        const dist = camera.position.length()
        const radius = (Math.tan(Math.asin(1 / dist)) / Math.tan((camera.fov * Math.PI) / 360)) * (h / 2)
        const spots = new Map<string, { left: number; top: number; width: number; height: number }>()
        if (narrow) {
          // A row along the bottom edge, in the order the dots run across the screen.
          const width = Math.min(150, (w - PAD * 2 - GAP * (sorted.length - 1)) / Math.max(1, sorted.length))
          const total = width * sorted.length + GAP * (sorted.length - 1)
          sorted.forEach(({ m }, i) => {
            const el = labels.current[m.id]
            if (!el) return
            el.style.width = `${width}px`
            const height = el.offsetHeight
            spots.set(m.id, { left: (w - total) / 2 + i * (width + GAP), top: bottom - height, width, height })
          })
        } else {
          // Two columns, one each side of the disc, stacked around the dots' height.
          const half = Math.ceil(sorted.length / 2)
          const columns = [sorted.slice(0, half), sorted.slice(half)]
          columns.forEach((column, side) => {
            const heights = column.map(({ m }) => {
              const el = labels.current[m.id]
              if (el) el.style.width = ''
              return el?.offsetHeight ?? 0
            })
            const width = column.reduce((a, { m }) => Math.max(a, labels.current[m.id]?.offsetWidth ?? 0), 0)
            const total = heights.reduce((a, b) => a + b, 0) + GAP * Math.max(0, column.length - 1)
            const mid = column.reduce((a, p) => a + p.y, 0) / Math.max(1, column.length)
            let top = Math.max(PAD, Math.min(bottom - total, mid - total / 2))
            const cx = ((v.set(0, 0, 0).project(camera).x + 1) * w) / 2
            const left = side === 0 ? Math.max(PAD, cx - radius - width - 36) : Math.min(w - PAD - width, cx + radius + 36)
            column.forEach(({ m }, i) => {
              spots.set(m.id, { left, top, width, height: heights[i] ?? 0 })
              top += (heights[i] ?? 0) + GAP
            })
          })
        }
        for (const { m, x, y, seen } of points) {
          const pin = pins.current[m.id]
          if (pin) {
            pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
            pin.style.opacity = seen ? '1' : '0'
          }
          const spot = spots.get(m.id)
          const el = labels.current[m.id]
          if (spot && el) {
            el.style.left = `${spot.left.toFixed(1)}px`
            el.style.top = `${spot.top.toFixed(1)}px`
          }
          const line = lines.current[m.id]
          if (line && spot) {
            // From the dot to the nearest edge of its label.
            const lx = narrow ? spot.left + spot.width / 2 : spot.left + spot.width / 2 < x ? spot.left + spot.width : spot.left
            const ly = narrow ? spot.top : spot.top + spot.height / 2
            line.setAttribute('x1', x.toFixed(1))
            line.setAttribute('y1', y.toFixed(1))
            line.setAttribute('x2', lx.toFixed(1))
            line.setAttribute('y2', ly.toFixed(1))
            line.style.opacity = seen ? '1' : '0'
          }
        }
        if (overlay.current) overlay.current.style.opacity = '1'
      }

      function draw(now: number) {
        frame = 0
        if (disposed || !visible || document.hidden) return
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016
        last = now
        let moving = false
        // Ease toward the asked zoom and aim; reduced motion snaps.
        const goalZoom = latest.current.zoom
        const goalAim = latest.current.aim
        if (Math.abs(goalZoom - curZoom) > 1e-4 || Math.abs(goalAim[0] - curAim[0]) > 1e-4 || Math.abs(goalAim[1] - curAim[1]) > 1e-4) {
          const k = motion.matches ? 1 : 1 - Math.exp(-dt * 4.5)
          curZoom += (goalZoom - curZoom) * k
          curAim[0] = curAim[0] + (goalAim[0] - curAim[0]) * k
          curAim[1] = curAim[1] + (goalAim[1] - curAim[1]) * k
          frameView()
          moving = true
        }
        if (tween) {
          tween.t = Math.min(1, tween.t + dt / 0.8)
          const e = 1 - (1 - tween.t) ** 3
          ;(tween.onBase ? base : camera.position)
            .copy(tween.from)
            .applyQuaternion(new THREE.Quaternion().slerp(tween.turn, e))
            .multiplyScalar(THREE.MathUtils.lerp(tween.d0, distance(), e))
          if (tween.t >= 1) tween = null
          else moving = true
        }
        let unzoomed = tween && !tween.onBase ? camera.position.length() : distance()
        if (follow) {
          // Sway eases in and out, so turning it on or off never jumps; a spin runs one turn with an ease at both ends.
          const swayOn = latest.current.sway && !motion.matches
          swayGain += ((swayOn ? 1 : 0) - swayGain) * Math.min(1, dt * 1.2)
          if (swayGain < 1e-3 && !swayOn) swayGain = 0
          let turn = swayGain * SWAY_DEG * Math.sin(((now / 1000) * 2 * Math.PI) / SWAY_S)
          if (spinT0 != null) {
            const p = Math.min(1, (now - spinT0) / SPIN_MS)
            const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2
            turn += 360 * (1 - e)
            if (p >= 1) spinT0 = null
          }
          if (swayGain > 0 || spinT0 != null) moving = true
          camera.position.copy(base).applyAxisAngle(Y, (turn * Math.PI) / 180)
          unzoomed = base.length()
        }
        // Damping keeps changing the camera after a drag; `change` asks for the next frame while it does.
        orbit.update()
        // The tween and the follow pose work at the unzoomed distance; the zoom scales it here, once per frame.
        camera.position.setLength(unzoomed * curZoom)
        camera.lookAt(0, 0, 0)
        renderer.render(scene, camera)
        placeLabels(box?.clientWidth ?? 0, box?.clientHeight ?? 0)
        if (moving) requestDraw()
        else last = 0
      }

      orbit.addEventListener('change', requestDraw)
      // Once the reader turns the Moon, a new landing day relights it without moving the camera.
      orbit.addEventListener('start', () => {
        follow = false
        tween = null
      })
      const resize = new ResizeObserver(() => {
        const { width, height } = box.getBoundingClientRect()
        if (!width || !height) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        // Portrait boxes widen the lens so the whole disc still fits across.
        const tanHalf = Math.tan((FOV * Math.PI) / 360) * Math.max(1, 1.15 / camera.aspect)
        camera.fov = (2 * Math.atan(tanHalf) * 180) / Math.PI
        narrow = width < NARROW
        boxW = width
        boxH = height
        frameView()
        if (follow) {
          if (tween?.onBase) tween = null
          base.copy(facing())
        } else camera.position.setLength(distance() * curZoom)
        orbit.update()
        requestDraw()
      })
      resize.observe(box)
      const onMotion = () => {
        orbit.enableDamping = !motion.matches
      }
      const onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(frame)
          frame = 0
        } else requestDraw()
      }
      const onLost = (event: Event) => {
        event.preventDefault()
        cancelAnimationFrame(frame)
        frame = 0
        setFailed(true)
      }
      const onRestored = () => {
        setFailed(false)
        requestDraw()
      }
      motion.addEventListener('change', onMotion)
      document.addEventListener('visibilitychange', onVisibility)
      surface.addEventListener('webglcontextlost', onLost)
      surface.addEventListener('webglcontextrestored', onRestored)

      api.current = {
        redraw: requestDraw,
        light: () => light(),
        spin: () => {
          if (motion.matches) return
          rejoin()
          spinT0 = performance.now()
          requestDraw()
        },
        turn: (direction) => {
          if (direction === 'reset') {
            rejoin()
            aim(facing())
            return
          }
          follow = false
          tween = null
          const offset = camera.position.clone()
          if (direction === 'left' || direction === 'right')
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction === 'left' ? 0.2 : -0.2)
          else {
            const spherical = new THREE.Spherical().setFromVector3(offset)
            spherical.phi = THREE.MathUtils.clamp(spherical.phi + (direction === 'up' ? -0.2 : 0.2), 0.1, Math.PI - 0.1)
            offset.setFromSpherical(spherical)
          }
          aim(offset)
        },
      }
      release = () => {
        cancelAnimationFrame(frame)
        resize.disconnect()
        orbit.dispose()
        motion.removeEventListener('change', onMotion)
        document.removeEventListener('visibilitychange', onVisibility)
        surface.removeEventListener('webglcontextlost', onLost)
        surface.removeEventListener('webglcontextrestored', onRestored)
        scene.traverse((object) => {
          const mesh = object as InstanceType<typeof THREE.Mesh>
          mesh.geometry?.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
          for (const mat of materials) mat.dispose()
        })
        for (const map of textures) map.dispose()
        renderer.dispose()
        api.current = { redraw: () => {}, light: () => {}, turn: () => {}, spin: () => {} }
      }
      light(true)
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
      if (visible && !started) {
        started = true
        void start().catch(() => {
          if (!disposed) setFailed(true)
        })
      }
      if (visible) wake()
    })
    observer.observe(box)
    return () => {
      disposed = true
      observer.disconnect()
      release()
    }
  }, [])

  const live = ready && !failed
  return (
    // `relative` only when the caller has not positioned the box itself, or it would override `absolute`.
    <div ref={host} className={`overflow-hidden ${/(^|\s)(absolute|fixed)(\s|$)/.test(className) ? '' : 'relative'} ${className}`}>
      {!live && (
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 aspect-square h-[58%] max-w-[80%] -translate-1/2 rounded-full bg-white/[0.04] motion-safe:animate-pulse"
        />
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={`The Moon from below its south pole, with ${markers.length} landing sites at their computed coordinates. ${caption}`}
        className={`absolute inset-0 size-full cursor-grab transition-opacity duration-700 active:cursor-grabbing ${live ? 'opacity-100' : 'opacity-0'}`}
      />
      {failed ? (
        showLabels && (
          <ul className="absolute inset-x-3 bottom-10 flex flex-wrap justify-center gap-2">
            {markers.map((m) => (
              <li key={m.id}>
                <SiteLabel marker={m} onToggle={onToggle} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <div ref={overlay} className="absolute inset-0 opacity-0 transition-opacity duration-500">
          {showLabels && (
            <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
              {markers.map((m) => (
                <line
                  key={m.id}
                  ref={(element) => {
                    lines.current[m.id] = element
                  }}
                  stroke="white"
                  strokeOpacity={m.selected ? 0.55 : 0.25}
                  strokeDasharray={m.selected ? undefined : '2 3'}
                />
              ))}
            </svg>
          )}
          {markers.map((m) => (
            <span
              key={m.id}
              aria-hidden
              ref={(element) => {
                pins.current[m.id] = element
              }}
              className="pointer-events-none absolute top-0 left-0 -mt-1 -ml-1 size-2 transition-opacity"
            >
              <span
                data-pin
                className={`absolute inset-0 rounded-full ring-1 transition-[scale] duration-200 ${m.selected ? 'bg-white ring-black' : 'bg-black ring-white/70'}`}
              />
              {m.selected && <span className="absolute inset-0 rounded-full bg-white/60 motion-safe:animate-ping" />}
            </span>
          ))}
          {showLabels &&
            markers.map((m) => (
              <SiteLabel
                key={m.id}
                marker={m}
                onToggle={onToggle}
                onHot={(on) => {
                  const pin = pins.current[m.id]?.querySelector<HTMLElement>('[data-pin]')
                  if (pin) pin.style.scale = on ? '2.2' : ''
                }}
                className="absolute"
                ref={(element) => {
                  labels.current[m.id] = element
                }}
              />
            ))}
        </div>
      )}
      {controls && (
        <div
          role="group"
          aria-label="Turn the Moon"
          className="absolute top-3 right-3 flex gap-0.5 rounded-md border border-line bg-black/70 p-0.5"
        >
          {(
            [
              ['left', ArrowLeftIcon, 'Turn the Moon left'],
              ['up', ArrowUpIcon, 'Tilt the Moon up'],
              ['down', ArrowDownIcon, 'Tilt the Moon down'],
              ['right', ArrowRightIcon, 'Turn the Moon right'],
              ['reset', ArrowCounterClockwiseIcon, 'Face the sunlit side again'],
            ] as const
          ).map(([direction, Icon, name]) => (
            <button
              key={direction}
              type="button"
              aria-label={name}
              title={name}
              disabled={!live}
              onClick={() => api.current.turn(direction)}
              className="grid size-7 cursor-pointer place-items-center rounded text-ink-muted hover:bg-white/10 hover:text-ink disabled:cursor-default disabled:opacity-30"
            >
              <Icon aria-hidden className="size-3.5" />
            </button>
          ))}
        </div>
      )}
      <p ref={foot} className={`scene-text pointer-events-none absolute flex flex-wrap gap-x-4 text-2xs text-ink-faint ${footClassName}`}>
        {(controls || failed) && <span>{failed ? '3D unavailable · site list only' : 'Drag to turn · two fingers on touch'}</span>}
        <span className={`eyebrow ${footClassName.includes('justify-center') ? '' : 'ml-auto'}`}>{caption}</span>
      </p>
    </div>
  )
}

/** A site's name, its latitude and whether it works; a toggle when the Moon can change the plan. */
function SiteLabel({
  marker: m,
  onToggle,
  onHot,
  className = '',
  ref,
}: {
  marker: MoonMarker
  onToggle?: (id: string) => void
  /** The pointer or focus is on this label, so its dot can stand out. */
  onHot?: (on: boolean) => void
  className?: string
  ref?: (element: HTMLElement | null) => void
}) {
  const s = STATUS[m.status]
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-medium text-ink">
        {onToggle && (
          <span
            aria-hidden
            className={`grid size-3 shrink-0 place-items-center rounded-[3px] border text-[0.55rem] leading-none ${m.selected ? 'border-white bg-white text-black' : 'border-line-strong'}`}
          >
            {m.selected ? '✓' : ''}
          </span>
        )}
        <span className="truncate">{m.name}</span>
      </span>
      <span className="readout text-ink-faint">
        {Math.abs(m.lat).toFixed(2)}°{m.lat < 0 ? 'S' : 'N'}
      </span>
      <span className={s.tone}>
        {s.mark && <span aria-hidden>{s.mark} </span>}
        {s.word}
      </span>
    </>
  )
  const look = `grid w-max max-w-[9.5rem] gap-0.5 rounded-md border bg-black/85 px-2.5 py-1.5 text-left text-2xs backdrop-blur-sm ${m.selected ? 'border-white/50' : 'border-line'} ${className}`
  if (!onToggle)
    return (
      <span ref={ref} className={look} onPointerEnter={() => onHot?.(true)} onPointerLeave={() => onHot?.(false)}>
        {body}
      </span>
    )
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={m.selected}
      aria-label={`${m.name}, ${s.word}. ${m.selected ? 'In this plan; press to remove.' : 'Press to add to this plan.'}`}
      onClick={() => onToggle(m.id)}
      onPointerEnter={() => onHot?.(true)}
      onPointerLeave={() => onHot?.(false)}
      onFocus={() => onHot?.(true)}
      onBlur={() => onHot?.(false)}
      className={`${look} cursor-pointer transition-colors hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
    >
      {body}
    </button>
  )
}
