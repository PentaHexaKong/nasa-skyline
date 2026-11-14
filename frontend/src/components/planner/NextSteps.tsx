import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, StackIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { reviewSearch } from '~/components/planner/resolvePlan'
import { ScenarioIcon } from '~/components/planner/ScenarioIcon'
import { Eyebrow } from '~/components/Shell'
import { shortName, siteResult } from '~/lib/mission'
import { reducedMotion } from '~/lib/motion'
import { SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'

const BLURB = {
  mast: 'A higher or nearby spot may see more Sun and Earth.',
  relay: 'What a relay spacecraft adds to direct contact.',
  rover: 'What a rover could reach from here.',
} as const

/**
 * Where to go from the result, for one site: its standing in a sentence, the two quick moves (another date, the other
 * sites), then the follow-ups as picture cards, the ones for missed limits first. The pictures are NASA renderings,
 * labelled as illustrations; the results behind them are not computed yet.
 */
export function NextSteps({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  const guidance = scenarioGuidance(site)
  const context = reviewSearch(search, site.data.site.id)
  const order: ScenarioPiece[] = [...guidance.priority, ...guidance.optional]
  const r = siteResult(site)
  const name = shortName(site.data)
  const compare = () => {
    const reduced = reducedMotion().matches
    document.getElementById('compare')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <section aria-labelledby="next-title" className="grid gap-8 border-t border-line pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Eyebrow pip>Next</Eyebrow>
          <h2 id="next-title" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-medium">
            What should you do next?
          </h2>
        </div>
        {plan.sites.length > 1 && (
          <div className="flex items-center gap-2">
            <span id="next-site" className="text-sm text-ink-muted">
              For
            </span>
            <Select
              aria-labelledby="next-site"
              className="w-56"
              value={site.data.site.id}
              items={Object.fromEntries(plan.sites.map((s) => [s.data.site.id, shortName(s.data)]))}
              onValueChange={(v) => actions.go({ focus: String(v) })}
            />
          </div>
        )}
      </div>

      <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <p className="max-w-[40ch] text-[clamp(1.25rem,1rem+1vw,1.75rem)] leading-snug text-pretty">
          <span className={`mr-2 text-base font-medium ${r.works ? 'text-go' : 'text-miss'}`}>
            {r.works ? '✓ Works' : '× Needs attention'}
          </span>
          {r.works
            ? `${name} meets every limit over the ${plan.stay}-day stay.`
            : `${name}: ${r.why.charAt(0).toLowerCase()}${r.why.slice(1)}. ${guidance.headline}`}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => actions.setStep('dates')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-2.5 font-medium text-black transition-opacity hover:opacity-90"
          >
            <CalendarBlankIcon aria-hidden weight="bold" /> Try another date
          </button>
          <button
            type="button"
            onClick={compare}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 transition-colors hover:border-white/60"
          >
            <StackIcon aria-hidden /> Compare sites
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="flex items-end justify-between gap-4">
          <h3 className="text-[clamp(1.35rem,1.1rem+0.8vw,1.75rem)] font-medium">
            {guidance.priority.length > 0 ? 'Next steps' : 'Explore further'}
          </h3>
          {guidance.priority.length > 0 && <p className="text-sm text-ink-muted">The ones for missed limits come first.</p>}
        </div>
        <FollowUps
          items={order.map((piece) => ({
            piece,
            priority: guidance.priority.includes(piece),
            missed: piece === 'mast' ? guidance.sun : piece === 'relay' ? guidance.earth : [],
          }))}
          context={context}
        />
        <p className="text-xs text-ink-faint">
          NASA artist’s renderings, for illustration only; credits on the Method page. Follow-up results are not computed yet.
        </p>
      </div>
    </section>
  )
}

/** NASA artist's renderings, one per follow-up. Credits are on the Method page. */
const PHOTO = {
  mast: {
    src: '/next-steps/mast.jpg',
    alt: "NASA artist's rendering of a Moon Base near the lunar south pole, with tall solar arrays on the ridge.",
  },
  relay: {
    src: '/next-steps/relay.jpg',
    alt: "NASA artist's concept of the Gateway lunar space station, with its antennas and solar arrays.",
  },
  rover: { src: '/next-steps/rover.jpg', alt: "NASA artist's rendering of a rover driving on the lunar surface." },
} as const

type Missed = ReturnType<typeof scenarioGuidance>['sun' | 'earth']

/**
 * The follow-ups as picture cards, each one link: the rendering, the tool's icon, its name, one line, the missed limits
 * where they apply, and Open analysis. Three in a row on wide screens; on narrower ones a row to swipe, with buttons over
 * the pictures while there is more to see.
 */
function FollowUps({ items, context }: { items: { piece: ScenarioPiece; priority: boolean; missed: Missed }[]; context: PlanSearch }) {
  const row = useRef<HTMLUListElement>(null)
  const [can, setCan] = useState({ back: false, forward: false })
  const [mid, setMid] = useState(0)
  useEffect(() => {
    const el = row.current
    if (!el) return
    const read = () => {
      setCan({ back: el.scrollLeft > 4, forward: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
      // The buttons sit halfway down the pictures.
      const img = el.querySelector('img')
      if (img) setMid(img.offsetTop + img.offsetHeight / 2)
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', read)
      ro.disconnect()
    }
  }, [])
  const page = (dir: number) => {
    const el = row.current
    const card = el?.querySelector('li')
    if (!el || !card) return
    el.scrollBy({ left: dir * (card.offsetWidth + 16), behavior: reducedMotion().matches ? 'auto' : 'smooth' })
  }
  const arrow =
    'absolute z-10 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/70 text-ink transition-opacity hover:bg-black lg:hidden'
  return (
    // min-w-0: as a grid child the row must not widen its column to fit the cards it scrolls through.
    <div className="relative min-w-0">
      <ul
        ref={row}
        aria-label="Follow-up analyses"
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-1 sm:scroll-px-6 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0"
      >
        {items.map(({ piece, priority, missed }) => {
          const tool = SCENARIOS[piece]
          return (
            <li key={piece} className="w-[85%] shrink-0 snap-start sm:w-[60%] md:w-[46%] lg:w-auto">
              <Link
                to="/analyze/scenario/$piece"
                params={{ piece }}
                search={context}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-black transition-colors hover:border-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="relative block overflow-hidden">
                  <img
                    src={PHOTO[piece].src}
                    alt={PHOTO[piece].alt}
                    loading="lazy"
                    decoding="async"
                    width={1600}
                    height={900}
                    className="aspect-video w-full object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105"
                  />
                  {priority && (
                    <span className="absolute top-3 left-3 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-miss">
                      × Start here
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
                  <span className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-4">
                    <ScenarioIcon piece={piece} />
                    <span className="grid gap-1.5">
                      <span className="text-xl leading-tight font-medium">{tool.name}</span>
                      <span className="text-ink-muted text-pretty">
                        {priority ? (piece === 'mast' ? 'Your Sun limits are missed. ' : 'Your Earth limits are missed. ') : ''}
                        {BLURB[piece]}
                      </span>
                    </span>
                  </span>
                  {priority && missed.length > 0 && (
                    <span className="grid gap-0.5 text-xs text-ink-muted">
                      {missed.map((c) => (
                        <span key={c.key}>
                          <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-miss" />
                          {c.label}:{' '}
                          <span className="tabular">
                            {c.value.toFixed(1)} {c.unit}
                          </span>
                          ; your limit is {c.bound}{' '}
                          <span className="tabular">
                            {c.limit} {c.unit}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="mt-auto inline-flex items-center gap-2 font-medium">
                    Open analysis
                    <ArrowRightIcon aria-hidden className="transition-transform duration-300 motion-safe:group-hover:translate-x-1" />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {can.back && (
        <button type="button" aria-label="Previous follow-up" onClick={() => page(-1)} className={`${arrow} left-2`} style={{ top: mid }}>
          <CaretLeftIcon aria-hidden weight="bold" />
        </button>
      )}
      {can.forward && (
        <button type="button" aria-label="Next follow-up" onClick={() => page(1)} className={`${arrow} right-2`} style={{ top: mid }}>
          <CaretRightIcon aria-hidden weight="bold" />
        </button>
      )}
    </div>
  )
}
