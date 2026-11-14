import { Select } from '@cloudflare/kumo/components/select'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { PROFILES } from '~/lib/profiles'

const meta = (p: (typeof PROFILES)[number]) => `${p.stay} days · ${p.sites.length} sites`

/** The profile cards at the top of Set up. Choosing one replaces every setting with the profile's. */
export function ProfileCards({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  return (
    <fieldset className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <legend className="text-lg font-medium">Start from a mission profile</legend>
        {plan.edited && (
          <button
            type="button"
            onClick={() => actions.chooseProfile(plan.profile.id)}
            className="cursor-pointer text-ink-muted underline underline-offset-3 hover:text-ink"
          >
            Reset to “{plan.profile.name}”
          </button>
        )}
      </div>
      <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {PROFILES.map((p) => {
          const on = p.id === plan.profile.id
          return (
            <li key={p.id} className="grid bg-bg">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => actions.chooseProfile(p.id)}
                className={`group relative grid cursor-pointer content-start gap-1.5 p-4 text-left transition-colors duration-150 hover:bg-surface ${
                  on ? 'bg-surface' : ''
                }`}
              >
                <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 ${on ? 'bg-brand' : 'bg-transparent'}`} />
                <span className="font-medium">
                  {p.name}
                  {on && plan.edited && <span className="font-normal text-ink-muted"> · edited</span>}
                </span>
                <span className="text-ink-muted text-pretty">{p.pitch}</span>
                <span className="readout pt-1 text-xs text-ink-faint">{meta(p)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-ink-faint">
        Profiles are starting points. Their thresholds are examples, not requirements from any mission.
      </p>
    </fieldset>
  )
}

/** Compact profile switch for the step bar. */
export function ProfileSelect({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  return (
    <Select
      aria-label="Mission profile"
      className="w-52 shrink-0"
      value={plan.profile.id}
      items={Object.fromEntries(PROFILES.map((p) => [p.id, plan.edited && p.id === plan.profile.id ? `${p.name} (edited)` : p.name]))}
      onValueChange={(id) => id && actions.chooseProfile(id as string)}
    />
  )
}
