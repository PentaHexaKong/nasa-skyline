import { Checkbox } from '@cloudflare/kumo/components/checkbox'
import { DayField, NumberField, TimeSlider } from '~/components/Controls'
import { ProfileCards } from '~/components/planner/ProfilePicker'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { readerReference, type Summary } from '~/lib/data'
import { REQUIREMENTS, verdict } from '~/lib/mission'
import { longDate } from '~/lib/time'

const BLURB: Record<string, string> = {
  'connecting-ridge': 'High ground on the ridge from Shackleton to de Gerlache crater.',
  'de-gerlache-rim': 'The rim of de Gerlache crater, 1.3° from the pole.',
  'shackleton-rim': 'The rim of Shackleton crater, 0.2° from the pole.',
}

function Horizon({ site }: { site: Summary }) {
  const W = 92
  const H = 30
  const points = site.skyline.elevation_deg.filter((_, i) => i % 20 === 0)
  const lo = Math.min(...points) - 1
  const hi = Math.max(...points, lo + 6) + 0.5
  const y = (e: number) => H - 2 - ((H - 4) * (e - lo)) / (hi - lo)
  const line = points.map((e, i) => `${((W * i) / (points.length - 1)).toFixed(1)},${y(e).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="shrink-0">
      <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-terrain" />
      <polyline points={line} fill="none" className="stroke-terrain-edge" />
    </svg>
  )
}

export function SetupStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const chosen = new Set(plan.sites.map((s) => s.data.site.id))
  return (
    <div className="grid gap-10">
      <ProfileCards plan={plan} actions={actions} />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[1.35fr_1fr]">
        <fieldset className="grid content-start gap-3">
          <div className="grid gap-1">
            <legend className="text-lg font-medium">Where could you land?</legend>
            <p className="text-ink-muted">Pick any sites to compare. The small shape is each site's real horizon.</p>
          </div>
          <ul>
            {plan.all.map((s) => (
              <li key={s.site.id} className="flex items-center gap-4 border-t border-line py-2.5">
                <div className="min-w-0 flex-1">
                  <Checkbox
                    label={
                      <span>
                        <span className="font-medium">{s.site.name}</span>{' '}
                        <span className="tabular text-xs text-ink-faint">{s.site.lat_deg.toFixed(2).replace('-', '−')}°</span>
                      </span>
                    }
                    checked={chosen.has(s.site.id)}
                    disabled={chosen.size === 1 && chosen.has(s.site.id)}
                    onCheckedChange={(on: boolean) => actions.toggleSite(s.site.id, on)}
                  />
                  <p className="mt-0.5 pl-6 text-xs text-ink-muted">{BLURB[s.site.id] ?? readerReference(s.site.reference)}</p>
                </div>
                <Horizon site={s} />
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="grid content-start gap-8">
          <div className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-medium">When, and for how long?</h2>
              <p className="text-ink-muted">
                All times UTC. Data covers {longDate(plan.dates[0] ?? plan.date)} to {longDate(plan.dates.at(-1) ?? plan.date)}.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-6">
              <div className="grid gap-2">
                <span className="font-medium">Landing day</span>
                <DayField dates={plan.dates} index={plan.index} onSelect={actions.selectDay} />
              </div>
              <NumberField label="Stay (days)" value={plan.stay} min={1} max={60} onCommit={(v) => actions.go({ stay: Math.round(v) })} />
            </div>
            <TimeSlider value={plan.minute} onChange={(v) => actions.go({ t: v })} />
          </div>

          <fieldset className="grid gap-4">
            <div className="grid gap-1">
              <legend className="text-lg font-medium">What must the site give you?</legend>
              <p className="text-ink-muted">Set by the profile. Change any of them.</p>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2">
              {REQUIREMENTS.map((q) => (
                <NumberField
                  key={q.key}
                  wide
                  label={`${q.label}, ${q.bound} (${q.unit})`}
                  value={plan.requirements[q.key]}
                  min={0}
                  max={q.unit === '%' ? 100 : 8760}
                  onCommit={(v) => actions.go({ [q.key]: v })}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      <p aria-live="polite" className="border-t border-line pt-4 text-ink-muted text-pretty">
        <span className="text-ink">Right now:</span> {verdict(verdictRows(plan), plan.slip).headline}
      </p>
    </div>
  )
}
