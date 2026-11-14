import { Link as KLink } from '@cloudflare/kumo/components/link'
import { CheckIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { Lanes } from '~/components/Lanes'
import { moment, NextChange, NextEarth, PhaseBadge } from '~/components/Moment'
import { Panorama } from '~/components/Panorama'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { OpenEnd } from '~/components/Shell'
import {
  evaluate,
  type Measure,
  REQUIREMENTS,
  type SitePlan,
  shortName,
  siteResult,
  type VerdictRow,
  verdict,
  whyNote,
} from '~/lib/mission'
import { earthTarget } from '~/lib/target'
import { longDate, shortDate } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

export const verdictRows = (plan: Plan): VerdictRow[] =>
  plan.sites.map((s) => ({ name: shortName(s.data), touchdown: s.touchdown, checks: s.checks, nextGo: s.nextGo }))

type Requirement = (typeof REQUIREMENTS)[number]

const Missed = () => <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-now" />

const pct = (x: number) => `${(x * 100).toFixed(0)} %`
const value = (q: Requirement, m: Measure) => `${q.read(m).toFixed(1)} ${q.unit}`
/** Whether a gap touches the edge of the stay. Undefined for requirements that are not gaps. */
const edge = (q: Requirement, m: Measure) =>
  q.key === 'maxNoSun' ? m.noSun.truncated : q.key === 'maxNoEarth' ? m.noEarth.truncated : undefined

function change(q: Requirement, now: Measure, was: Measure) {
  const d = q.read(now) - q.read(was)
  if (Math.abs(d) < 0.05) return 'no change'
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} ${q.unit === '%' ? 'pts' : 'h'}`
}

function Reading({ q, s }: { q: Requirement; s: SitePlan }) {
  const { stay, was, checks } = s
  if (!stay || !checks) return null
  const check = checks.checks.find((c) => c.key === q.key)
  const open = edge(q, stay)
  return (
    <>
      <span className="whitespace-nowrap">
        {check && !check.pass && <Missed />}
        {value(q, stay)}
        {open !== undefined && <OpenEnd open={open} />}
      </span>
      {was && <small className="block text-xs font-normal whitespace-nowrap text-ink-faint">{change(q, stay, was)}</small>}
    </>
  )
}

/** One body at touchdown: a tick or a cross, and its name, so the state never rests on colour alone. */
function Seen({ what, seen }: { what: string; seen: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {seen ? <CheckIcon aria-hidden weight="bold" className="text-ink-muted" /> : <XIcon aria-hidden weight="bold" className="text-now" />}
      {what}
      <span className="sr-only">{seen ? ' in view' : ' hidden'}</span>
    </span>
  )
}

/** The Sun and Earth at touchdown, each on its own: either one hidden fails the landing. */
function Touchdown({ s }: { s: SitePlan }) {
  const sun = s.touchdown === 'both' || s.touchdown === 'earth_hidden'
  const earth = s.touchdown === 'both' || s.touchdown === 'sun_hidden'
  return (
    <span className="inline-flex gap-3">
      <Seen what="Sun" seen={sun} />
      <Seen what="Earth" seen={earth} />
    </span>
  )
}

/** Whether this site works for this landing, with the reason when it does not. */
function Answer({ s, compact = false }: { s: SitePlan; compact?: boolean }) {
  const r = siteResult(s)
  if (r.works) return <span className="font-medium">Works</span>
  if (compact)
    return (
      <span>
        <span className="font-medium">
          <Missed />
          Doesn’t work:
        </span>{' '}
        <span className="text-ink-muted">{r.why.charAt(0).toLowerCase() + r.why.slice(1)}</span>
      </span>
    )
  return (
    <span className="grid justify-items-end">
      <span className="font-medium whitespace-nowrap">
        <Missed />
        No
      </span>
      <small className="block max-w-[14rem] text-right text-xs font-normal text-pretty text-ink-muted">{r.why}</small>
    </span>
  )
}

const met = (s: SitePlan) => `${s.checks?.met} of ${s.checks?.checks.length}`
const wasMet = (s: SitePlan, plan: Plan) => s.was && `was ${evaluate(s.was, plan.requirements).met}`

function ResultTable({ plan }: { plan: Plan }) {
  return (
    <table className="hidden w-full border-collapse md:table">
      <thead>
        <tr className="text-xs text-ink-muted">
          <th className="pb-2 text-left align-bottom font-normal">Site</th>
          <th className="pb-2 pl-3 text-right align-bottom font-normal">At touchdown</th>
          {REQUIREMENTS.map((q) => (
            <th key={q.key} className="pb-2 pl-3 text-right align-bottom font-normal">
              {q.label}
              <small className="readout block text-xs font-normal text-ink-faint">
                {q.bound === 'at least' ? '≥' : '≤'} {plan.requirements[q.key]} {q.unit}
              </small>
            </th>
          ))}
          <th className="pb-2 pl-3 text-right align-bottom font-normal">Stay limits met</th>
          <th className="pb-2 pl-3 text-right align-bottom font-normal">This landing</th>
        </tr>
      </thead>
      <tbody className="readout text-base font-normal">
        {plan.sites.map((s) => (
          <tr key={s.data.site.id} className="border-t border-line align-top">
            <td className="py-2 font-sans">{s.data.site.name}</td>
            <td className="py-2 pl-3 text-right font-sans">
              <Touchdown s={s} />
            </td>
            {s.stay ? (
              <>
                {REQUIREMENTS.map((q) => (
                  <td key={q.key} className="py-2 pl-3 text-right">
                    <Reading q={q} s={s} />
                  </td>
                ))}
                <td className="py-2 pl-3 text-right">
                  {met(s)}
                  {s.was && <small className="block text-xs font-normal text-ink-faint">{wasMet(s, plan)}</small>}
                </td>
              </>
            ) : (
              <td colSpan={REQUIREMENTS.length + 1} className="py-2 text-right font-sans text-ink-muted">
                Not computed
              </td>
            )}
            <td className="py-2 pl-3 text-right font-sans">
              <Answer s={s} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ResultCards({ plan }: { plan: Plan }) {
  return (
    <div className="md:hidden">
      {plan.sites.map((s) => (
        <article key={s.data.site.id} className="grid gap-1.5 border-t border-line py-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">{s.data.site.name}</h3>
          </div>
          <p>
            <Answer s={s} compact />
          </p>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-ink-muted">At touchdown</span> <Touchdown s={s} />
          </p>
          {s.checks && (
            <p className="readout text-xs font-normal text-ink-muted">
              Stay limits met: {met(s)}
              {s.was && `, ${wasMet(s, plan)}`}
            </p>
          )}
          {s.stay ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              {REQUIREMENTS.map((q) => (
                <div key={q.key} className="flex justify-between gap-2">
                  <dt className="text-xs text-ink-muted">{q.short}</dt>
                  <dd className="readout text-right text-xs font-normal">
                    <Reading q={q} s={s} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-ink-muted">Not computed</p>
          )}
        </article>
      ))}
    </div>
  )
}

function SiteColumn({ site, plan }: { site: SitePlan; plan: Plan }) {
  const { data, stay, elRange } = site
  const tracks = useTracks(data.site.id)
  const track = tracks?.[plan.date]
  const now = moment(data, track, plan.date, plan.minute)
  const earth = earthTarget(data, track, plan.date, plan.minute)
  const note = whyNote({
    sunEl: now.sun?.el,
    horizon: now.horizon,
    inSun: now.state.inSun,
    earthEl: earth?.reference.el_deg,
    earthVisible: earth?.reference.visible,
  })
  return (
    <article className="grid min-w-0 content-start gap-3">
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold">{data.site.name}</h3>
        <KLink
          className="-my-2 shrink-0 py-2 text-base"
          render={<Link to="/analyze/$siteId" params={{ siteId: data.site.id }} search={{ day: plan.date, t: plan.minute }} />}
        >
          Open site
        </KLink>
      </header>
      <Panorama
        skyline={data.skyline.elevation_deg}
        azStep={data.skyline.az_step_deg}
        track={track}
        now={now.sun}
        comms={earth}
        height={150}
        elRange={elRange}
        compact
        label={`${data.site.name}: skyline, Sun and Earth on ${longDate(plan.date)}`}
      />
      <div className="grid gap-1">
        <PhaseBadge phase={now.phase} />
        <NextChange m={now} compact />
        <NextEarth data={data} at={now.at} />
        <p className="tabular text-xs text-ink-muted">
          Sun elevation {now.sun ? `${now.sun.el.toFixed(1).replace('-', '−')}°` : now.phase === 'loading' ? '…' : 'below −1°'}, Earth
          elevation {earth ? `${earth.reference.el_deg.toFixed(1).replace('-', '−')}°` : '…'}
        </p>
        {note && <p className="text-xs text-ink-muted text-pretty">{note}</p>}
      </div>
      {stay ? (
        <Lanes
          window={stay.window}
          label={`${data.site.name}: Sun, Earth and both over the stay`}
          lanes={[
            { key: 'sun', label: 'Sun', spans: stay.sun, fill: 'bg-sun', value: pct(stay.sunShare) },
            { key: 'earth', label: 'Earth', spans: stay.earth, fill: 'bg-comms', value: pct(stay.earthShare) },
            { key: 'both', label: 'Both', spans: stay.both, fill: 'bg-ink', value: pct(stay.bothShare) },
          ]}
        />
      ) : (
        <p className="border-t border-line pt-3 text-ink-muted">Stay totals not computed.</p>
      )}
    </article>
  )
}

function MarkerKey({ mixedScales }: { mixedScales: boolean }) {
  const item = 'inline-flex items-center gap-1.5'
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
      <li className={item}>
        <span aria-hidden className="size-2.5 rounded-full bg-sun" />
        Sun in view
      </li>
      <li className={item}>
        <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-sun" />
        Sun hidden
      </li>
      <li className={item}>
        <span aria-hidden className="size-2 rotate-45 bg-comms" />
        Earth in view
      </li>
      <li className={item}>
        <span aria-hidden className="size-2 rotate-45 border-[1.5px] border-comms" />
        Earth hidden
      </li>
      <li>The shaded shape is the real terrain horizon.</li>
      {mixedScales && <li>Polar and other sites use different height scales.</li>}
    </ul>
  )
}

export function ResultStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const v = verdict(verdictRows(plan), plan.slip)
  const polar = plan.sites.map((s) => Math.abs(s.data.site.lat_deg) >= 75)
  return (
    <div className="grid gap-8">
      <section aria-labelledby="verdict" className="grid gap-5">
        <div className="grid gap-2">
          <h2 id="verdict" aria-live="polite" className="max-w-[30em] text-2xl font-medium text-balance">
            {v.headline}
          </h2>
          <p className="max-w-[72ch] text-lg text-ink-muted text-pretty">
            {v.detail} {v.next && <span className="font-medium text-ink">{v.next}</span>}{' '}
            {plan.base ? (
              <button
                type="button"
                className="cursor-pointer text-ink underline underline-offset-3"
                onClick={() => {
                  const i = plan.dates.indexOf(plan.base ?? '')
                  if (i >= 0) actions.selectDay(i)
                }}
              >
                Back to {shortDate(plan.base)}
              </button>
            ) : (
              v.next && (
                <button
                  type="button"
                  className="cursor-pointer text-ink underline underline-offset-3"
                  onClick={() => actions.setStep('dates')}
                >
                  See all dates
                </button>
              )
            )}
          </p>
        </div>
        <ResultTable plan={plan} />
        <ResultCards plan={plan} />
        <p className="max-w-[80ch] text-xs text-ink-faint text-pretty">
          A + means the gap touches the edge of the stay, so it may be longer. These are geometric opportunities under stated assumptions,
          not delivered power or a working radio link.
        </p>
      </section>
      <section aria-label="Sites side by side" className="grid gap-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-8 gap-y-10">
          {plan.sites.map((s) => (
            <SiteColumn key={s.data.site.id} site={s} plan={plan} />
          ))}
        </div>
        <MarkerKey mixedScales={polar.includes(true) && polar.includes(false)} />
      </section>
    </div>
  )
}
