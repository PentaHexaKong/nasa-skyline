import { Button } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { reviewSearch } from '~/components/planner/resolvePlan'
import { ScenarioIcon } from '~/components/planner/ScenarioIcon'
import { shortName } from '~/lib/mission'
import { SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'

const BLURB = {
  mast: 'Check position and height.',
  relay: 'Compare contact windows.',
  rover: 'Explore the surrounding terrain.',
} as const

export function ReviewNext({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  const guidance = scenarioGuidance(site)
  const context = reviewSearch(search, site.data.site.id)
  const row = (piece: ScenarioPiece, priority: boolean) => {
    const tool = SCENARIOS[piece]
    const missed = piece === 'mast' ? guidance.sun : piece === 'relay' ? guidance.earth : []
    return (
      <li key={piece} className="overflow-hidden rounded-lg border border-line">
        <Link
          to="/analyze/scenario/$piece"
          params={{ piece }}
          search={context}
          aria-label={tool.title}
          className="scenario-choice-link grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5 lg:min-h-28"
        >
          <ScenarioIcon piece={piece} />
          <div className="grid min-w-0 gap-1">
            <h4 className="text-lg font-medium">{tool.name}</h4>
            <p className="text-sm text-ink-muted">
              {priority ? (piece === 'mast' ? 'Your Sun limits are missed.' : 'Your Earth limits are missed.') : BLURB[piece]}
            </p>
          </div>
          <ArrowRightIcon aria-hidden className="scenario-choice-arrow size-4 shrink-0 text-ink-muted" />
        </Link>
        <div className="px-4 pb-2 sm:px-5">
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>{priority ? 'Why this option?' : 'More details'}</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <div className="grid max-w-[72ch] gap-3 pb-3 text-sm text-ink-muted">
                <p>{tool.detail}</p>
                {priority && (
                  <ul className="grid gap-1">
                    {missed.map((c) => (
                      <li key={c.key}>
                        <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-now" />
                        {c.label}:{' '}
                        <span className="tabular">
                          {c.value.toFixed(1)} {c.unit}
                          {site.stay &&
                          ((c.key === 'maxNoSun' && site.stay.noSun.truncated) || (c.key === 'maxNoEarth' && site.stay.noEarth.truncated))
                            ? ' +'
                            : ''}
                        </span>
                        ; your limit is {c.bound}{' '}
                        <span className="tabular">
                          {c.limit} {c.unit}
                        </span>
                        .
                      </li>
                    ))}
                  </ul>
                )}
                {priority && (
                  <p className="text-xs">+ marks a gap that touches the stay boundary; it may continue beyond the selected period.</p>
                )}
              </div>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        </div>
      </li>
    )
  }
  return (
    <section aria-labelledby="review-next" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="review-next" className="text-2xl font-medium">
          What could you improve?
        </h2>
        {plan.sites.length > 1 && (
          <div className="grid w-full max-w-xs gap-1.5">
            <span id="review-next-site" className="font-medium">
              Site to investigate
            </span>
            <Select
              aria-labelledby="review-next-site"
              value={site.data.site.id}
              items={Object.fromEntries(plan.sites.map((s) => [s.data.site.id, shortName(s.data)]))}
              onValueChange={(v) => actions.go({ focus: String(v) })}
            />
          </div>
        )}
      </div>
      <div className="grid gap-3">
        <h3 className="font-medium">
          {shortName(site.data)}: {guidance.headline}
        </h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => actions.setStep('dates')}>
            Try another date
          </Button>
          <Button variant="secondary" onClick={() => actions.setStep('result')}>
            Compare sites
          </Button>
        </div>
      </div>
      <div className="grid gap-3">
        <h3 className="font-medium">{guidance.priority.length > 0 ? 'Next steps' : 'Explore further'}</h3>
        <ul className="grid items-start gap-3 lg:grid-cols-3">
          {[...guidance.priority, ...guidance.optional].map((p) => row(p, guidance.priority.includes(p)))}
        </ul>
      </div>
      <Collapsible.Root>
        <Collapsible.DefaultTrigger>About this review</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="grid max-w-[72ch] gap-2 text-sm text-ink-muted">
            <p>{guidance.detail}</p>
            <p>Limits cover the whole stay and come from your selected profile unless you changed them. Profile thresholds are examples.</p>
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </section>
  )
}
