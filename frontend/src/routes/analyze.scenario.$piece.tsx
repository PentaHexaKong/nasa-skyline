import { Badge } from '@cloudflare/kumo/components/badge'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Link as KLink } from '@cloudflare/kumo/components/link'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, notFound, useHydrated } from '@tanstack/react-router'
import { lazy, Suspense, useMemo } from 'react'
import { z } from 'zod'
import { SiteProvenance } from '~/components/Evidence'
import { MastPanel } from '~/components/PowerPanels'
import type { Plan, PlanSearch } from '~/components/planner/plan'
import { planSearch } from '~/components/planner/plan'
import { resolvePlan, reviewSearch } from '~/components/planner/resolvePlan'
import { missionSummary } from '~/components/planner/StepBar'
import { RelayCoverage } from '~/components/RelayPanels'
import { Footer, Shell } from '~/components/Shell'
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

function Baseline({ plan }: { plan: Plan }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  return (
    <section aria-labelledby="baseline" className="grid gap-4 border-y border-line py-5">
      <div className="grid gap-1">
        <h2 id="baseline" className="text-lg font-medium">
          Your starting point · {shortName(site.data)}
        </h2>
        <p className="text-ink-muted">
          {scenarioGuidance(site).headline} At touchdown: {TOUCHDOWN_LABEL[site.touchdown]}.
        </p>
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {REQUIREMENTS.map((q) => {
          const missed = site.checks?.checks.find((c) => c.key === q.key)?.pass === false
          const truncated =
            site.stay && (q.key === 'maxNoSun' ? site.stay.noSun.truncated : q.key === 'maxNoEarth' ? site.stay.noEarth.truncated : false)
          return (
            <div key={q.key} className="grid content-start gap-1">
              <dt className="text-sm text-ink-muted">{q.label}</dt>
              <dd className="readout text-xl">
                {missed && <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-base text-now" />}
                {site.stay ? `${q.read(site.stay).toFixed(1)} ${q.unit}${truncated ? ' +' : ''}` : 'Not computed'}
              </dd>
              <dd className="text-xs text-ink-faint">
                Your limit: {q.bound} {plan.requirements[q.key]} {q.unit}
              </dd>
            </div>
          )
        })}
      </dl>
      <p className="text-xs text-ink-faint">
        Whole stay, [start, end), UTC. A partly visible Sun counts as in view; Earth uses the centre-above-skyline rule. Observer height{' '}
        {site.data.site.observer_height_m} m. + means the gap touches a stay boundary and may continue beyond it. Profile limits are
        examples unless you changed them.
      </p>
    </section>
  )
}

function ScenarioResult({ plan, piece }: { plan: Plan; piece: ScenarioPiece }) {
  const siteId = plan.focus ?? ''
  const mast = useFeed('mast', siteId)
  const relay = useFeed('relay', siteId)
  const feed = piece === 'mast' ? mast : relay
  if (piece !== 'rover' && feed.state === 'loading') return <p aria-busy="true">Checking scenario results…</p>
  if (piece !== 'rover' && feed.state === 'ready' && matchesScenario(feed.data, siteId, plan.window)) {
    return (
      <section aria-label="Pipeline scenario output" className="grid gap-4">
        <p className="text-ink-muted">
          Pipeline output for your site and period. Read its visibility rules and assumptions before comparing with your starting point.
        </p>
        {piece === 'mast' ? <MastPanel siteId={siteId} /> : <RelayCoverage siteId={siteId} />}
      </section>
    )
  }
  return (
    <section aria-labelledby="scenario-result" className="grid gap-2">
      <h2 id="scenario-result" className="text-lg font-medium">
        Scenario result · not computed
      </h2>
      <p className="max-w-[72ch] text-ink-muted text-pretty">
        {piece === 'rover'
          ? 'Rover reach has not been computed for this plan. Your site, period and limits are kept here for the next analysis.'
          : 'A computed result matching this site and the exact mission period is not available. Any improvement over your starting point is not computed.'}
      </p>
      {piece !== 'rover' && feed.state === 'invalid' && (
        <p className="text-sm text-ink-muted">The delivered file could not be validated, so its results are hidden.</p>
      )}
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
            <ArrowLeftIcon aria-hidden className="inline" /> Back to review
          </KLink>
          <div className="grid gap-2">
            <p className="text-sm text-ink-muted">{missionSummary(plan)}</p>
            <h1 className="text-3xl font-medium text-balance">{tool.question}</h1>
            <p className="max-w-[72ch] text-lg text-ink-muted text-pretty">{tool.detail}</p>
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
                className={`-mb-px border-b-2 py-3 font-medium ${piece === value ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
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
          <KLink render={<Link to="/analyze" search={back} />}>Back to review</KLink>
          <KLink render={<Link to="/analyze" search={{ ...back, step: 'dates' }} />}>Try another date</KLink>
          <KLink render={<Link to="/analyze" search={{ ...back, step: 'result' }} />}>Compare sites</KLink>
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
