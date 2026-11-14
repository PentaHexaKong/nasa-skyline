import { Badge } from '@cloudflare/kumo/components/badge'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Link as KLink } from '@cloudflare/kumo/components/link'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, BroadcastIcon, CarIcon, SolarPanelIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { type KeyboardEvent, lazy, Suspense } from 'react'
import { SiteProvenance } from '~/components/Evidence'
import { Lanes } from '~/components/Lanes'
import { MastPanel } from '~/components/PowerPanels'
import { SiteThumb } from '~/components/planner/Illustrations'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { RelayLadder } from '~/components/planner/RelayLadder'
import { RoverReach } from '~/components/planner/RoverReach'
import { Eyebrow } from '~/components/Shell'
import { useFeed } from '~/lib/feeds'
import { REQUIREMENTS, shortName, TOUCHDOWN_LABEL } from '~/lib/mission'
import { matchesScenario, SCENARIO_PIECES, SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'

const Preview = import.meta.env.DEV ? lazy(() => import('~/prototypes/ScenarioPreview')) : null

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
  if (piece === 'rover') return <RoverReach plan={plan} />
  if (piece === 'relay') return <RelayLadder plan={plan} />
  if (feed.state === 'loading') return <p aria-busy="true">Checking scenario results…</p>
  if (feed.state === 'ready' && matchesScenario(feed.data, siteId, plan.window)) {
    return (
      <section aria-label="Pipeline scenario output" className="grid gap-4">
        <p className="text-ink-muted">
          Pipeline output for your site and period. Read its visibility rules and assumptions before comparing with your starting point.
        </p>
        <MastPanel siteId={siteId} />
      </section>
    )
  }
  return (
    <section aria-labelledby="scenario-result" className="flex gap-3 rounded-xl border border-line-strong p-4">
      <WarningCircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <div className="grid gap-1">
        <h2 id="scenario-result" className="font-medium">
          Scenario result · not computed
        </h2>
        <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
          A computed result matching this site and the exact mission period is not available. Any improvement over your starting point is
          not computed.
        </p>
        <p className="max-w-[72ch] text-sm text-pretty">
          Meanwhile, the site report shows how the Sun clears this site’s ridge, hour by hour:{' '}
          <Link to="/analyze/$siteId" params={{ siteId }} className="font-medium underline underline-offset-3 hover:text-ink">
            open the {shortName(plan.sites.find((x) => x.data.site.id === siteId)?.data ?? plan.sites[0]!.data)} report
          </Link>
          .
        </p>
        {feed.state === 'invalid' && (
          <p className="text-sm text-ink-muted">The delivered file could not be validated, so its results are hidden.</p>
        )}
      </div>
    </section>
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
  const preview = search.preview === '1' && Preview !== null
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
          {Preview && (
            <section aria-labelledby="scenario-preview" className="grid gap-4 border-t border-line pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="scenario-preview" className="text-lg font-medium">
                  Preview the simulation
                </h2>
                <Badge variant="outline">Sample data</Badge>
              </div>
              <p className="max-w-[72ch] text-ink-muted text-pretty">
                This preview uses the Connecting Ridge example, with fixture numbers and its own period and settings. It does not use your
                selected mission inputs or show an improvement for your plan.
              </p>
              <KLink
                render={<button type="button" onClick={() => actions.go({ preview: preview ? undefined : '1' })} />}
                className="cursor-pointer justify-self-start"
              >
                {preview ? 'Close sample preview' : 'Open sample preview'} <ArrowRightIcon aria-hidden className="inline" />
              </KLink>
              {preview && (
                <Suspense fallback={<p aria-busy="true">Loading sample preview…</p>}>
                  <Preview key={piece} piece={piece} />
                </Suspense>
              )}
            </section>
          )}
          {piece === 'relay' && (
            <section className="grid gap-2 border-t border-line pt-5">
              <h2 className="text-lg font-medium">What would this mean for a rover?</h2>
              <p className="max-w-[68ch] text-ink-muted">
                Continue to rover reach with the same mission inputs. The effect of a relay choice on reach still needs a computed rover
                result.
              </p>
              <KLink render={<button type="button" onClick={() => choose('rover')} />} className="cursor-pointer justify-self-start">
                Explore rover reach <ArrowRightIcon aria-hidden className="inline" />
              </KLink>
            </section>
          )}
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
