import { Badge } from '@cloudflare/kumo/components/badge'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Link as KLink } from '@cloudflare/kumo/components/link'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowLeftIcon, ArrowRightIcon, BroadcastIcon, CarIcon, SolarPanelIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, notFound, useHydrated } from '@tanstack/react-router'
import { lazy, Suspense, useMemo } from 'react'
import { z } from 'zod'
import { SiteProvenance } from '~/components/Evidence'
import { Lanes } from '~/components/Lanes'
import { MastPanel } from '~/components/PowerPanels'
import { SiteThumb } from '~/components/planner/Illustrations'
import type { Plan, PlanSearch } from '~/components/planner/plan'
import { planSearch } from '~/components/planner/plan'
import { RelayLadder } from '~/components/planner/RelayLadder'
import { resolvePlan, reviewSearch } from '~/components/planner/resolvePlan'
import { missionSummary } from '~/components/planner/StepBar'
import { Footer, Shell } from '~/components/Shell'
import { Mascot } from '~/components/story'
import { loadSummary, MOON_SITES } from '~/lib/data'
import { useFeed } from '~/lib/feeds'
import { REQUIREMENTS, shortName, TOUCHDOWN_LABEL } from '~/lib/mission'
import { matchesScenario, SCENARIO_PIECES, SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'
import { forgiving } from '~/lib/useSiteView'

const Preview = import.meta.env.DEV ? lazy(() => import('~/prototypes/ScenarioPreview')) : null
export const scenarioSearch = planSearch.extend({ preview: forgiving(z.coerce.string().pipe(z.literal('1'))) })

export const Route = createFileRoute('/analyze/scenario/$piece')({
  validateSearch: scenarioSearch,
  loader: async ({ params }) => {
    if (!SCENARIO_PIECES.includes(params.piece as ScenarioPiece)) throw notFound()
    return Promise.all(MOON_SITES.map((s) => loadSummary(s.id)))
  },
  head: ({ params }) => ({ meta: [{ title: `${SCENARIOS[params.piece as ScenarioPiece]?.name ?? 'Scenario'} · Skyline` }] }),
  component: ScenarioPage,
})

const pct = (x: number) => `${(x * 100).toFixed(0)} %`

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
  if (piece === 'relay') return <RelayLadder plan={plan} />
  if (piece !== 'rover' && feed.state === 'loading') return <p aria-busy="true">Checking scenario results…</p>
  if (piece !== 'rover' && feed.state === 'ready' && matchesScenario(feed.data, siteId, plan.window)) {
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
    <section aria-labelledby="scenario-result" className="flex gap-3 rounded-xl border border-sun/40 bg-sun-fill/20 p-4">
      <WarningCircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-sun" />
      <div className="grid gap-1">
        <h2 id="scenario-result" className="font-medium">
          Scenario result · not computed
        </h2>
        <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
          {piece === 'rover'
            ? 'Rover reach has not been computed for this plan. Your site, period and limits are kept here for the next analysis.'
            : 'A computed result matching this site and the exact mission period is not available. Any improvement over your starting point is not computed.'}
        </p>
        {piece !== 'rover' && feed.state === 'invalid' && (
          <p className="text-sm text-ink-muted">The delivered file could not be validated, so its results are hidden.</p>
        )}
      </div>
    </section>
  )
}

function ScenarioPage() {
  const all = Route.useLoaderData()
  const search = Route.useSearch()
  const piece = Route.useParams().piece as ScenarioPiece
  const navigate = Route.useNavigate()
  const hydrated = useHydrated()
  const p = useMemo(() => (hydrated ? search : {}), [hydrated, search])
  const context: PlanSearch = useMemo(() => planSearch.parse(p), [p])
  const plan = useMemo(() => resolvePlan(all, context), [all, context])
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  const back = reviewSearch(context, plan.focus)
  const preview = hydrated && search.preview === '1' && Preview !== null
  const tool = SCENARIOS[piece]
  return (
    <Shell>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 pt-6 pb-10 sm:px-6">
        <header className="grid gap-4">
          <KLink render={<Link to="/analyze" search={back} />} className="justify-self-start">
            <ArrowLeftIcon aria-hidden className="inline" /> Back to the result
          </KLink>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="grid gap-2">
              <p className="text-sm text-ink-muted">{missionSummary(plan)}</p>
              <h1 className="text-3xl font-medium text-balance">{tool.question}</h1>
              <p className="max-w-[72ch] text-lg text-ink-muted text-pretty">{tool.detail}</p>
            </div>
            <Mascot pose="planner-surprised" className="size-28" />
          </div>
          {plan.sites.length > 1 && (
            <div className="grid w-full max-w-xs gap-1.5">
              <span id="scenario-site" className="font-medium">
                Site to investigate
              </span>
              <Select
                aria-labelledby="scenario-site"
                value={plan.focus}
                items={Object.fromEntries(plan.sites.map((s) => [s.data.site.id, shortName(s.data)]))}
                onValueChange={(v) =>
                  navigate({ search: { ...context, focus: String(v), preview: undefined }, replace: true, resetScroll: false })
                }
              />
            </div>
          )}
          <nav aria-label="Scenarios" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line">
            {SCENARIO_PIECES.map((value) => (
              <Link
                key={value}
                to="/analyze/scenario/$piece"
                params={{ piece: value }}
                search={back}
                aria-current={piece === value ? 'page' : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 py-3 font-medium ${piece === value ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                <ScenarioTabIcon piece={value} />
                {SCENARIOS[value].name}
              </Link>
            ))}
          </nav>
        </header>
        <Baseline plan={plan} />
        <ScenarioResult key={`${piece}-${plan.focus}`} plan={plan} piece={piece} />
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
              render={
                <Link
                  to="/analyze/scenario/$piece"
                  params={{ piece }}
                  search={{ ...back, preview: preview ? undefined : '1' }}
                  resetScroll={false}
                />
              }
              className="justify-self-start"
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
            <KLink render={<Link to="/analyze/scenario/$piece" params={{ piece: 'rover' }} search={back} />} className="justify-self-start">
              Explore rover reach <ArrowRightIcon aria-hidden className="inline" />
            </KLink>
          </section>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-4">
          <KLink render={<Link to="/analyze" search={back} />}>Back to the result</KLink>
          <KLink render={<Link to="/analyze" search={{ ...back, step: 'dates' }} />}>Try another date</KLink>
          <KLink render={<Link to="/analyze" search={back} hash="compare" />}>Compare sites</KLink>
        </div>
        {site && (
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>Starting point: sources and assumptions</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <SiteProvenance sites={[site.data]} />
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        )}
      </main>
      <Footer />
    </Shell>
  )
}

function ScenarioTabIcon({ piece }: { piece: ScenarioPiece }) {
  const I = piece === 'mast' ? SolarPanelIcon : piece === 'relay' ? BroadcastIcon : CarIcon
  return <I aria-hidden className="size-4" />
}
