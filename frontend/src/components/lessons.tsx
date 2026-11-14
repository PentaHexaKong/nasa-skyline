import { Link as KLink } from '@cloudflare/kumo/components/link'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { TimeSlider } from '~/components/Controls'
import { Lanes } from '~/components/Lanes'
import { moment, PhaseBadge } from '~/components/Moment'
import { azWindow, Panorama } from '~/components/Panorama'
import type { Summary, Track } from '~/lib/data'
import { DAY_MS, longestGap, measure, siteSpans } from '~/lib/mission'
import { longDate, shortDate } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

/**
 * Guided investigations for classrooms: predict, see the real data, then the why.
 * Every number on a lesson is computed from the pipeline results when the page runs; none is typed in here.
 */
export type Lesson = {
  id: string
  question: string
  /** One or two sentences that set the scene. */
  intro: string
  prompt: string
  options: { id: string; label: string }[]
  answer: string
  sites: string[]
  See: (props: { data: Record<string, Summary> }) => ReactNode
  why: string
  teacher: { goal: string; ask: string; note?: string }
  tryIt: { label: string; href: string }[]
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const short = (s: Summary) => s.site.name.split(',')[0] ?? s.site.name
const sunShare = (s: Summary) => s.days.reduce((a, d) => a + d.direct_min, 0) / (s.days.length * 1440)
const flatShare = (s: Summary) => s.days.reduce((a, d) => a + d.daylight_min, 0) / (s.days.length * 1440)
const days = (ms: number) => `${(ms / DAY_MS).toFixed(1)} days`
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}
/** The UTC date a time falls on. */
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** A [start, end) window as the days it covers, "4 Nov to 3 Dec 2026". */
const spanLabel = (w: { start: number; end: number }) => `${shortDate(dateOf(w.start))} to ${longDate(dateOf(w.end - 1))}`

/** States the period a chart covers, on screen, so its numbers are never read against another period's. */
function Period({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-muted">{children}</p>
}

function need(data: Record<string, Summary>, id: string) {
  const s = data[id]
  if (!s) throw new Error(`Lesson needs site "${id}"`)
  return s
}

/** The sentence the data gives back, under the visual. */
function Finding({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] text-lg leading-snug text-balance">{children}</p>
}

/** Horizontal share bars, with the dashed share a perfectly flat horizon would give. */
function ShareBars({ rows }: { rows: { label: string; value: number; flat?: number; fill: string }[] }) {
  return (
    <div className="grid gap-4">
      {rows.map((r) => (
        <div key={r.label} className="grid gap-1.5 sm:grid-cols-[12rem_minmax(0,1fr)_4rem] sm:items-center sm:gap-4">
          <span className="font-medium">{r.label}</span>
          <div className="relative h-7 overflow-hidden rounded-sm bg-surface ring-1 ring-line ring-inset">
            <div className={`h-full ${r.fill}`} style={{ width: `${r.value * 100}%` }} />
            {r.flat != null && (
              <div aria-hidden className="absolute inset-y-0 border-l-2 border-dashed border-ink" style={{ left: `${r.flat * 100}%` }} />
            )}
          </div>
          <span className="readout text-xl sm:text-right">{pct(r.value)}</span>
        </div>
      ))}
      {rows.some((r) => r.flat != null) && (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <span aria-hidden className="h-3.5 border-l-2 border-dashed border-ink" />
          What a perfectly flat horizon would give
        </p>
      )}
    </div>
  )
}

function PolarDaySee({ data }: { data: Record<string, Summary> }) {
  const s = need(data, 'shackleton-rim')
  const spans = siteSpans(s)
  const window = spans.coverage
  const m = measure(spans, window)
  // Shadows between two sunlit spells; the edges of the computed year are left out, as they may be cut short.
  const dark = spans.sun.slice(1).map(([a], i) => a - (spans.sun[i]?.[1] ?? a))
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Period>
          Sun at {short(s)}, the computed year: {spanLabel(window)}
        </Period>
        <Lanes
          window={window}
          label={`Sun at ${short(s)} over the computed year, ${spanLabel(window)}`}
          lanes={[{ key: 'sun', label: 'Sun', spans: m.sun, fill: 'bg-sun', value: pct(m.sunShare) }]}
        />
      </div>
      <Finding>
        Neither. At {short(s)} the Sun is in view <strong className="font-medium text-sun">{pct(m.sunShare)}</strong> of the year. Half of
        its spells of shadow last under <strong className="font-medium">{days(median(dark))}</strong>; the longest lasts{' '}
        <strong className="font-medium">{days(Math.max(...dark))}</strong>.
      </Finding>
    </div>
  )
}

/** The moment of the year when the Sun stands highest while the terrain still hides all of it. */
function hiddenMoment(tracks: Record<string, Track>) {
  let best: { date: string; minute: number; el: number } | undefined
  for (const [date, tr] of Object.entries(tracks))
    tr.t_min.forEach((t, i) => {
      const el = tr.el_deg[i] ?? -90
      if (tr.direct_fraction[i] === 0 && (!best || el > best.el)) best = { date, minute: t, el }
    })
  return best
}

function RidgeSee({ data }: { data: Record<string, Summary> }) {
  const s = need(data, 'connecting-ridge')
  const tracks = useTracks(s.site.id)
  const found = useMemo(() => (tracks ? hiddenMoment(tracks) : undefined), [tracks])
  const [minute, setMinute] = useState<number>()
  if (!tracks) return <div className="grid h-[22rem] place-items-center text-ink-muted">Loading the Sun’s path…</div>
  if (!found) return <p className="text-ink-muted">This site has no moment with the Sun up and hidden.</p>
  const track = tracks[found.date]
  const t = minute ?? found.minute
  const now = moment(s, track, found.date, t)
  const first = moment(s, track, found.date, found.minute)
  return (
    <div className="grid gap-6">
      <Finding>
        No. On {longDate(found.date)} the Sun is <strong className="font-medium text-sun">{first.sun?.el.toFixed(1)}°</strong> up, but the
        ridge in that direction rises to <strong className="font-medium">{first.horizon?.toFixed(1)}°</strong>. The lander is in shadow.
      </Finding>
      <div className="grid gap-3">
        <Panorama
          skyline={s.skyline.elevation_deg}
          azStep={s.skyline.az_step_deg}
          track={track}
          now={now.sun}
          height={340}
          azRange={azWindow(track)}
          label={`Terrain skyline near ${short(s)} with the Sun path on ${longDate(found.date)}`}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="readout text-sm">
            Sun {now.sun ? `${now.sun.el.toFixed(1)}°` : 'below −1°'} · ridge {now.horizon != null ? `${now.horizon.toFixed(1)}°` : '…'}
          </span>
          <PhaseBadge phase={now.phase} />
          <KLink className="ml-auto" render={<Link to="/explore/$siteId" params={{ siteId: s.site.id }} search={{ day: found.date, t }} />}>
            Stand here in 3D
          </KLink>
        </div>
        <div className="max-w-xl">
          <TimeSlider value={t} onChange={setMinute} />
        </div>
        <p className="text-xs text-ink-faint">Drag the time to watch the Sun come out from behind the ridge. Times in UTC.</p>
      </div>
    </div>
  )
}

/** Compared with the share a perfectly flat horizon would give. */
const vsFlat = (s: Summary) => (sunShare(s) >= flatShare(s) ? 'more than' : 'less than')

function HilltopSee({ data }: { data: Record<string, Summary> }) {
  const high = need(data, 'connecting-ridge')
  const rim = need(data, 'shackleton-rim')
  return (
    <div className="grid gap-6">
      <ShareBars
        rows={[
          { label: short(high), value: sunShare(high), flat: flatShare(high), fill: 'bg-sun' },
          { label: short(rim), value: sunShare(rim), flat: flatShare(rim), fill: 'bg-sun' },
        ]}
      />
      <Finding>
        No. {short(rim)} stands about{' '}
        <strong className="font-medium">{Math.round((high.site.ground_height_m - rim.site.ground_height_m) / 10) * 10} m</strong> lower, yet
        it is in direct sun <strong className="font-medium text-sun">{pct(sunShare(rim))}</strong> of the year, {vsFlat(rim)} flat ground
        would get. {short(high)}: <strong className="font-medium">{pct(sunShare(high))}</strong>, {vsFlat(high)} flat ground.
      </Finding>
    </div>
  )
}

const CONTACT_SITES = ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim']

function EarthSee({ data }: { data: Record<string, Summary> }) {
  const sites = CONTACT_SITES.map((id) => need(data, id))
  const pole = need(data, 'connecting-ridge')
  const poleSpans = siteSpans(pole)
  const window = { start: poleSpans.coverage.start, end: poleSpans.coverage.start + 29.53 * DAY_MS }
  const gap = longestGap(poleSpans.earth, poleSpans.coverage)
  const month = measure(poleSpans, window).earthShare
  const shares = sites.map((s) => s.earth?.visible_share ?? 0)
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Period>Earth in view, one lunar month: {spanLabel(window)}</Period>
        <Lanes
          window={window}
          label={`Earth in view over one lunar month, ${spanLabel(window)}`}
          lanes={sites.map((s) => {
            const m = measure(siteSpans(s), window)
            return { key: s.site.id, label: short(s), spans: m.earth, fill: 'bg-comms', value: pct(m.earthShare) }
          })}
        />
      </div>
      <Finding>
        Only part of the time. In this month {short(pole)} sees Earth <strong className="font-medium text-comms">{pct(month)}</strong> of
        the time. Over the whole computed year, {spanLabel(poleSpans.coverage)}, it is{' '}
        <strong className="font-medium text-comms">{pct(pole.earth?.visible_share ?? 0)}</strong>, and the longest wait is{' '}
        <strong className="font-medium">{Math.round(gap.hours / 24)} days</strong>. None of the three keeps Earth in view more than{' '}
        <strong className="font-medium text-comms">{pct(Math.max(...shares))}</strong> of the year.
      </Finding>
    </div>
  )
}

export const LESSONS: Lesson[] = [
  {
    id: 'lunar-day',
    question: 'How long is a day at the south pole?',
    intro:
      'The Moon turns once for every trip around Earth, so near its equator the Sun is up for about two weeks, then down for about two weeks. Shackleton Rim sits on the edge of a crater, a fraction of a degree from the south pole.',
    prompt: 'Over a year, how does sunlight come to Shackleton Rim?',
    options: [
      { id: 'fortnight', label: 'Two weeks of sun, two weeks of night, all year' },
      { id: 'dark', label: 'Hardly at all: the pole is dark' },
      { id: 'mostly', label: 'Neither: mostly sun, broken by spells of shadow' },
    ],
    answer: 'mostly',
    sites: ['shackleton-rim'],
    See: PolarDaySee,
    why: 'The Moon’s axis stands almost upright, so near the pole the Sun does not climb and set. It circles low around the horizon, once a month. Whether a lander sees it depends on the horizon in each direction: where the ground around is lower, the Sun stays in view; where a hill rises, it slips into shadow. Over the year the Sun’s circle drifts a little higher, then a little lower, so the shadows come in some months more than others.',
    teacher: {
      goal: 'At the pole, sunlight depends on the Sun’s path around the horizon, not on day and night.',
      ask: 'Where on Earth does the Sun circle the sky without setting? In which season?',
    },
    tryIt: [
      { label: 'See Shackleton Rim through the year', href: '/analyze/shackleton-rim' },
      { label: 'Watch the Moon turn', href: '/?view=orbit#space' },
    ],
  },
  {
    id: 'ridge',
    question: 'Can a mountain hide the Sun?',
    intro: 'On Connecting Ridge, the high ground between Shackleton and de Gerlache craters, the Sun never climbs high.',
    prompt: 'The Sun is above the horizon, but low. Is the lander in sunlight?',
    options: [
      { id: 'yes', label: 'Yes, the Sun is up' },
      { id: 'no', label: 'No, something is in the way' },
    ],
    answer: 'no',
    sites: ['connecting-ridge'],
    See: RidgeSee,
    why: 'Sunlight needs a clear line from the Sun to the lander. Near the pole the Sun only skims the horizon, so a ridge a few degrees high is enough to block it, even with the Sun up. The white line is the real horizon, measured from a NASA terrain map.',
    teacher: {
      goal: 'Separate “the Sun is up” from “the Sun reaches me”.',
      ask: 'Where on Earth do mountains hide the Sun for weeks? What do people there do?',
      note: 'The skyline comes from the LRO LOLA terrain model, so it is accurate to the model, not to every boulder.',
    },
    tryIt: [{ label: 'Compare Connecting Ridge with the rims', href: '/analyze?profile=lunar-day' }],
  },
  {
    id: 'hilltop',
    question: 'Is higher ground always sunnier?',
    intro: 'Two places near the south pole: Connecting Ridge, and the rim of Shackleton crater, which stands lower.',
    prompt: 'Which one gets more direct sunlight over a year?',
    options: [
      { id: 'ridge', label: 'The higher ridge' },
      { id: 'rim', label: 'The lower rim' },
      { id: 'same', label: 'About the same' },
    ],
    answer: 'rim',
    sites: ['connecting-ridge', 'shackleton-rim'],
    See: HilltopSee,
    why: 'What counts is not your height but your horizon. Shackleton Rim sits on the edge of a deep crater, so in most directions the ground falls away and you see over it, even past the curve of the Moon. The ridge is higher, but in some directions the terrain still rises above its horizon and blocks the low polar Sun.',
    teacher: {
      goal: 'Sunlight depends on what you can see, and the local horizon decides that, not height alone.',
      ask: 'If the rim is so sunny, why might a mission still choose the ridge?',
      note: 'Both sites are within about half a degree of the pole, so latitude barely separates them; the horizon does.',
    },
    tryIt: [
      { label: 'Stand on Shackleton Rim', href: '/explore/shackleton-rim' },
      { label: 'Compare the two sites', href: '/analyze?sites=connecting-ridge,shackleton-rim' },
    ],
  },
  {
    id: 'earth',
    question: 'Can a lander always see Earth?',
    intro: 'The Moon keeps the same face toward Earth, so Earth barely moves in its sky.',
    prompt: 'Will a lander near the south pole see Earth all the time?',
    options: [
      { id: 'always', label: 'Yes, always' },
      { id: 'part', label: 'Only part of the time' },
      { id: 'never', label: 'Never' },
    ],
    answer: 'part',
    sites: CONTACT_SITES,
    See: EarthSee,
    why: 'Earth hangs almost still in the Moon’s sky, but it rocks a few degrees over a month. At the pole Earth sits on the horizon, so the rocking lifts it above the ridges and drops it behind them. No Earth in view means no direct radio contact.',
    teacher: {
      goal: 'Line of sight decides direct contact, and the Moon’s wobble moves it.',
      ask: 'How could a lander talk to Earth while Earth is hidden?',
      note: 'This is line of sight only, not a working radio link.',
    },
    tryIt: [
      { label: 'Plan around Earth contact', href: '/analyze?profile=talk-to-earth' },
      { label: 'Stand on Connecting Ridge', href: '/explore/connecting-ridge' },
    ],
  },
]

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id)
