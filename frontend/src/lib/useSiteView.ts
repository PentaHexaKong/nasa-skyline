import { useHydrated } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { type Moment, moment } from '~/components/Moment'
import { useReducedMotion } from '~/lib/motion'
import type { Summary, Track } from './data'
import { minutes, peakMinute } from './time'
import { useTracks } from './useTracks'

/** Links get shared, edited and go stale, so a bad value in one falls back to its default instead of failing the page. */
export const forgiving = <T extends z.ZodType>(field: T) => field.optional().catch(undefined)

export const siteSearch = z.object({
  day: forgiving(z.iso.date()),
  t: forgiving(z.coerce.number().int().min(0).max(1439)),
})
export type SiteSearch = z.infer<typeof siteSearch>

/**
 * Where the 3D view was opened from, so it can say so and lead back. Only Understand pages (and a section of one) are
 * accepted: this is a path in our own app, never a free-form address.
 */
export const BACK_TO_UNDERSTAND = /^\/understand(\/[a-z0-9-]+)?(#[a-z0-9-]+)?$/
export const siteFromUnderstandSearch = siteSearch.extend({ back: forgiving(z.string().regex(BACK_TO_UNDERSTAND)) })

/** The place to return to from the 3D view: this Understand page, at the lesson section the reader pressed the button in. */
export const understandBack = (pathname: string, anchor?: string) =>
  pathname === '/understand' && anchor ? `${pathname}#${anchor}` : pathname
export type SiteView = ReturnType<typeof useSiteView>

/**
 * The day a first-time reader should see: the first day the terrain takes part of the Sun, so the scene is lit and the
 * ridge matters.
 */
export function defaultDay(data: Summary) {
  const partial =
    data.days.find((d) => d.direct_min > 0 && d.direct_min < d.daylight_min - 1) ??
    // Hilltops see the Sun below the flat horizon, so their partial days are simply not whole days of sun.
    // Days with no daylight have no stored Sun track, so a first-time reader would land on an empty chart.
    data.days.find((d) => d.direct_min > 0 && d.direct_min < 1439 && d.daylight_min > 0)
  return partial?.date ?? data.days.find((d) => d.direct_min > 0)?.date ?? data.days[0]?.date ?? ''
}

export function sunHud(m: Moment) {
  if (!m.sun || m.horizon == null) return undefined
  const state = m.sun.fraction >= 1 ? 'in sun' : m.sun.fraction > 0 ? `${Math.round(m.sun.fraction * 100)}% of disk` : 'hidden'
  return `Sun ${m.sun.el.toFixed(1)}° · ridge ${m.horizon.toFixed(1)}° · ${state}`
}

/** The day's answer in one line: the headline reads it before the chart explains it. */
export function headline(d: Summary['days'][number]) {
  if (d.direct_min === 0 && d.daylight_min === 0) return 'Lunar night today.'
  if (d.direct_min === 0) return 'No direct sun today.'
  // On a lunar hilltop the Sun can shine while below the flat horizon, so direct can exceed daylight.
  if (d.direct_min >= 1439) return 'Sun all day.'
  return `${minutes(d.direct_min)} of direct sun.`
}

/** Day, time, Sun state and day playback for one site, shared by Visualize and the full 3D view. */
export function useSiteView(data: Summary, { day, t }: SiteSearch, go: (s: SiteSearch) => void) {
  // Pages are pre-rendered for the default day; a linked ?day applies after hydration so the HTML matches.
  const hydrated = useHydrated()
  const tracks = useTracks(data.site.id)
  const index = Math.max(
    0,
    data.days.findIndex((d) => d.date === ((hydrated && day) || defaultDay(data))),
  )
  const current = data.days[index] ?? data.days[0]
  if (!current) throw new Error('Site summary has no days')
  const track = tracks?.[current.date]
  const [live, setLive] = useState<number>()
  const minute = live ?? (hydrated && t != null ? t : peakMinute(track))
  const m = moment(data, track, current.date, minute)
  const play = usePlayDay(track, minute, setLive, (v) => go({ t: v }))
  const selectDay = (i: number) => {
    const d = data.days[Math.max(0, Math.min(data.days.length - 1, i))]
    if (d) go({ day: d.date })
  }
  return { hydrated, index, current, track, minute, m, play, selectDay }
}

/** Sweeps the time from now to the last sample of the day in about 6 s; with reduced motion it steps 10 min at a time. */
function usePlayDay(track: Track | undefined, minute: number, setLive: (v: number | undefined) => void, commit: (v: number) => void) {
  const [playing, setPlaying] = useState(false)
  const reduced = useReducedMotion()
  const at = useRef(minute)
  at.current = minute
  const out = useRef({ setLive, commit })
  out.current = { setLive, commit }
  useEffect(() => {
    if (!playing || !track) return
    const first = track.t_min[0] ?? 0
    const last = track.t_min.at(-1) ?? 1439
    let t = at.current >= last - 5 ? first : at.current
    const rate = (last - first) / 6000 // minutes per ms
    let prev = performance.now()
    let frame = 0
    let timer = 0
    const show = (v: number) => out.current.setLive(Math.round(v))
    const done = () => {
      setPlaying(false)
      out.current.setLive(undefined)
      out.current.commit(Math.round(t))
    }
    const step = (now: number) => {
      t = Math.min(last, t + (now - prev) * rate)
      prev = now
      show(t)
      if (t >= last) return done()
      frame = requestAnimationFrame(step)
    }
    if (reduced) {
      timer = window.setInterval(() => {
        t = Math.min(last, t + 10)
        show(t)
        if (t >= last) {
          clearInterval(timer)
          done()
        }
      }, 250)
    } else frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(timer)
    }
  }, [playing, track, reduced])
  const toggle = () => {
    if (playing) {
      setPlaying(false)
      out.current.setLive(undefined)
      out.current.commit(Math.round(at.current))
    } else setPlaying(true)
  }
  const stop = () => {
    if (playing) {
      setPlaying(false)
      out.current.setLive(undefined)
    }
  }
  return { playing, toggle, stop }
}
