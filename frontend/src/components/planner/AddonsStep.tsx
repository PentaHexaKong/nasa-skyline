import { Button } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowLeftIcon, ArrowRightIcon, BroadcastIcon, CarIcon, SolarPanelIcon, XIcon } from '@phosphor-icons/react'
import { type KeyboardEvent, lazy, Suspense } from 'react'
import { ComputingMark, SkeletonRows } from '~/components/addons/Computing'
import { RelayLadder } from '~/components/addons/RelayLadder'
import { RoverPanel } from '~/components/addons/RoverPanel'
import { SiteProvenance } from '~/components/Evidence'
import { Lanes } from '~/components/Lanes'
import { MastPanel } from '~/components/PowerPanels'
import { SiteThumb } from '~/components/planner/Illustrations'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { StatusWord } from '~/components/planner/Section'
import { useFeed } from '~/lib/feeds'
import { REQUIREMENTS, shortName, siteResult, TOUCHDOWN_LABEL } from '~/lib/mission'
import { matchesScenario, SCENARIO_PIECES, SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'

const MastExample = lazy(() => import('~/components/addons/MastExample'))

const pct = (x: number) => `${(x * 100).toFixed(0)} %`
const tabId = (piece: ScenarioPiece) => `addon-tab-${piece}`
const PANEL_ID = 'addon-panel'

function Baseline({ plan }: { plan: Plan }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  const tone = { minSun: 'text-sun', maxNoSun: 'text-sun', minEarth: 'text-comms', maxNoEarth: 'text-comms' } as const
  return (
    <section
      aria-labelledby="baseline"
      className="grid gap-6 rounded-xl border border-line p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
    >
      <div className="grid content-start gap-4">
        <div className="grid gap-1">
          <h2 id="baseline" className="text-lg font-medium">
            Your starting point · {shortName(site.data)}
          </h2>
          <p className="text-ink-muted">
            {scenarioGuidance(site).headline} At touchdown: {TOUCHDOWN_LABEL[site.touchdown]}.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {REQUIREMENTS.map((q) => {
            const missed = site.checks?.checks.find((c) => c.key === q.key)?.pass === false
            const truncated =
              site.stay && (q.key === 'maxNoSun' ? site.stay.noSun.truncated : q.key === 'maxNoEarth' ? site.stay.noEarth.truncated : false)
            return (
              <div
                key={q.key}
                className={`grid content-start gap-1 rounded-lg border p-3 ${missed ? 'border-miss/50 bg-miss-fill/20' : 'border-go/40 bg-go-fill/15'}`}
              >
                <dt className={`text-xs ${tone[q.key]}`}>{q.label}</dt>
                <dd className="readout text-xl">
                  {missed && <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-base text-miss" />}
                  {site.stay ? `${q.read(site.stay).toFixed(1)} ${q.unit}${truncated ? ' +' : ''}` : 'Not computed'}
                </dd>
                <dd className="text-xs text-ink-faint">
                  Your limit: {q.bound} {plan.requirements[q.key]} {q.unit}
                </dd>
              </div>
            )
          })}
        </dl>
        {site.stay && (
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Visibility over the stay</h3>
            <Lanes
              window={site.stay.window}
              label={`${site.data.site.name}: Sun and Earth over the stay`}
              lanes={[
                { key: 'sun', label: 'Sun', spans: site.stay.sun, fill: 'bg-sun', value: pct(site.stay.sunShare) },
                { key: 'earth', label: 'Earth', spans: site.stay.earth, fill: 'bg-comms', value: pct(site.stay.earthShare) },
              ]}
            />
          </div>
        )}
      </div>
      <figure className="relative overflow-hidden rounded-lg border border-line">
        <SiteThumb site={site.data} className="h-full min-h-56 w-full" />
        <figcaption className="absolute inset-x-2 bottom-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-black/75 px-3 py-2 font-mono text-2xs">
          <span>
            <span className="text-ink-faint">SITE </span>
            {shortName(site.data)}
          </span>
          <span>
            <span className="text-ink-faint">OBSERVER HEIGHT </span>
            {site.data.site.observer_height_m} m
          </span>
          <span>
            <span className="text-ink-faint">POSITION </span>
            {Math.abs(site.data.site.lat_deg).toFixed(3)}°S {site.data.site.lon_deg_east.toFixed(3)}°E (starting point)
          </span>
        </figcaption>
        <p className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-2xs text-ink-muted">
          The site’s computed skyline, north round to north
        </p>
      </figure>
    </section>
  )
}

function ScenarioResult({ plan, piece }: { plan: Plan; piece: ScenarioPiece }) {
  const siteId = plan.focus ?? ''
  const feed = useFeed('mast', siteId)
  if (piece === 'rover') return <RoverPanel plan={plan} />
  if (piece === 'relay') return <RelayLadder plan={plan} />
  const computed = feed.state === 'ready' && matchesScenario(feed.data, siteId, plan.window)
  return (
    <div className="grid gap-8">
      {computed && (
        <section aria-label="Mast placement for your plan" className="grid gap-4">
          <p className="text-ink-muted">
            Pipeline output for your site and period. Read its visibility rules and assumptions before comparing with your starting point.
          </p>
          <MastPanel siteId={siteId} />
        </section>
      )}
      <Suspense fallback={<MastLoading />}>
        <MastExample />
      </Suspense>
    </div>
  )
}

/** While the mast example's code and terrain load: the same frame as the answer, so nothing jumps when it arrives. */
function MastLoading() {
  return (
    <section aria-busy="true" aria-label="Loading the mast example" className="grid gap-5 rounded-xl border border-line px-5 py-4 lg:py-5">
      <div className="flex items-center gap-4">
        <ComputingMark kind="sun" />
        <p className="text-ink-muted">Loading the mast example…</p>
      </div>
      <SkeletonRows rows={4} />
    </section>
  )
}

const ICON = { mast: SolarPanelIcon, relay: BroadcastIcon, rover: CarIcon } as const
/** Each add-on keeps the colour of what it is about: the Sun for a mast, Earth contact for relays. */
const TONE = { mast: 'text-sun', relay: 'text-comms', rover: 'text-ink' } as const

/** The fourth step: the follow-up tools (mast, relay, rover), each opened on the plan and the site in focus. */
export function AddonsStep({ plan: planned, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  // Add-ons are for the sites that need help: with no site asked for, open on the first one that doesn't work (the plan
  // itself focuses the first one that does, which suits Result). A site picked here, or a tool opened for one on
  // Result, is kept (`addonSite`); Result's own site switch is not a request for add-ons.
  const asked = search.addonSite ? planned.sites.find((s) => s.data.site.id === search.addonSite) : undefined
  const site =
    asked ??
    planned.sites.find((s) => !siteResult(s).works) ??
    planned.sites.find((s) => s.data.site.id === planned.focus) ??
    planned.sites[0]
  if (!site) return null
  // Every panel below reads the site from `plan.focus`.
  const plan: Plan = { ...planned, focus: site.data.site.id }
  const guidance = scenarioGuidance(site)
  const suggested = guidance.priority
  const piece: ScenarioPiece = search.piece ?? suggested[0] ?? 'relay'
  const choose = (next: ScenarioPiece) => actions.go({ piece: next })

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SCENARIO_PIECES.indexOf(piece)
    const last = SCENARIO_PIECES.length - 1
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % SCENARIO_PIECES.length
        : e.key === 'ArrowLeft'
          ? (i + last) % SCENARIO_PIECES.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (to === null) return
    e.preventDefault()
    const next = SCENARIO_PIECES[to]!
    choose(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <div className="grid gap-10">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="grid max-w-[44rem] gap-2">
          <h2 className="text-[clamp(1.75rem,1.3rem+1.8vw,2.75rem)] leading-[1.08] font-medium text-balance">
            What would help at <span className="text-story-ink">{shortName(site.data)}</span>?
          </h2>
          <p className="text-ink-muted text-pretty">{guidance.headline} Pick an add-on to see what it changes.</p>
        </div>
        {plan.sites.length > 1 && (
          <div className="flex items-center gap-3">
            <span id="addon-site" className="text-sm text-ink-muted">
              Site
            </span>
            <Select
              aria-labelledby="addon-site"
              value={site.data.site.id}
              items={Object.fromEntries(plan.sites.map((s) => [s.data.site.id, shortName(s.data)]))}
              onValueChange={(v) => actions.go({ addonSite: String(v) })}
            />
            {/* The status beside the picker, in the planner's own ✓/× words, not squeezed into the option text. */}
            <span className="text-sm">
              <StatusWord works={siteResult(site).works} computed={!!site.checks} />
            </span>
          </div>
        )}
      </header>

      <div className="grid gap-6">
        {/* The three add-ons as cards: what each one asks, and which ones this site's misses point to. */}
        <div role="tablist" aria-label="Add-ons" className="grid gap-3 sm:grid-cols-3">
          {SCENARIO_PIECES.map((value) => {
            const selected = value === piece
            const Icon = ICON[value]
            return (
              <button
                key={value}
                type="button"
                role="tab"
                id={tabId(value)}
                aria-selected={selected}
                aria-controls={PANEL_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(value)}
                onKeyDown={onTabKey}
                className={`grid cursor-pointer content-start gap-2 rounded-xl border px-4 py-3.5 text-left transition-[background-color,border-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  selected ? 'border-white/45 bg-white/[0.06]' : 'border-line hover:border-line-strong hover:bg-white/[0.025]'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className={`flex items-center gap-2.5 font-medium ${selected ? 'text-ink' : 'text-ink/85'}`}>
                    <Icon aria-hidden weight={selected ? 'fill' : 'regular'} className={`size-5 shrink-0 ${TONE[value]}`} />
                    {SCENARIOS[value].name}
                  </span>
                  {suggested.includes(value) && (
                    <span className="shrink-0 rounded-full bg-story/20 px-2 py-0.5 text-xs font-medium text-story-ink">Suggested</span>
                  )}
                </span>
                <span className="text-sm text-ink-muted text-pretty">{SCENARIOS[value].question}</span>
              </button>
            )
          })}
        </div>

        <div key={`${piece}-${plan.focus}`} role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(piece)} className="addon-panel-in">
          <ScenarioResult plan={plan} piece={piece} />
        </div>
      </div>

      <footer className="grid gap-6 border-t border-line pt-6">
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>Compare with your plan without add-ons</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <div className="grid gap-8 pt-3">
              <Baseline plan={plan} />
              <section aria-labelledby="addon-sources" className="grid gap-3">
                <h3 id="addon-sources" className="font-medium">
                  Sources and assumptions
                </h3>
                <SiteProvenance sites={[site.data]} />
              </section>
            </div>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
        <nav aria-label="Other steps" className="flex flex-wrap justify-between gap-3">
          <Button variant="secondary" icon={ArrowLeftIcon} onClick={() => actions.setStep('result')}>
            Back to the result
          </Button>
          <Button variant="secondary" onClick={() => actions.setStep('dates')}>
            Try another date
            <ArrowRightIcon aria-hidden />
          </Button>
        </nav>
      </footer>
    </div>
  )
}
