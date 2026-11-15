import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { ReferenceControls, ReferenceStateMessage, useSelectedReference } from '~/components/dynamicSiteReference'
import { Shell } from '~/components/Shell'
import { hasTerrain, loadReferenceSite, MAP_SITES } from '~/lib/data'
import { referenceEarth, referenceTrack } from '~/lib/referenceScience'
import { type SiteSearch, siteFromUnderstandSearch } from '~/lib/useSiteView'

const SiteIsland = lazy(() => import('~/components/SiteIsland'))

export const Route = createFileRoute('/explore/$siteId')({
  validateSearch: siteFromUnderstandSearch,
  loader: async ({ params }) => {
    if (!MAP_SITES.some((site) => site.id === params.siteId)) throw notFound()
    return loadReferenceSite(params.siteId)
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.site.name ?? 'Site'} · Explore · Skyline` }] }),
  component: ExplorePage,
})

function ExplorePage() {
  const site = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = (next: SiteSearch) => navigate({ search: (previous) => ({ ...previous, ...next }), replace: true, resetScroll: false })
  const view = useSelectedReference(site, search, go)
  const { day, instant } = view
  const sample = instant.state === 'computed' ? instant.response.result.samples[0] : undefined
  const result = day.state === 'computed' ? day.data.response.result : undefined
  const back = search.back ?? `/analyze/${site.site.id}?day=${view.date}&t=${view.minute}`
  return (
    <Shell active={search.back ? '/understand' : undefined}>
      <main className="relative h-[calc(100dvh-3.5rem)] overflow-hidden">
        {view.enabled && result && sample && day.state === 'computed' && instant.state === 'computed' && (
          <Suspense fallback={<p role="status">Loading the terrain visualization.</p>}>
            <SiteIsland
              fill
              siteId={site.site.id}
              place={site.site.name}
              track={referenceTrack(day.data)}
              now={{ az: sample.sun.azimuthDeg, el: sample.sun.elevationDeg, fraction: sample.sun.visibleDiskFraction }}
              inSun={sample.sun.sunlightVisible}
              horizon={sample.sun.horizonElevationDeg}
              comms={referenceEarth(day.data, instant.response)}
              skyline={result.skyline.visibilityHorizonElevationDeg}
              azStep={result.skyline.azimuthStepDeg}
              skylineKm={result.skyline.computationSettings.outerRadiusM! / 1000}
              label={`Live scientific Sun and Earth directions at ${site.site.name}, ${sample.timestampUtc}`}
            />
          </Suspense>
        )}
        <div className="absolute top-4 left-4 grid max-w-xl gap-3 rounded-xl bg-bg/90 p-4 text-sm">
          <a href={back} className="underline">
            Back to reference
          </a>
          <h1 className="text-xl font-medium">{site.site.name}</h1>
          <ReferenceStateMessage row={day} />
          <ReferenceStateMessage row={instant} />
          {sample && (
            <>
              <p>Scientific sample {sample.timestampUtc}</p>
              <p>
                Sun · {sample.sun.diskState.replaceAll('_', ' ')} · visible disk fraction {sample.sun.visibleDiskFraction.toFixed(4)}
              </p>
              <p>
                Earth center · {sample.earth.centerVisible ? 'visible' : 'obscured'} · clearance {sample.earth.clearanceDeg.toFixed(3)}°
              </p>
            </>
          )}
          <p className="text-xs text-ink-muted">
            The terrain mesh is a static visualization. Sky positions, visibility readouts and the terrain skyline come from the scientific
            API.
          </p>
        </div>
        <div className="absolute inset-x-4 bottom-4">
          <ReferenceControls
            site={site}
            date={view.date}
            minute={view.minute}
            go={go}
            onSite={(siteId) =>
              navigate({
                to: hasTerrain(siteId) ? '/explore/$siteId' : '/analyze/$siteId',
                params: { siteId },
                search: { day: view.date, t: view.minute },
              })
            }
          />
        </div>
      </main>
    </Shell>
  )
}
