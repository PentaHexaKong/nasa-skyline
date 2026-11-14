import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useMemo } from 'react'
import { LabJourney } from '~/components/lab/LabJourney'
import { LESSONS, type Lesson } from '~/components/lessons'
import { useMoonScene } from '~/components/MoonStage'
import { MOON_PREVIEW } from '~/components/moonTextures'
import type { MoonPose, MoonScene, TourSite } from '~/components/ParallaxMoon'
import { Eyebrow, Footer, Shell } from '~/components/Shell'
import { Bubble, Mascot, StandHereLink } from '~/components/story'
import { loadMoonEphemeris, loadSummary, MAP_SITES, type MoonEphemeris, type Summary } from '~/lib/data'
import { shortName } from '~/lib/mission'
import { bestHour, SYNODIC_HOURS, subPoints, whenAt } from '~/lib/moonLight'
import { longDate } from '~/lib/time'

/**
 * Understand: the learning journey. The same Moon as Explore turns to each question's place while the reader scrolls;
 * each chapter gives one finding computed from the site results. It ends by handing over to the lab
 * (`/understand/lab`), where the reader predicts, moves time and explains.
 */
export const Route = createFileRoute('/understand/')({
  loader: async () => {
    const [eph, summaries] = await Promise.all([loadMoonEphemeris(), Promise.all(MAP_SITES.map((s) => loadSummary(s.id)))])
    return { eph, summaries }
  },
  head: () => ({
    meta: [{ title: 'Understand · Skyline' }],
    links: [MOON_PREVIEW.color, MOON_PREVIEW.normal, MOON_PREVIEW.cap].map((href) => ({
      rel: 'preload',
      as: 'image',
      href,
      crossOrigin: 'anonymous' as const,
      fetchPriority: 'high' as const,
    })),
  }),
  component: UnderstandPage,
})

/** The scientist's pose beside each chapter, in chapter order. */
const POSES = ['scientist-sun', 'scientist-question', 'scientist-globe', 'scientist-earth'] as const

type Chapter = { id: string; short: string; pose: MoonPose }

/** One per `[data-moon-chapter]` section, in page order. The Moon swaps sides; the text takes the other side. */
const CHAPTERS: Chapter[] = [
  {
    id: 'top',
    short: 'A different perspective',
    pose: { cam: [-70, 0, 2.9], look: [-88, 0, 0.7], sites: ['shackleton-rim'], side: 'right' },
  },
  {
    id: 'lunar-day',
    short: 'A lunar day',
    pose: { cam: [-58, 0, 3.6], look: [-86, 0, 0.6], sites: ['shackleton-rim'], sweep: true, side: 'left' },
  },
  { id: 'ridge', short: 'A hidden Sun', pose: { cam: [-60, 30, 2.6], look: [-88, 30, 0.75], sites: ['connecting-ridge'], side: 'right' } },
  {
    id: 'hilltop',
    short: 'High ground',
    pose: { cam: [-62, -20, 2.3], look: [-88, -20, 0.8], sites: ['connecting-ridge', 'shackleton-rim'], side: 'left' },
  },
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
  { id: 'your-turn', short: 'Your turn', pose: { cam: [-20, 40, 10], opacity: 0, side: 'right' } },
]

const lesson = (id: string) => {
  const l = LESSONS.find((x) => x.id === id)
  if (!l) throw new Error(`No lesson "${id}"`)
  return l
}

function UnderstandPage() {
  const { eph, summaries } = Route.useLoaderData()
  const data = useMemo(() => Object.fromEntries(summaries.map((s) => [s.site.id, s])), [summaries])
  const sites = useMemo<TourSite[]>(
    () => summaries.map((s) => ({ id: s.site.id, name: shortName(s), lat: s.site.lat_deg, lon: s.site.lon_deg_east })),
    [summaries],
  )
  const moon = useMemo<MoonScene>(
    () => ({ kind: 'tour', poses: CHAPTERS.map((c) => c.pose), sites, textPanels: true, spin: true }),
    [sites],
  )
  useMoonScene(moon, eph)
  return (
    <Shell>
      {/* No background of its own: the shared Moon (MoonStage) sits behind the page, on the page colour of <html>. */}
      <main className="relative overflow-x-clip text-ink">
        <div className="relative z-[1]">
          <Landing />
          <LessonChapter n={1} lesson={lesson('lunar-day')} data={data} tall />
          <LessonChapter n={2} lesson={lesson('ridge')} data={data} />
          <LessonChapter n={3} lesson={lesson('hilltop')} data={data} />
          <LessonChapter n={4} lesson={lesson('earth')} data={data} tall dropWhy extra={<EarthLoopNote eph={eph} sites={sites} />} />
          <LabJourney eph={eph} summaries={summaries} embedded />
          <Footer />
        </div>
      </main>
    </Shell>
  )
}

/** A chapter's column: the side away from the Moon on wide screens, a panel rising over the Moon on narrow ones. */
function Column({ id, tall = false, label, children }: { id: string; tall?: boolean; label: string; children: ReactNode }) {
  const textRight = CHAPTERS.find((c) => c.id === id)?.pose.side === 'left'
  return (
    <section id={id} data-moon-chapter aria-labelledby={label} className="scroll-mt-14">
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

/** The opening: a different place, a different perspective, with the scientist to guide the way. */
function Landing() {
  return (
    <Column id="top" label="understand-title">
      <h1 id="understand-title" className="rise text-[clamp(2.5rem,1.6rem+4vw,4.75rem)] leading-[0.98] font-medium text-balance">
        A different place. <br />A different <span className="text-story-ink">perspective.</span>
      </h1>
      <p className="rise max-w-[40ch] text-lg leading-relaxed text-ink-muted text-pretty [--i:1]">
        Follow the light around the Moon. Change the time, explore the landscape, and discover when the Sun and Earth can come into view.
      </p>
      {/* The scientist speaks: the bubble sits to its right, its tail pointing back at the face. */}
      <div className="rise flex items-end gap-3 [--i:2]">
        <Mascot pose="scientist-moons" className="size-32 shrink-0 sm:size-36" />
        <Bubble className="mb-16">Scroll with me. Four questions, one Moon.</Bubble>
      </div>
      <ol className="rise grid border-t border-line sm:grid-cols-2 sm:gap-x-8 [--i:4]">
        {CHAPTERS.slice(1, 5).map((c, k) => (
          <li key={c.id}>
            <a href={`#${c.id}`} className="group flex items-baseline gap-3 border-b border-line py-2.5 text-ink-muted hover:text-ink">
              <span className="readout text-xs text-ink-faint">{String(k + 1).padStart(2, '0')}</span>
              <span className="group-hover:underline group-hover:underline-offset-4">{c.short}</span>
            </a>
          </li>
        ))}
      </ol>
    </Column>
  )
}

/** A lesson told as a chapter: the question, the finding from the real data, why, and where to stand to see it. */
function LessonChapter({
  n,
  lesson: l,
  data,
  tall = false,
  dropWhy = false,
  extra,
}: {
  n: number
  lesson: Lesson
  data: Record<string, Summary>
  tall?: boolean
  dropWhy?: boolean
  extra?: ReactNode
}) {
  const { See } = l
  const title = `${l.id}-title`
  // Only the way into the 3D site stays here; the guess-first version is the lab's job now.
  const stand = l.tryIt.filter((t) => t.href.startsWith('/explore/'))
  return (
    <Column id={l.id} tall={tall} label={title}>
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
      {/* The scientist asks the class the lesson's question; the why stays one tap away for whoever wants it. */}
      <div className="flex items-end gap-3">
        <Mascot pose={POSES[n - 1] ?? 'scientist-question'} className="size-24 shrink-0" />
        <Bubble className="mb-6" more={{ text: dropWhy ? l.teacher.goal : l.why }}>
          {l.teacher.ask}
        </Bubble>
      </div>
      {stand.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stand.map((t) => (
            <StandHereLink key={t.href} href={t.href} label={t.label} anchor={l.id} />
          ))}
        </div>
      )}
    </Column>
  )
}

/** Reads the cyan loop on the Moon behind chapter 04, from the pipeline's sub-Earth points. */
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
