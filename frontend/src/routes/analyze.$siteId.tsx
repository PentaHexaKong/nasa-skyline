import { LinkButton } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Select } from '@cloudflare/kumo/components/select'
import { CubeIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DayProfile, NoTrackNote } from '~/components/DayProfile'
import { Intervals, intervalsOn } from '~/components/Intervals'
import { changeReadout, earthChangeReadout, PhaseBadge, type Readout, Readouts, sunReadout } from '~/components/Moment'
import { MonthTimeline } from '~/components/MonthTimeline'
import { Panorama, PanoramaKey } from '~/components/Panorama'
import { Explain, Eyebrow, Shell } from '~/components/Shell'
import { SiteDock } from '~/components/SiteDock'
import { YearChart } from '~/components/YearChart'
import { hasTerrain, loadSummary, NEIGHBOURS, readerReference, SITES, type Summary, surfaceMetres } from '~/lib/data'
import { DAY_MS, measure, siteSpans } from '~/lib/mission'
import { earthTarget } from '~/lib/target'
import { longDate, minuteLabel, minutes, shortDate } from '~/lib/time'
import { headline, siteSearch, sunHud, useSiteView } from '~/lib/useSiteView'

export const Route = createFileRoute('/analyze/$siteId')({
  validateSearch: siteSearch,
  loader: async ({ params }) => {
    if (!SITES.some((s) => s.id === params.siteId)) throw notFound()
    return loadSummary(params.siteId)
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.site.name ?? 'Site'} · Analyze · Skyline` }] }),
  component: VisualizePage,
})

function darkStretch(data: Summary) {
  const s = data.summary
  const days = s.longest_no_direct_stretch_days ?? s.longest_dark_stretch_days
  const first = s.longest_no_direct_first_day ?? s.longest_dark_first_day
  const last = s.longest_no_direct_last_day ?? s.longest_dark_last_day
  return first && last ? { days, first, last } : undefined
}

type Day = Summary['days'][number]

function lede(d: Day, name: string, dark: ReturnType<typeof darkStretch>) {
  const place = name.split(',')[0]
  const inDark = dark && d.date >= dark.first && d.date <= dark.last
  const stretch = inDark ? ` ${place} stays in shadow from ${shortDate(dark.first)} to ${shortDate(dark.last)}.` : ''
  if (d.direct_min > d.daylight_min + 1)
    return `On ${longDate(d.date)} the Sun shines here for ${minutes(d.direct_min)}, longer than the ${minutes(d.daylight_min)} it spends above a flat horizon: from high ground you see past the curve of the Moon.`
  if (d.daylight_min === 0) return `The Sun stays below the horizon all day on ${longDate(d.date)}.${stretch}`
  if (d.direct_min === 0)
    return `The Sun is up for ${minutes(d.daylight_min)} on ${longDate(d.date)} but never clears the terrain.${stretch}`
  const lost = d.daylight_min - d.direct_min
  return `The Sun is up for ${minutes(d.daylight_min)} on ${longDate(d.date)}${
    lost >= 1 ? `; terrain takes ${minutes(lost)} of it` : ', and terrain takes none of it'
  }.`
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`

const days = (h: number) => `${(h / 24).toFixed(1)} days`

/** One site's year in the four planner readings, measured the way the planner measures a stay. */
function yearOf(d: Summary) {
  const spans = siteSpans(d)
  const m = measure(spans, spans.coverage)
  return {
    sun: m.sunShare,
    noSun: m.noSun.hours,
    earth: m.earthShare,
    noEarth: m.noEarth.hours,
    ridge: Math.max(...d.skyline.elevation_deg),
    ground: d.site.ground_height_m,
  }
}

const ROWS = [
  { key: 'sun', label: 'Direct sun, share of the year', show: (v: number) => `${(v * 100).toFixed(1)} %` },
  { key: 'noSun', label: 'Longest without direct sun', show: days },
  { key: 'earth', label: 'Earth in view, share of the year', show: (v: number) => `${(v * 100).toFixed(1)} %` },
  { key: 'noEarth', label: 'Longest without Earth', show: days },
  { key: 'ridge', label: 'Highest point of the horizon', show: (v: number) => `${v.toFixed(1)}°` },
  { key: 'ground', label: 'Ground height', show: (v: number) => `${Math.round(v).toLocaleString('en-GB')} m` },
] as const

/** The same year at a site a short walk away: how much a small move changes (C8). */
function Nearby({ data, day, t }: { data: Summary; day: string; t: number }) {
  const id = NEIGHBOURS[data.site.id]
  const [near, setNear] = useState<Summary | null>(null)
  useEffect(() => {
    setNear(null)
    if (id) loadSummary(id).then(setNear)
  }, [id])
  if (!id || !near) return null
  const metres = Math.round(surfaceMetres(data.site, near.site))
  const here = yearOf(data)
  const there = yearOf(near)
  const pct = (v: number) => `${Math.round(v * 100)} %`
  return (
    <section aria-labelledby="nearby-h" className="grid gap-4">
      <div className="grid gap-2">
        <Eyebrow pip>A short walk away</Eyebrow>
        <h2 id="nearby-h" className="text-2xl font-medium text-balance">
          {metres} m away, a different year
        </h2>
        <p className="max-w-[62ch] leading-relaxed text-ink-muted text-pretty">
          {near.site.name} is {metres} m from here. Over the same year the Sun is in direct view {pct(here.sun)} of the time here and{' '}
          {pct(there.sun)} there.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full max-w-[48rem] text-left text-sm">
          <caption className="sr-only">
            {data.site.name} and {near.site.name} over the computed year
          </caption>
          <thead className="text-ink-faint">
            <tr className="border-b border-line">
              <td className="py-2 pr-4" />
              <th scope="col" className="py-2 pr-4 font-normal">
                {data.site.name} <span className="text-ink-faint">(this site)</span>
              </th>
              <th scope="col" className="py-2 font-normal">
                <Link
                  to="/analyze/$siteId"
                  params={{ siteId: near.site.id }}
                  search={{ day, t }}
                  className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  {near.site.name}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="readout">
            {ROWS.map((r) => (
              <tr key={r.key} className="border-b border-line">
                <th scope="row" className="py-2 pr-4 font-sans font-normal text-ink-muted">
                  {r.label}
                </th>
                <td className="py-2 pr-4">{r.show(here[r.key])}</td>
                <td className="py-2">{r.show(there[r.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explain>
        <p>
          Near the pole the Sun skims the horizon, so a ridge one or two degrees high decides whether a lander has power. A couple of
          hundred metres changes which ridges stand in the way. Both columns come from the same NASA LOLA terrain and the same year. Ground
          this close is only as sharp as the 20 m terrain map, so read the gap as a direction, not an exact figure.
        </p>
      </Explain>
    </section>
  )
}

function VisualizePage() {
  const data = Route.useLoaderData()
  const { day, t } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = (s: { day?: string; t?: number }) => navigate({ search: (prev) => ({ ...prev, ...s }), replace: true, resetScroll: false })
  const view = useSiteView(data, { day, t }, go)
  const { current, track, minute, m, index, selectDay } = view
  const dark = darkStretch(data)
  const comms = earthTarget(data, track, current.date, minute)
  const ref = comms?.reference
  const seek = (ms: number) => go({ day: new Date(ms).toISOString().slice(0, 10), t: Math.floor((ms % DAY_MS) / 60_000) })

  const pending = (r: Readout): Readout => (m.phase === 'loading' ? { ...r, value: '…', sub: undefined } : r)
  const readouts: Readout[] = [
    sunReadout(m),
    pending(changeReadout(m.state)),
    ref
      ? {
          label: 'Earth',
          value: ref.visible ? 'In view' : 'Below the ridge',
          sub: `centre ${signed(ref.clearance_deg)} vs the ridge`,
          tone: ref.visible ? 'text-comms' : 'text-ink-muted',
        }
      : { label: 'Earth', value: !track ? '…' : 'Not computed', tone: 'text-ink-muted' },
    pending(earthChangeReadout(data, m.at)),
  ]

  return (
    <Shell>
      <main className="pb-6">
        <section aria-labelledby="pano">
          <div className="mx-auto grid max-w-7xl gap-x-16 gap-y-7 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pt-12">
            <div className="grid content-start gap-4">
              <Eyebrow pip>
                {data.site.name} · {shortDate(current.date)} {current.date.slice(0, 4)}
              </Eyebrow>
              <h1 id="pano" className="text-[clamp(2.25rem,1.6rem+2.2vw,3.5rem)] leading-[1.05] font-medium text-balance">
                {headline(current)}
              </h1>
              <p className="max-w-[60ch] leading-relaxed text-ink-muted text-pretty">{lede(current, data.site.name, dark)}</p>
              {hasTerrain(data.site.id) && (
                <div>
                  <LinkButton href={`/explore/${data.site.id}?day=${current.date}&t=${minute}`} variant="secondary" icon={CubeIcon}>
                    Explore in 3D
                  </LinkButton>
                </div>
              )}
            </div>
            <Readouts items={readouts} />
            <div className="flex flex-wrap items-center gap-2 sm:hidden">
              <Select
                aria-label="Site"
                value={data.site.id}
                items={Object.fromEntries(SITES.map((site) => [site.id, site.name.split(',')[0] ?? site.name]))}
                onValueChange={(id) =>
                  id && navigate({ to: '/analyze/$siteId', params: { siteId: id as string }, search: { day: current.date, t: minute } })
                }
                className="min-w-0 flex-1"
              />
              <LinkButton
                href={`/analyze?sites=${data.site.id}&day=${current.date}&t=${minute}`}
                variant="secondary"
                className="whitespace-nowrap"
              >
                Plan a landing here
              </LinkButton>
            </div>
          </div>

          <div className="mx-auto mt-10 grid max-w-7xl gap-1 px-4 sm:px-6">
            <Eyebrow pip>The same sky, unrolled</Eyebrow>
            <p className="text-sm text-ink-muted">
              Stand at the site and turn all the way round, from north back to north: the white line is the ridge in each direction.
            </p>
          </div>
          <div className="mt-4">
            <Panorama
              skyline={data.skyline.elevation_deg}
              azStep={data.skyline.az_step_deg}
              track={track}
              now={m.sun}
              comms={comms}
              height={440}
              // The whole horizon: at the pole the Sun circles all the way round, so a cut-off view hides ridges that matter.
              azRange={[0, 360]}
              hud={{
                sun: sunHud(m),
                comms: ref ? `${ref.name.split(' ')[0]} · ${ref.el_deg.toFixed(1)}° up · ${signed(ref.clearance_deg)}` : undefined,
              }}
              label={`Terrain skyline at ${data.site.name} with the Sun path on ${longDate(current.date)}`}
            />
          </div>
          <div className="mx-auto mt-4 grid max-w-7xl gap-4 px-4 sm:px-6">
            <NoTrackNote track={track} />
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="readout text-sm text-ink-muted">{minuteLabel(minute)} UTC</span>
                <PhaseBadge phase={m.phase} />
              </div>
              <PanoramaKey comms={comms?.kind ?? false} />
            </div>
            <Explain>
              <p>
                The horizon seen from the site, unrolled all the way round from north to north. The shape is the land out to{' '}
                {data.params.skyline_max_km} km. The amber line is the Sun’s path on this day; where it turns dashed, the Sun is up but
                hidden behind terrain.
              </p>
              {comms && (
                <p>
                  The cyan line is Earth’s path across this site’s sky today. The Moon keeps one face toward Earth, so Earth barely moves:
                  it wobbles a few degrees over a month (libration). Near the pole that wobble is enough to lift Earth above a ridge or drop
                  it behind one, which decides when a lander can talk to Earth directly.
                </p>
              )}
              <p>
                The Moon has no air, so there is no twilight and no refraction: the Sun is either above the ridge or not. Near the poles the
                Sun skims the horizon for days, and a ridge a few degrees high decides whether a lander has power.
              </p>
            </Explain>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-16 px-4 pt-16 pb-12 sm:px-6">
          <section aria-labelledby="month-h" className="grid gap-4">
            <div className="grid gap-2">
              <Eyebrow pip>Through the lunar day</Eyebrow>
              <h2 id="month-h" className="text-2xl font-medium">
                How Sun and Earth trade off over 29.5 days
              </h2>
            </div>
            <MonthTimeline data={data} at={m.at.getTime()} onSeek={seek} />
          </section>

          <section aria-labelledby="day-h" className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
              <div className="grid gap-2">
                <Eyebrow pip>Through the day</Eyebrow>
                <h2 id="day-h" className="text-2xl font-medium">
                  How much of the Sun clears the ridge
                </h2>
              </div>
              <p className="text-xs text-ink-faint">Drag, or focus and use the arrow keys. UTC.</p>
            </div>
            <DayProfile track={track} stepMin={data.params.track_step_min} comms={comms} minute={minute} onMinute={(v) => go({ t: v })} />
            <Explain>
              <p>
                The height of the amber area is how much of the Sun’s disk clears the terrain, from 0 to 100 %. The pale band is daylight
                over a flat horizon; the difference between the band and the amber area is time lost to terrain.
              </p>
              {comms && <p>The {comms.label} lane shows line of sight to Earth. It is geometry only, not a working radio link.</p>}
            </Explain>
          </section>

          <section aria-labelledby="year-h" className="grid gap-4">
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <div className="grid gap-2">
                <Eyebrow pip>Across the year</Eyebrow>
                <h2 id="year-h" className="text-2xl font-medium">
                  When the ridge takes the Sun away
                </h2>
              </div>
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                <div className="grid gap-1">
                  <dt className="eyebrow text-ink-faint">Direct sun, share of the year</dt>
                  <dd className="readout text-xl">
                    {`${((data.days.reduce((a, d) => a + d.direct_min, 0) / (data.days.length * 1440)) * 100).toFixed(1)} %`}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="eyebrow text-ink-faint">Longest stretch without direct sun</dt>
                  <dd className="readout text-xl">
                    {dark ? (
                      <button
                        type="button"
                        onClick={() => go({ day: dark.first })}
                        className="text-left underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                      >
                        {dark.days} days, {shortDate(dark.first)} to {shortDate(dark.last)}
                      </button>
                    ) : (
                      'None'
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <YearChart days={data.days} selected={index} onSelect={selectDay} />
            <Explain>
              <p>
                Each amber bar is one day’s minutes of direct sun; the grey line is the daylight a flat horizon would give. Short grey marks
                under the axis are days with daylight but no direct sun at all. A small change of date near the edge of a dark stretch can
                mean the difference between hours of sun and none.
              </p>
            </Explain>
          </section>

          <Nearby data={data} day={current.date} t={minute} />

          <div className="grid grid-cols-1 gap-12 xl:grid-cols-2">
            <section aria-labelledby="intervals" className="grid content-start gap-3">
              <Eyebrow pip>Events</Eyebrow>
              <h2 id="intervals" className="text-xl font-medium">
                Direct-sun intervals on {shortDate(current.date)}
              </h2>
              <Intervals rows={intervalsOn(data.intervals, current.date)} daylightMin={current.daylight_min} />
              <p className="text-xs text-ink-faint">Edges refined to 1 s. UTC, [start, end).</p>
            </section>
            <section aria-labelledby="method" className="grid content-start gap-3">
              <Eyebrow pip>Provenance</Eyebrow>
              <h2 id="method" className="sr-only">
                Method and limits
              </h2>
              <Collapsible.Root>
                <Collapsible.DefaultTrigger>Method and limits</Collapsible.DefaultTrigger>
                <Collapsible.DefaultPanel>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                    <dt className="text-ink-muted">Algorithm</dt>
                    <dd className="readout">{data.provenance.algorithm_version}</dd>
                    <dt className="text-ink-muted">Terrain</dt>
                    <dd>{data.provenance.dem_product}</dd>
                    <dt className="text-ink-muted">Frame</dt>
                    <dd>{data.provenance.frame}</dd>
                    <dt className="text-ink-muted">Elevation</dt>
                    <dd>{data.conventions.elevation}</dd>
                    {data.earth && (
                      <>
                        <dt className="text-ink-muted">Earth</dt>
                        <dd>
                          {data.earth.model}; {data.earth.rule}
                        </dd>
                      </>
                    )}
                    <dt className="text-ink-muted">Reference</dt>
                    <dd>{readerReference(data.site.reference)}</dd>
                  </dl>
                  <ul className="grid list-disc gap-1 pl-4 text-xs text-ink-muted">
                    {data.provenance.known_limits.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </Collapsible.DefaultPanel>
              </Collapsible.Root>
            </section>
          </div>
        </div>

        <SiteDock
          data={data}
          view={view}
          go={go}
          onSite={(id) => navigate({ to: '/analyze/$siteId', params: { siteId: id }, search: { day: current.date, t: minute } })}
          action={
            <LinkButton
              href={`/analyze?sites=${data.site.id}&day=${current.date}&t=${minute}`}
              variant="primary"
              className="ml-auto hidden whitespace-nowrap sm:flex"
            >
              Plan a landing here
            </LinkButton>
          }
        />
      </main>
    </Shell>
  )
}
