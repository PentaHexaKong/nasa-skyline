import { PauseIcon, PlayIcon, SkipForwardIcon } from '@phosphor-icons/react'
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { StatusWord } from '~/components/planner/Section'
import { type LandingStatus, type SitePlan, shortName, siteResult } from '~/lib/mission'
import { longDate, shortDate } from '~/lib/time'

/** One status per site and day, from the runs the plan already holds: the same rule as Result's Works. */
export const statusAt = (s: SitePlan, i: number): LandingStatus => s.runs.find((r) => i >= r.from && i < r.to)?.status ?? 'outside'

/** Why a previewed day fails, from its status alone. The chosen day uses `siteResult`, which names the missed limit. */
const WHY: Record<LandingStatus, string> = {
  go: '',
  arrive: 'Sun and Earth at touchdown, but the stay misses a limit',
  no: 'Sun or Earth hidden at touchdown',
  outside: 'The stay runs past the computed data',
}
const PLAY_MS = 110

/**
 * The day in view: the chosen one, or one being hovered, dragged or played through the year. The plan itself only
 * changes on a choice, so Result and Dates always read the chosen day.
 */
export function useDayPreview(plan: Plan, actions: PlanActions) {
  const n = plan.dates.length
  const [scrub, setScrub] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const day = scrub ?? hover ?? plan.index
  const date = plan.dates[day] ?? plan.date

  const commit = (i: number) => {
    const k = Math.max(0, Math.min(n - 1, i))
    // A chosen day replaces any preview, so the list and "next day that works" count from it.
    setHover(null)
    setScrub(k)
    actions.selectDay(k)
  }
  // Once the URL holds the chosen day, the preview hands back to the plan.
  useEffect(() => {
    if (scrub != null && !playing && !dragging && plan.index === scrub) setScrub(null)
  }, [plan.index, scrub, playing, dragging])

  const latest = useRef(day)
  latest.current = day
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const next = latest.current + 1
      if (next >= n) {
        setPlaying(false)
        commitRef.current(n - 1)
      } else setScrub(next)
    }, PLAY_MS)
    return () => window.clearInterval(id)
  }, [playing, n])

  const nextGood = plan.dates.findIndex((_, i) => i > day && plan.sites.some((s) => statusAt(s, i) === 'go'))
  const year: YearProps = {
    plan,
    day,
    playing,
    nextGood,
    onPlay: () => {
      if (playing) {
        setPlaying(false)
        commit(latest.current)
      } else {
        setHover(null)
        setScrub(day >= n - 1 ? 0 : day)
        setPlaying(true)
      }
    },
    onNext: () => {
      setPlaying(false)
      commit(nextGood)
    },
    onHover: (i) => !playing && !dragging && setHover(i),
    onScrub: (i) => {
      setPlaying(false)
      setHover(null)
      setScrub(i)
    },
    onDrag: setDragging,
    onCommit: commit,
  }
  return {
    day,
    date,
    previewing: day !== plan.index,
    at: Date.parse(`${date}T00:00:00Z`) + plan.minute * 60_000,
    year,
  }
}

/** Each site's answer on the day in view, with the reason when it fails. */
export function siteAnswer(s: SitePlan, plan: Plan, day: number) {
  if (day === plan.index) {
    const r = siteResult(s)
    return { works: r.works, computed: !!s.checks, why: r.why }
  }
  const status = statusAt(s, day)
  return { works: status === 'go', computed: status !== 'outside', why: WHY[status] }
}

/** Every computed site: a checkbox, its coordinates and its answer on the day in view, with the reason when it fails. */
export function SiteList({ plan, actions, day }: { plan: Plan; actions: PlanActions; day: number }) {
  const selected = new Set(plan.sites.map((s) => s.data.site.id))
  return (
    <ul className="grid gap-2">
      {plan.all.map((data) => {
        const id = data.site.id
        const site = plan.sites.find((s) => s.data.site.id === id)
        const last = !!site && selected.size === 1
        const a = site && siteAnswer(site, plan, day)
        return (
          <li key={id}>
            <label
              title={last ? 'Keep at least one site in the plan' : undefined}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 transition-colors ${site ? 'border-white/40 bg-white/[0.04]' : 'border-line hover:border-line-strong'} ${last ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={!!site}
                disabled={last}
                onChange={() => actions.toggleSite(id, !site)}
                className="mt-1 size-4 cursor-pointer accent-white disabled:cursor-not-allowed"
              />
              <span className="grid min-w-0">
                <span className="truncate font-medium">{shortName(data)}</span>
                <span className="readout text-2xs text-ink-faint">
                  {Math.abs(data.site.lat_deg).toFixed(2)}°{data.site.lat_deg < 0 ? 'S' : 'N'} · {data.site.lon_deg_east.toFixed(1)}°E
                </span>
              </span>
              <span className="text-xs">
                {a ? <StatusWord works={a.works} computed={a.computed} /> : <span className="text-ink-faint">Not in plan</span>}
              </span>
              {a && !a.works && a.why && <span className="col-start-2 col-end-4 text-xs text-ink-muted text-pretty">{a.why}.</span>}
            </label>
          </li>
        )
      })}
    </ul>
  )
}

type YearProps = {
  plan: Plan
  day: number
  playing: boolean
  nextGood: number
  onPlay: () => void
  onNext: () => void
  onHover: (i: number | null) => void
  onScrub: (i: number) => void
  onDrag: (on: boolean) => void
  onCommit: (i: number) => void
  /** `large`: taller rows for a page of its own (Dates). */
  size?: 'compact' | 'large'
  /** Name each site's status on the day in view under the strip. */
  readout?: boolean
  /** The one line of help under the title. */
  hint?: string
}

/**
 * The year as a strip, one row per site: a full bar where the landing works, a half bar where both are in view at
 * touchdown but the stay misses a limit, an empty track otherwise, so the status reads from shape as well as colour.
 */
export function Year({
  plan,
  day,
  playing,
  nextGood,
  onPlay,
  onNext,
  onHover,
  onScrub,
  onDrag,
  onCommit,
  size = 'compact',
  readout = false,
  hint = 'Hover to preview on the Moon. Drag, play or click to choose a day.',
}: YearProps) {
  const n = plan.dates.length
  const strip = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const indexAt = (e: PointerEvent) => {
    const r = strip.current?.getBoundingClientRect()
    if (!r) return day
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)))
  }
  const W = 1000
  const ROW = size === 'large' ? 18 : 10
  const GAP = size === 'large' ? 10 : 6
  const H = plan.sites.length * (ROW + GAP) - GAP
  const x = (i: number) => (i / n) * W
  const months = plan.dates.flatMap((d, i) =>
    d.endsWith('-01') ? [{ i, label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) }] : [],
  )
  const pos = `${((day + 0.5) / n) * 100}%`
  const date = plan.dates[day] ?? plan.date
  const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      onCommit(e.key === 'Home' ? 0 : n - 1)
    } else if (keys[e.key] != null) {
      e.preventDefault()
      onCommit(day + (keys[e.key] ?? 0))
    }
  }
  const worksHere = plan.sites.filter((s) => statusAt(s, day) === 'go').map((s) => shortName(s.data))
  const round = 'grid size-10 shrink-0 cursor-pointer place-items-center rounded-full transition-transform active:scale-95'
  return (
    <div className="@container grid gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <p className="font-medium">Landing days across the year</p>
          <p className="text-xs text-ink-muted">{hint}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onPlay}
            aria-label={playing ? 'Pause' : 'Play through the year'}
            title={playing ? 'Pause' : 'Play through the year'}
            className={`${round} bg-story text-white hover:scale-105 hover:bg-story-hover`}
          >
            {playing ? <PauseIcon weight="fill" aria-hidden /> : <PlayIcon weight="fill" aria-hidden />}
          </button>
          <button
            type="button"
            disabled={nextGood < 0}
            onClick={onNext}
            aria-label="Jump to the next day that works"
            title="Next day that works"
            className={`${round} border border-white/15 hover:border-white/50 disabled:cursor-default disabled:opacity-30`}
          >
            <SkipForwardIcon weight="fill" aria-hidden />
          </button>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-3.5 rounded-sm bg-go" />
          Works
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-3.5 rounded-sm bg-go-fill" />
          Stay misses a limit
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-3.5 rounded-sm bg-white/[0.06] ring-1 ring-line ring-inset" />
          Hidden at touchdown, or not computed
        </li>
      </ul>
      <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 @max-sm:grid-cols-[minmax(0,1fr)]">
        <ul aria-hidden className="grid content-start pt-6 @max-sm:hidden" style={{ gap: GAP }}>
          {plan.sites.map((s) => (
            <li key={s.data.site.id} className="truncate text-xs text-ink-muted" style={{ height: ROW, lineHeight: `${ROW}px` }}>
              {shortName(s.data)}
            </li>
          ))}
        </ul>
        <div className="relative min-w-0 pt-6 pb-4">
          <span
            aria-hidden
            className="readout pointer-events-none absolute top-0 -translate-x-1/2 rounded-full bg-white px-2 py-0.5 text-2xs whitespace-nowrap text-black"
            style={{ left: `clamp(2.5rem, ${pos}, calc(100% - 2.5rem))` }}
          >
            {shortDate(date)}
          </span>
          <div
            ref={strip}
            role="slider"
            tabIndex={0}
            aria-label="Landing day"
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={day}
            aria-valuetext={`${longDate(date)}: ${worksHere.length ? `works at ${worksHere.join(', ')}` : 'no site works'}`}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = true
              onDrag(true)
              onScrub(indexAt(e))
            }}
            onPointerMove={(e) => {
              if (drag.current) onScrub(indexAt(e))
              else if (e.pointerType === 'mouse') onHover(indexAt(e))
            }}
            onPointerUp={(e) => {
              if (!drag.current) return
              drag.current = false
              onDrag(false)
              onCommit(indexAt(e))
            }}
            onPointerCancel={() => {
              drag.current = false
              onDrag(false)
            }}
            onPointerLeave={() => !drag.current && onHover(null)}
            className="relative cursor-ew-resize touch-none rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="block w-full" style={{ height: H }}>
              {plan.sites.map((s, k) => (
                <g key={s.data.site.id} transform={`translate(0 ${k * (ROW + GAP)})`}>
                  <rect width={W} height={ROW} rx={1} className="fill-white/[0.06]" />
                  {s.runs.map((r) =>
                    r.status === 'go' || r.status === 'arrive' ? (
                      <rect
                        key={r.from}
                        x={x(r.from)}
                        width={Math.max(0.8, x(r.to) - x(r.from))}
                        y={r.status === 'go' ? 0 : ROW / 4}
                        height={r.status === 'go' ? ROW : ROW / 2}
                        className={r.status === 'go' ? 'fill-go' : 'fill-go-fill'}
                      />
                    ) : null,
                  )}
                </g>
              ))}
            </svg>
            {/* The chosen day stays marked while another one is previewed. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-y-1 w-px bg-white/40"
              style={{ left: `${((plan.index + 0.5) / n) * 100}%` }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-y-2 w-0.5 -translate-x-1/2 rounded-full bg-white"
              style={{ left: pos }}
            />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-3 text-2xs leading-none text-ink-faint">
            {months.map((m) => (
              <span key={m.i} className="absolute @max-xl:[&:nth-child(even)]:hidden" style={{ left: `${(m.i / n) * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {readout && (
        <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-line pt-3 text-sm">
          <span className="readout text-ink-muted">
            {longDate(date)}
            {day === plan.index ? ' · chosen' : ''}
          </span>
          {plan.sites.map((s) => {
            const st = statusAt(s, day)
            return (
              <span key={s.data.site.id} className="inline-flex items-baseline gap-1.5">
                <span className="text-ink-muted">{shortName(s.data)}</span>
                {st === 'go' ? (
                  <span className="text-go">✓ Works</span>
                ) : st === 'outside' ? (
                  <span className="text-ink-faint">Not computed</span>
                ) : (
                  <span className="text-miss">× {st === 'arrive' ? 'Stay misses a limit' : 'Hidden at touchdown'}</span>
                )}
              </span>
            )
          })}
        </p>
      )}
    </div>
  )
}
