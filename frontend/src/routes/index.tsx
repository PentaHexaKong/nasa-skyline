import { createFileRoute, Link } from '@tanstack/react-router'
import { MOON_PREVIEW } from '~/components/moonTextures'
import { Shell } from '~/components/Shell'
import { Mascot, type MascotPose, StoryLink, useScrollProgress } from '~/components/story'
import { Wordmark } from '~/components/Wordmark'

/**
 * The front door: three ways in, one per audience. Explore for the curious, Understand for classrooms and anyone who
 * wants to experiment, Analyze for mission planners.
 */
export const Route = createFileRoute('/')({
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
  return (
    <Shell>
      <main ref={ref} className="starfield relative grid min-h-[calc(100svh-3.5rem)] overflow-hidden">
        <div className="relative mx-auto grid w-full max-w-6xl grid-rows-[1fr_auto_1fr_auto] justify-items-center gap-10 px-4 pt-14 pb-6 sm:px-6">
          <div className="grid content-end justify-items-center gap-5">
            <h1 className="relative grid place-items-center">
              {/* The Moon behind the S: the same NASA colour map as the globe, shaded into a sphere. */}
              <span
                aria-hidden
                className="rise absolute top-1/2 left-[13%] aspect-square w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cover bg-center opacity-70 shadow-[inset_-18px_-10px_40px_rgb(0_0_0/0.85)]"
                style={{ backgroundImage: `url(${MOON_PREVIEW.color})`, backgroundSize: '220% 100%' }}
              />
              <Wordmark className="rise relative h-16 w-auto text-white sm:h-24 [--i:1]" />
              <span className="sr-only">Skyline</span>
            </h1>
            <p className="rise font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] italic [--i:2]">What brings you to the Moon?</p>
          </div>
          <ul className="grid w-full gap-8 sm:grid-cols-3 sm:gap-6">
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
          <div />
          <div className="eyebrow flex w-full items-baseline justify-between gap-4 text-2xs text-ink-faint">
            <span>One Moon. Your way in.</span>
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
