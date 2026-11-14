import { useEffect, useRef, useState } from 'react'
import { MOON_PREVIEW } from '~/components/moonTextures'

export type MoonMarker = { id: string; name: string; lat: number; lon: number; selected: boolean; status: string }

/** An illustrative globe: no running animation; GPU work stops when the view settles or leaves the screen. */
export default function MissionMoon({ markers = [], onToggle }: { markers?: MoonMarker[]; onToggle?: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const turn = useRef<(direction: string) => void>(() => {})
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef(markers)
  latest.current = markers
  const pins = useRef<Record<string, HTMLSpanElement | null>>({})
  const lines = useRef<Record<string, SVGLineElement | null>>({})
  const labels = useRef<Record<string, HTMLButtonElement | null>>({})
  const redraw = useRef(() => {})
  useEffect(() => {
    redraw.current()
  }, [markers])

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
      const [THREE, { OrbitControls }] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')])
      if (disposed) return
      let renderer: InstanceType<typeof THREE.WebGLRenderer>
      try {
        renderer = new THREE.WebGLRenderer({ canvas: surface, alpha: true, antialias: true, powerPreference: 'low-power' })
      } catch {
        setFailed(true)
        return
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.setClearColor(0x000000, 0)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20)
      camera.position.set(0, -0.45, 4.6)
      if (latest.current.length) camera.position.set(0, -3.2, 3.3)
      const controls = new OrbitControls(camera, surface)
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
      controls.enableDamping = !motion.matches
      controls.dampingFactor = 0.14
      controls.enablePan = false
      controls.enableZoom = false
      controls.rotateSpeed = 0.65
      // A single finger still scrolls the page. Mouse drag or a two-finger gesture turns the Moon.
      controls.touches.ONE = null
      controls.touches.TWO = THREE.TOUCH.ROTATE
      surface.style.touchAction = 'pan-y'
      controls.update()
      controls.saveState()
      let frame = 0
      const draw = () => {
        frame = 0
        if (disposed || !visible || document.hidden) return
        controls.update()
        renderer.render(scene, camera)
        const width = box.clientWidth
        const height = box.clientHeight
        for (const marker of latest.current) {
          const lat = (marker.lat * Math.PI) / 180
          const lon = (marker.lon * Math.PI) / 180
          const point = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)).applyEuler(
            moon.rotation,
          )
          const facing = camera.position.clone().sub(point).dot(point) > 0
          const projected = point.clone().project(camera)
          const x = ((projected.x + 1) * width) / 2
          const y = ((1 - projected.y) * height) / 2
          const pin = pins.current[marker.id]
          if (pin) {
            pin.style.transform = `translate(${x}px, ${y}px)`
            pin.style.opacity = facing ? '1' : '0'
          }
          const line = lines.current[marker.id]
          const label = labels.current[marker.id]
          if (line && label) {
            line.setAttribute('x1', String(x))
            line.setAttribute('y1', String(y))
            line.setAttribute('x2', String(label.offsetLeft + label.offsetWidth / 2))
            line.setAttribute('y2', String(label.offsetTop + label.offsetHeight / 2))
            line.style.opacity = facing ? '0.65' : '0'
          }
        }
      }
      const requestDraw = () => {
        if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw)
      }
      wake = requestDraw
      redraw.current = requestDraw
      controls.addEventListener('change', requestDraw)
      const textures: InstanceType<typeof THREE.Texture>[] = []
      const loader = new THREE.TextureLoader()
      const texture = (url: string, color = false) => {
        const map = loader.load(
          url,
          () => {
            if (disposed) return void map.dispose()
            if (color) setReady(true)
            requestDraw()
          },
          undefined,
          () => {
            if (!disposed && color) setFailed(true)
          },
        )
        if (color) map.colorSpace = THREE.SRGBColorSpace
        textures.push(map)
        return map
      }
      const material = new THREE.MeshStandardMaterial({
        map: texture(MOON_PREVIEW.color, true),
        normalMap: texture(MOON_PREVIEW.normal),
        roughness: 1,
        metalness: 0,
      })
      const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material)
      // Face the prime meridian toward the viewer; these are illustration camera choices, not ephemeris positions.
      moon.rotation.y = -Math.PI / 2
      scene.add(moon, new THREE.AmbientLight(0xffffff, 0.35))
      const light = new THREE.DirectionalLight(0xffffff, 2.6)
      light.position.set(-3, 2, 5)
      scene.add(light)
      const orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 128 }, (_, i) => {
            const a = (i / 128) * Math.PI * 2
            return new THREE.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 0.45, Math.sin(a) * 1.1)
          }),
        ),
        new THREE.LineDashedMaterial({ color: 0x8886ed, dashSize: 0.035, gapSize: 0.035, transparent: true, opacity: 0.7 }),
      )
      orbit.rotation.z = 0.25
      orbit.computeLineDistances()
      scene.add(orbit)
      const descent = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.3, 0.55, 0.45),
        new THREE.Vector3(1.15, -0.25, 0.65),
        new THREE.Vector3(0.6, -0.85, 0.65),
        new THREE.Vector3(0, -1.02, 0.1),
      ])
      scene.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints(descent.getPoints(64)), new THREE.LineBasicMaterial({ color: 0xe7bc73 })),
      )
      const pole = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      pole.position.copy(descent.getPoint(1))
      scene.add(pole)
      const resize = new ResizeObserver(() => {
        const { width, height } = box.getBoundingClientRect()
        if (!width || !height) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        // Keep the globe fully inside the drawing on portrait cards too.
        camera.fov = camera.aspect < 1.2 ? 46 : 35
        camera.updateProjectionMatrix()
        requestDraw()
      })
      resize.observe(box)
      const onMotion = () => {
        controls.enableDamping = !motion.matches
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
      turn.current = (direction) => {
        if (direction === 'reset') controls.reset()
        else {
          const offset = camera.position.clone().sub(controls.target)
          if (direction === 'left' || direction === 'right')
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction === 'left' ? 0.18 : -0.18)
          else {
            const spherical = new THREE.Spherical().setFromVector3(offset)
            spherical.phi = THREE.MathUtils.clamp(spherical.phi + (direction === 'up' ? -0.18 : 0.18), 0.1, Math.PI - 0.1)
            offset.setFromSpherical(spherical)
          }
          camera.position.copy(controls.target).add(offset)
          controls.update()
        }
        requestDraw()
      }
      release = () => {
        cancelAnimationFrame(frame)
        resize.disconnect()
        controls.dispose()
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
        turn.current = () => {}
        redraw.current = () => {}
      }
      requestDraw()
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

  return (
    <div ref={host} className="absolute inset-0">
      {(!ready || failed) && (
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 aspect-square w-[52%] -translate-1/2 rounded-full bg-cover bg-center shadow-[inset_-28px_-18px_60px_rgb(0_0_0/0.9)]"
          style={{ backgroundImage: `url(${MOON_PREVIEW.color})` }}
        />
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={
          markers.length ? 'Interactive Moon with computed landing site coordinates' : 'Interactive Moon and illustrative landing approach'
        }
        className={`size-full cursor-grab active:cursor-grabbing ${ready && !failed ? 'opacity-100' : 'opacity-0'}`}
      />
      {markers.length > 0 && (
        <>
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
            {markers.map((marker) => (
              <line
                key={marker.id}
                ref={(element) => {
                  lines.current[marker.id] = element
                }}
                stroke="white"
                strokeOpacity="0.5"
              />
            ))}
          </svg>
          {markers.map((marker, index) => (
            <span key={marker.id}>
              <span
                aria-hidden
                ref={(element) => {
                  pins.current[marker.id] = element
                }}
                className={`pointer-events-none absolute top-0 left-0 -mt-1.5 -ml-1.5 size-3 rounded-full border border-white/60 ${marker.selected ? 'bg-comms shadow-[0_0_12px_var(--comms)]' : 'bg-black'}`}
              />
              <button
                type="button"
                ref={(element) => {
                  labels.current[marker.id] = element
                }}
                onClick={() => onToggle?.(marker.id)}
                aria-pressed={marker.selected}
                className={`absolute grid w-[7.5rem] cursor-pointer gap-1 rounded border bg-[#080d14]/95 p-2 text-left text-2xs transition-colors ${marker.selected ? 'border-comms' : 'border-line-strong'}`}
                style={{
                  left: index === 2 ? undefined : '3%',
                  right: index === 2 ? '3%' : undefined,
                  top: `${index === 0 ? 45 : index === 1 ? 70 : 64}%`,
                }}
              >
                <span className="truncate font-medium">{marker.name}</span>
                <span className="readout text-2xs text-ink-muted">
                  {Math.abs(marker.lat).toFixed(2)}°{marker.lat < 0 ? 'S' : 'N'}
                </span>
                <span className={marker.status === 'Works' ? 'text-go' : marker.status === 'Doesn’t work' ? 'text-miss' : 'text-ink-muted'}>
                  {marker.status === 'Works' ? '✓ ' : marker.status === 'Doesn’t work' ? '× ' : ''}
                  {marker.status}
                </span>
              </button>
            </span>
          ))}
        </>
      )}
      <div
        className="absolute top-3 right-3 flex gap-1 rounded-md border border-line bg-black/70 p-1"
        role="group"
        aria-label="Rotate the Moon"
      >
        {(
          [
            ['left', '←'],
            ['up', '↑'],
            ['down', '↓'],
            ['right', '→'],
            ['reset', '↺'],
          ] as const
        ).map(([direction, icon]) => (
          <button
            key={direction}
            type="button"
            aria-label={direction === 'reset' ? 'Reset Moon view' : `Rotate Moon ${direction}`}
            disabled={!ready || failed}
            onClick={() => turn.current(direction)}
            className="grid size-7 cursor-pointer place-items-center rounded text-sm text-ink-muted hover:bg-white/10 hover:text-ink disabled:opacity-30"
          >
            {icon}
          </button>
        ))}
      </div>
      <p className={`pointer-events-none absolute left-3 text-2xs text-ink-muted ${markers.length ? 'bottom-3' : 'bottom-12'}`}>
        {failed ? 'Moon preview · 3D unavailable' : 'Drag to rotate · two fingers on touch'}
      </p>
    </div>
  )
}
