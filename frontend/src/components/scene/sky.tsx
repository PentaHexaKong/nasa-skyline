import { Button } from '@cloudflare/kumo/components/button'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { type Moment, moment } from '~/components/Moment'
import { loadMoonEphemeris, loadSummary, loadTerrain, type MoonEphemeris, type Summary, type Terrain } from '~/lib/data'
import { earthTarget } from '~/lib/target'
import { clock, shortDate } from '~/lib/time'
import { defaultDay } from '~/lib/useSiteView'
import { useTracks } from '~/lib/useTracks'
import { SITE } from './terrain'

/** The Sun and Earth over the site at one instant, as the 3D stage draws them. */
export type SkyNow = {
  sun?: { az: number; el: number }
  /** Direct sun at the site, from the pipeline's 1 s intervals. The rendered shadows are decoration; this is the answer. */
  inSun: boolean
  earth?: { az: number; el: number; visible: boolean }
}

const HOUR = 3_600_000
const rad = Math.PI / 180

/**
 * The Sun's azimuth and elevation at the site from the hourly sub-solar points (SPICE, ME frame), interpolated.
 * Stored tracks skip samples below -1°, but a hilltop sees the Sun down to about -2.7° (the dip of its horizon), so
 * this fills those hours. Parallax is ignored: the Moon's radius moves the Sun by under 0.001°.
 */
function sunFromEphemeris(eph: MoonEphemeris, site: { lat: number; lon: number }, at: number) {
  const x = (at - Date.parse(eph.start)) / (eph.step_h * HOUR)
  const i = Math.floor(x)
  if (i < 0 || i + 1 >= eph.subsolar_lat_deg.length) return undefined
  const unit = (lat: number, lon: number) => [
    Math.cos(lat * rad) * Math.cos(lon * rad),
    Math.cos(lat * rad) * Math.sin(lon * rad),
    Math.sin(lat * rad),
  ]
  const a = unit(eph.subsolar_lat_deg[i] ?? 0, eph.subsolar_lon_deg_east[i] ?? 0)
  const b = unit(eph.subsolar_lat_deg[i + 1] ?? 0, eph.subsolar_lon_deg_east[i + 1] ?? 0)
  const f = x - i
  const sun = a.map((v, k) => v + ((b[k] ?? 0) - v) * f)
  const up = unit(site.lat, site.lon)
  const east = [-Math.sin(site.lon * rad), Math.cos(site.lon * rad), 0]
  const north = [
    -Math.sin(site.lat * rad) * Math.cos(site.lon * rad),
    -Math.sin(site.lat * rad) * Math.sin(site.lon * rad),
    Math.cos(site.lat * rad),
  ]
  const dot = (u: number[]) => u.reduce((t, v, k) => t + v * (sun[k] ?? 0), 0)
  const len = Math.hypot(...sun)
  return { az: (((Math.atan2(dot(east), dot(north)) / rad) % 360) + 360) % 360, el: Math.asin(dot(up) / len) / rad }
}
/** One lunar month, so the Sun goes once around the site's sky. */
const WINDOW_H = 30 * 24
/** Playback speed: a day of the window per second. */
const PLAY_H_PER_S = 24

/**
 * Real Sun, Earth and direct-sun state for the prototype site over one lunar month, from the same pipeline files as
 * Visualize, plus the coarse surround terrain. The month starts on Visualize's default day, and the clock opens two
 * hours before the first terrain sunset in it, so pressing play shows the ridge's shadow reaching the site.
 */
export function useSiteSky() {
  const [summary, setSummary] = useState<Summary>()
  const [outer, setOuter] = useState<Terrain>()
  const [eph, setEph] = useState<MoonEphemeris>()
  const tracks = useTracks(SITE)
  useEffect(() => {
    let live = true
    loadSummary(SITE).then((s) => live && setSummary(s))
    loadMoonEphemeris().then((e) => live && setEph(e))
    loadTerrain(SITE, 'outer').then((t) => live && setOuter(t))
    return () => {
      live = false
    }
  }, [])

  const start = useMemo(() => (summary ? Date.parse(`${defaultDay(summary)}T00:00:00Z`) : 0), [summary])
  const [hours, setHours] = useState<number>()
  const [playing, setPlaying] = useState(false)
  const opening = useMemo(() => {
    if (!summary) return 12
    const sunset = summary.intervals.map(([, b]) => Date.parse(b)).find((b) => b > start + 2 * HOUR && b < start + WINDOW_H * HOUR)
    return sunset ? (sunset - start) / HOUR - 2 : 12
  }, [summary, start])
  const h = hours ?? opening

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      setHours((v) => ((v ?? opening) + ((now - last) / 1000) * PLAY_H_PER_S) % WINDOW_H)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, opening])

  if (!summary || !outer || !tracks || !eph) return undefined
  const at = new Date(start + h * HOUR)
  const date = at.toISOString().slice(0, 10)
  const minute = (at.getTime() % (24 * HOUR)) / 60_000
  const track = tracks[date]
  const raw = moment(summary, track, date, minute)
  const sun = raw.sun ?? sunFromEphemeris(eph, { lat: summary.site.lat_deg, lon: summary.site.lon_deg_east }, at.getTime())
  // From a hilltop the horizon dips below flat, so "behind terrain" runs down to the lowest point of the skyline.
  const dip = Math.min(...summary.skyline.elevation_deg)
  const phase = raw.state.inSun ? 'sun' : sun && sun.el > dip ? 'shadow' : 'night'
  const m = { ...raw, sun, phase: phase as Exclude<Moment['phase'], 'loading'> }
  const ref = earthTarget(summary, track, date, minute)?.reference
  const now: SkyNow = {
    sun: sun && { az: sun.az, el: sun.el },
    inSun: m.state.inSun,
    earth: ref && { az: ref.az_deg, el: ref.el_deg, visible: ref.visible },
  }
  return {
    outer,
    now,
    clock: { at, hours: h, m, earth: now.earth, playing, setPlaying, setHours },
  }
}

const SUN_STATE: Record<Exclude<Moment['phase'], 'loading'>, { text: string; dot: string }> = {
  sun: { text: 'in direct sun', dot: 'bg-sun' },
  shadow: { text: 'behind terrain', dot: 'border-[1.5px] border-sun' },
  night: { text: 'below the horizon', dot: 'border-[1.5px] border-ink-faint' },
}

/** Play, scrub and read out the instant the scene is lit for. */
export function SkyClock({ sky }: { sky: NonNullable<ReturnType<typeof useSiteSky>>['clock'] }) {
  const { at, hours, m, earth, playing, setPlaying, setHours } = sky
  const s = SUN_STATE[m.phase]
  return (
    <div className="grid gap-2">
      <div className="flex items-end gap-3">
        <Button variant="secondary" shape="square" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
          {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </Button>
        <label className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-sm text-ink-muted">
            Sun and shadows at{' '}
            <span className="readout text-ink">
              {shortDate(at.toISOString().slice(0, 10))} {at.getUTCFullYear()} · {clock(at)} UTC
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={WINDOW_H}
            step={1 / 6}
            value={hours}
            aria-valuetext={`${shortDate(at.toISOString().slice(0, 10))} ${clock(at)} UTC`}
            onChange={(e) => {
              setPlaying(false)
              setHours(Number(e.target.value))
            }}
            className="h-9 w-full accent-(--brand)"
          />
        </label>
      </div>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className={`size-2.5 rounded-full ${s.dot}`} />
          {m.sun ? (
            <span>
              Sun <span className="tabular">{Math.abs(m.sun.el).toFixed(1)}°</span> {m.sun.el < 0 ? 'below' : 'above'} the flat horizon,{' '}
              {s.text}
            </span>
          ) : (
            <span>Sun {s.text}</span>
          )}
        </span>
        {earth && (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className={`size-2.5 rounded-full ${earth.visible ? 'bg-comms' : 'border-[1.5px] border-comms'}`} />
            Earth {earth.visible ? 'in view' : 'below the ridge'}
          </span>
        )}
      </p>
    </div>
  )
}
