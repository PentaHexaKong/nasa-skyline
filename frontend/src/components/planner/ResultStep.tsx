import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Link as KLink } from '@cloudflare/kumo/components/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CalendarBlankIcon,
  CheckIcon,
  DownloadSimpleIcon,
  LinkSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { Lanes } from '~/components/Lanes'
import { changeReadout, earthChangeReadout, moment, PhaseBadge, Readouts, sunReadout } from '~/components/Moment'
import { Panorama } from '~/components/Panorama'
import { DeeperAnalysis } from '~/components/planner/DeeperAnalysis'
import { LiveCheck } from '~/components/planner/LiveCheck'
import MissionMoon, { type MoonMarker } from '~/components/planner/MissionMoon'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { RecommendedPlan } from '~/components/planner/RecommendedPlan'
import { Eyebrow } from '~/components/Shell'
import { isPolar, type Measure, REQUIREMENTS, type SitePlan, shortName, siteResult, type VerdictRow, verdict, whyNote } from '~/lib/mission'
import { earthTarget } from '~/lib/target'
import { longDate, minuteLabel, shortDate } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

export const verdictRows = (plan: Plan): VerdictRow[] =>
  plan.sites.map((s) => ({ name: shortName(s.data), touchdown: s.touchdown, checks: s.checks, nextGo: s.nextGo }))

type Requirement = (typeof REQUIREMENTS)[number]

const pct = (x: number) => `${(x * 100).toFixed(0)} %`
/** Whether a gap touches the edge of the stay. Undefined for requirements that are not gaps. */
const edge = (q: Requirement, m: Measure) =>
  q.key === 'maxNoSun' ? m.noSun.truncated : q.key === 'maxNoEarth' ? m.noEarth.truncated : undefined

function change(q: Requirement, now: Measure, was: Measure) {
  const d = q.read(now) - q.read(was)
  if (Math.abs(d) < 0.05) return 'no change'
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} ${q.unit === '%' ? 'pts' : 'h'}`
}

/** A ghost button in the page's style. */
const ghost =
  'inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm transition-colors hover:border-white/60'

const better = (q: Requirement, now: Measure, was: Measure) => (q.read(now) - q.read(was)) * (q.bound === 'at least' ? 1 : -1) > 0

function Works({ yes }: { yes: boolean }) {
  return <span className={yes ? 'text-go' : 'text-miss'}>{yes ? 'Works' : 'Doesn’t work'}</span>
}

/** After a slip: per site, whether the original day worked and whether the new one does, then the readings that moved. */
function SlipChange({ plan }: { plan: Plan }) {
  if (!plan.base) return null
  const days = plan.slip
  return (
    <section aria-labelledby="slip-change" className="grid gap-3 border-t border-line pt-4">
      <h3 id="slip-change" className="font-medium">
        What changed from {shortDate(plan.base)}{' '}
        <span className="tabular font-normal text-ink-muted">
          ({days > 0 ? '+' : '−'}
          {Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'})
        </span>
      </h3>
      <ul className="grid gap-3">
        {plan.sites.map((s) => {
          const now = siteResult(s).works
          const moved = s.stay && s.was ? REQUIREMENTS.filter((q) => change(q, s.stay as Measure, s.was as Measure) !== 'no change') : null
          return (
            <li key={s.data.site.id} className="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-4">
              <span className="font-medium">{shortName(s.data)}</span>
              <div className="grid gap-1">
                <p>
                  {s.wasGo === null ? (
                    <span className="text-ink-muted">Not computed</span>
                  ) : s.wasGo === now ? (
                    <>
                      <Works yes={now} /> <span className="text-ink-muted">on both days</span>
                    </>
                  ) : (
                    <>
                      <Works yes={s.wasGo} /> <ArrowRightIcon aria-label="now" className="inline" /> <Works yes={now} />
                    </>
                  )}
                </p>
                <p className="tabular text-sm text-ink-muted">
                  {!moved
                    ? 'One of the two stays runs past the computed data.'
                    : moved.length === 0
                      ? 'The four readings are unchanged.'
                      : moved.map((q, i) => (
                          <span key={q.key}>
                            {i > 0 && ' · '}
                            {q.label}{' '}
                            <span className={better(q, s.stay as Measure, s.was as Measure) ? 'text-go' : 'text-miss'}>
                              {change(q, s.stay as Measure, s.was as Measure)}
                            </span>
                          </span>
                        ))}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * The answer, set like a cover: how many sites work as one large figure, the verdict in words, the Moon at the landing
 * moment, and a strip of the plan's four facts under it.
 */
function Verdict({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const v = verdict(verdictRows(plan), plan.slip)
  const computed = plan.sites.every((s) => s.checks)
  const works = plan.sites.filter((s) => siteResult(s).works).length
  const next = plan.sites
    .map((s) => s.nextGo)
    .filter((d): d is string => !!d)
    .sort()[0]
  const markers: MoonMarker[] = plan.sites.map((s) => ({
    id: s.data.site.id,
    name: shortName(s.data),
    lat: s.data.site.lat_deg,
    lon: s.data.site.lon_deg_east,
    selected: true,
    status: !s.checks ? 'not-computed' : siteResult(s).works ? 'works' : 'fails',
  }))
  const facts: [string, ReactNode][] = [
    ['Mission', `${plan.profile.name}${plan.edited ? ' (edited)' : ''}`],
    ['Landing', `${shortDate(plan.date)} ${plan.date.slice(0, 4)}, ${minuteLabel(plan.minute)} UTC`],
    ['Stay', `${plan.stay} days`],
    ['Next day that works', next ? longDate(next) : 'None in the computed year'],
  ]
  return (
    <section aria-labelledby="verdict" className="grid gap-10">
      <div className="grid items-center gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-center gap-5">
          <Eyebrow pip>Result</Eyebrow>
          {computed && (
            <p aria-hidden className="flex items-baseline gap-2 leading-none font-medium">
              <span key={`${works}-${plan.sites.length}`} className="rise text-[clamp(5rem,3rem+7vw,9.5rem)] tabular-nums">
                {works}
              </span>
              <span className="text-[clamp(2rem,1.4rem+2.6vw,4rem)] text-ink-faint">/{plan.sites.length}</span>
            </p>
          )}
          <h2
            id="verdict"
            aria-live="polite"
            className="max-w-[22ch] text-[clamp(1.6rem,1.1rem+1.6vw,2.5rem)] leading-[1.1] font-medium text-balance"
          >
            {v.headline}
          </h2>
          <p className="max-w-[56ch] leading-relaxed text-ink-muted text-pretty">
            {v.detail} {v.next && <span className="text-ink">{v.next}</span>}
          </p>
          <SlipChange plan={plan} />
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => actions.setStep('dates')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-story px-5 py-2.5 font-medium text-white transition-colors hover:bg-story-hover"
            >
              <CalendarBlankIcon aria-hidden weight="bold" /> See every date
            </button>
            {plan.base && (
              <button
                type="button"
                className={ghost}
                onClick={() => {
                  const i = plan.dates.indexOf(plan.base ?? '')
                  if (i >= 0) actions.selectDay(i)
                }}
              >
                <ArrowLeftIcon aria-hidden /> Back to {shortDate(plan.base)}
              </button>
            )}
            <button type="button" className={ghost} onClick={() => actions.setStep('setup')}>
              Change the setup
            </button>
          </div>
        </div>
        <MissionMoon markers={markers} at={plan.window.start} controls={false} className="h-[22rem] sm:h-[28rem] lg:h-[32rem]" />
      </div>
      <dl className="grid grid-cols-2 border-y border-line md:grid-cols-4">
        {facts.map(([label, value], i) => (
          <div
            key={label}
            className={`grid content-start gap-1.5 py-4 ${i % 2 === 1 ? 'pl-4 max-md:border-l max-md:border-line' : 'pr-4'} ${i > 0 ? 'md:border-l md:border-line md:pl-5' : ''} ${i > 1 ? 'max-md:border-t max-md:border-line' : ''}`}
          >
            <dt className="eyebrow text-ink-faint">{label}</dt>
            <dd className="text-lg leading-snug font-medium text-pretty">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * One requirement as a meter: the reading against its limit. Shares fill toward 100 %; gaps fill toward the stay's length.
 * The tick is the limit; a missed limit is a red cross beside the value, never colour alone.
 */
function Meter({ q, site, plan }: { q: Requirement; site: SitePlan; plan: Plan }) {
  const { stay, was, checks } = site
  const check = checks?.checks.find((c) => c.key === q.key)
  const limit = plan.requirements[q.key]
  const sun = q.key === 'minSun' || q.key === 'maxNoSun'
  const full = q.unit === '%' ? 100 : plan.stay * 24
  const reading = stay ? q.read(stay) : null
  const open = stay ? edge(q, stay) : undefined
  // How far from the limit, so 71.7 % against 70 % reads as a near miss without the table.
  const gap = check ? (q.bound === 'at least' ? check.value - check.limit : check.limit - check.value) : null
  return (
    <div className="grid gap-1.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-muted">
          {q.label}
          <span className="readout ml-2 text-2xs text-ink-faint">
            {q.bound === 'at least' ? '≥' : '≤'} {limit} {q.unit}
            {gap != null && (
              <span className={check?.pass ? '' : 'text-miss'}>
                {' · '}
                {Math.abs(gap).toFixed(1)} {q.unit === '%' ? 'pts' : 'h'} {gap >= 0 ? 'spare' : 'short'}
              </span>
            )}
          </span>
        </span>
        <span className={`readout text-xl whitespace-nowrap ${check && !check.pass ? 'text-miss' : ''}`}>
          {check && !check.pass && <XIcon aria-label="Missed" weight="bold" className="mr-1 inline size-4 align-[-0.1em]" />}
          {reading == null ? '—' : `${reading.toFixed(1)} ${q.unit}`}
          {open && <span title="The gap touches the edge of the stay, so it may be longer."> +</span>}
        </span>
      </div>
      <div aria-hidden className="relative h-1.5 rounded-full bg-white/[0.08]">
        {reading != null && (
          <div
            className={`h-full rounded-full ${sun ? 'bg-sun' : 'bg-comms'}`}
            style={{ width: `${Math.max(0, Math.min(100, (reading / full) * 100))}%` }}
          />
        )}
        <div className="absolute -inset-y-1 w-0.5 rounded-full bg-white" style={{ left: `${Math.min(100, (limit / full) * 100)}%` }} />
      </div>
      {was && stay && (
        <span className="readout text-2xs text-ink-faint">
          {change(q, stay, was)} since {shortDate(plan.base ?? plan.date)}
        </span>
      )}
    </div>
  )
}

/** One column of the comparison board: the site, whether it works and why, its skyline now, and every limit as a meter. */
function SiteBoardColumn({ site, plan, n }: { site: SitePlan; plan: Plan; n: number }) {
  const { data, elRange } = site
  const tracks = useTracks(data.site.id)
  const track = tracks?.[plan.date]
  const now = moment(data, track, plan.date, plan.minute)
  const earth = earthTarget(data, track, plan.date, plan.minute)
  const r = siteResult(site)
  const sunSeen = site.touchdown === 'both' || site.touchdown === 'earth_hidden'
  const earthSeen = site.touchdown === 'both' || site.touchdown === 'sun_hidden'
  return (
    <article className="group grid min-w-0 content-start gap-4 py-8 transition-colors md:px-6 md:first:pl-0 md:last:pr-0">
      <header className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="readout text-xs text-ink-faint">{String(n).padStart(2, '0')}</span>
          <span className="text-sm font-medium">
            {!site.checks ? (
              <span className="text-ink-muted">Not computed</span>
            ) : r.works ? (
              <span className="text-go">✓ Works</span>
            ) : (
              <span className="text-miss">× Doesn’t work</span>
            )}
          </span>
        </div>
        <h3 className="text-[clamp(1.4rem,1.1rem+1vw,1.9rem)] leading-tight font-medium">{data.site.name}</h3>
        <p className="readout text-2xs text-ink-faint">
          {Math.abs(data.site.lat_deg).toFixed(2)}°{data.site.lat_deg < 0 ? 'S' : 'N'} · {data.site.lon_deg_east.toFixed(1)}°E
        </p>
        {/* Every column has its reason line, so the skylines below line up across the board. */}
        <p className="min-h-[2.5em] text-sm text-ink-muted text-pretty">
          {!site.checks ? 'Stay not computed.' : r.works ? 'Sun and Earth in view at touchdown; every limit holds.' : `${r.why}.`}
        </p>
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
      <div className="divide-y divide-line border-y border-line">
        <div className="flex items-baseline justify-between gap-3 py-3">
          <span className="text-sm text-ink-muted">At touchdown</span>
          <span className="inline-flex gap-4 text-sm">
            {[
              ['Sun', sunSeen],
              ['Earth', earthSeen],
            ].map(([what, seen]) => (
              <span key={what as string} className="inline-flex items-center gap-1">
                {seen ? (
                  <CheckIcon aria-hidden weight="bold" className="text-ink-muted" />
                ) : (
                  <XIcon aria-hidden weight="bold" className="text-miss" />
                )}
                {what}
                <span className="sr-only">{seen ? ' in view' : ' hidden'}</span>
              </span>
            ))}
          </span>
        </div>
        {site.stay ? (
          REQUIREMENTS.map((q) => <Meter key={q.key} q={q} site={site} plan={plan} />)
        ) : (
          <p className="py-3 text-sm text-ink-muted">The stay runs past the computed data: not computed.</p>
        )}
      </div>
      <Link
        to="/analyze/$siteId"
        params={{ siteId: data.site.id }}
        search={{ day: plan.date, t: plan.minute }}
        className="inline-flex w-max items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        Full site report <ArrowUpRightIcon aria-hidden />
      </Link>
    </article>
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
        <Readouts
          compact
          items={[
            sunReadout(now),
            changeReadout(now.state),
            {
              label: 'Earth elevation',
              value: earth ? `${earth.reference.el_deg.toFixed(1).replace('-', '−')}°` : '…',
              tone: earth?.reference.visible ? 'text-comms' : 'text-ink-muted',
            },
            earthChangeReadout(data, now.at),
          ]}
        />
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

function CopyLink() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(location.href).then(() => setCopied(true))}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm transition-colors hover:border-white/60"
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

/** Result and the way forward on one page: the answer, the sites side by side, what to do next, and the detail. */
export function ResultStep({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const polar = plan.sites.map((s) => isPolar(s.data))
  return (
    <div className="grid gap-16 pb-8">
      <Verdict plan={plan} actions={actions} />
      <RecommendedPlan plan={plan} actions={actions} search={search} />

      <section id="compare" aria-labelledby="compare-title" className="grid scroll-mt-32 gap-2">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="grid gap-2">
            <Eyebrow pip>Site by site</Eyebrow>
            <h2 id="compare-title" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-medium">
              What each site gives you
            </h2>
          </div>
          <MarkerKey mixedScales={polar.includes(true) && polar.includes(false)} />
        </div>
        <div
          className="grid divide-y divide-line border-t border-line md:divide-x md:divide-y-0"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 18rem), 1fr))` }}
        >
          {plan.sites.map((s, i) => (
            <SiteBoardColumn key={s.data.site.id} site={s} plan={plan} n={i + 1} />
          ))}
        </div>
        <p className="max-w-[80ch] text-xs text-ink-faint text-pretty">
          The bar is the reading over the whole stay, the white tick your limit. A + means a gap touches the edge of the stay, so it may be
          longer. Geometric opportunities under stated assumptions, not delivered power or a working radio link.
        </p>
      </section>

      <section aria-labelledby="take-title" className="grid gap-6 border-t border-line pt-12">
        <div className="grid gap-2">
          <Eyebrow pip>Take it with you</Eyebrow>
          <h2 id="take-title" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-medium">
            Share or keep this plan
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={actions.downloadBrief}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-story px-5 py-2.5 font-medium text-white transition-colors hover:bg-story-hover"
          >
            <DownloadSimpleIcon aria-hidden weight="bold" /> Download mission brief
          </button>
          <CopyLink />
          <button type="button" onClick={() => actions.setStep('dates')} className={ghost}>
            See every date <ArrowRightIcon aria-hidden />
          </button>
        </div>
        <LiveCheck plan={plan} />
      </section>

      <section aria-labelledby="appendix-title" className="grid gap-4 border-t border-line pt-12">
        <div className="grid gap-2">
          <Eyebrow pip>Behind the numbers</Eyebrow>
          <h2 id="appendix-title" className="text-[clamp(1.75rem,1.3rem+1.4vw,2.5rem)] leading-tight font-medium">
            How we know, and what we cannot see
          </h2>
        </div>
        <div className="grid gap-1">
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>The stay hour by hour, site by site</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-8 gap-y-10 pt-3">
                {plan.sites.map((s) => (
                  <SiteColumn key={s.data.site.id} site={s} plan={plan} />
                ))}
              </div>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
          <BeforeYouDecide plan={plan} />
          <DeeperAnalysis plan={plan} />
        </div>
      </section>
    </div>
  )
}
