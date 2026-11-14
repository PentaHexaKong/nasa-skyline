import { createFileRoute, Link, notFound, useHydrated } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense } from 'react'
import { Eyebrow, Shell } from '~/components/Shell'
import { LegacyMastFeed, RelayFeed } from '~/lib/feed-schemas'
import { MastPlan, MastSection, MastTrade } from '~/prototypes/mast'
import { Picker } from '~/prototypes/Picker'
import { RelayDial, RelayFill, RelayGaps } from '~/prototypes/relay'
import { RoverCorridor, RoverDays, RoverReach } from '~/prototypes/rover'

const In3D = lazy(() => import('~/prototypes/in3d'))

/**
 * PROTOTYPE SURFACE (emil-prototype). Dev only, never linked from the app, and deleted once a
 * direction is chosen. Every number on it is a fixture; only the terrain is real.
 */
const PIECES = {
  mast: { title: 'Where to put the mast', names: ['Site plan', 'Section', 'Trade-off', 'In 3D'] },
  relay: { title: 'What each relay adds', names: ['Ladder', 'Dial', 'Gap ledger', 'In 3D'] },
  rover: { title: 'How far a rover gets', names: ['Reach map', 'Days out', 'Corridor', 'In 3D'] },
} as const
type Piece = keyof typeof PIECES

export const Route = createFileRoute('/prototypes/$piece')({
  loader: async ({ params }) => {
    if (!import.meta.env.DEV || !(params.piece in PIECES)) throw notFound()
    const [mast, relay] = await Promise.all([
      import('../../fixtures/feeds/mast/connecting-ridge.json'),
      import('../../fixtures/feeds/relay/connecting-ridge.json'),
    ])
    return { mast: LegacyMastFeed.parse(mast.default), relay: RelayFeed.parse(relay.default) }
  },
  head: () => ({ meta: [{ title: 'Prototypes · Skyline' }, { name: 'robots', content: 'noindex' }] }),
  component: Page,
})

function Page() {
  const piece = Route.useParams().piece as Piece
  const { mast, relay } = Route.useLoaderData()
  const hydrated = useHydrated()
  const in3d = hydrated ? (
    <Suspense key="4" fallback={null}>
      <In3D piece={piece} mast={mast} />
    </Suspense>
  ) : null
  const variants: Record<Piece, ReactNode[]> = {
    mast: [<MastPlan key="1" data={mast} />, <MastSection key="2" data={mast} />, <MastTrade key="3" data={mast} />, in3d],
    relay: [<RelayFill key="1" data={relay} />, <RelayDial key="2" data={relay} />, <RelayGaps key="3" data={relay} />, in3d],
    rover: [<RoverReach key="1" />, <RoverDays key="2" />, <RoverCorridor key="3" />, in3d],
  }
  return (
    <Shell>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 pt-10 pb-32 sm:px-6">
        <header className="grid gap-3">
          <Eyebrow pip>Prototype · Connecting Ridge · fixture numbers, real terrain</Eyebrow>
          <nav aria-label="Prototype piece" className="flex gap-5">
            {(Object.keys(PIECES) as Piece[]).map((p) => (
              <Link
                key={p}
                to="/prototypes/$piece"
                params={{ piece: p }}
                className={`border-b-2 pb-1 capitalize ${p === piece ? 'border-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                {p}
              </Link>
            ))}
          </nav>
          <h1 className="text-3xl font-medium">{PIECES[piece].title}</h1>
        </header>
        <Picker key={piece} names={[...PIECES[piece].names]} render={(i) => variants[piece][i]} />
      </main>
    </Shell>
  )
}
