import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, CubeIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { Landscape, type LandscapeMode, type Moment, momentLabel } from '~/components/explore/Landscape'
import { useMoonScene } from '~/components/MoonStage'
import { MOON_PREVIEW } from '~/components/moonTextures'
import type { MoonPose, MoonScene } from '~/components/ParallaxMoon'
import { Eyebrow, Footer, Shell } from '~/components/Shell'
import { SpaceChapter, type SpaceSearch } from '~/components/SpaceChapter'
import { Bubble, Guide, Mascot, Orbits, StoryLink, useScrollProgress } from '~/components/story'
import { loadMoonEphemeris, loadSummary, MOON_SITES, type Summary } from '~/lib/data'
import { measure, shortName, siteSpans } from '~/lib/mission'
import { forgiving } from '~/lib/useSiteView'

/**
 * Explore: the public's way in. One scroll that gets closer to the Moon: the whole Moon, then a real polar landscape
 * with three questions (ground, sunlight, Earth), then the true-scale Moon, Earth and Sun where the reader picks a
 * place, then the bridge to Understand. Every number on it is computed from the pipeline's files when the page runs.
 */
export const Route = createFileRoute('/explore/')({
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
    meta: [{ title: 'Explore · Skyline' }],
    links: [MOON_PREVIEW.color, MOON_PREVIEW.normal, MOON_PREVIEW.cap].map((href) => ({
      rel: 'preload',
      as: 'image',
      href,
      crossOrigin: 'anonymous' as const,
      fetchPriority: 'high' as const,
    })),
  }),
  component: ExplorePage,
})

/** One pose per `[data-moon-chapter]` section, in page order (the shared Moon, ParallaxMoon, reads them). */
const POSES: MoonPose[] = [
  // The whole Moon, centred, lit as on the moment in the corner.
  { cam: [-30, 10, 5.2], side: 'center' },
  // Getting closer: the camera dives toward Shackleton Rim and the Moon fades to black on the way, so Discovery's
  // landscape can take the dive on from orbit without the two ever showing at once.
  { cam: [-83, 0, 1.28], look: [-89.7755, 203.552, 1], sites: ['shackleton-rim'], opacity: 0, side: 'center' },
  // The true-scale scene: this Moon carries on into the scene's Moon view (moonBridge.ts).
  { cam: [-50, 18, 6], opacity: 0, side: 'left', scene: true },
  { cam: [-20, 60, 14], opacity: 0, side: 'right' },
]

/** What each place teaches, as the storyboard's table puts it. The numbers beside it are computed. */
const PLACES: Record<string, { hook: string; insight: string }> = {
  'shackleton-rim': {
    hook: 'At the edge of deep shadow.',
    insight: 'The rim sees almost endless light, while the crater beside it stays dark: the strongest contrast of the three.',
  },
  'connecting-ridge': {
    hook: 'Follow the higher ground.',
    insight: 'Height changes the view: from the ridge you see over some hills, but not all of them.',
  },
  'de-gerlache-rim': {
    hook: 'Another crater. Another skyline.',
    insight: 'A different crater shape gives a different horizon, and with it different light and a different view of Earth.',
  },
}

function ExplorePage() {
  const { eph, summaries } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [full, setFull] = useState(false)

  // A shared link into the scene (a view, a moment, or back from a site) opens at the scene.
  useEffect(() => {
    if ((search.from || search.view || search.day) && !window.location.hash) document.getElementById('space')?.scrollIntoView()
  }, [search.from, search.view, search.day])

  const moon = useMemo<MoonScene>(
    () => ({
      kind: 'tour',
      poses: POSES,
      sites: summaries.map((s) => ({ id: s.site.id, name: shortName(s), lat: s.site.lat_deg, lon: s.site.lon_deg_east })),
      spin: true,
    }),
    [summaries],
  )
  useMoonScene(moon, eph)
  const globeSites = summaries.map((s) => {
    const spans = siteSpans(s)
    const m = measure(spans, spans.coverage)
    return {
      id: s.site.id,
      name: shortName(s),
      lat: s.site.lat_deg,
      lon: s.site.lon_deg_east,
      note: `${Math.abs(s.site.lat_deg).toFixed(1)}°${s.site.lat_deg < 0 ? 'S' : 'N'} · Sun ${Math.round(m.sunShare * 100)} % · Earth ${Math.round((s.earth?.visible_share ?? 0) * 100)} %`,
    }
  })
  const rim = summaries.find((s) => s.site.id === 'shackleton-rim') ?? summaries[0]

  return (
    <Shell>
      {/* No background of its own: the shared Moon (MoonStage) sits behind the page, on the page colour of <html>. */}
      <main className="relative overflow-x-clip text-ink">
        <div className={`relative ${full ? 'z-(--z-popover)' : 'z-[1]'}`}>
          <Opening />
          {rim && <Discovery site={rim} />}
          <section id="space" data-moon-chapter aria-labelledby="pick-title" className="scroll-mt-[-1rem]">
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
          <PickPlace summaries={summaries} />
          <Ending />
          <Footer />
        </div>
      </main>
    </Shell>
  )
}

/** 1. Curiosity first: the whole Moon, a question, and the explorer looking up at it. */
function Opening() {
  return (
    <section id="top" data-moon-chapter aria-labelledby="explore-title" className="relative min-h-[calc(100svh-3.5rem)] scroll-mt-14">
      <div className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-7xl grid-rows-[auto_1fr_auto] px-4 py-5 sm:px-6">
        <div className="grid justify-items-center gap-3 text-center">
          <Link to="/" className="justify-self-start text-sm text-ink-muted hover:text-ink">
            <ArrowLeftIcon aria-hidden className="mr-1 inline size-3.5" />
            Choose your journey
          </Link>
          <p className="eyebrow rise text-story-ink">Your lunar journey</p>
          <h1 id="explore-title" className="rise text-display font-medium text-balance [--i:1]">
            Where would you land?
          </h1>
          <p className="rise max-w-[34ch] text-lg text-ink-muted text-pretty [--i:2]">
            Come closer. There’s more to a landing spot than meets the eye.
          </p>
        </div>
        <div />
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <Guide pose="explorer-lookup" says="Let’s find out together!" className="rise [--i:3]" size="size-24 sm:size-28" />
          <a href="#discover" className="grid justify-items-center gap-1 pb-2 text-sm text-ink-muted hover:text-ink">
            <span className="max-w-[30ch] text-center text-xs text-ink-faint">
              The Moon may look quiet from here. Up close, every ridge, crater and shadow changes the story.
            </span>
            <span>
              Scroll to get closer <ArrowDownIcon aria-hidden className="inline size-3.5" />
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}

const MODES: {
  id: LandscapeMode
  tab: string
  question: string
  body: string
  says: string
  pose: 'explorer-pointing' | 'explorer-happy' | 'explorer-wondering'
}[] = [
  {
    id: 'ground',
    tab: 'Ground',
    question: 'Could we land and move here?',
    body: 'Look for steep slopes and crater edges. They can make landing and moving harder. The view shows terrain reconstructed from NASA elevation data.',
    says: 'Looks flat… until you get closer.',
    pose: 'explorer-pointing',
  },
  {
    id: 'sun',
    tab: 'Sunlight',
    question: 'Will sunlight reach our equipment?',
    body: 'Near the south pole, the Sun stays low. A ridge can catch light while a nearby crater floor stays in shadow.',
    says: 'Higher ground can see the Sun, while the lower ground next to it may not.',
    pose: 'explorer-happy',
  },
  {
    id: 'earth',
    tab: 'Earth',
    question: 'Can we send a signal directly to Earth?',
    body: 'Earth sits low near the south pole. Terrain can interrupt the direct view. A relay spacecraft can offer another route for communication.',
    says: 'Can we still see home from here?',
    pose: 'explorer-wondering',
  },
]

/**
 * Discovery's pinned scroll, as shares of its run: arriving (the Moon dives and fades to black, then the ground fades in
 * from orbit and the camera comes down), the three questions, then leaving (the camera climbs back out and the ground
 * fades, before the Moon returns for the next section).
 */
const ARRIVAL = 0.38
const LEAVING = 0.16
/** Where in the run the Moon has all but faded out (measured: under 5 % by 0.12). */
const MOON_GONE = 0.13
const ease = (t: number) => {
  const k = Math.max(0, Math.min(1, t))
  return k * k * (3 - 2 * k)
}

/**
 * 2. The moment of discovery. The section stays pinned for several screens. The shared Moon dives toward the site and
 * fades to black; the real landscape then fades in seen from orbit and its camera comes down onto the site
 * (`--reveal`, 0 to 1), so it reads as one dive. Scrolling then walks the three questions, and the tabs jump to them.
 * At the end the camera climbs back out and the ground fades (`--exit`, 0 to 1) before the Moon returns.
 */
function Discovery({ site }: { site: Summary }) {
  const ref = useScrollProgress<HTMLElement>()
  // -1 while arriving, -2 while leaving, else the question shown.
  const [index, setIndex] = useState(-1)
  const [moment, setMoment] = useState<{ m: Moment; sunShare: number; earthShare: number | null; km: number }>()
  const onMoment = useCallback((m: Moment, l: { sunShare: number; earthShare: number | null; km: number }) => setMoment({ m, ...l }), [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const read = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const run = Math.max(1, r.height - window.innerHeight + 56)
      // Pinned below the header, so the run starts when the top reaches it.
      const x = Math.max(0, Math.min(0.999, (56 - r.top) / run))
      // The ground comes in from black once the Moon has gone, and the dive carries on down into it.
      el.style.setProperty('--reveal', ease((x - MOON_GONE) / (ARRIVAL - MOON_GONE)).toFixed(4))
      el.style.setProperty('--exit', ease((x - (1 - LEAVING)) / LEAVING).toFixed(4))
      const asked = (x - ARRIVAL) / (1 - ARRIVAL - LEAVING)
      setIndex(x < ARRIVAL ? -1 : x > 1 - LEAVING * 0.5 ? -2 : Math.min(MODES.length - 1, Math.floor(asked * MODES.length)))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
    }
  }, [ref])

  const go = (i: number) => {
    const el = ref.current
    if (!el) return
    const run = el.offsetHeight - window.innerHeight + 56
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const x = ARRIVAL + ((1 - ARRIVAL - LEAVING) * (i + 0.5)) / MODES.length
    window.scrollTo({ top: el.offsetTop - 56 + run * x, behavior: reduced ? 'auto' : 'smooth' })
  }

  // Arriving or leaving: the text is out of sight, so out of reach too.
  const away = index < 0
  const mode = MODES[index === -2 ? MODES.length - 1 : Math.max(0, index)] ?? MODES[0]
  if (!mode) return null
  const reading =
    moment &&
    (mode.id === 'sun'
      ? `At ${momentLabel(moment.m)} the Sun is ${moment.m.sun.el.toFixed(1)}° up: ${Math.round(moment.sunShare * 100)} % of this ground is in sunlight.`
      : mode.id === 'earth' && moment.m.earth && moment.earthShare != null
        ? `At the same moment Earth is ${moment.m.earth.el.toFixed(1)}° up: ${Math.round(moment.earthShare * 100)} % of this ground has it in direct view.`
        : mode.id === 'ground'
          ? `${moment.km} km of real terrain around ${shortName(site)}, from the LOLA elevation map. Heights are measured from the site's own ground.`
          : null)

  return (
    <section ref={ref} id="discover" data-moon-chapter aria-labelledby="discover-title" className="discover relative h-[460svh]">
      <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="discover-window absolute inset-0">
            <div className="absolute inset-0">
              {/* Arriving and leaving, the ground shows its plain shape: the question's colours belong to the question. */}
              <Landscape site={site} mode={away ? 'ground' : mode.id} onMoment={onMoment} />
            </div>
            <div className="discover-shade absolute inset-0 bg-[linear-gradient(90deg,#000_0%,rgb(0_0_0/0.75)_32%,transparent_62%)] max-lg:bg-[linear-gradient(180deg,#000_0%,rgb(0_0_0/0.7)_45%,transparent_75%)]" />
          </div>
        </div>
        <div inert={away} className="discover-text relative mx-auto grid h-full max-w-7xl grid-rows-[1fr_auto] px-4 py-8 sm:px-6">
          <div className="grid max-w-[30rem] content-start gap-5 lg:content-center">
            <p className="eyebrow text-story-ink">The lunar south pole</p>
            <h2 id="discover-title" className="text-[clamp(2rem,1.3rem+3vw,3.5rem)] leading-[1.02] font-medium text-balance">
              What makes a good place to land?
            </h2>
            <p className="text-lg text-ink-muted text-pretty">
              A few metres of height can change what you can see, where sunlight falls, and whether Earth is within reach.
            </p>
            <div role="tablist" aria-label="Three questions" className="flex w-max rounded-full border border-white/15 bg-black/60 p-1">
              {MODES.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  onClick={() => go(i)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-sm transition-colors duration-200 ${
                    i === index ? 'bg-story text-white' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {m.tab}
                </button>
              ))}
            </div>
            <div key={mode.id} className="rise grid gap-2" role="tabpanel" aria-label={mode.tab}>
              <h3 className="text-xl font-medium">{mode.question}</h3>
              <p className="text-ink-muted text-pretty">{mode.body}</p>
              {reading && <p className="readout text-xs text-ink-faint">{reading}</p>}
            </div>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div key={mode.pose} className="rise flex items-end gap-3">
              <Mascot pose={mode.pose} className="size-24 shrink-0 sm:size-28" />
              <Bubble className="mb-6">{mode.says}</Bubble>
            </div>
            <p className="eyebrow hidden max-w-[22rem] text-right text-ink-faint lg:block">
              {shortName(site)} · LOLA terrain{moment ? `, ${moment.km} km square` : ''} · shadows traced inside this square only
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/** 3. Pick a place: the reader chooses the chapter. Each place has its own challenge, with the numbers behind it. */
function PickPlace({ summaries }: { summaries: Summary[] }) {
  const ordered = useMemo(() => [...summaries].sort((a, b) => a.site.lat_deg - b.site.lat_deg), [summaries])
  const [chosen, setChosen] = useState(ordered[0]?.site.id ?? '')
  const pick = ordered.find((s) => s.site.id === chosen) ?? ordered[0]
  const listRef = useRef<HTMLUListElement>(null)
  if (!pick) return null
  const place = PLACES[pick.site.id]
  return (
    <section aria-labelledby="pick-title" className="relative bg-bg">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6">
        <header className="grid max-w-[40rem] gap-3">
          <p className="eyebrow text-story-ink">Where do we go next?</p>
          <h2 id="pick-title" className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium text-balance">
            Choose a place to investigate.
          </h2>
          <p className="text-lg text-ink-muted text-pretty">
            Each place shows a different lunar challenge. Pick one on the Moon above, or here, then stand on it in 3D.
          </p>
        </header>
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
          <ul ref={listRef} className="grid gap-4 md:grid-cols-3">
            {ordered.map((s) => {
              const spans = siteSpans(s)
              const m = measure(spans, spans.coverage)
              const on = s.site.id === pick.site.id
              const p = PLACES[s.site.id]
              return (
                <li key={s.site.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(s.site.id)}
                    className={`grid h-full w-full cursor-pointer content-start gap-4 rounded-xl border p-5 text-left transition-[border-color,background-color] duration-200 ${
                      on ? 'border-story bg-story/10' : 'border-line bg-surface/40 hover:border-line-strong'
                    }`}
                  >
                    <span className="eyebrow text-ink-faint">
                      {Math.abs(s.site.lat_deg).toFixed(1)}°S · {Math.round(s.site.ground_height_m)} m
                    </span>
                    <span className="text-xl font-medium">{shortName(s)}</span>
                    {p && <span className="text-lg leading-snug text-story-ink">“{p.hook}”</span>}
                    <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                      <div>
                        <dt className="text-xs text-ink-muted">Sun in view</dt>
                        <dd className="readout text-xl text-sun">{Math.round(m.sunShare * 100)} %</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-muted">Earth in view</dt>
                        <dd className="readout text-xl text-comms">{Math.round((s.earth?.visible_share ?? 0) * 100)} %</dd>
                      </div>
                    </dl>
                    <span className="text-xs text-ink-faint">Over the computed year from {s.params.start}.</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <aside aria-live="polite" className="grid gap-4 rounded-xl border border-line bg-surface/40 p-5">
            <div className="flex items-end gap-3">
              <Mascot pose="explorer-magnifier" className="size-24 shrink-0" />
              {place && <Bubble className="mb-4">{place.hook}</Bubble>}
            </div>
            <Eyebrow pip>Key insight · {shortName(pick)}</Eyebrow>
            {place && <p className="text-pretty">{place.insight}</p>}
            <Link
              to="/explore/$siteId"
              params={{ siteId: pick.site.id }}
              className="inline-flex items-center gap-2 justify-self-start rounded-md border border-line-strong px-3 py-2 text-sm hover:bg-surface-hover"
            >
              <CubeIcon aria-hidden className="size-4" />
              Stand on {shortName(pick)} in 3D
            </Link>
          </aside>
        </div>
      </div>
    </section>
  )
}

/** 5. Not straight to the footer: one large dark section with a little blue orbit and the explorer facing the reader. */
function Ending() {
  const ref = useScrollProgress<HTMLElement>()
  return (
    <section ref={ref} data-moon-chapter aria-labelledby="ending-title" className="story-bridge starfield relative">
      <Orbits />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-24 sm:px-6 md:grid-cols-[18rem_1fr]">
        <div className="parallax grid justify-items-center gap-3 [--depth:60px]">
          <Mascot pose="explorer-hello" className="size-48 sm:size-56" />
          <Bubble>Ready to test your own lunar moment?</Bubble>
        </div>
        <div className="grid gap-5">
          <p className="eyebrow text-story-ink">Your next discovery</p>
          <h2 id="ending-title" className="text-[clamp(2rem,1.3rem+3vw,3.75rem)] leading-[1.02] font-medium text-balance">
            You’ve seen the place.
            <br />
            Now change the conditions.
          </h2>
          <ul className="grid gap-1 text-lg text-ink-muted">
            <li>What happens when the Sun moves?</li>
            <li>What if the terrain blocks the view of Earth?</li>
          </ul>
          <div>
            <StoryLink to="/understand" className="min-w-64">
              Try the light experiment
            </StoryLink>
          </div>
          <p className="text-sm text-ink-faint">
            Or go straight to{' '}
            <Link to="/analyze" className="underline underline-offset-3 hover:text-ink">
              planning a landing
              <ArrowRightIcon aria-hidden className="ml-1 inline size-3" />
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
