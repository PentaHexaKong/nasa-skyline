import { LinkButton } from '@cloudflare/kumo/components/button'
import { ArrowDownIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, useHydrated, useNavigate } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { LESSONS, type Lesson } from '~/components/lessons'
import { MOON_PREVIEW } from '~/components/moonTextures'
import type { MoonPose, TourSite } from '~/components/ParallaxMoon'
import { Eyebrow, Footer, OpenEnd, Shell } from '~/components/Shell'
import { SpaceChapter, type SpaceSearch } from '~/components/SpaceChapter'
import { loadMoonEphemeris, loadSummary, MOON_SITES, type MoonEphemeris, type Summary } from '~/lib/data'
import { measure, shortName, siteSpans } from '~/lib/mission'
import { bestHour, SYNODIC_HOURS, subPoints, whenAt } from '~/lib/moonLight'
import { PROFILES } from '~/lib/profiles'
import { longDate } from '~/lib/time'
import { forgiving } from '~/lib/useSiteView'

const loadParallaxMoon = () => import('~/components/ParallaxMoon')
// The Moon's code (and three.js with it) starts downloading as soon as this page's code runs in the browser, alongside
// hydration, instead of after it.
if (typeof window !== 'undefined') void loadParallaxMoon()
const ParallaxMoon = lazy(loadParallaxMoon)

/**
 * One page for the public and for classrooms (Explore and Understand in one). A Moon stays on screen
 * and turns to each chapter's place while the reader scrolls; every chapter gives one finding from the pipeline output,
 * and opens onto the full tool behind it. Mission planners continue in Analyze.
 */
export const Route = createFileRoute('/')({
  validateSearch: z.object({
    from: forgiving(z.string()),
    day: forgiving(z.iso.date()),
    t: forgiving(z.coerce.number().int().min(0).max(1439)),
    view: forgiving(z.enum(['moon', 'earth', 'pair', 'orbit', 'fromEarth', 'sun'])),
    scale: forgiving(z.enum(['closer'])),
  }),
  loader: async () => {
    const [eph, summaries] = await Promise.all([loadMoonEphemeris(), Promise.all(MOON_SITES.map((s) => loadSummary(s.id)))])
    return { eph, summaries }
  },
  head: () => ({
    meta: [{ title: 'Skyline · Sunlight and Earth, against the real lunar horizon' }],
    // The Moon's first-look maps start downloading with the page itself, before any script runs. Same CORS mode as
    // three.js's TextureLoader, so the browser reuses these downloads.
    links: [MOON_PREVIEW.color, MOON_PREVIEW.normal, MOON_PREVIEW.cap].map((href) => ({
      rel: 'preload',
      as: 'image',
      href,
      crossOrigin: 'anonymous' as const,
      fetchPriority: 'high' as const,
    })),
  }),
  component: Home,
})

type ChapterMeta = { id: string; short: string; pose: MoonPose }

const lesson = (id: string) => {
  const l = LESSONS.find((x) => x.id === id)
  if (!l) throw new Error(`No lesson "${id}"`)
  return l
}

/**
 * The chapters in scroll order. Each pose says where the Moon turns while that chapter is on screen, and which side it
 * sits on: it swaps sides from one chapter to the next (right, left, right…), and the text takes the other side.
 */
const CHAPTERS: ChapterMeta[] = [
  { id: 'top', short: 'Start', pose: { cam: [-28, 18, 5.6], side: 'right' } },
  {
    id: 'lunar-day',
    short: 'A polar day',
    pose: { cam: [-58, 0, 3.6], look: [-86, 0, 0.6], sites: ['shackleton-rim'], sweep: true, side: 'left' },
  },
  {
    id: 'ridge',
    short: 'A hidden Sun',
    pose: { cam: [-60, 30, 2.6], look: [-88, 30, 0.75], sites: ['connecting-ridge'], side: 'right' },
  },
  {
    id: 'hilltop',
    short: 'High ground',
    pose: { cam: [-62, -20, 2.3], look: [-88, -20, 0.8], sites: ['connecting-ridge', 'shackleton-rim'], side: 'left' },
  },
  // Looks from a little west of the near side's centre, so the Earth loop sits on the Moon's face, clear of the text fade.
  {
    id: 'earth',
    short: 'Earth contact',
    pose: {
      cam: [-30, -6, 4.6],
      sites: ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'],
      sweep: true,
      earth: true,
      side: 'right',
    },
  },
  {
    id: 'compare',
    short: 'Compare sites',
    pose: {
      cam: [-60, -10, 3.4],
      look: [-87, -10, 0.7],
      sites: ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'],
      opacity: 0.7,
      side: 'left',
    },
  },
  // The scene's Moon view: this Moon carries on into it and follows the scene's camera (moonBridge.ts). Until the scene
  // can hand over (still loading, or another view), the Moon fades out here behind the scene's own frame.
  { id: 'space', short: 'True scale', pose: { cam: [-50, 18, 6], opacity: 0, side: 'left', scene: true } },
  // After the tour the Moon steps back behind the lesson list, then sets before the planner's table.
  { id: 'lessons', short: 'Lessons', pose: { cam: [-20, 40, 10], opacity: 0.55, side: 'right' } },
  { id: 'plan', short: 'Plan a mission', pose: { cam: [-20, 60, 14], opacity: 0, side: 'right' } },
]

const SPACE = CHAPTERS.findIndex((c) => c.id === 'space')
/** The tour proper: chapters 01 to 06, numbered on screen. */
const TOUR = CHAPTERS.slice(1, SPACE + 1)

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const pct = (x: number) => `${Math.round(x * 100)}%`
const days = (hours: number) => `${(hours / 24).toFixed(1)} days`

function Home() {
  const { eph, summaries } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const hydrated = useHydrated()
  const data = useMemo(() => Object.fromEntries(summaries.map((s) => [s.site.id, s])), [summaries])
  const current = useChapter()
  // Full screen lifts the scene's layer above the site header.
  const [full, setFull] = useState(false)

  // A shared link into the scene (a view, a moment, or back from a site) opens at the scene.
  useEffect(() => {
    if ((search.from || search.view || search.day) && !window.location.hash) document.getElementById('space')?.scrollIntoView()
  }, [search.from, search.view, search.day])

  const sites: TourSite[] = summaries.map((s) => ({ id: s.site.id, name: shortName(s), lat: s.site.lat_deg, lon: s.site.lon_deg_east }))
  const globeSites = summaries.map((s) => {
    const spans = siteSpans(s)
    const m = measure(spans, spans.coverage)
    return {
      id: s.site.id,
      name: s.site.name.split(',')[0] ?? s.site.name,
      lat: s.site.lat_deg,
      lon: s.site.lon_deg_east,
      note: `${Math.abs(s.site.lat_deg).toFixed(1)}°${s.site.lat_deg < 0 ? 'S' : 'N'} · Sun ${Math.round(m.sunShare * 100)} % · Earth ${Math.round((s.earth?.visible_share ?? 0) * 100)} %`,
    }
  })

  return (
    <Shell>
      {/* Follows the theme; only the 3D scene's viewport stays dark. No stacking context of its own: the full-screen
          scene has to rise above the sticky site header. */}
      <main className="relative overflow-x-clip bg-bg text-ink">
        {hydrated && (
          <Suspense fallback={null}>
            <ParallaxMoon poses={CHAPTERS.map((c) => c.pose)} sites={sites} eph={eph} />
          </Suspense>
        )}
        <ChapterBar current={current} />

        <div className={`relative ${full ? 'z-(--z-popover)' : 'z-[1]'}`}>
          <Hero />
          <LessonChapter n={1} lesson={lesson('lunar-day')} data={data} tall />
          <LessonChapter n={2} lesson={lesson('ridge')} data={data} />
          <LessonChapter n={3} lesson={lesson('hilltop')} data={data} />
          <LessonChapter n={4} lesson={lesson('earth')} data={data} tall extra={<EarthLoopNote eph={eph} sites={sites} />} />
          <CompareChapter summaries={summaries} />
          {/* The page's scroll padding is 4.5rem; less 1rem leaves exactly the 3.5rem header, so the scene fills the screen. */}
          <section id="space" data-moon-chapter aria-labelledby="space-title" className="scroll-mt-[-1rem]">
            <SpaceChapter
              onFull={setFull}
              eph={eph}
              sites={globeSites}
              search={search}
              onSearch={(s: SpaceSearch) =>
                navigate({ search: (prev) => ({ ...prev, ...s }), replace: true, resetScroll: false, hashScrollIntoView: false })
              }
              onArrive={(id, day, t) => navigate({ to: '/explore/$siteId', params: { siteId: id }, search: { day, t } })}
            />
          </section>
          <LessonsChapter />
          <PlanChapter />
          <Footer />
        </div>
      </main>
    </Shell>
  )
}

/** Which chapter is under the middle of the screen. */
function useChapter() {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const mid = window.innerHeight * 0.5
      let i = 0
      document.querySelectorAll<HTMLElement>('[data-moon-chapter]').forEach((el, k) => {
        if (el.getBoundingClientRect().top <= mid) i = k
      })
      setCurrent(i)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
  return current
}

const jump = (id: string) => (e: React.MouseEvent) => {
  const el = document.getElementById(id)
  if (!el) return
  e.preventDefault()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(history.state, '', `#${id}`)
}

/** Where the reader is in the tour, under the header. Hidden on the opening screen and inside the 3D scene. */
function ChapterBar({ current }: { current: number }) {
  const shown = current > 0 && current !== SPACE
  const here = CHAPTERS[current]
  return (
    <nav
      aria-label="Chapters"
      className={`fixed inset-x-0 top-14 z-(--z-sticky) border-b border-line bg-bg transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
      inert={!shown}
    >
      <div className="mx-auto flex h-11 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <p className="eyebrow flex min-w-0 items-center gap-2 text-ink-muted">
          <span className="readout text-ink">
            {current <= SPACE ? `${String(current).padStart(2, '0')} / ${String(TOUR.length).padStart(2, '0')}` : 'Next'}
          </span>
          <span className="truncate">{here?.short}</span>
        </p>
        <ol className="ml-auto hidden items-center gap-1 md:flex">
          {CHAPTERS.slice(1).map((c, k) => {
            const i = k + 1
            const on = i === current
            return (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  onClick={jump(c.id)}
                  aria-current={on ? 'step' : undefined}
                  className={`eyebrow flex h-11 items-center px-2 transition-colors duration-150 hover:text-ink ${on ? 'text-ink' : 'text-ink-faint'}`}
                >
                  <span className={`relative ${on ? 'after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:bg-brand' : ''}`}>
                    {i <= SPACE ? String(i).padStart(2, '0') : c.short}
                  </span>
                  <span className="sr-only"> {c.short}</span>
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}

/**
 * A chapter's column. On wide screens the text takes the side away from the Moon (its pose's side); on narrow ones it
 * sits on a panel that rises over the Moon.
 */
function Chapter({ id, tall = false, label, children }: { id: string; tall?: boolean; label: string; children: ReactNode }) {
  const textRight = CHAPTERS.find((c) => c.id === id)?.pose.side === 'left'
  return (
    <section id={id} data-moon-chapter aria-labelledby={label} className="scroll-mt-14">
      {/* A tall chapter's column is the sticky element's container, so it must carry the height the sweep scrolls through. */}
      <div className={`mx-auto max-w-7xl px-4 pt-[44svh] sm:px-6 lg:pt-0 ${tall ? 'lg:min-h-[200svh]' : ''}`}>
        <div
          className={`tour-panel grid max-w-[36rem] content-center gap-6 pb-20 lg:min-h-[calc(100svh-3.5rem)] lg:py-24 ${
            tall ? 'lg:sticky lg:top-14' : ''
          } ${textRight ? 'lg:ml-auto' : ''}`}
        >
          {children}
        </div>
      </div>
    </section>
  )
}

function Hero() {
  return (
    <section id="top" data-moon-chapter aria-labelledby="hero-title" className="scroll-mt-14">
      <div className="mx-auto max-w-7xl px-4 pt-[46svh] sm:px-6 lg:pt-0">
        <div className="tour-panel grid max-w-[36rem] content-center gap-8 pb-16 lg:min-h-[calc(100svh-3.5rem)] lg:py-20">
          <div className="grid gap-5">
            <Eyebrow pip className="rise">
              Lunar Landing Site Navigation
            </Eyebrow>
            <h1 id="hero-title" className="rise max-w-[16ch] text-display font-medium text-balance [--i:1]">
              Can a lander on the Moon see the Sun and Earth?
            </h1>
            <p className="rise max-w-[46ch] text-lg leading-relaxed text-ink-muted text-pretty [--i:2]">
              It depends on the hills around it. Skyline draws the real horizon at each landing site and shows when sunlight and Earth clear
              it. Scroll for the short tour, or go straight to planning.
            </p>
            <div className="rise flex flex-wrap gap-3 [--i:3]">
              <LinkButton href="#lunar-day" onClick={jump('lunar-day')} variant="primary" size="lg">
                Start the tour
                <ArrowDownIcon aria-hidden weight="bold" className="size-4" />
              </LinkButton>
              <LinkButton href="/analyze" variant="secondary" size="lg">
                Plan a landing
              </LinkButton>
            </div>
          </div>

          <nav aria-labelledby="tour-index" className="rise grid gap-3 [--i:4]">
            <h2 id="tour-index" className="eyebrow text-ink-faint">
              In this tour
            </h2>
            <ol className="grid border-t border-line sm:grid-cols-2 sm:gap-x-8">
              {TOUR.map((c, k) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    onClick={jump(c.id)}
                    className="group flex items-baseline gap-3 border-b border-line py-2.5 text-ink-muted hover:text-ink"
                  >
                    <span className="readout text-xs text-ink-faint">{String(k + 1).padStart(2, '0')}</span>
                    <span className="group-hover:underline group-hover:underline-offset-4">{c.short}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  )
}

/** A lesson told as a chapter: the question, the finding from the real data, and why. The guess-first version stays one click away. */
function LessonChapter({
  n,
  lesson: l,
  data,
  tall = false,
  extra,
}: {
  n: number
  lesson: Lesson
  data: Record<string, Summary>
  tall?: boolean
  /** A note on what the Moon behind the chapter is showing. */
  extra?: ReactNode
}) {
  const { See } = l
  const title = `${l.id}-title`
  return (
    <Chapter id={l.id} tall={tall} label={title}>
      <header className="grid gap-4">
        <Eyebrow pip>
          {String(n).padStart(2, '0')} · {CHAPTERS[n]?.short}
        </Eyebrow>
        <h2 id={title} className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium text-balance">
          {l.question}
        </h2>
        <p className="max-w-[52ch] text-lg leading-relaxed text-ink-muted text-pretty">
          {l.intro} <span className="text-ink">{l.prompt}</span>
        </p>
      </header>
      <See data={data} />
      {extra}
      <p className="max-w-[60ch] leading-relaxed text-ink-muted text-pretty">{l.why}</p>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/understand/${l.id}`} variant="secondary">
          Guess first: open the lesson
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </LinkButton>
        {l.tryIt.map((t) => (
          <LinkButton key={t.href} href={t.href} variant="ghost">
            {t.label}
          </LinkButton>
        ))}
      </div>
    </Chapter>
  )
}

/**
 * Reads the cyan loop on the Moon behind chapter 04: the point where Earth stands straight overhead, over the same month
 * the Moon is lit for. Its drift comes from the pipeline's sub-Earth points, not from a typed number.
 */
function EarthLoopNote({ eph, sites }: { eph: MoonEphemeris; sites: TourSite[] }) {
  const { from, lat, lon } = useMemo(() => {
    const h0 = bestHour(eph, sites)
    let lat = 0
    let lon = 0
    for (let h = h0; h <= h0 + SYNODIC_HOURS; h += 1) {
      const e = subPoints(eph, h).earth
      lat = Math.max(lat, Math.abs(e.lat))
      lon = Math.max(lon, Math.abs(((e.lon + 540) % 360) - 180))
    }
    return { from: whenAt(eph, h0).date, lat, lon }
  }, [eph, sites])
  return (
    <p className="flex max-w-[60ch] gap-3 text-sm leading-relaxed text-ink-muted">
      <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-comms">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      </svg>
      <span>
        <span className="text-ink">On the Moon, the cyan ring is the point with Earth straight overhead.</span> The loop is its path over
        one month from {longDate(from)}: it drifts up to {Math.round(lat)}° north or south and {Math.round(lon)}° east or west. Earth never
        orbits the Moon; this small wobble is what lifts Earth over a polar ridge and drops it behind.
      </span>
    </p>
  )
}

/** Every curated site over the whole computed window, from the same spans the planner reads. */
function CompareChapter({ summaries }: { summaries: Summary[] }) {
  const rows = [...summaries]
    .sort((a, b) => b.site.lat_deg - a.site.lat_deg)
    .map((s) => {
      const spans = siteSpans(s)
      const m = measure(spans, spans.coverage)
      return { s, m, earth: s.earth?.visible_share ?? null }
    })
  const first = summaries[0]
  const n = first?.params.days ?? 0
  const count = COUNT_WORDS[rows.length] ?? String(rows.length)
  // How far the farthest site lies from the pole, in degrees of latitude.
  const reach = Math.max(...rows.map(({ s }) => 90 - Math.abs(s.site.lat_deg)))
  return (
    <Chapter id="compare" label="compare-title">
      <header className="grid gap-4">
        <Eyebrow pip>05 · Compare sites</Eyebrow>
        <h2 id="compare-title" className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium text-balance">
          {count} sites near the pole, {count.toLowerCase()} different skies.
        </h2>
        <p className="max-w-[52ch] text-lg leading-relaxed text-ink-muted text-pretty">
          Every site we computed, all within {reach.toFixed(1)}° of the south pole, over the {n} days from{' '}
          {first ? longDate(first.params.start) : '…'}: how often each has the Sun in direct view and Earth above its horizon, and the
          longest wait for each.
        </p>
      </header>
      <ul className="grid border-t border-line">
        {rows.map(({ s, m, earth }) => (
          <li key={s.site.id} className="grid gap-3 border-b border-line py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link to="/explore/$siteId" params={{ siteId: s.site.id }} className="font-medium underline-offset-4 hover:underline">
                {s.site.name.split(',')[0]}
              </Link>
              <span className="readout text-xs text-ink-faint">
                {Math.abs(s.site.lat_deg).toFixed(1)}°{s.site.lat_deg < 0 ? 'S' : 'N'}
              </span>
            </div>
            <Meter
              label="Sun in direct view"
              value={m.sunShare}
              fill="bg-sun"
              wait={m.noSun.hours > 0 ? `Longest wait ${days(m.noSun.hours)}` : 'Never out of view'}
              open={m.noSun.truncated}
            />
            <Meter
              label="Earth in view"
              value={earth}
              fill="bg-comms"
              wait={m.noEarth.hours > 0 ? `Longest wait ${days(m.noEarth.hours)}` : 'Never out of view'}
              open={m.noEarth.truncated}
            />
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-faint">
        Longest wait: the longest stretch without it in the computed window. A + means the stretch runs into the window’s edge, so it may be
        longer. Earth counts when its centre clears the skyline.
      </p>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/analyze?sites=${rows.map((r) => r.s.site.id).join(',')}`} variant="secondary">
          Compare them for a mission
          <ArrowRightIcon aria-hidden className="size-3.5" />
        </LinkButton>
        <LinkButton href="#space" onClick={jump('space')} variant="ghost">
          Fly down to one
        </LinkButton>
      </div>
    </Chapter>
  )
}

/** One share as a bar and a number, and the longest wait beside it. */
function Meter({ label, value, fill, wait, open }: { label: string; value: number | null; fill: string; wait: string; open: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)_3.5rem]">
      <span className="text-sm text-ink-muted max-sm:col-span-2">{label}</span>
      <div className="relative h-2.5 overflow-hidden rounded-sm bg-surface ring-1 ring-line ring-inset" aria-hidden>
        {value != null && <div className={`h-full ${fill}`} style={{ width: `${value * 100}%` }} />}
      </div>
      <span className="readout text-right text-sm">{value == null ? 'n/a' : pct(value)}</span>
      <span className="text-xs text-ink-faint sm:col-start-2">
        {wait}
        <OpenEnd open={open} />
      </span>
    </div>
  )
}

function LessonsChapter() {
  return (
    <section id="lessons" data-moon-chapter aria-labelledby="lessons-title" className="scroll-mt-14">
      <div className="mx-auto max-w-7xl px-4 pt-[44svh] sm:px-6 lg:pt-0">
        <div className="tour-panel grid gap-10 pb-24 lg:min-h-[calc(100svh-3.5rem)] lg:content-center lg:py-24">
          <header className="grid max-w-[40rem] gap-4">
            <Eyebrow pip>For classrooms</Eyebrow>
            <h2 id="lessons-title" className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium text-balance">
              The same four questions, as lessons.
            </h2>
            <p className="max-w-[52ch] text-lg leading-relaxed text-ink-muted text-pretty">
              Each lesson asks for a guess first, then checks it against the real terrain and orbit data, then explains why. Each has notes
              for teachers.
            </p>
          </header>
          <ol className="grid max-w-3xl border-t border-line">
            {LESSONS.map((l, i) => (
              <li key={l.id}>
                <Link
                  to="/understand/$lessonId"
                  params={{ lessonId: l.id }}
                  className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-line py-5 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
                >
                  <span className="readout text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className="grid gap-1.5">
                    <span className="text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)] leading-tight font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-6">
                      {l.question}
                    </span>
                    <span className="text-ink-muted">{l.teacher.goal}</span>
                  </span>
                  <ArrowRightIcon
                    aria-hidden
                    className="size-5 self-center text-ink-faint transition-[translate,color] duration-150 ease-out group-hover:translate-x-1 group-hover:text-ink"
                  />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function PlanChapter() {
  return (
    <section id="plan" data-moon-chapter aria-labelledby="plan-title" className="scroll-mt-14 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-24 sm:px-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Eyebrow pip>For mission planners</Eyebrow>
          <h2 id="plan-title" className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium text-balance">
            Plan a landing.
          </h2>
          <p className="text-ink-muted text-pretty">
            The same numbers, in full: compare sites and landing dates against your own requirements, slip the date and see what changes,
            and download a brief. Start from a mission, then change anything.
          </p>
          <div>
            <LinkButton href="/analyze" variant="primary">
              Open the planner
              <ArrowRightIcon aria-hidden weight="bold" className="size-4" />
            </LinkButton>
          </div>
        </div>
        <ul className="grid content-start border-t border-line">
          {PROFILES.map((p) => (
            <li key={p.id}>
              <Link
                to="/analyze"
                search={{ profile: p.id }}
                className="group grid gap-1 border-b border-line py-4 sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-6"
              >
                <span className="font-medium group-hover:underline group-hover:underline-offset-4">{p.name}</span>
                <span className="text-ink-muted">{p.pitch}</span>
                <span className="readout text-xs text-ink-faint">
                  {p.stay} days · {p.sites.length} sites
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
