import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { DynamicSiteReference } from '~/components/dynamicSiteReference'
import { Shell } from '~/components/Shell'
import { loadReferenceSite, SITES } from '~/lib/data'
import { type SiteSearch, siteSearch } from '~/lib/useSiteView'

export const Route = createFileRoute('/analyze/$siteId')({
  validateSearch: siteSearch,
  loader: async ({ params }) => {
    if (!SITES.some((site) => site.id === params.siteId)) throw notFound()
    return loadReferenceSite(params.siteId)
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.site.name ?? 'Site'} · Analyze · Skyline` }] }),
  component: VisualizePage,
})

function VisualizePage() {
  const site = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = (next: SiteSearch) => navigate({ search: (previous) => ({ ...previous, ...next }), replace: true, resetScroll: false })
  return (
    <Shell>
      <DynamicSiteReference
        site={site}
        search={search}
        go={go}
        onSite={(siteId) => navigate({ to: '/analyze/$siteId', params: { siteId }, search })}
      />
    </Shell>
  )
}
