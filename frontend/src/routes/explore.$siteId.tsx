import { LinkButton } from '@cloudflare/kumo/components/button'
import { ArrowsInIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { PhaseBadge } from '~/components/Moment'
import { Eyebrow, Shell } from '~/components/Shell'
import { SiteDock } from '~/components/SiteDock'
import { loadMoonEphemeris, loadSummary, MAP_SITES, type MoonEphemeris } from '~/lib/data'
import { hoursAt, orbitSky, SYNODIC_HOURS, skyNow } from '~/lib/moonLight'
import { earthTarget } from '~/lib/target'
import { longDate, minuteLabel, shortDate } from '~/lib/time'
import { headline, siteFromUnderstandSearch, sunHud, useSiteView } from '~/lib/useSiteView'

const SiteIsland = lazy(() => import('~/components/SiteIsland'))

export const Route = createFileRoute('/explore/$siteId')({
  validateSearch: siteFromUnderstandSearch,
  loader: async ({ params }) => {
    if (!MAP_SITES.some((s) => s.id === params.siteId)) throw notFound()
    return loadSummary(params.siteId)
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.site.name ?? 'Site'} · Explore · Skyline` }] }),
  component: ExplorePage,
})

/** The 3D island on its own, edge to edge under the header; readouts and the dock float over it. */
function ExplorePage() {
  const data = Route.useLoaderData()
  const { day, t, back: from } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = (s: { day?: string; t?: number }) => navigate({ search: (prev) => ({ ...prev, ...s }), replace: true, resetScroll: false })
  const view = useSiteView(data, { day, t }, go)
  const { hydrated, current, track, minute, m } = view
  const comms = earthTarget(data, track, current.date, minute)
  const ref = comms?.reference
  const [eph, setEph] = useState<MoonEphemeris>()
  useEffect(() => {
    loadMoonEphemeris().then(setEph, () => undefined)
  }, [])
  const site = { lat: data.site.lat_deg, lon: data.site.lon_deg_east }
  const hours = eph ? hoursAt(eph, current.date, minute) : 0
  // The month's path stays put while it plays, and moves on one whole lunar month at a time.
  const month = Math.floor(hours / SYNODIC_HOURS)
  const orbit = useMemo(() => (eph ? orbitSky(eph, site, (month + 0.5) * SYNODIC_HOURS) : undefined), [eph, data.site.id, month])
  // The stored track stops about 1° below the horizon; past that, the ephemeris says where the Sun is under the ground.
  const sun = m.sun ?? (eph && m.phase !== 'loading' ? { ...skyNow(eph, site, hours).sun, fraction: 0 } : undefined)
  // Opened from an Understand lesson, this stays a part of Understand and leads back to the lesson, not to the Moon.
  const back = from ?? `/explore?from=${data.site.id}&day=${current.date}&t=${minute}#space`

  return (
    <Shell active={from ? '/understand' : undefined}>
      <main className="relative h-[calc(100dvh-3.5rem-1px)] overflow-hidden">
        {hydrated ? (
          <Suspense fallback={null}>
            <SiteIsland
              fill
              siteId={data.site.id}
              place={data.site.name.split(',')[0] ?? data.site.name}
              track={track}
              now={sun}
              orbit={orbit}
              inSun={m.phase === 'sun'}
              horizon={m.horizon}
              comms={comms}
              skyline={data.skyline.elevation_deg}
              azStep={data.skyline.az_step_deg}
              skylineKm={data.params.skyline_max_km}
              tools={
                <LinkButton href={back} variant="secondary" size="sm" icon={ArrowsInIcon}>
                  <span className="hidden sm:inline">{from ? 'Back to lesson' : 'Back to Moon'}</span>
                  <span className="sm:hidden">Back</span>
                </LinkButton>
              }
              label={`3D model of the terrain around ${data.site.name} with the Sun path on ${longDate(current.date)}. ${sunHud(m) ?? ''}`}
            />
          </Suspense>
        ) : null}

        <div className="scene-text pointer-events-none absolute top-4 left-4 grid max-w-[min(26rem,calc(100%-2rem))] gap-3 sm:left-(--page-edge)">
          <Eyebrow pip>
            {from ? 'Understand' : 'Explore'} › {data.site.name} · {shortDate(current.date)} {current.date.slice(0, 4)}
          </Eyebrow>
          <h1 className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium">{headline(current)}</h1>
          <dl className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-2">
            <dt className="eyebrow text-ink-faint">Sun</dt>
            <dd>
              <PhaseBadge phase={m.phase} />
            </dd>
            {ref && (
              <>
                <dt className="eyebrow text-ink-faint">Earth</dt>
                <dd className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2.5 rounded-full ${ref.visible ? 'bg-comms' : 'border-[1.5px] border-comms bg-transparent'}`}
                  />
                  {ref.visible ? 'In view' : ref.el_deg < 0 ? 'Below the horizon' : 'Behind the ridge'}
                </dd>
              </>
            )}
            <dt className="eyebrow text-ink-faint">Time</dt>
            <dd className="readout text-sm text-ink-muted">{minuteLabel(minute)} UTC</dd>
          </dl>
          <div className="pointer-events-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              to="/understand"
              hash={m.phase === 'shadow' ? 'ridge' : ref && !ref.visible ? 'earth' : 'hilltop'}
              className="underline underline-offset-3 hover:text-ink"
            >
              Why?
            </Link>
            <Link
              to="/analyze/$siteId"
              params={{ siteId: data.site.id }}
              search={{ day: current.date, t: minute }}
              className="text-ink-muted underline underline-offset-3 hover:text-ink"
            >
              Full analysis
            </Link>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 pb-4">
          <SiteDock
            siteOnPhone
            sites={MAP_SITES}
            data={data}
            view={view}
            go={go}
            onSite={(id) =>
              navigate({ to: '/explore/$siteId', params: { siteId: id }, search: { day: current.date, t: minute, back: from } })
            }
          />
        </div>
      </main>
    </Shell>
  )
}
