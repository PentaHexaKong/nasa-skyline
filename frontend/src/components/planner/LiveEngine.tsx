import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { ArrowsClockwiseIcon, CircleNotchIcon, CloudCheckIcon, CloudSlashIcon } from '@phosphor-icons/react'
import type { Plan } from '~/components/planner/plan'
import { liveLabel, type PlannerRows } from '~/lib/dynamicPlanner'
import { shortName } from '~/lib/mission'

const LEAD: Record<NonNullable<Plan['live']>['state'], string> = {
  checking:
    'Asking the mission-science engine about this exact stay. Until it answers, the numbers above come from each site’s precomputed file.',
  live: 'Every number above was computed for this exact stay by the mission-science engine, from pinned SPICE kernels and LOLA terrain.',
  partial: 'Sites marked Live were computed for this exact stay by the engine. The rest show their precomputed files.',
  offline: 'The engine could not be reached, so every number above comes from the sites’ precomputed files.',
}

/**
 * Where the plan's numbers come from. The planner asks the live engine about every stay on its own; this panel says which
 * sites it answered for, lets the reader ask again, and keeps the engine's provenance one fold away.
 */
export function LiveEngine({ plan, rows, refresh }: { plan: Plan; rows: PlannerRows; refresh: () => void }) {
  const state = plan.live?.state ?? 'checking'
  const checking = state === 'checking'
  const precomputed = plan.sites.filter((site) => site.source !== 'live')
  const versions = [...new Set(precomputed.map((site) => site.data.provenance.algorithm_version))]
  return (
    <section aria-labelledby="live-engine" aria-busy={checking} className="grid gap-4 rounded-lg border border-line px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-[64ch] gap-1">
          <h2 id="live-engine" className="flex items-center gap-2 text-lg font-medium">
            {state === 'offline' ? (
              <CloudSlashIcon aria-hidden className="text-ink-faint" />
            ) : (
              <CloudCheckIcon aria-hidden className={state === 'checking' ? 'text-ink-faint' : 'text-go'} />
            )}
            Live engine
          </h2>
          <p aria-live="polite" className="text-sm text-ink-muted text-pretty">
            {LEAD[state]}
          </p>
        </div>
        <button
          type="button"
          disabled={checking}
          onClick={refresh}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 font-medium hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowsClockwiseIcon aria-hidden className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>

      <ul className="grid text-sm">
        {plan.sites.map((site) => {
          const row = rows[site.data.site.id]
          const label = liveLabel(row)
          const tone = label.short === 'Live' ? 'text-go' : 'text-ink-muted'
          return (
            <li
              key={site.data.site.id}
              className="grid gap-x-4 gap-y-0.5 border-t border-line py-2.5 sm:grid-cols-[minmax(9rem,14rem)_6.5rem_minmax(0,1fr)]"
            >
              <span className="font-medium">{shortName(site.data)}</span>
              <span className={`inline-flex items-center gap-1.5 ${tone}`}>
                {label.short === 'Checking' && <CircleNotchIcon aria-hidden className="animate-spin" />}
                {label.short}
              </span>
              <span className="text-ink-muted text-pretty">{label.detail}</span>
            </li>
          )
        })}
      </ul>

      {versions.length > 0 && !checking && (
        <p className="max-w-[72ch] text-xs text-ink-faint text-pretty">
          The precomputed files were made with pipeline {versions.join(', ')}, an earlier model than the engine’s (a different Moon frame
          and a coarser event search). Expect small differences near sunrise, sunset and Earthset.
        </p>
      )}

      <Collapsible.Root>
        <Collapsible.DefaultTrigger>What the engine used</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="grid max-w-[80ch] gap-5 pt-1 text-sm text-ink-muted">
            <p>
              One request per site goes through the backend to the mission-science service, one after another. A partly visible Sun counts
              as in view, Earth counts when its centre clears the skyline, there is no atmosphere, and times are UTC, [start, end). Your
              limits travel with the request. Neither number is delivered power or a working radio link.
            </p>
            {plan.sites.map((site) => {
              const row = rows[site.data.site.id]
              if (row?.state !== 'computed') return null
              const { result, provenance, scenarioId } = row.response
              return (
                <div key={site.data.site.id} className="grid gap-1.5">
                  <h3 className="font-medium text-ink">{site.data.site.name}</h3>
                  <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1">
                    <dt>Observer</dt>
                    <dd>
                      {result.observer.siteId}, {result.observer.latitudeDeg}°, {result.observer.longitudeDegEast}° E,{' '}
                      {result.observer.observerHeightM} m up, {result.observer.frame}
                    </dd>
                    <dt>Window</dt>
                    <dd className="readout">
                      {result.period.startUtc} to {result.period.endUtc}
                    </dd>
                    <dt>Engine</dt>
                    <dd>
                      {provenance.engineVersion}, algorithm {provenance.algorithmVersion}, {provenance.scientificProfile} profile
                    </dd>
                    <dt>Events</dt>
                    <dd>
                      Searched every {result.cadenceS / 60} min, refined to {result.sunlightIntervals.detection.numericalRootToleranceS} s
                      {result.sunlightIntervals.detection.possibleMissedEvents || result.directEarthIntervals.detection.possibleMissedEvents
                        ? '. Very short events between searches could be missed.'
                        : '.'}
                    </dd>
                    <dt>Validation</dt>
                    <dd>{provenance.independentlyValidated ? 'Independently validated' : 'Not independently validated'}</dd>
                    <dt>Scenario</dt>
                    <dd className="font-mono text-[0.9em] break-all">{scenarioId}</dd>
                  </dl>
                  <details className="text-xs">
                    <summary className="cursor-pointer">Terrain and kernel checksums, limitations</summary>
                    <ul className="mt-2 grid gap-1 font-mono break-all">
                      {provenance.dems.map((dem) => (
                        <li key={dem.sha256}>
                          {dem.filename} · {dem.resolutionM.join(' × ')} m · {dem.sha256}
                        </li>
                      ))}
                      {Object.entries(provenance.kernels).map(([name, hash]) => (
                        <li key={name}>
                          {name} · {hash}
                        </li>
                      ))}
                    </ul>
                    <ul className="mt-2 grid list-disc gap-1 pl-4">
                      {provenance.limitations.map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )
            })}
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </section>
  )
}
