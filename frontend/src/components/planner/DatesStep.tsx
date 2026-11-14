import { LandingStrip } from '~/components/LandingStrip'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { Explain } from '~/components/Shell'
import { goWindows, nextDays, shortName } from '~/lib/mission'
import { longDate, minuteLabel, shortDate } from '~/lib/time'

const WINDOWS_SHOWN = 4

export function DatesStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const rows = plan.sites.map((s) => ({ id: s.data.site.id, label: shortName(s.data), runs: s.runs }))
  return (
    <section aria-labelledby="dates" className="grid gap-5">
      <div className="grid gap-2">
        <h2 id="dates" className="max-w-[34em] text-2xl font-medium text-balance">
          {nextDays(verdictRows(plan))}
        </h2>
        <p className="max-w-[72ch] text-lg text-ink-muted text-pretty">
          Landing at {minuteLabel(plan.minute)} UTC for a {plan.stay}-day stay. Across the computed year,{' '}
          {plan.sites.map((s) => `${shortName(s.data)} has ${s.goDays} good days`).join(', ')}.
        </p>
      </div>
      <LandingStrip dates={plan.dates} rows={rows} selected={plan.index} onSelect={actions.selectDay} />
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden className="grid h-3 w-5 grid-rows-2">
            <span className="bg-sun" />
            <span className="bg-comms" />
          </span>
          Works: Sun and Earth at touchdown, all requirements met
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-5 bg-line-strong" />
          Sun and Earth at touchdown, stay misses a requirement
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-5 bg-surface outline -outline-offset-1 outline-line" />
          Sun or Earth hidden at touchdown, or stay runs past the computed data
        </li>
      </ul>
      <div className="grid gap-x-8 gap-y-6 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {plan.sites.map((s) => {
          const windows = goWindows(s.runs, plan.dates, plan.index).slice(0, WINDOWS_SHOWN)
          return (
            <div key={s.data.site.id} className="grid content-start gap-1">
              <h3 className="font-semibold">{shortName(s.data)}</h3>
              {windows.length === 0 && <p className="text-ink-muted">No later day works.</p>}
              <ul>
                {windows.map((w) => {
                  const on = plan.date >= w.from && plan.date <= w.to
                  return (
                    <li key={w.from} className="border-t border-line">
                      <button
                        type="button"
                        aria-current={on ? 'date' : undefined}
                        onClick={() => actions.selectDay(plan.dates.indexOf(w.from))}
                        className="tabular -mx-2 flex w-[calc(100%+1rem)] cursor-pointer justify-between gap-3 px-2 py-1.5 text-left hover:bg-surface-hover"
                      >
                        <span className={on ? 'font-medium' : ''}>
                          {on && <span aria-hidden className="mr-2 inline-block size-1.5 bg-brand align-middle" />}
                          {shortDate(w.from)} to {longDate(w.to)}
                        </span>
                        <span className="text-ink-muted">{w.days}-day window</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <Explain>
        <p>
          Each row is a site and each thin column is one landing day. A full bar, the Sun's amber over Earth's cyan, means the Sun and Earth
          are both in view at touchdown and every requirement holds over the stay; a thin grey bar means the stay misses a requirement, and
          an empty track means the Sun or Earth is hidden at touchdown. Hover to read a day, and click to choose it. These are geometric
          opportunities. They say nothing about slopes, hazards or the lander itself.
        </p>
      </Explain>
    </section>
  )
}
