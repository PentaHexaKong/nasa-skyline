import { Button } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { CheckIcon, DownloadSimpleIcon, LinkSimpleIcon } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { SiteProvenance, ValidationPanel } from '~/components/Evidence'
import { MastPanel, PowerPanel } from '~/components/PowerPanels'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { ReviewNext } from '~/components/planner/ReviewNext'
import { RelayCoverage, RelayStudy } from '~/components/RelayPanels'
import { showFeed, useFeed } from '~/lib/feeds'
import { shortName } from '~/lib/mission'

const VERIFY = [
  ['Terrain and landing hazards', 'Slopes, boulders and anything finer than the terrain grid are not in the skyline.'],
  ['Power and storage', 'Sun in view is not delivered power.'],
  ['Thermal limits', 'Not modelled.'],
  ['Communications link budget', 'Earth in view is line of sight, not a working radio link.'],
] as const

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

function CopyLink() {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="secondary"
      icon={copied ? CheckIcon : LinkSimpleIcon}
      onClick={() => {
        navigator.clipboard.writeText(location.href).then(() => setCopied(true))
      }}
    >
      {copied ? 'Link copied' : 'Copy link to this plan'}
    </Button>
  )
}

export function ReviewStep({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const data = plan.sites.map((s) => s.data)
  const focus = data.find((s) => s.site.id === plan.focus) ?? data[0]
  const siteId = focus?.site.id ?? ''
  const power = useFeed('power', siteId)
  const relay = useFeed('relay', siteId)
  const validation = useFeed('validation')
  const unique = (xs: string[]) => [...new Set(xs)].join(', ')
  const names = Object.fromEntries(plan.all.map((s) => [s.site.id, shortName(s)]))
  const groups = [
    { key: 'power', label: 'power from masts', shown: showFeed('power', [siteId]) || showFeed('mast', [siteId]) },
    { key: 'relay', label: 'relay coverage', shown: showFeed('relay', [siteId]) || showFeed('relay-study') },
    { key: 'validation', label: 'a comparison with NASA’s maps', shown: showFeed('validation') },
  ]
  const pending = groups.filter((g) => !g.shown).map((g) => g.label)
  return (
    <div className="grid gap-6">
      <ReviewNext plan={plan} actions={actions} search={search} />
      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button variant="primary" icon={DownloadSimpleIcon} onClick={actions.downloadBrief}>
          Download mission brief
        </Button>
        <CopyLink />
      </div>
      <div className="grid gap-1 border-t border-line pt-3">
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>Before you decide</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <div className="grid gap-x-12 gap-y-10 pt-2 lg:grid-cols-[1.35fr_1fr]">
              <section aria-labelledby="review" className="grid content-start gap-4">
                <div className="grid gap-2">
                  <h2 id="review" className="text-2xl font-medium text-balance">
                    What this tool cannot see
                  </h2>
                  <p className="max-w-[60ch] text-lg text-ink-muted text-pretty">
                    Skyline reports where the Sun and Earth sit against the terrain. Everything below still needs its own analysis.
                  </p>
                </div>
                <ul>
                  {VERIFY.map(([what, why]) => (
                    <li key={what} className="border-t border-line py-2.5 last:border-b">
                      <p className="font-medium">{what}</p>
                      <p className="text-ink-muted">{why}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="made" className="grid content-start gap-3">
                <h2 id="made" className="text-lg font-medium">
                  How these numbers were made
                </h2>
                <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                  <dt className="text-ink-muted">Algorithm</dt>
                  <dd className="tabular">{unique(data.map((s) => s.provenance.algorithm_version))}</dd>
                  <dt className="text-ink-muted">Terrain</dt>
                  <dd>{unique(data.map((s) => s.provenance.dem_product.split(',')[0] ?? s.provenance.dem_product))}</dd>
                  <dt className="text-ink-muted">Geometry</dt>
                  <dd className="font-mono text-xs break-words">{unique(data.flatMap((s) => s.provenance.kernels.map((k) => k.file)))}</dd>
                  <dt className="text-ink-muted">Sun rule</dt>
                  <dd>A partly visible Sun counts as in view.</dd>
                  <dt className="text-ink-muted">Earth rule</dt>
                  <dd>Earth's centre clears the skyline.</dd>
                  <dt className="text-ink-muted">Atmosphere</dt>
                  <dd>None, nothing is refracted.</dd>
                </dl>
              </section>
            </div>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>

        <Collapsible.Root>
          <Collapsible.DefaultTrigger>Sources and known limits, site by site</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <div className="pt-2">
              <SiteProvenance sites={data} />
            </div>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>

        {groups.some((g) => g.shown) ? (
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>More analysis</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <section aria-labelledby="deeper" className="grid gap-3 border-t border-line pt-6">
                <div className="flex flex-wrap items-end gap-6">
                  <h2 id="deeper" className="text-lg font-medium">
                    Deeper analysis
                  </h2>
                  <p className="text-ink-muted">{focus && shortName(focus)}</p>
                </div>
                {groups.find((g) => g.key === 'power')?.shown && (
                  <Deeper title="Power and masts" ready={power.state === 'ready'}>
                    {showFeed('power', [siteId]) && <PowerPanel siteId={siteId} />}
                    {showFeed('mast', [siteId]) && <MastPanel siteId={siteId} />}
                  </Deeper>
                )}
                {groups.find((g) => g.key === 'relay')?.shown && (
                  <Deeper title="Relays" ready={relay.state === 'ready'}>
                    {showFeed('relay', [siteId]) && <RelayCoverage siteId={siteId} />}
                    {showFeed('relay-study') && <RelayStudy siteIds={data.map((s) => s.site.id)} names={names} />}
                  </Deeper>
                )}
                {groups.find((g) => g.key === 'validation')?.shown && (
                  <Deeper title="Comparison with NASA maps" ready={validation.state === 'ready'}>
                    <ValidationPanel names={names} />
                  </Deeper>
                )}
              </section>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        ) : null}
        {pending.length > 0 && <p className="border-t border-line pt-4 text-ink-muted">Coming next: {pending.join(', ')}.</p>}
        {/* The science engine's live page (from the scientificEngine branch). It computes for its three study points only and
            needs the science services running, so the link says both. */}
        <p className="text-sm text-ink-muted">
          <a href="/mission-science.html" className="text-ink underline underline-offset-3">
            Evaluate a live mission window
          </a>{' '}
          with the science engine, for its three study points (CR1, GR1 and SR1). Needs the science services running.
        </p>
      </div>
    </div>
  )
}
