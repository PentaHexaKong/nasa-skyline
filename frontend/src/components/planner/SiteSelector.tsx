import MissionMoon, { type MoonMarker } from '~/components/planner/MissionMoon'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { shortName, siteResult } from '~/lib/mission'

export function SiteSelector({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const selected = new Set(plan.sites.map((site) => site.data.site.id))
  const markers: MoonMarker[] = plan.all.map((data) => {
    const site = plan.sites.find((candidate) => candidate.data.site.id === data.site.id)
    return {
      id: data.site.id,
      name: shortName(data),
      lat: data.site.lat_deg,
      lon: data.site.lon_deg_east,
      selected: selected.has(data.site.id),
      status: !site ? 'Not selected' : !site.checks ? 'Not computed' : siteResult(site).works ? 'Works' : 'Doesn’t work',
    }
  })
  const works = plan.sites.filter((site) => siteResult(site).works).length
  return (
    <section aria-labelledby="site-selector-title" className="grid gap-3">
      <h2 id="site-selector-title" className="text-lg font-medium">
        Where could you land?
      </h2>
      <div className="overflow-hidden rounded-lg border border-line bg-[#070c12]">
        <p className="px-4 pt-4 text-xs text-ink-muted">Pick any sites to compare. Tap a site label on the Moon.</p>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="site-selection-sky relative h-[25rem] min-w-0 sm:h-[28rem]">
            <MissionMoon markers={markers} onToggle={(id) => actions.toggleSite(id, !selected.has(id))} />
            <p className="pointer-events-none absolute top-3 left-3 max-w-[12rem] text-2xs text-ink-muted">
              Computed south-polar sites. Labels are spread apart for readability.
            </p>
          </div>
          <aside className="grid content-start gap-4 border-t border-line p-5 lg:border-t-0 lg:border-l">
            <h3 className="font-medium">Selected sites</h3>
            <p className="eyebrow text-2xs text-ink-muted">
              Sites in this mission: {selected.size} of {plan.all.length}
            </p>
            <ul className="grid gap-2">
              {plan.sites.map((site) => (
                <li
                  key={site.data.site.id}
                  className="flex items-center justify-between gap-2 rounded-full border border-comms px-3 py-2 text-xs"
                >
                  <span>{shortName(site.data)}</span>
                  <button
                    type="button"
                    disabled={selected.size === 1}
                    aria-label={`Remove ${shortName(site.data)}`}
                    title={selected.size === 1 ? 'Keep at least one site selected' : 'Remove site'}
                    onClick={() => actions.toggleSite(site.data.site.id, false)}
                    className="grid size-5 shrink-0 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <p aria-live="polite" className="rounded border border-line-strong bg-black/50 px-3 py-2 text-xs">
              {plan.sites.some((site) => !site.checks)
                ? 'Stay leaves the computed range · not computed'
                : `${works} of ${selected.size} selected sites work for this landing`}
            </p>
            <p className="text-2xs leading-relaxed text-ink-faint">
              Site positions use pipeline coordinates in the ME frame. Works includes touchdown visibility and every stay limit. The orbit
              is an illustration.
            </p>
          </aside>
        </div>
      </div>
    </section>
  )
}
