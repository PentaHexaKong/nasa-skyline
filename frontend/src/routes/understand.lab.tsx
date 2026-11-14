import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LabJourney } from '~/components/lab/LabJourney'
import { Footer, Shell } from '~/components/Shell'
import { loadMoonEphemeris, loadSummary, MOON_SITES } from '~/lib/data'
import { INVESTIGATION_IDS, LUNAR_DAYS } from '~/lib/investigation'
import { forgiving } from '~/lib/useSiteView'

export const Route = createFileRoute('/understand/lab')({
  validateSearch: z.object({
    step: forgiving(z.enum(['choose', 'try', 'observe', 'explain'])),
    q: forgiving(z.enum(INVESTIGATION_IDS)),
    site: forgiving(z.string()),
    day: forgiving(z.coerce.number().min(0).max(LUNAR_DAYS)),
  }),
  loader: async () => {
    const [eph, summaries] = await Promise.all([loadMoonEphemeris(), Promise.all(MOON_SITES.map((s) => loadSummary(s.id)))])
    return { eph, summaries }
  },
  head: () => ({ meta: [{ title: 'Understand lab · Skyline' }] }),
  component: LabPage,
})

function LabPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <Shell>
      <main className="min-h-[calc(100svh-3.5rem)] bg-bg">
        <LabJourney {...data} initialSearch={search} />
      </main>
      <Footer />
    </Shell>
  )
}
