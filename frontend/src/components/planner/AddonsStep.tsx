import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Link as KLink } from '@cloudflare/kumo/components/link'
import { Select } from '@cloudflare/kumo/components/select'
import { BroadcastIcon, CarIcon, SolarPanelIcon, XIcon } from '@phosphor-icons/react'
import { type KeyboardEvent, lazy, Suspense } from 'react'
import { RelayLadder } from '~/components/addons/RelayLadder'
import { RoverPanel } from '~/components/addons/RoverPanel'
import { SiteProvenance } from '~/components/Evidence'
import { Lanes } from '~/components/Lanes'
import { MastPanel } from '~/components/PowerPanels'
import { SiteThumb } from '~/components/planner/Illustrations'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { Eyebrow } from '~/components/Shell'
import { useFeed } from '~/lib/feeds'
import { REQUIREMENTS, shortName, TOUCHDOWN_LABEL } from '~/lib/mission'
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
      <Suspense fallback={<p aria-busy="true">Loading the mast example…</p>}>
        <MastExample />
      </Suspense>
    </div>
  )
}

function ScenarioTabIcon({ piece }: { piece: ScenarioPiece }) {
  const I = piece === 'mast' ? SolarPanelIcon : piece === 'relay' ? BroadcastIcon : CarIcon
  return <I aria-hidden className="size-4" />
}

/** The fourth step: the follow-up tools (mast, relay, rover), each opened on the plan and the site in focus. */
export function AddonsStep({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  const suggested = scenarioGuidance(site).priority
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
    <>
      <header className="grid gap-3">
        <Eyebrow pip>Add-ons · {shortName(site.data)}</Eyebrow>
        <h2 className="text-[clamp(1.75rem,1.3rem+1.8vw,2.75rem)] leading-[1.08] font-medium text-balance">
          What would help this landing?
        </h2>
        <p className="max-w-[60ch] text-ink-muted text-pretty">
          A mast for more Sun, relay satellites for more contact with Earth, a rover to go further. Each opens on your plan and site.
        </p>
      </header>
      <div className="grid gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line">
          <div role="tablist" aria-label="Add-ons" className="flex flex-wrap gap-x-6">
            {SCENARIO_PIECES.map((value) => {
              const selected = value === piece
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
                  className={`-mb-px flex cursor-pointer items-center gap-2 border-b-2 py-3 font-medium whitespace-nowrap ${
                    selected ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <ScenarioTabIcon piece={value} />
                  {SCENARIOS[value].name}
                  {suggested.includes(value) && <span className="readout text-xs text-ink-muted">Suggested</span>}
                </button>
              )
            })}
          </div>
          {plan.sites.length > 1 && (
            <div className="flex items-center gap-2 pb-2">
              <span id="addon-site" className="text-ink-muted">
                Site
              </span>
              <Select
                aria-labelledby="addon-site"
                value={site.data.site.id}
                items={Object.fromEntries(plan.sites.map((s) => [s.data.site.id, shortName(s.data)]))}
                onValueChange={(v) => actions.go({ focus: String(v) })}
              />
            </div>
          )}
        </div>
        <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(piece)} className="grid gap-8">
          <ScenarioResult key={`${piece}-${plan.focus}`} plan={plan} piece={piece} />
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>Compare with your plan as it stands</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <div className="pt-2">
                <Baseline plan={plan} />
              </div>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-4">
          <KLink render={<button type="button" onClick={() => actions.setStep('result')} />} className="cursor-pointer">
            Back to the result
          </KLink>
          <KLink render={<button type="button" onClick={() => actions.setStep('dates')} />} className="cursor-pointer">
            Try another date
          </KLink>
        </div>
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>Starting point: sources and assumptions</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <SiteProvenance sites={[site.data]} />
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
      </div>
    </>
  )
}
