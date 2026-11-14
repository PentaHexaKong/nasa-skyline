import { DayField, NumberField, TimeSlider } from '~/components/Controls'
import { ProfileCards } from '~/components/planner/ProfilePicker'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { SiteSelector } from '~/components/planner/SiteSelector'
import { Mascot } from '~/components/story'
import { REQUIREMENTS, shortName, siteResult, verdict } from '~/lib/mission'
import { longDate } from '~/lib/time'

export function SetupStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-9">
      <ProfileCards plan={plan} actions={actions} />
      <SiteSelector plan={plan} actions={actions} />
      <div className="flex items-center gap-4 rounded-lg border border-line bg-[#161d26] px-4 py-3">
        <Mascot pose="planner-clipboard" className="size-14 shrink-0" />
        <p className="w-full rounded-lg border border-line bg-[#0e141c] px-3 py-2 text-sm">
          Tip: start from a profile, then tweak the limits.
        </p>
      </div>
      <section aria-labelledby="mission-dates" className="grid gap-4">
        <header className="grid gap-1">
          <h2 id="mission-dates" className="text-lg font-medium">
            When, and for how long?
          </h2>
          <p className="text-xs text-ink-muted">
            All times UTC. Computed range: {longDate(plan.dates[0] ?? plan.date)} to {longDate(plan.dates.at(-1) ?? plan.date)}.
          </p>
        </header>
        <div className="grid gap-2">
          <span className="font-medium">Landing day</span>
          <DayField dates={plan.dates} index={plan.index} onSelect={actions.selectDay} />
        </div>
        <div className="w-40">
          <NumberField
            label="Stay (days)"
            value={plan.stay}
            min={1}
            max={60}
            onCommit={(value) => actions.go({ stay: Math.round(value) })}
          />
        </div>
        <TimeSlider value={plan.minute} onChange={(value) => actions.go({ t: value })} />
      </section>
      <fieldset className="grid gap-4">
        <div className="grid gap-1">
          <legend className="text-lg font-medium">What must the site give you?</legend>
          <p className="text-sm text-ink-muted">Set by the profile. Change any of them.</p>
        </div>
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {[REQUIREMENTS[0], REQUIREMENTS[2], REQUIREMENTS[1], REQUIREMENTS[3]]
            .filter((requirement) => !!requirement)
            .map((requirement) => (
              <NumberField
                key={requirement.key}
                wide
                label={`${requirement.label}, ${requirement.bound} (${requirement.unit})`}
                value={plan.requirements[requirement.key]}
                min={0}
                max={requirement.unit === '%' ? 100 : 8760}
                onCommit={(value) => actions.go({ [requirement.key]: value })}
              />
            ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-[#0e141c] p-4">
        <div className="grid gap-3">
          <p aria-live="polite" className="text-sm">
            Right now: {verdict(verdictRows(plan), plan.slip).headline}
          </p>
          <div className="flex gap-2">
            {plan.sites.map((site) => (
              <span
                key={site.data.site.id}
                title={`${shortName(site.data)}: ${siteResult(site).why}`}
                aria-label={`${shortName(site.data)}: ${!site.checks ? 'Not computed' : siteResult(site).works ? 'Works' : 'Doesn’t work'}`}
                className={`grid size-6 place-items-center rounded-full border ${!site.checks ? 'border-line-strong text-ink-muted' : siteResult(site).works ? 'border-go bg-go text-black' : 'border-miss text-miss'}`}
              >
                {!site.checks ? '?' : siteResult(site).works ? '✓' : '×'}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => actions.setStep('result')}
          className="cursor-pointer rounded-md bg-white px-5 py-3 font-medium text-black"
        >
          See the result →
        </button>
      </div>
    </div>
  )
}
