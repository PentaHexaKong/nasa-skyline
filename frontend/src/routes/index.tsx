import { createFileRoute, Link, useHydrated } from '@tanstack/react-router'
import { lazy, Suspense, useRef } from 'react'
import { MOON_PREVIEW } from '~/components/moonTextures'
import { Shell } from '~/components/Shell'
import { Mascot, type MascotPose, StoryLink, useScrollProgress } from '~/components/story'
import { Wordmark } from '~/components/Wordmark'
import { loadMoonEphemeris } from '~/lib/data'

const loadHorizonMoon = () => import('~/components/HorizonMoon')
if (typeof window !== 'undefined') void loadHorizonMoon()
const HorizonMoon = lazy(loadHorizonMoon)

/**
 * The front door: three ways in, one per audience. Explore for the curious, Understand for classrooms and anyone who
 * wants to experiment, Analyze for mission planners.
 */
export const Route = createFileRoute('/')({
  loader: () => loadMoonEphemeris(),
  head: () => ({
    meta: [{ title: 'Skyline · What brings you to the Moon?' }],
    links: [{ rel: 'preload', as: 'image', href: MOON_PREVIEW.color, fetchPriority: 'high' as const }],
  }),
  component: Home,
})

const DOORS: { pose: MascotPose; ask: string; go: string; to: '/explore' | '/understand' | '/analyze'; what: string }[] = [
  {
    pose: 'explorer-lookup',
    ask: 'Just curious?',
    go: 'Explore the Moon',
    to: '/explore',
    what: 'Fly from the whole Moon down to a polar ridge, and see why a few metres change everything.',
  },
  {
    pose: 'scientist-globe',
    ask: 'Ready to experiment?',
    go: 'Try the simulation',
    to: '/understand',
    what: 'Predict, move the Sun through a lunar day, and explain what the terrain hides.',
  },
  {
    pose: 'planner-clipboard',
    ask: 'Planning a mission?',
    go: 'Analyze landing sites',
    to: '/analyze',
    what: 'Compare sites and landing dates against your own Sun and Earth requirements.',
  },
]

function Home() {
  const ref = useScrollProgress<HTMLElement>()
  const eph = Route.useLoaderData()
  const hydrated = useHydrated()
  const doors = useRef<HTMLUListElement>(null)
  return (
    <Shell bare>
      <main ref={ref} className="starfield relative grid min-h-svh overflow-hidden">
        {hydrated && (
          <Suspense fallback={null}>
            <HorizonMoon eph={eph} clearOf={doors} />
          </Suspense>
        )}
        {/* The Moon fades into the night at the bottom edge, so the footer line stays legible over it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black via-black/70 to-transparent"
        />
        <div className="relative mx-auto grid w-full max-w-6xl grid-rows-[auto_auto_1fr_auto] justify-items-center gap-8 px-4 pt-[clamp(2rem,7svh,6rem)] pb-6 sm:px-6">
          <div className="grid content-end justify-items-center gap-5">
            <h1 className="relative grid place-items-center">
              <Wordmark className="rise relative h-16 w-auto text-white sm:h-24 [--i:1]" />
              <span className="sr-only">Skyline</span>
            </h1>
            <p className="rise font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] italic [--i:2]">What brings you to the Moon?</p>
          </div>
          <ul ref={doors} className="grid w-full gap-8 sm:grid-cols-3 sm:gap-6">
            {DOORS.map((d, i) => (
              <li key={d.to} className="rise grid justify-items-center gap-4 text-center" style={{ ['--i' as string]: 3 + i }}>
                <Mascot pose={d.pose} className="size-28" />
                <h2 className="text-xl font-medium">{d.ask}</h2>
                <StoryLink to={d.to} className="w-full max-w-64">
                  {d.go}
                </StoryLink>
                <p className="max-w-[30ch] text-sm text-ink-muted text-pretty">{d.what}</p>
              </li>
            ))}
          </ul>
          {/* Room for the Moon on a page taller than the screen; on one screen the Moon fills whatever is left (HorizonMoon). */}
          <div className="min-h-20" />
          <div className="eyebrow flex w-full items-baseline justify-between gap-4 text-2xs text-ink-faint">
            <Link to="/method" className="hover:text-ink">
              How we know
            </Link>
            <span>Built by Hexakong</span>
          </div>
        </div>
      </main>
    </Shell>
  )
}
