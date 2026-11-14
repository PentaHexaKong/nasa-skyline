import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, CalendarBlankIcon, CheckCircleIcon, StackIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { ScenarioScene } from '~/components/planner/Illustrations'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { addonsSearch, reviewSearch } from '~/components/planner/resolvePlan'
import { ScenarioIcon } from '~/components/planner/ScenarioIcon'
import { Eyebrow } from '~/components/Shell'
import { type SitePlan, shortName, siteResult } from '~/lib/mission'
import { SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'

const BLURB = {
  mast: 'A higher or nearby spot may see more Sun and Earth.',
  relay: 'What a relay spacecraft adds to direct contact.',
  rover: 'What a rover could reach from here.',
} as const

/** A share against its limit: the bar is the share, the tick is the limit, the words say which side of it the share falls. */
function Tile({
  label,
  share,
  limit,
  fill,
  icon,
}: {
  label: string
  share: number | null
  limit: number
  fill: string
  icon: React.ReactNode
}) {
  const ok = share != null && share * 100 >= limit
  return (
    <div className="grid content-start gap-2 rounded-lg border border-line bg-surface/50 p-4">
      <div className="flex items-start gap-3">
        {icon}
        <div className="grid">
          <span className="text-xs text-ink-muted">{label}</span>
          <span className="font-medium">
            {share == null ? 'Not computed' : `${(share * 100).toFixed(1)} %`}
            <span className={`ml-2 text-xs ${ok ? 'text-go' : 'text-miss'}`}>
              {share == null ? '' : ok ? 'meets your limit' : 'below your limit'}
            </span>
          </span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-surface ring-1 ring-line ring-inset" aria-hidden>
        {share != null && <div className={`h-full rounded-full ${fill}`} style={{ width: `${share * 100}%` }} />}
        <div className="absolute -inset-y-1 border-l-2 border-ink" style={{ left: `${limit}%` }} />
      </div>
      <span className="text-2xs text-ink-faint">Tick: your limit, at least {limit} %</span>
    </div>
  )
}

function Status({ site, plan }: { site: SitePlan; plan: Plan }) {
  const r = siteResult(site)
  const g = scenarioGuidance(site)
  const name = shortName(site.data)
  return (
    <div className="grid content-start gap-3">
      <span className={`inline-flex w-max items-center gap-1.5 text-sm font-medium ${r.works ? 'text-go' : 'text-miss'}`}>
        {r.works ? <CheckCircleIcon aria-hidden weight="fill" /> : <WarningCircleIcon aria-hidden weight="fill" />}
        {r.works ? 'Works for this landing' : 'Doesn’t work for this landing'}
      </span>
      <p className="text-lg leading-snug text-pretty">
        {r.works
          ? `${name} meets every limit over the ${plan.stay}-day stay.`
          : `${name}: ${r.why.charAt(0).toLowerCase()}${r.why.slice(1)}. ${g.headline}`}
      </p>
    </div>
  )
}

/** Where to go from the result: the chosen site's standing, other dates and sites first, then the deeper follow-ups. */
export function NextSteps({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  const guidance = scenarioGuidance(site)
  const context = reviewSearch(search, site.data.site.id)
  const order: ScenarioPiece[] = [...guidance.priority, ...guidance.optional]
  const compare = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('compare')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }
  return (
    <section aria-labelledby="next-title" className="grid gap-6 border-t border-line pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Eyebrow pip>Next</Eyebrow>
          <h2 id="next-title" className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-tight font-medium">
            What should you do next?
          </h2>
        </div>
        {plan.sites.length > 1 && (
          <div className="flex items-center gap-2">
            <span id="next-site" className="text-sm text-ink-muted">
              Site
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Status site={site} plan={plan} />
        <div className="grid content-start gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              label="Sun coverage"
              share={site.stay?.sunShare ?? null}
              limit={plan.requirements.minSun}
              fill="bg-sun"
              icon={<span aria-hidden className="mt-1 size-3 rounded-full bg-sun" />}
            />
            <Tile
              label="Earth visibility"
              share={site.stay?.earthShare ?? null}
              limit={plan.requirements.minEarth}
              fill="bg-comms"
              icon={<span aria-hidden className="mt-1 size-3 rotate-45 bg-comms" />}
            />
            <div className="grid content-start gap-2 rounded-lg border border-line bg-surface/50 p-4">
              <span className="text-xs text-ink-muted">Stay duration</span>
              <span className="flex items-center gap-2 font-medium">
                {site.stay ? 'Inside the computed data' : 'Runs past the computed data'}
                {site.stay ? (
                  <CheckCircleIcon aria-hidden weight="fill" className="text-go" />
                ) : (
                  <XIcon aria-hidden className="text-miss" />
                )}
              </span>
              <span className="text-2xs text-ink-faint">{plan.stay} days from the landing, [start, end) UTC</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => actions.setStep('dates')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand px-4 py-2 font-medium text-bg hover:opacity-90"
            >
              <CalendarBlankIcon aria-hidden /> Try another date
            </button>
            <button
              type="button"
              onClick={compare}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
            >
              <StackIcon aria-hidden /> Compare sites
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <h3 className="text-xl font-medium">{guidance.priority.length > 0 ? 'Next steps' : 'Explore further'}</h3>
        <ul className="grid gap-4 lg:grid-cols-3">
          {order.map((piece) => {
            const tool = SCENARIOS[piece]
            const priority = guidance.priority.includes(piece)
            const missed = piece === 'mast' ? guidance.sun : piece === 'relay' ? guidance.earth : []
            return (
              <li key={piece} className="overflow-hidden rounded-lg border border-line bg-surface/40">
                <ScenarioScene piece={piece} />
                <div className="grid gap-3 p-4">
                  <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3">
                    <ScenarioIcon piece={piece} />
                    <div className="grid gap-1">
                      <h4 className="text-lg font-medium">{tool.name}</h4>
                      <p className="text-sm text-ink-muted">
                        {priority ? (piece === 'mast' ? 'Your Sun limits are missed. ' : 'Your Earth limits are missed. ') : ''}
                        {BLURB[piece]}
                      </p>
                    </div>
                  </div>
                  {priority && missed.length > 0 && (
                    <ul className="grid gap-1 text-xs text-ink-muted">
                      {missed.map((c) => (
                        <li key={c.key}>
                          <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-miss" />
                          {c.label}:{' '}
                          <span className="tabular">
                            {c.value.toFixed(1)} {c.unit}
                          </span>
                          ; your limit is {c.bound}{' '}
                          <span className="tabular">
                            {c.limit} {c.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    to="/analyze"
                    search={addonsSearch(context, piece)}
                    className="inline-flex w-max items-center gap-2 font-medium underline-offset-4 hover:underline"
                  >
                    Open analysis <ArrowRightIcon aria-hidden />
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-ink-faint">Drawings. Follow-up results are not computed yet.</p>
      </div>
    </section>
  )
}
