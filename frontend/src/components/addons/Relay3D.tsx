import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { glowTexture, palette as scenePalette } from '~/components/SiteIsland'
import { type RelayLadder, suggestedRelays } from '~/lib/relayLive'
import { loadSpace, R_MOON_KM, type Space, sampleSpace, spanHours } from '~/lib/space'
import { clock, shortDate } from '~/lib/time'
// ponytail: the three.js stage and the relay model still live with the prototypes; move them here when those go.
import tdrsUrl from '~/prototypes/models/relay-tdrs.glb?url'
import { type Build, loadModel, polyline, rgb, Stage } from '~/prototypes/stage'
import { rgbOf } from '~/prototypes/terrain'
import { Caption } from './RelayViews'
import { fitView, lerpSamples, orbitNormal, sampleAt, type Vec3 } from './relayTrack'

const rad = Math.PI / 180
/** Moon-fixed axes (x to 0°E on the equator, z to the north pole) to the scene (y up), in thousands of km. */
const toScene = (v: readonly number[]) => new THREE.Vector3((v[0] ?? 0) / 1000, (v[2] ?? 0) / 1000, -(v[1] ?? 0) / 1000)
const SKY = 1500 // thousand km: the Sun's disc sits on a sphere this far out
const SUN_X = 3
/** The Stage's vertical field of view; its canvas is always 4:3. */
const FOV = 32
/** Relays are markers, not to scale: each is held at this share of the distance to the camera, about 30 px across. */
const MARKER = 0.034
/** The whole stay plays in about this long. */
const PLAY_MS = 30_000
/** Each relay trails this much of its flight. */
const TRAIL_S = 24 * 3600

type Sky = { sun?: THREE.Vector3; earth?: THREE.Vector3; earthQ?: THREE.Quaternion; toMoon?: THREE.Quaternion }

/**
 * Sun, Earth and the sky's turn in the Moon-fixed scene at `ms` after the first sample. Earth comes from the comparison
 * itself when it sent positions; the Sun and the turn come from space.json, and are left out when the file does not
 * cover the stay.
 */
function skyAt(space: Space | null, track: RelayLadder['track'], ms: number): Sky {
  const fromTrack = track.earthKm?.length ? toScene(lerpSamples(track.earthKm, track.cadenceS, ms)) : undefined
  const hours = space ? (track.startMs + ms - Date.parse(space.start)) / 3_600_000 : Number.NaN
  if (!space || !(hours >= 0 && hours <= spanHours(space))) return { earth: fromTrack }
  const s = sampleSpace(space, hours)
  const toMoon = new THREE.Quaternion(...s.moonQ).invert()
  return {
    toMoon,
    sun: new THREE.Vector3(...s.sun).applyQuaternion(toMoon).normalize(),
    earth: fromTrack ?? new THREE.Vector3(...s.earth).multiplyScalar(1 / 1000).applyQuaternion(toMoon),
    earthQ: toMoon.clone().multiply(new THREE.Quaternion(...s.earthQ)),
  }
}

/** True while the Moon blocks the Sun from a point: behind the Moon and inside its shadow cylinder. */
const inShadow = (p: THREE.Vector3, sun: THREE.Vector3) =>
  p.dot(sun) < 0 && p.clone().addScaledVector(sun, -p.dot(sun)).length() < R_MOON_KM / 1000

const texLoader = new THREE.TextureLoader()
const texture = (url: string, srgb = true) =>
  texLoader.load(url, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
  })

const Blank = () => <div className="aspect-[4/3] w-full outline -outline-offset-1 outline-line" />

/** Relays in 3D: the comparison's own relay positions around the Moon, with a line whenever it finds contact. */
export default function Relay3D({ ladder, site }: { ladder: RelayLadder; site: { lat_deg: number; lon_deg_east: number } }) {
  const { track } = ladder
  const relayKm = track.relayKm ?? []
  const n = suggestedRelays(ladder.steps)
  const count = relayKm.length
  const offerAll = n > 0 && n < count
  const [all, setAll] = useState(!offerAll)
  const shown = all ? count : n
  const cadenceMs = track.cadenceS * 1000
  const spanMs = Math.max(cadenceMs, (track.direct.length - 1) * cadenceMs)
  const [ms, setMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  // undefined while loading; null when the file cannot be had, and the scene goes without the Sun.
  const [space, setSpace] = useState<Space | null>()
  const now = useRef(0)
  now.current = ms

  useEffect(() => {
    let live = true
    loadSpace()
      .then((sp) => live && setSpace(sp))
      .catch(() => live && setSpace(null))
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true)
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      setMs((m) => (m + ((t - last) * spanMs) / PLAY_MS) % spanMs)
      last = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, spanMs])

  // Framed once per set of relays shown: the Moon and every shown relay's whole path, seen from its orbit's side.
  const view = useMemo(() => {
    const shownKm = relayKm.slice(0, shown)
    const step = Math.max(1, Math.floor((shownKm[0]?.length ?? 0) / 1500))
    const points = shownKm.flatMap((samples) => samples.filter((_, j) => j % step === 0).map((v) => toScene(v).toArray() as Vec3))
    const firstDay = (shownKm[0] ?? relayKm[0] ?? [])
      .slice(0, Math.round(86_400 / track.cadenceS) + 1)
      .map((v) => toScene(v).toArray() as Vec3)
    const r = R_MOON_KM / 1000
    const moon: Vec3[] = [
      [r, 0, 0],
      [-r, 0, 0],
      [0, r, 0],
      [0, -r, 0],
      [0, 0, r],
      [0, 0, -r],
    ]
    return fitView([...moon, ...points], orbitNormal(firstDay), FOV, 4 / 3, 1.08)
  }, [relayKm, shown, track.cadenceS])

  if (space === undefined) return <Blank />

  const lat = site.lat_deg * rad
  const lon = site.lon_deg_east * rad
  const siteAt = toScene([R_MOON_KM * Math.cos(lat) * Math.cos(lon), R_MOON_KM * Math.cos(lat) * Math.sin(lon), R_MOON_KM * Math.sin(lat)])

  const build: Build = (root) => {
    const p = scenePalette()
    const relay = rgb(rgbOf('--relay'))

    // Stars: NASA SVS Deep Star Maps 2020 (J2000), tilted into the ecliptic, turned with the Moon when the turn is known.
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
    stars.quaternion.copy(ecliptic)

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(R_MOON_KM / 1000, 128, 64),
      new THREE.MeshStandardMaterial({
        map: texture('/moon/color-4k.jpg'),
        normalMap: texture('/moon/normal-2k.jpg', false),
        roughness: 1,
      }),
    )
    moon.castShadow = true
    moon.receiveShadow = true
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(6.371, 64, 32),
      new THREE.MeshStandardMaterial({ map: texture('/space/earth-day-4k.jpg'), roughness: 0.8 }),
    )
    const sunR = SKY * Math.tan(0.267 * rad) * SUN_X
    const sun = new THREE.Mesh(new THREE.SphereGeometry(sunR, 32, 16), new THREE.MeshBasicMaterial({ color: p.sun }))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: p.sun, transparent: true, depthWrite: false }))
    glow.scale.setScalar(sunR * 9)
    sun.add(glow)
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    const cam = light.shadow.camera
    cam.left = cam.bottom = -25
    cam.right = cam.top = 25
    cam.near = 1
    cam.far = 120
    light.shadow.bias = -0.0005
    // Earthshine fill; without a Sun it lights the whole Moon evenly.
    const fill = new THREE.AmbientLight(0xffffff, 0.06)
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: p.ink }))
    pin.position.copy(siteAt)
    const direct = polyline([siteAt.clone(), siteAt.clone()], p.comms, { opacity: 0.8 })
    root.add(stars, moon, earth, sun, light, fill, pin, direct)

    let alive = true
    const trailN = Math.max(2, Math.round(TRAIL_S / track.cadenceS) + 1)
    const craft = relayKm.slice(0, shown).map((samples, k) => {
      const dim = k >= n
      const positions = new Float32Array((trailN + 1) * 3)
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: relay, transparent: true, opacity: dim ? 0.25 : 0.6 }))
      trail.frustumCulled = false
      const body = new THREE.Group()
      const dotMat = new THREE.MeshBasicMaterial({ color: relay, transparent: true, opacity: dim ? 0.45 : 1 })
      const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), dotMat)
      body.add(dot)
      // Relays beyond the suggested number stay plain markers, so the suggested ones read first.
      if (!dim)
        loadModel(tdrsUrl).then((sat) => {
          if (!alive) return
          sat.traverse((m) => {
            m.receiveShadow = true
          })
          body.remove(dot)
          body.add(sat)
        })
      const sight = polyline([siteAt.clone(), siteAt.clone()], relay, { dashed: true, opacity: dim ? 0.5 : 1 })
      root.add(trail, body, sight)
      return { samples, k, dim, positions, geo, body, sight, dotMat }
    })
    root.userData.stop = () => {
      alive = false
    }

    return (camera) => {
      const t = now.current
      const i = sampleAt(track, t)
      const sky = skyAt(space, track, t)
      if (sky.toMoon) stars.quaternion.copy(sky.toMoon).multiply(ecliptic)
      sun.visible = !!sky.sun
      light.intensity = sky.sun ? 3 : 0
      fill.intensity = sky.sun ? 0.06 : 0.9
      if (sky.sun) {
        sun.position.copy(sky.sun).multiplyScalar(SKY)
        light.position.copy(sky.sun).multiplyScalar(60)
      }
      earth.visible = !!sky.earth
      if (sky.earth) earth.position.copy(sky.earth)
      if (sky.earthQ) earth.quaternion.copy(sky.earthQ)
      direct.visible = !!sky.earth && !!track.direct[i]
      if (direct.visible && sky.earth) direct.geometry.setFromPoints([siteAt, sky.earth])

      for (const c of craft) {
        const at = toScene(lerpSamples(c.samples, track.cadenceS, t))
        let m = 0
        for (let j = Math.max(0, i - trailN + 1); j <= i; j++) {
          const v = toScene(c.samples[j] ?? [])
          c.positions.set([v.x, v.y, v.z], m * 3)
          m++
        }
        c.positions.set([at.x, at.y, at.z], m * 3)
        c.geo.setDrawRange(0, m + 1)
        ;(c.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
        c.body.position.copy(at)
        c.body.scale.setScalar(camera.position.distanceTo(at) * MARKER * (c.dim ? 0.7 : 1))
        c.body.lookAt(0, 0, 0)
        c.dotMat.color.copy(relay).multiplyScalar(sky.sun && inShadow(at, sky.sun) ? 0.3 : 1)
        c.sight.visible = !!track.relayed[c.k]?.[i]
        if (c.sight.visible) {
          c.sight.geometry.setFromPoints([siteAt, at])
          c.sight.computeLineDistances()
        }
      }
    }
  }

  const i = sampleAt(track, ms)
  const sky = skyAt(space, track, ms)
  const at = new Date(track.startMs + ms)
  const via = track.direct[i] ? -1 : relayKm.slice(0, shown).findIndex((_, k) => track.relayed[k]?.[i])
  const status = via === -1 ? 'Earth is in view directly' : via >= 0 ? `In contact through relay ${via + 1}` : 'No line of sight to Earth'
  const dayOf = Math.floor(ms / 86_400_000) + 1
  const days = Math.max(1, Math.ceil((spanMs + cadenceMs) / 86_400_000))

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {offerAll && (
          <div className="grid gap-1.5">
            <span id="relay-3d-shown" className="text-sm text-ink-muted">
              Relays shown
            </span>
            <ButtonGroup aria-labelledby="relay-3d-shown">
              <Button variant={all ? 'secondary' : 'primary'} aria-pressed={!all} onClick={() => setAll(false)}>
                Suggested ({n})
              </Button>
              <Button variant={all ? 'primary' : 'secondary'} aria-pressed={all} onClick={() => setAll(true)}>
                All {count}
              </Button>
            </ButtonGroup>
          </div>
        )}
        <div className="flex min-w-0 flex-1 basis-64 items-end gap-3">
          <Button variant="secondary" shape="square" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          </Button>
          <label className="grid min-w-0 flex-1 gap-1.5">
            <span className="text-sm text-ink-muted">
              <span className="tabular text-ink">
                {shortDate(at.toISOString().slice(0, 10))} · {clock(at)} UTC
              </span>{' '}
              <span className="tabular">
                · day {dayOf} of {days}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={spanMs}
              step={cadenceMs}
              value={ms}
              aria-label="Time in the stay"
              aria-valuetext={`${shortDate(at.toISOString().slice(0, 10))} ${clock(at)} UTC, day ${dayOf} of ${days}`}
              onChange={(e) => {
                setPlaying(false)
                setMs(Number(e.target.value))
              }}
              className="h-9 w-full max-w-md accent-(--brand)"
            />
          </label>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]">
        <Stage
          key={shown}
          build={build}
          deps={[track, shown, n, space]}
          label="The Moon with the relays on their computed paths, and lines of contact from the site"
          eye={view.eye}
          aim={view.target}
          fov={FOV}
          far={4000}
          lights={false}
        />
        <div className="grid content-start gap-4">
          <p className="text-base font-medium text-pretty" aria-live="off">
            {status}
          </p>
          <ul className="grid text-sm">
            <li
              className={`grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-2.5 ${track.direct[i] ? '' : 'text-ink-muted'}`}
            >
              <span
                aria-hidden
                className={`h-2.5 w-5 self-center ${track.direct[i] ? 'bg-comms' : 'outline -outline-offset-1 outline-line'}`}
              />
              <span>Direct to Earth</span>
              <span>{track.direct[i] ? 'In view' : 'Hidden'}</span>
            </li>
            {relayKm.slice(0, shown).map((samples, k) => {
              const on = !!track.relayed[k]?.[i]
              const dark = !!sky.sun && inShadow(toScene(lerpSamples(samples, track.cadenceS, ms)), sky.sun)
              return (
                <li
                  key={k}
                  className={`grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-2.5 ${on ? '' : 'text-ink-muted'}`}
                >
                  <span aria-hidden className={`h-2.5 w-5 self-center ${on ? 'lane-relay' : 'outline -outline-offset-1 outline-line'}`} />
                  <span>
                    Relay {k + 1}
                    {n > 0 && k >= n && <span className="text-ink-faint"> · beyond suggested</span>}
                    {dark && <span className="text-ink-faint"> · in the Moon’s shadow</span>}
                  </span>
                  <span>{on ? 'In contact' : 'No line of sight'}</span>
                </li>
              )
            })}
          </ul>
          <Caption>
            Relay positions come from the comparison for your stay, every {track.cadenceS / 60} min, joined by straight lines; each relay
            trails its last day. A dashed pink line joins the site to a relay while the comparison finds it sees both the site over its
            skyline and Earth; a cyan line joins the site to Earth while Earth clears the skyline. The Moon and Earth are to scale; relays
            are markers held at one size on screen, NASA’s TDRS model standing in.{' '}
            {sky.sun
              ? `The Sun and stars stand where SPICE puts them, the Sun drawn ${SUN_X}× its size. Drag to orbit, scroll to zoom.`
              : 'The Sun’s position is not on file for these dates, so the Moon is lit evenly. Drag to orbit, scroll to zoom.'}
          </Caption>
        </div>
      </div>
    </div>
  )
}
