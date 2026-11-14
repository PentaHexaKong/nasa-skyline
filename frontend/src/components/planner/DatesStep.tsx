import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { useDayPreview, Year } from '~/components/planner/SiteSelector'
import { Explain, Eyebrow } from '~/components/Shell'
import { Mascot } from '~/components/story'
import { goWindows, nextDays, shortName } from '~/lib/mission'
import { longDate, minuteLabel, shortDate } from '~/lib/time'

/** "18–19 Nov", "28 Nov – 2 Dec", or one day. */
function range(from: string, to: string) {
  if (from === to) return shortDate(from)
  const [, fm] = from.split('-')
  const [, tm] = to.split('-')
  return fm === tm ? `${Number(from.slice(8))}–${shortDate(to)}` : `${shortDate(from)} – ${shortDate(to)}`
}

/**
 * Dates: when the landing works. The next day that works per site, set large; the whole year as one strip to hover, drag
 * or play through; and every run of days that work, one tap to plan around it. Every status is the plan's own per-day
 * rule, the same as Result's Works.
 */
export function DatesStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const preview = useDayPreview(plan, actions)
  return (
    <div className="grid gap-16 pb-8">
      <section aria-labelledby="dates" className="grid gap-8">
        <div className="grid items-end gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4">
            <Eyebrow pip>
              Dates · landing at {minuteLabel(plan.minute)} UTC, {plan.stay}-day stay
            </Eyebrow>
            <h2 id="dates" className="text-[clamp(2.25rem,1.5rem+3vw,4.5rem)] leading-[1.02] font-medium">
              When can you land?
            </h2>
            <p className="max-w-[60ch] text-lg leading-relaxed text-ink-muted text-pretty">{nextDays(verdictRows(plan))}</p>
          </div>
          <Mascot pose="planner-magnifier" className="hidden size-32 md:block" />
        </div>
        <dl
          className="grid divide-y divide-line border-y border-line sm:divide-x sm:divide-y-0"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))' }}
        >
          {plan.sites.map((s) => (
            <div key={s.data.site.id} className="grid content-start gap-2 py-5 sm:px-5 sm:first:pl-0">
              <dt className="eyebrow text-ink-faint">{shortName(s.data)}</dt>
              <dd className="grid gap-1">
                <span className="text-[clamp(1.75rem,1.3rem+1.6vw,2.75rem)] leading-none font-medium">
                  {s.nextGo ? shortDate(s.nextGo) : 'None'}
                </span>
                <span className="text-sm text-ink-muted">
                  {s.nextGo ? `${s.nextGo.slice(0, 4)} · next day that works` : 'No later day works in the computed year'}
                </span>
                <span className="readout text-sm">
                  {s.goDays} <span className="font-sans text-ink-muted">day{s.goDays === 1 ? '' : 's'} that work in the year</span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="year-title" className="grid gap-4">
        <div className="grid gap-2">
          <Eyebrow pip>The year</Eyebrow>
          <h3 id="year-title" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-medium">
            Every landing day, at a glance
          </h3>
          <p className="max-w-[62ch] text-ink-muted text-pretty">
            The computed year from {longDate(plan.dates[0] ?? plan.date)} to {longDate(plan.dates.at(-1) ?? plan.date)}.
          </p>
        </div>
        <div className="rounded-2xl border border-line">
          <Year {...preview.year} size="large" readout hint="Hover to see a day. Drag, play or click to choose one." />
        </div>
      </section>

      <section aria-labelledby="windows" className="grid gap-4">
        <div className="grid gap-2">
          <Eyebrow pip>Windows</Eyebrow>
          <h3 id="windows" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-medium">
            Runs of days that work
          </h3>
          <p className="max-w-[62ch] text-ink-muted text-pretty">From the chosen day on. Pick one to plan around it.</p>
        </div>
        <ul className="border-t border-line">
          {plan.sites.map((s) => {
            const windows = goWindows(s.runs, plan.dates, plan.index)
            return (
              <li key={s.data.site.id} className="grid gap-3 border-b border-line py-5 md:grid-cols-[12rem_minmax(0,1fr)] md:items-start">
                <div className="grid gap-0.5">
                  <span className="text-lg font-medium">{shortName(s.data)}</span>
                  <span className="readout text-xs text-ink-faint">
                    {windows.length} window{windows.length === 1 ? '' : 's'}
                  </span>
                </div>
                {windows.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {windows.map((w) => {
                      const on = plan.date >= w.from && plan.date <= w.to
                      return (
                        <button
                          key={w.from}
                          type="button"
                          aria-current={on ? 'date' : undefined}
                          title={`${longDate(w.from)} to ${longDate(w.to)}`}
                          onClick={() => actions.selectDay(plan.dates.indexOf(w.from))}
                          className={`inline-flex cursor-pointer items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                            on ? 'border-white bg-white text-black' : 'border-white/15 hover:border-white/60'
                          }`}
                        >
                          <span className="font-medium">{range(w.from, w.to)}</span>
                          <span className={`readout text-2xs ${on ? 'text-black/60' : 'text-ink-faint'}`}>{w.days} d</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-ink-muted">No later day works at this site in the computed year.</p>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <Explain>
        <p>
          Each row of the strip is a site and each thin column one landing day. A full green bar means the Sun and Earth are both in view at
          touchdown and every requirement holds over the stay; a thin dark-green bar means both are in view at touchdown but the stay misses
          a requirement; an empty track means the Sun or Earth is hidden at touchdown, or the stay runs past the computed data. These are
          geometric opportunities. They say nothing about slopes, hazards or the lander itself.
        </p>
      </Explain>
      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => actions.setStep('result')}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 transition-colors hover:border-white/60"
        >
          <ArrowLeftIcon aria-hidden /> Back to the result for {shortDate(plan.date)}
        </button>
      </div>
    </div>
  )
}
