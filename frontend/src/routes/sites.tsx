import { ArrowRightIcon, ArrowSquareOutIcon } from '@phosphor-icons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Shell } from '~/components/Shell'
import { GLOBAL_TERRAIN_M, REFERENCE_SITES, SITES } from '~/lib/data'

export const Route = createFileRoute('/sites')({
  head: () => ({ meta: [{ title: 'Landing sites · Skyline' }] }),
  component: SiteCataloguePage,
})

type Entry = (typeof REFERENCE_SITES)[number]

/** What a site's page can show, from what exists for it: a precomputed year, a live check, or neither yet. */
function capability(site: Entry) {
  if (SITES.some((s) => s.id === site.id))
    return { label: 'Full report', tone: 'text-ink', detail: 'A precomputed year, plus a live check.' }
  if (!site.liveEvaluation.startsWith('supported'))
    return {
      label: 'Position unresolved',
      tone: 'text-ink-muted',
      detail: 'Its published position can’t yet be placed on the terrain map.',
    }
  return site.terrainResolutionM === GLOBAL_TERRAIN_M
    ? {
        label: 'Live check · exploratory',
        tone: 'text-story-ink',
        detail: 'Computed on request from global terrain about 1.9 km apart, so small ridges are missed.',
      }
    : { label: 'Live check', tone: 'text-story-ink', detail: 'Computed on request from the 80 m south-polar terrain.' }
}

const coordinate = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} · ${(((lon % 360) + 360) % 360).toFixed(3)}°E`

/** "Chang'e-4 - CNSA (Liu 2019)" reads as the mission, the agency and the source of the position. */
const title = (name: string) => name.replace(' - ', ' · ')

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}

function SiteRow({ site }: { site: Entry }) {
  const can = capability(site)
  return (
    <li className="grid gap-x-8 gap-y-3 border-b border-line py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-start">
      <div className="grid gap-1">
        <h3 className="font-medium text-pretty">{title(site.name)}</h3>
        <p className="text-sm text-ink-muted first-letter:uppercase">{site.locationRole}</p>
      </div>
      <div className="grid gap-1 text-sm">
        <p className="readout">{coordinate(site.latitudeDeg, site.longitudeDegEast)}</p>
        <p className="text-ink-muted">
          {site.publishedElevationM === null
            ? 'Elevation not published'
            : `${site.publishedElevationM.toLocaleString('en-GB')} m published elevation`}
        </p>
      </div>
      <div className="grid gap-1 text-sm">
        <p className={`font-medium ${can.tone}`}>{can.label}</p>
        <p className="text-ink-muted text-pretty">{can.detail}</p>
        {site.notes.map((note) => (
          <p key={note} className="text-xs text-ink-faint text-pretty">
            {note}
          </p>
        ))}
        <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-ink-faint">
          <a
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink"
            href={site.coordinateSource}
            target="_blank"
            rel="noreferrer"
          >
            Position from {host(site.coordinateSource)}
            <ArrowSquareOutIcon aria-hidden />
          </a>
          {site.frameEvidence && (
            <a
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink"
              href={site.frameEvidence.evidence}
              target="_blank"
              rel="noreferrer"
            >
              Map frame evidence
              <ArrowSquareOutIcon aria-hidden />
            </a>
          )}
        </p>
      </div>
      <Link
        to="/analyze/$siteId"
        params={{ siteId: site.id }}
        className="inline-flex items-center gap-2 justify-self-start rounded-md border border-line-strong px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:bg-white/[0.04]"
      >
        Open site
        <ArrowRightIcon aria-hidden weight="bold" />
      </Link>
    </li>
  )
}

function SiteCataloguePage() {
  const groups = [
    {
      id: 'others',
      title: 'Landings by other agencies',
      lede: 'Published landing points from China, India, Japan and Russia, each with the source of its position.',
      entries: REFERENCE_SITES.filter((site) => site.agency),
    },
    {
      id: 'skyline',
      title: 'Skyline’s own sites',
      lede: 'The south-pole rims the planner is built on, with Apollo 11 for comparison.',
      entries: REFERENCE_SITES.filter((site) => !site.agency),
    },
  ]
  return (
    <Shell>
      <main className="mx-auto grid max-w-7xl gap-12 px-4 pt-10 pb-16 sm:px-6">
        <header className="grid max-w-[44rem] gap-3">
          <h1 className="text-[clamp(1.75rem,1.3rem+1.8vw,2.75rem)] leading-[1.08] font-medium text-balance">Landing sites</h1>
          <p className="text-ink-muted text-pretty">
            {REFERENCE_SITES.length} places on the Moon, from Skyline’s south-pole rims to where other missions came down. Each opens on
            what Skyline can say about its Sun and Earth.
          </p>
        </header>

        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`sites-${group.id}`} className="grid gap-4">
            <div className="grid gap-1">
              <h2 id={`sites-${group.id}`} className="text-xl font-medium">
                {group.title}
              </h2>
              <p className="max-w-[60ch] text-sm text-ink-muted text-pretty">{group.lede}</p>
            </div>
            <ul className="border-t border-line">
              {group.entries.map((site) => (
                <SiteRow key={site.id} site={site} />
              ))}
            </ul>
          </section>
        ))}

        <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
          Published elevations keep their own sources and datums; live checks stand the observer on the terrain map’s ground instead. A live
          check is a geometric result for the stated position, not an independently validated one.
        </p>
      </main>
    </Shell>
  )
}
