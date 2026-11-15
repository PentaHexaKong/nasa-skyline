import { createFileRoute } from '@tanstack/react-router'
import { Shell } from '~/components/Shell'
import { REFERENCE_SITES } from '~/lib/data'

export const Route = createFileRoute('/sites')({
  head: () => ({ meta: [{ title: 'Katalog Situs Internasional - SKYLINE' }] }),
  component: SiteCataloguePage,
})

function SiteCataloguePage() {
  const groups = [
    { title: 'Katalog Situs Internasional', entries: REFERENCE_SITES.filter((site) => site.agency) },
    { title: 'Existing lunar observers', entries: REFERENCE_SITES.filter((site) => !site.agency) },
  ]
  return (
    <Shell active="/analyze">
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <header className="grid gap-3">
          <h1 className="text-3xl font-medium">Katalog Situs Internasional</h1>
          <p>Menyediakan titik observasi Bulan dari berbagai program antariksa internasional.</p>
          <p className="text-sm text-ink-muted">
            Published coordinates, independent validation, terrain support and relay compatibility have their own provenance. Exploratory
            results carry their scientific limitations.
          </p>
          <a className="underline" href="/analyze">
            Mission planner
          </a>
        </header>
        {groups.map((group) => (
          <section key={group.title} className="grid gap-4">
            <h2 className="text-xl font-medium">{group.title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="p-3">Site and role</th>
                    <th className="p-3">Published coordinates and elevation</th>
                    <th className="p-3">Scientific capability</th>
                    <th className="p-3">Sources and evaluation</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((site) => (
                    <tr key={site.id} className="border-b border-line align-top">
                      <td className="p-3">
                        <p className="font-medium">{site.name}</p>
                        <p className="text-ink-muted">{site.locationRole}</p>
                        <code className="text-xs">{site.canonicalId}</code>
                      </td>
                      <td className="p-3">
                        <p>
                          {site.latitudeDeg} deg latitude, {site.longitudeDegEast} deg east
                        </p>
                        <p>
                          {site.publishedElevationM === null
                            ? 'Published elevation unavailable'
                            : `${site.publishedElevationM} m published elevation`}
                        </p>
                        <p className="text-xs text-ink-muted">Frame {site.frame}</p>
                        {site.publishedElevationDatum && <p className="text-xs text-ink-muted">{site.publishedElevationDatum}</p>}
                        {site.coordinateUncertaintyM !== null && (
                          <p className="text-xs text-ink-muted">
                            Reported uncertainty {site.coordinateUncertaintyM} m, {site.uncertaintyComponent ?? 'component unspecified'}. {site.uncertaintyQualifier}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <p>
                          {site.liveEvaluation.startsWith('supported')
                            ? site.qualification.includes('exploratory')
                              ? 'Exploratory evaluation available'
                              : 'Scientific evaluation available'
                            : 'Coordinate realization unresolved'}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Nominal DEM {site.terrainResolutionM} m. Independent site validation incomplete.
                        </p>
                        <p className="text-xs text-ink-muted">Relay {site.relayStatus}.</p>
                        {site.notes.map((note) => (
                          <p key={note} className="mt-2 text-xs text-ink-muted">
                            {note}
                          </p>
                        ))}
                      </td>
                      <td className="grid gap-3 p-3">
                        <a className="underline" href={site.coordinateSource} target="_blank" rel="noreferrer">
                          Coordinate source
                        </a>
                        {site.frameEvidence && (
                          <a className="underline" href={site.frameEvidence.evidence} target="_blank" rel="noreferrer">
                            Frame convention evidence
                          </a>
                        )}
                        <a className="underline" href={`/analyze/${site.id}?day=2026-11-20&t=720`}>
                          {site.liveEvaluation.startsWith('supported') ? 'Evaluate observer' : 'View unresolved observer'}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <p className="text-sm text-ink-muted">
          Published elevations retain their original sources and datums. Evaluated observer positions use the selected DEM ground height.
          Global LOLA at about 1.9 km nominal spacing leaves small ridges and hazards unresolved.
        </p>
      </main>
    </Shell>
  )
}
