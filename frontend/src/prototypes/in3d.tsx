import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { glowTexture, palette as scenePalette } from '~/components/SiteIsland'
import type { LegacyMastData as MastData } from '~/lib/feed-schemas'
import { reducedMotion } from '~/lib/motion'
import { heightAt } from '~/lib/sky'
import { loadSpace, type Space, sampleSpace } from '~/lib/space'
import { clock as clockOf, shortDate } from '~/lib/time'
import { at, frontOf, Heights, heightsOf, Radius, SpotCard, spots } from './mast'
import tdrsUrl from './models/relay-tdrs.glb?url'
import merUrl from './models/rover-mer.glb?url'
import { cellOf, type Field, km2, Range, reachKm, SCENARIOS, Swatch, usePalette, useRover } from './rover'
import { SkyClock, useSiteSky } from './sky'
import { type Build, EARTH_SCALE, facing, loadModel, polyline, rgb, Stage, SUN_SCALE, shadowBoxOf, sharedTerrain } from './stage'
import { Fig, useTerrain } from './terrain'

const Blank = () => <div className="aspect-[4/3] outline -outline-offset-1 outline-line" />

/** Masts are drawn this many times taller than they are: at true height a 30 m mast is two pixels. */
const MAST_X = 10

/** Mast in 3D: the spots as poles on the real terrain, the cable reach as a ring on the ground. */
export function Mast3D({ data }: { data: MastData }) {
  const terrain = useTerrain()
  const sky = useSiteSky()
  const heights = heightsOf(data)
  const [height, setHeight] = useState(heights.at(-2) ?? 0)
  const [radius, setRadius] = useState(1000)
  const [picked, setPicked] = useState<string>()
  const all = spots(data)
  const reach = all.filter((s) => s.distance <= radius)
  const front = frontOf(reach, height)
  const ranked = [...reach].sort((a, b) => at(b, height).sun_share - at(a, height).sun_share)
  const shown = all.find((s) => s.id === picked) ?? ranked[0]

  const build: Build = (root) => {
    if (!terrain) return
    const p = scenePalette()
    root.add(sharedTerrain(terrain, p, undefined, sky?.outer))
    const ground = (eastM: number, northM: number) => heightAt(terrain, eastM / 1000, -northM / 1000)
    const { ink, sun, comms } = p
    const ring = Array.from({ length: 129 }, (_, i) => {
      const a = (i / 128) * 2 * Math.PI
      const e = radius * Math.sin(a)
      const n = radius * Math.cos(a)
      return new THREE.Vector3(e / 1000, ground(e, n) + 0.012, -n / 1000)
    })
    root.add(polyline(ring, ink, { opacity: 0.9 }))
    for (const s of all) {
      const o = at(s, height)
      const inside = s.distance <= radius
      const tall = (height * MAST_X) / 1000
      const foot = new THREE.Vector3(s.east_m / 1000, ground(s.east_m, s.north_m), -s.north_m / 1000)
      const on = s.id === shown?.id
      const fade = inside ? 1 : 0.3
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(on ? 0.012 : 0.006, on ? 0.012 : 0.006, tall, 8),
        new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: fade }),
      )
      pole.position.copy(foot).setY(foot.y + tall / 2)
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 + 0.04 * o.sun_share, 20, 12),
        new THREE.MeshBasicMaterial({ color: sun, transparent: true, opacity: fade }),
      )
      head.position.copy(foot).setY(foot.y + tall)
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.03 + 0.07 * o.earth_center_share, 0.006, 8, 48),
        new THREE.MeshBasicMaterial({ color: comms, transparent: true, opacity: fade }),
      )
      halo.rotation.x = Math.PI / 2
      halo.position.copy(head.position)
      root.add(pole, head, halo)
      if (front.has(s.id)) {
        const base = new THREE.Mesh(
          new THREE.RingGeometry(0.03, 0.045, 32),
          new THREE.MeshBasicMaterial({ color: ink, side: THREE.DoubleSide }),
        )
        base.rotation.x = -Math.PI / 2
        base.position.copy(foot).setY(foot.y + 0.012)
        root.add(base)
      }
    }
    return undefined
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Heights heights={heights} value={height} onChange={setHeight} />
        <Radius value={radius} onChange={setRadius} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          {terrain && sky ? (
            <Stage
              build={build}
              deps={[terrain, height, radius, shown?.id]}
              label="Mast spots as poles on the sunlit terrain around the site"
              eye={facing(sky.now.sun?.az ?? 180, 5.2, 13)}
              aim={[0, 0.25, 0]}
              fov={40}
              far={2000}
              sky={sky.now}
              shadowBox={shadowBoxOf(terrain, sky.outer)}
            />
          ) : (
            <Blank />
          )}
          {sky && <SkyClock sky={sky.clock} />}
          <Fig>
            The same terrain as Visualize, at true height, with a contour every 250 m and the coarser terrain veiled around it. The Sun and
            Earth stand where the pipeline puts them for this site, drawn {SUN_SCALE}× and {EARTH_SCALE}× their true size. Shadows are drawn
            from the terrain out to 60 km and only show the look of the light; whether the site is in sun comes from the pipeline. Masts are
            drawn {MAST_X}× taller than they are. The amber ball grows with the Sun share and the cyan hoop with the Earth share. A ring at
            the foot marks a spot no other in reach beats. Drag to orbit, scroll to zoom.
          </Fig>
        </div>
        <div className="grid content-start gap-6">
          <div className="grid gap-1.5">
            <span id="proto-3d-spot" className="text-sm text-ink-muted">
              Spots in cable reach, sunniest first
            </span>
            <div role="group" aria-labelledby="proto-3d-spot" className="flex flex-wrap gap-1">
              {ranked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === shown?.id}
                  onClick={() => setPicked(s.id)}
                  className={`readout h-9 px-2.5 text-sm outline -outline-offset-1 transition-colors duration-(--duration-fast) ${s.id === shown?.id ? 'bg-brand text-bg outline-brand' : 'outline-line hover:bg-surface-hover'}`}
                >
                  {s.id}
                </button>
              ))}
            </div>
          </div>
          {shown && <SpotCard spot={shown} height={height} heights={heights} radius={radius} onFront={front.has(shown.id)} />}
        </div>
      </div>
    </div>
  )
}

/** Rover in 3D: the reach draped over the terrain, with a route and a rover at its far end. */
export function Rover3D() {
  const [speed, setSpeed] = useState(40)
  const [maxSlope, setMaxSlope] = useState(15)
  const { terrain, model, fields } = useRover(maxSlope)
  const palette = usePalette()
  const sky = useSiteSky()
  if (!terrain || !model || !fields || !sky) return <Blank />
  const limits = SCENARIOS.map((s) => reachKm(speed, s.hours))
  const level = (i: number) => fields.findIndex((f, k) => (f.dist[i] as number) <= (limits[k] as number))
  const areas = SCENARIOS.map((_, k) =>
    km2(
      model,
      (fields[k] as Field).dist.reduce((n, d) => n + (d <= (limits[k] as number) ? 1 : 0), 0),
    ),
  )
  const far = fields[2] as Field
  const start = ((model.g - 1) / 2) * model.g + (model.g - 1) / 2
  const goal = far.dist.reduce((best, d, i) => (d <= (limits[2] as number) && d > (far.dist[best] as number) ? i : best), start)
  const path: number[] = []
  for (let i = goal; i >= 0; i = far.prev[i] as number) path.unshift(i)

  const build: Build = (root) => {
    const p = scenePalette()
    const relay = rgb(palette.relay)
    const tints = [p.comms, relay, relay.clone().lerp(p.land, 0.55)]
    root.add(sharedTerrain(terrain, p, (col, row) => tints[level(cellOf(model, col, row))], sky.outer))
    const ground = (eastM: number, northM: number) => heightAt(terrain, eastM / 1000, -northM / 1000)
    const { ink } = p
    const spot = (i: number, lift: number) => {
      const e = (i % model.g) * model.cell - model.half
      const n = model.half - Math.floor(i / model.g) * model.cell
      return new THREE.Vector3(e / 1000, ground(e, n) + lift, -n / 1000)
    }
    root.add(
      polyline(
        path.map((i) => spot(i, 0.04)),
        ink,
      ),
    )
    const mast = polyline([spot(start, 0), spot(start, 0.9)], ink)
    root.add(mast)
    let alive = true
    loadModel(merUrl).then((rover) => {
      if (!alive) return
      rover.scale.setScalar(1.6)
      rover.position.copy(spot(goal, 0.02))
      root.add(rover)
    })
    root.userData.stop = () => {
      alive = false
    }
    return undefined
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Range label="Average speed" value={speed} unit=" m/h" min={10} max={100} step={5} onChange={setSpeed} />
        <Range label="Steepest slope it will take" value={maxSlope} unit="°" min={5} max={25} step={1} onChange={setMaxSlope} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <Stage
            build={build}
            deps={[speed, maxSlope, fields, palette]}
            label="Rover reach draped over the sunlit terrain around the site"
            eye={facing(sky.now.sun?.az ?? 180, 33, 17, 16)}
            aim={[0, 1.5, 0]}
            fov={40}
            far={2000}
            sky={sky.now}
            shadowBox={shadowBoxOf(terrain, sky.outer)}
          />
          <SkyClock sky={sky.clock} />
          <Fig>
            The same terrain as Visualize, 20 km across, at true height, with the coarser terrain veiled around it. The Sun and Earth stand
            where the pipeline puts them for this site, drawn {SUN_SCALE}× and {EARTH_SCALE}× their true size; the shadows only show the
            look of the light. Cyan is reach with direct contact; pink is what Pathfinder adds, pale pink the network. The line is the
            longest drive inside the widest reach. The rover is NASA's Opportunity model standing in for a lunar rover, drawn about 1.6 km
            long so it can be seen. The upright line marks the landing site.
          </Fig>
        </div>
        <div className="grid content-start gap-5">
          <p className="max-w-[40ch] text-xl text-pretty">
            Relays take the reach from <span className="tabular">{(areas[0] as number).toFixed(1)}</span> to{' '}
            <span className="tabular">{(areas[2] as number).toFixed(1)} km²</span> in one lunar month.
          </p>
          <dl className="grid max-w-md">
            {SCENARIOS.map((s, i) => (
              <div key={s.id} className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-3">
                <Swatch i={i} />
                <dt>{s.label}</dt>
                <dd className="readout text-right">{(areas[i] as number).toFixed(1)} km²</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-ink-muted">
            Longest drive shown: <span className="tabular text-ink">{(far.dist[goal] as number).toFixed(1)} km</span>.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Planned relay orbits, taken from ds/pipeline/relay_orbits.json (retrieved 2026-11-14).
 * Pathfinder: SSTL Lunar Pathfinder Service Guide, section 3.4.3, "indicative"; no mean anomaly is published, so 0 is used.
 * LDN-1 to 5: Brack et al., AAS 25-758, Table 2, preliminary design; its RAAN zero point is unstated.
 * ILLUSTRATIVE: the elements are propagated as plain two-body orbits about the Moon's pole, and the
 * horizon is flat. The pipeline's relay feed, with terrain and the real frames, replaces all of this.
 */
const ORBITS = [
  { id: 'Lunar Pathfinder', group: 0, a: 5740, e: 0.58, i: 54.856, raan: 0, argp: 86.322, m: 0 },
  { id: 'LDN-1', group: 1, a: 12002.3, e: 0.678, i: 56.24, raan: 40.1, argp: 90.03, m: 0.62 },
  { id: 'LDN-2', group: 1, a: 12005.1, e: 0.706, i: 56.14, raan: 41.18, argp: 89.64, m: 183.51 },
  { id: 'LDN-3', group: 1, a: 11988.1, e: 0.695, i: 56.71, raan: 161.41, argp: 90.32, m: 60.37 },
  { id: 'LDN-4', group: 1, a: 12013.8, e: 0.683, i: 55.84, raan: 160.82, argp: 90.69, m: 236.41 },
  { id: 'LDN-5', group: 1, a: 11997.3, e: 0.698, i: 57.24, raan: 279.93, argp: 89.84, m: 114.83 },
] as const
type Orbit = (typeof ORBITS)[number]
const MU_MOON = 4902.800066 // km3/s2, GRAIL, as in ds/pipeline/relay_check.py
const MOON_KM = 1737.4
const SITE = { lat: -89.4679, lon: 222.589 } // frontend/data/connecting-ridge.json
const rad = Math.PI / 180
const WINDOW_H = 48

/** Moon-fixed axes (x to 0°E on the equator, z to the north pole) to the scene (y up), in thousands of km. */
const toScene = (x: number, y: number, z: number) => new THREE.Vector3(x / 1000, z / 1000, -y / 1000)

/** Position on the orbit at mean anomaly `m` radians. */
function onOrbit(o: Orbit, m: number) {
  let E = m
  for (let k = 0; k < 12; k++) E -= (E - o.e * Math.sin(E) - m) / (1 - o.e * Math.cos(E))
  const p = o.a * (Math.cos(E) - o.e)
  const q = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)
  const [cw, sw, ci, si, cO, sO] = [
    Math.cos(o.argp * rad),
    Math.sin(o.argp * rad),
    Math.cos(o.i * rad),
    Math.sin(o.i * rad),
    Math.cos(o.raan * rad),
    Math.sin(o.raan * rad),
  ]
  const x = p * cw - q * sw
  const y = p * sw + q * cw
  return toScene(x * cO - y * ci * sO, x * sO + y * ci * cO, y * si)
}
const at_h = (o: Orbit, hours: number) => onOrbit(o, o.m * rad + Math.sqrt(MU_MOON / o.a ** 3) * hours * 3600)
const site = toScene(
  MOON_KM * Math.cos(SITE.lat * rad) * Math.cos(SITE.lon * rad),
  MOON_KM * Math.cos(SITE.lat * rad) * Math.sin(SITE.lon * rad),
  MOON_KM * Math.sin(SITE.lat * rad),
)
const up = site.clone().normalize()
/** Elevation of a relay above the site's flat horizon, in degrees. */
const elevation = (o: Orbit, hours: number) => Math.asin(at_h(o, hours).sub(site).normalize().dot(up)) / rad

/** The window starts where ds/pipeline/relay_check.py runs its first month, so the Sun and Earth match that run. */
const EPOCH = Date.parse('2027-03-01T00:00:00Z')
const SKY = 1500 // thousand km: the Sun's disc sits on a sphere this far out
const SUN_X = 3
/**
 * Relays are markers, not models to scale: a real one is metres across, far below a pixel here. Each is held at
 * this share of the distance to the camera, about 30 px across in the default view, whatever the zoom.
 */
const MARKER = 0.034

/** Sun direction, Earth position and orientation in the Moon-fixed scene, from the SPICE ephemeris in space.json. */
function skyAt(space: Space, hours: number) {
  const s = sampleSpace(space, (EPOCH - Date.parse(space.start)) / 3_600_000 + hours)
  const toMoon = new THREE.Quaternion(...s.moonQ).invert()
  return {
    toMoon,
    sun: new THREE.Vector3(...s.sun).applyQuaternion(toMoon).normalize(),
    earth: new THREE.Vector3(...s.earth).multiplyScalar(1 / 1000).applyQuaternion(toMoon),
    earthQ: toMoon.clone().multiply(new THREE.Quaternion(...s.earthQ)),
  }
}

/** True while the Moon blocks the Sun from a point: behind the Moon and inside its shadow cylinder (the umbra is ~380,000 km long). */
const inShadow = (p: THREE.Vector3, sun: THREE.Vector3) =>
  p.dot(sun) < 0 && p.clone().addScaledVector(sun, -p.dot(sun)).length() < MOON_KM / 1000

const texLoader = new THREE.TextureLoader()
const texture = (url: string, srgb = true) =>
  texLoader.load(url, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
  })

/** Relays in 3D: the Moon lit by the real Sun, the planned orbits, and a line whenever a relay stands above the site's horizon. */
export function Relay3D() {
  const [network, setNetwork] = useState(true)
  const [hours, setHours] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [space, setSpace] = useState<Space>()
  const clock = useRef(0)
  clock.current = hours
  const palette = usePalette()
  const shown = useMemo(() => ORBITS.filter((o) => o.group === 0 || network), [network])

  useEffect(() => {
    let live = true
    loadSpace().then((sp) => live && setSpace(sp))
    if (!reducedMotion().matches) setPlaying(true)
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // Two hours of orbit per second.
      setHours((h) => (h + ((now - last) / 1000) * 2) % WINDOW_H)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  if (!space) return <Blank />

  const build: Build = (root) => {
    const ink = scenePalette().ink
    const sunColor = scenePalette().sun
    const relay = rgb(palette.relay)

    // Stars: NASA SVS Deep Star Maps 2020 (J2000), tilted into the ecliptic and turned into the Moon-fixed frame, as on /moon.
    const starTex = texture('/space/stars-4k.jpg')
    starTex.wrapS = THREE.RepeatWrapping
    starTex.repeat.x = -1
    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(SKY * 1.5, 64, 32),
      new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite: false, color: new THREE.Color(0.3, 0.3, 0.3) }),
    )
    stars.renderOrder = -1
    const obl = 23.4392911 * rad
    const ecliptic = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().set(1, 0, 0, 0, 0, Math.cos(obl), Math.sin(obl), 0, 0, -Math.sin(obl), Math.cos(obl), 0, 0, 0, 0, 1),
    )

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_KM / 1000, 128, 64),
      new THREE.MeshStandardMaterial({
        map: texture('/moon/color-4k.jpg'),
        normalMap: texture('/moon/normal-2k.jpg', false),
        roughness: 1,
      }),
    )
    moon.castShadow = true
    moon.receiveShadow = true

    // Earth at its true distance and size, turned as SPICE has it; its phase comes from the same sunlight.
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(6.371, 64, 32),
      new THREE.MeshStandardMaterial({ map: texture('/space/earth-day-4k.jpg'), roughness: 0.8 }),
    )
    const sunR = SKY * Math.tan(0.267 * rad) * SUN_X
    const sun = new THREE.Mesh(new THREE.SphereGeometry(sunR, 32, 16), new THREE.MeshBasicMaterial({ color: sunColor }))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: sunColor, transparent: true, depthWrite: false }))
    glow.scale.setScalar(sunR * 9)
    sun.add(glow)

    // One light from the Sun; the Moon's shadow falls on the relays that pass behind it.
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    const cam = light.shadow.camera
    cam.left = cam.bottom = -25
    cam.right = cam.top = 25
    cam.near = 1
    cam.far = 120
    light.shadow.bias = -0.0005
    // A faint fill for earthshine, so the night side is not a hole.
    const fill = new THREE.AmbientLight(0xffffff, 0.06)
    root.add(stars, moon, earth, sun, light, fill)

    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: ink }))
    pin.position.copy(site)
    const horizon = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 5, 96),
      new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    )
    horizon.position.copy(site)
    horizon.lookAt(site.clone().add(up))
    root.add(pin, horizon)
    let alive = true
    const craft = shown.map((o) => {
      const path = Array.from({ length: 241 }, (_, k) => onOrbit(o, (k / 240) * 2 * Math.PI))
      root.add(polyline(path, o.group === 0 ? ink : relay, { opacity: o.group === 0 ? 0.75 : 0.45 }))
      const body = new THREE.Group()
      const dotMat = new THREE.MeshBasicMaterial({ color: relay })
      const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), dotMat)
      body.add(dot)
      loadModel(tdrsUrl).then((sat) => {
        if (!alive) return
        sat.traverse((m) => {
          m.receiveShadow = true
        })
        body.remove(dot)
        body.add(sat)
      })
      const sight = polyline([site.clone(), site.clone()], relay, { dashed: true })
      root.add(body, sight)
      return { o, body, sight, dotMat }
    })
    root.userData.stop = () => {
      alive = false
    }
    return (camera) => {
      const now = skyAt(space, clock.current)
      stars.quaternion.copy(now.toMoon).multiply(ecliptic)
      sun.position.copy(now.sun).multiplyScalar(SKY)
      light.position.copy(now.sun).multiplyScalar(60)
      earth.position.copy(now.earth)
      earth.quaternion.copy(now.earthQ)
      for (const { o, body, sight, dotMat } of craft) {
        const p = at_h(o, clock.current)
        body.position.copy(p)
        body.scale.setScalar(camera.position.distanceTo(p) * MARKER)
        body.lookAt(0, 0, 0)
        dotMat.color.copy(relay).multiplyScalar(inShadow(p, now.sun) ? 0.3 : 1)
        sight.visible = p.clone().sub(site).dot(up) > 0
        if (sight.visible) {
          sight.geometry.setFromPoints([site, p])
          sight.computeLineDistances()
        }
      }
    }
  }

  const now = skyAt(space, hours)
  const rows = shown.map((o) => ({ o, el: elevation(o, hours), dark: inShadow(at_h(o, hours), now.sun) }))
  const above = rows.filter((r) => r.el > 0).length
  const at = new Date(EPOCH + hours * 3_600_000)
  // Start with the Sun to one side of the view, so the globe shows its terminator.
  const start = skyAt(space, 0).sun
  const eye = new THREE.Vector3(16, -22, 44).applyAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.atan2(start.x, start.z) + 1.25 - Math.atan2(16, 44),
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="grid gap-1.5">
          <span id="proto-3d-relay" className="text-sm text-ink-muted">
            Relays
          </span>
          <ButtonGroup aria-labelledby="proto-3d-relay">
            <Button variant={network ? 'secondary' : 'primary'} aria-pressed={!network} onClick={() => setNetwork(false)}>
              Pathfinder
            </Button>
            <Button variant={network ? 'primary' : 'secondary'} aria-pressed={network} onClick={() => setNetwork(true)}>
              + Network
            </Button>
          </ButtonGroup>
        </div>
        <div className="flex items-end gap-3">
          <Button variant="secondary" shape="square" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          </Button>
          <label className="grid gap-1.5">
            <span className="text-sm text-ink-muted">
              Time{' '}
              <span className="readout text-ink">
                {shortDate(at.toISOString().slice(0, 10))} {at.getUTCFullYear()} · {clockOf(at)} UTC
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={WINDOW_H}
              step={0.1}
              value={hours}
              aria-valuetext={`${shortDate(at.toISOString().slice(0, 10))} ${clockOf(at)} UTC`}
              onChange={(e) => {
                setPlaying(false)
                setHours(Number(e.target.value))
              }}
              className="h-9 w-72 accent-(--brand)"
            />
          </label>
        </div>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <Stage
            build={build}
            deps={[shown, palette, space]}
            label="The Moon lit by the Sun, the planned relay orbits and lines of sight to the site"
            eye={eye.toArray() as [number, number, number]}
            aim={[0, -7, 0]}
            far={4000}
            lights={false}
          />
          <Fig>
            The Moon, Earth and the orbits are to scale, and the Sun is drawn {SUN_X}× its size. The relays are markers held at one size on
            screen: a real one is a few metres across, far smaller than a pixel at this scale. The Sun, Earth and stars stand where SPICE
            puts them from 1 Mar 2027 (the start of the relay check run), and the Moon's shadow falls on relays behind it. The dot at the
            south pole is the site and the pale disc is its flat horizon. A dashed line appears while a relay is above it. The marker is
            NASA's TDRS model standing in for the planned relays.
          </Fig>
        </div>
        <div className="grid content-start gap-5">
          <p className="max-w-[36ch] text-xl text-pretty">
            <span className="tabular">{above}</span> of {rows.length} {rows.length === 1 ? 'relay is' : 'relays are'} above the site's flat
            horizon.
          </p>
          <ul className="grid max-w-md">
            {rows.map(({ o, el, dark }) => (
              <li
                key={o.id}
                className={`grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-2.5 ${el > 0 ? '' : 'text-ink-muted'}`}
              >
                <span aria-hidden className={`h-2.5 w-5 self-center ${el > 0 ? 'lane-relay' : 'outline -outline-offset-1 outline-line'}`} />
                <span>
                  {o.id}
                  {dark && <span className="text-ink-faint"> · in the Moon's shadow</span>}
                </span>
                <span className="readout font-normal">{el > 0 ? `${el.toFixed(0)}° up` : 'below'}</span>
              </li>
            ))}
          </ul>
          <Fig>
            Illustrative. Orbit elements are the published planned ones (SSTL service guide; AAS 25-758), run as plain two-body orbits fixed
            to the turning Moon, with a flat horizon and no terrain. Pathfinder's starting point on its orbit is not published. This is line
            of sight only, not a radio link.
          </Fig>
        </div>
      </div>
    </div>
  )
}

export default function In3D({ piece, mast }: { piece: 'mast' | 'relay' | 'rover'; mast: MastData }) {
  return piece === 'mast' ? <Mast3D data={mast} /> : piece === 'relay' ? <Relay3D /> : <Rover3D />
}
