import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Link as KLink } from '@cloudflare/kumo/components/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  DownloadSimpleIcon,
  GlobeHemisphereWestIcon,
  LinkSimpleIcon,
  SunIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Lanes } from '~/components/Lanes'
import { moment, NextChange, NextEarth, PhaseBadge } from '~/components/Moment'
import { Panorama } from '~/components/Panorama'
import { DeeperAnalysis } from '~/components/planner/DeeperAnalysis'
import { SiteThumb } from '~/components/planner/Illustrations'
import { LiveCheck } from '~/components/planner/LiveCheck'
import MissionMoon, { type MoonMarker } from '~/components/planner/MissionMoon'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { RecommendedPlan } from '~/components/planner/RecommendedPlan'
import { Eyebrow, OpenEnd } from '~/components/Shell'
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
import { longDate, minuteLabel, shortDate } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

export const verdictRows = (plan: Plan): VerdictRow[] =>
  plan.sites.map((s) => ({ name: shortName(s.data), touchdown: s.touchdown, checks: s.checks, nextGo: s.nextGo }))

type Requirement = (typeof REQUIREMENTS)[number]

const Missed = () => <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-miss" />

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
      {seen ? (
        <CheckIcon aria-hidden weight="bold" className="text-ink-muted" />
      ) : (
        <XIcon aria-hidden weight="bold" className="text-miss" />
      )}
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

/**
 * The limit beside a reading and how far the reading is from it, so a planner sees whether 71.7 % against 70 % is a
 * comfortable pass or a near miss without opening the table.
 */
function Margin({ q, site }: { q: Requirement; site: SitePlan }) {
  const c = site.checks?.checks.find((x) => x.key === q.key)
  if (!c) return null
  const gap = q.bound === 'at least' ? c.value - c.limit : c.limit - c.value
  const unit = q.unit === '%' ? 'pts' : 'h'
  return (
    <dd className="readout text-xs text-ink-faint">
      {q.bound === 'at least' ? '≥' : '≤'} {c.limit} {q.unit}
      <span className={c.pass ? '' : 'text-miss'}>
        {' · '}
        {Math.abs(gap).toFixed(1)} {unit} {gap >= 0 ? 'spare' : 'short'}
      </span>
    </dd>
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

/** The answer first, beside the Moon at the landing moment: the verdict, how many sites work, and the next day that does. */
function Verdict({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const v = verdict(verdictRows(plan), plan.slip)
  const markers: MoonMarker[] = plan.sites.map((s) => ({
    id: s.data.site.id,
    name: shortName(s.data),
    lat: s.data.site.lat_deg,
    lon: s.data.site.lon_deg_east,
    selected: true,
    status: !s.checks ? 'not-computed' : siteResult(s).works ? 'works' : 'fails',
  }))
  return (
    <section aria-labelledby="verdict" className="grid items-center gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="grid content-center gap-5">
        <Eyebrow pip>
          Result · {shortDate(plan.date)} {plan.date.slice(0, 4)}, {minuteLabel(plan.minute)} UTC · {plan.stay}-day stay
        </Eyebrow>
        <h2 id="verdict" aria-live="polite" className="text-[clamp(2rem,1.4rem+2.2vw,3.25rem)] leading-[1.05] font-medium text-balance">
          {v.headline}
        </h2>
        <p className="max-w-[58ch] text-lg leading-relaxed text-ink-muted text-pretty">
          {v.detail} {v.next && <span className="text-ink">{v.next}</span>}
        </p>
        <div className="flex flex-wrap gap-3">
          {plan.base ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
              onClick={() => {
                const i = plan.dates.indexOf(plan.base ?? '')
                if (i >= 0) actions.selectDay(i)
              }}
            >
              <ArrowLeftIcon aria-hidden /> Back to {shortDate(plan.base)}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
            onClick={() => actions.setStep('dates')}
          >
            <CalendarBlankIcon aria-hidden /> See every date
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            onClick={() => actions.setStep('setup')}
          >
            Change the setup
          </button>
        </div>
      </div>
      {/* A small Moon: it locates the sites and shows the light at landing; the answer and the cards below carry the detail. */}
      <MissionMoon markers={markers} at={plan.window.start} controls={false} className="h-[16rem] rounded-xl sm:h-[18rem]" />
    </section>
  )
}

const statValue = (q: Requirement, s: SitePlan) =>
  s.stay ? `${q.key === 'minSun' || q.key === 'minEarth' ? `${q.read(s.stay).toFixed(1)}%` : `${q.read(s.stay).toFixed(1)} h`}` : 'n/a'

/** One card per site: its own skyline as the picture, whether it works, its skyline with the Sun and Earth now, and three readings. */
function SiteCard({ site, plan }: { site: SitePlan; plan: Plan }) {
  const { data, stay, elRange } = site
  const tracks = useTracks(data.site.id)
  const track = tracks?.[plan.date]
  const now = moment(data, track, plan.date, plan.minute)
  const earth = earthTarget(data, track, plan.date, plan.minute)
  const r = siteResult(site)
  const shown = REQUIREMENTS.filter((q) => q.key !== 'maxNoEarth')
  const Icon = { minSun: SunIcon, maxNoSun: ClockIcon, minEarth: GlobeHemisphereWestIcon, maxNoEarth: ClockIcon } as const
  const short = { minSun: 'Sun in view', maxNoSun: 'Longest w/o Sun', minEarth: 'Earth in view', maxNoEarth: 'Longest w/o Earth' } as const
  return (
    <article className="grid content-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-line-strong">
      <header className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-3">
        <SiteThumb site={data} className="h-12 w-full overflow-hidden rounded-md" />
        <div className="grid gap-1">
          <h3 className="leading-tight font-medium">{data.site.name}</h3>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            {!site.checks ? (
              <span className="text-ink-muted">Not computed</span>
            ) : r.works ? (
              <>
                <CheckCircleIcon aria-hidden weight="fill" className="text-go" /> <span className="text-go">Works</span>
              </>
            ) : (
              <>
                <XCircleIcon aria-hidden weight="fill" className="text-miss" /> <span className="text-miss">Doesn’t work</span>
              </>
            )}
          </span>
        </div>
        <Link
          to="/analyze/$siteId"
          params={{ siteId: data.site.id }}
          search={{ day: plan.date, t: plan.minute }}
          aria-label={`Open the full report for ${data.site.name}`}
          title="Open the full site report"
          className="rounded p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          <ArrowSquareOutIcon aria-hidden className="size-5" />
        </Link>
      </header>
      {!r.works && <p className="text-sm text-ink-muted text-pretty">{r.why}.</p>}
      <Panorama
        skyline={data.skyline.elevation_deg}
        azStep={data.skyline.az_step_deg}
        track={track}
        now={now.sun}
        comms={earth}
        height={120}
        elRange={elRange}
        compact
        label={`${data.site.name}: skyline, Sun and Earth on ${longDate(plan.date)}`}
      />
      <dl className="grid grid-cols-3 divide-x divide-line border-t border-line pt-3">
        {shown.map((q) => {
          const miss = site.checks?.checks.find((c) => c.key === q.key)?.pass === false
          const I = Icon[q.key]
          const open = stay ? edge(q, stay) : undefined
          return (
            <div key={q.key} className="grid gap-0.5 px-2 first:pl-0">
              <dt className="flex items-center gap-1 text-2xs text-ink-muted">
                <I aria-hidden className={q.key === 'minSun' ? 'text-sun' : q.key === 'minEarth' ? 'text-comms' : ''} />
                {short[q.key]}
              </dt>
              <dd className={`readout text-lg ${miss ? 'text-miss' : ''}`}>
                {miss && <XIcon aria-label="Missed" weight="bold" className="mr-0.5 inline size-3.5" />}
                {statValue(q, site)}
                {open && (
                  <abbr title="The gap runs past the end of the stay, so it is at least this long" className="no-underline">
                    {' +'}
                  </abbr>
                )}
              </dd>
              <Margin q={q} site={site} />
            </div>
          )
        })}
      </dl>
    </article>
  )
}

function CopyLink() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(location.href).then(() => setCopied(true))}
      className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
    >
      {copied ? <CheckIcon aria-hidden /> : <LinkSimpleIcon aria-hidden />}
      {copied ? 'Link copied' : 'Copy link to this plan'}
    </button>
  )
}

const VERIFY = [
  ['Terrain and landing hazards', 'Slopes, boulders and anything finer than the terrain grid are not in the skyline.'],
  ['Power and storage', 'Sun in view is not delivered power.'],
  ['Thermal limits', 'Not modelled.'],
  ['Communications link budget', 'Earth in view is line of sight, not a working radio link.'],
] as const

function BeforeYouDecide({ plan }: { plan: Plan }) {
  const data = plan.sites.map((s) => s.data)
  const unique = (xs: string[]) => [...new Set(xs)].join(', ')
  return (
    <Collapsible.Root>
      <Collapsible.DefaultTrigger>Before you decide: what this tool cannot see, and how the numbers were made</Collapsible.DefaultTrigger>
      <Collapsible.DefaultPanel>
        <div className="grid gap-x-12 gap-y-8 pt-2 lg:grid-cols-[1.35fr_1fr]">
          <ul>
            {VERIFY.map(([what, why]) => (
              <li key={what} className="border-t border-line py-2.5 last:border-b">
                <p className="font-medium">{what}</p>
                <p className="text-ink-muted">{why}</p>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] content-start gap-x-3 gap-y-1.5">
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
        </div>
      </Collapsible.DefaultPanel>
    </Collapsible.Root>
  )
}

/** Result and the way forward on one page: summary, the sites, the table, what to do next, the live check, the brief. */
export function ResultStep({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const polar = plan.sites.map((s) => Math.abs(s.data.site.lat_deg) >= 75)
  return (
    <div className="grid gap-12">
      <Verdict plan={plan} actions={actions} />
      <RecommendedPlan plan={plan} actions={actions} search={search} />
      <section id="compare" aria-labelledby="compare-title" className="grid scroll-mt-32 gap-4">
        <div className="grid gap-2">
          <Eyebrow pip>Site by site</Eyebrow>
          <h2 id="compare-title" className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-tight font-medium">
            What each site sees at touchdown
          </h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(19rem,1fr))] gap-4">
          {plan.sites.map((s) => (
            <SiteCard key={s.data.site.id} site={s} plan={plan} />
          ))}
        </div>
        <MarkerKey mixedScales={polar.includes(true) && polar.includes(false)} />
      </section>
      <div className="grid gap-1">
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>Every limit, site by site</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <section aria-label="Every limit, site by site" className="grid gap-3 pt-2">
              <ResultTable plan={plan} />
              <ResultCards plan={plan} />
              <p className="max-w-[80ch] text-xs text-ink-faint text-pretty">
                A + means the gap touches the edge of the stay, so it may be longer. These are geometric opportunities under stated
                assumptions, not delivered power or a working radio link.
              </p>
            </section>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>Sun and Earth at touchdown, in detail</Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-8 gap-y-10 pt-3">
              {plan.sites.map((s) => (
                <SiteColumn key={s.data.site.id} site={s} plan={plan} />
              ))}
            </div>
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
      </div>
      <LiveCheck plan={plan} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button
          type="button"
          onClick={actions.downloadBrief}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand px-4 py-2 font-medium text-bg hover:opacity-90"
        >
          <DownloadSimpleIcon aria-hidden weight="bold" /> Download mission brief
        </button>
        <CopyLink />
        <button
          type="button"
          onClick={() => actions.setStep('dates')}
          className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
        >
          See dates <ArrowRightIcon aria-hidden />
        </button>
      </div>
      <BeforeYouDecide plan={plan} />
      <DeeperAnalysis plan={plan} />
    </div>
  )
}
