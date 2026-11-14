import { Select } from '@cloudflare/kumo/components/select'
import { CheckCircleIcon } from '@phosphor-icons/react'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { PROFILES } from '~/lib/profiles'

/**
 * The mission profiles as cards: what each asks, its stay and its two shares. Choosing one sets the sites, day, stay and
 * limits at once; choosing the active one again after a change resets it. The thresholds are examples and say so.
 */
export function ProfileCards({ plan, actions, compact = false }: { plan: Plan; actions: PlanActions; compact?: boolean }) {
  return (
    <div className="grid gap-3">
      <ul aria-label="Mission profiles" className={`grid gap-3 sm:grid-cols-2 ${compact ? '' : 'lg:grid-cols-4'}`}>
        {PROFILES.map((p, i) => {
          const active = p.id === plan.profile.id
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => actions.chooseProfile(p.id)}
                className={`grid h-full w-full cursor-pointer content-start gap-2 rounded-xl border p-4 text-left transition-[border-color,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  active ? 'border-white bg-white/[0.05]' : 'border-line hover:border-line-strong hover:bg-white/[0.02]'
                }`}
              >
                <span className="flex min-h-5 items-center justify-between gap-2">
                  <span className="readout text-xs text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  {active && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <CheckCircleIcon aria-hidden weight="fill" className="size-4" />
                      {plan.edited ? 'Edited · tap to reset' : 'Selected'}
                    </span>
                  )}
                </span>
                <span className="text-lg leading-tight font-medium">{p.name}</span>
                <span className="text-sm text-ink-muted text-pretty">{p.pitch}</span>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-xs">
                  <div className="grid gap-0.5">
                    <dt className="text-ink-faint">Sun in view</dt>
                    <dd className="readout">≥ {p.requirements.minSun} %</dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-ink-faint">Without Sun</dt>
                    <dd className="readout">≤ {p.requirements.maxNoSun} h</dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-ink-faint">Earth in view</dt>
                    <dd className="readout">≥ {p.requirements.minEarth} %</dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-ink-faint">Without Earth</dt>
                    <dd className="readout">≤ {p.requirements.maxNoEarth} h</dd>
                  </div>
                  <div className="col-span-2 grid gap-0.5">
                    <dt className="text-ink-faint">Stay</dt>
                    <dd className="readout">{p.stay} days</dd>
                  </div>
                </dl>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
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
