import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import type { ReactNode } from 'react'
import { SiteProvenance, ValidationPanel } from '~/components/Evidence'
import { MastPanel, PowerPanel } from '~/components/PowerPanels'
import type { Plan } from '~/components/planner/plan'
import { RelayCoverage, RelayStudy } from '~/components/RelayPanels'
import { showFeed, useFeed } from '~/lib/feeds'
import { shortName } from '~/lib/mission'

function Deeper({ title, ready, children }: { title: string; ready: boolean; children: ReactNode }) {
  return (
    <Collapsible.Root>
      <Collapsible.DefaultTrigger>
        {title}
        {!ready && <span className="ml-2 font-normal text-ink-muted">Not computed yet</span>}
      </Collapsible.DefaultTrigger>
      <Collapsible.DefaultPanel>
        <div className="grid gap-10 pt-2">{children}</div>
      </Collapsible.DefaultPanel>
    </Collapsible.Root>
  )
}

/**
 * The delivered feeds behind the result, for the site in focus: per-site sources and limits, power and masts, relays and
 * the comparison with NASA's maps. A feed that is not delivered is listed as coming next, never shown empty.
 */
export function DeeperAnalysis({ plan }: { plan: Plan }) {
  const data = plan.sites.map((s) => s.data)
  const focus = data.find((s) => s.site.id === plan.focus) ?? data[0]
  const siteId = focus?.site.id ?? ''
  const power = useFeed('power', siteId)
  const relay = useFeed('relay', siteId)
  const validation = useFeed('validation')
  const names = Object.fromEntries(plan.all.map((s) => [s.site.id, shortName(s)]))
  const groups = [
    { key: 'power', label: 'power from masts', shown: showFeed('power', [siteId]) || showFeed('mast', [siteId]) },
    { key: 'relay', label: 'relay coverage', shown: showFeed('relay', [siteId]) || showFeed('relay-study') },
    { key: 'validation', label: 'a comparison with NASA’s maps', shown: showFeed('validation') },
  ]
  const shown = (key: string) => groups.find((g) => g.key === key)?.shown
  const pending = groups.filter((g) => !g.shown).map((g) => g.label)
  return (
    <div className="grid gap-1">
      <Collapsible.Root>
        <Collapsible.DefaultTrigger>Sources and known limits, site by site</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="pt-2">
            <SiteProvenance sites={data} />
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
      {groups.some((g) => g.shown) && (
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>More analysis{focus ? ` · ${shortName(focus)}` : ''}</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <section aria-label="Deeper analysis" className="grid gap-3 pt-2">
              {shown('power') && (
                <Deeper title="Power and masts" ready={power.state === 'ready'}>
                  {showFeed('power', [siteId]) && <PowerPanel siteId={siteId} />}
                  {showFeed('mast', [siteId]) && <MastPanel siteId={siteId} />}
                </Deeper>
              )}
              {shown('relay') && (
                <Deeper title="Relays" ready={relay.state === 'ready'}>
                  {showFeed('relay', [siteId]) && <RelayCoverage siteId={siteId} />}
                  {showFeed('relay-study') && <RelayStudy siteIds={data.map((s) => s.site.id)} names={names} />}
                </Deeper>
              )}
              {shown('validation') && (
                <Deeper title="Comparison with NASA maps" ready={validation.state === 'ready'}>
                  <ValidationPanel names={names} />
                </Deeper>
              )}
            </section>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
      )}
      {pending.length > 0 && <p className="pt-3 text-sm text-ink-muted">Coming next: {pending.join(', ')}.</p>}
    </div>
  )
}
