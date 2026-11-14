import { FeedFrame, TableScroll } from '~/components/FeedFrame'
import type { Summary } from '~/lib/data'
import { useFeed } from '~/lib/feeds'

const pct = (x: number) => `${(x * 100).toFixed(1)} %`

export function ValidationPanel({ names }: { names: Record<string, string> }) {
  const feed = useFeed('validation')
  return (
    <FeedFrame
      feed={feed}
      title="Our numbers next to NASA's maps"
      what="Each site's Sun and Earth shares next to PGDA's published illumination maps, with the differences in period and rule stated."
      limit="The two sources differ in period and method, so this is a comparison and not an agreement score."
    >
      {(data) => (
        <TableScroll label="Our shares next to the published maps">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr className="text-xs text-ink-muted">
                <th className="sticky left-0 bg-bg pb-2 text-left font-normal">Site</th>
                <th className="pb-2 text-right font-normal">Sun, ours</th>
                <th className="pb-2 text-right font-normal">Sun, reference</th>
                <th className="pb-2 text-right font-normal">Earth, ours</th>
                <th className="pb-2 text-right font-normal">Earth, reference</th>
                <th className="pb-2 pl-6 text-left font-normal">Why they differ</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.site_id} className="border-t border-line align-top">
                  <td className="sticky left-0 bg-bg py-2">{names[r.site_id] ?? r.site_id}</td>
                  <td className="readout py-2 text-right font-normal">{pct(r.ours.sun_share)}</td>
                  <td className="readout py-2 text-right font-normal">{pct(r.reference.sun_share)}</td>
                  <td className="readout py-2 text-right font-normal">{pct(r.ours.earth_any_share)}</td>
                  <td className="readout py-2 text-right font-normal">{pct(r.reference.earth_any_share)}</td>
                  <td className="py-2 pl-6 text-ink-muted">
                    {r.ours.period} at {r.ours.observer_height_m} m, against {r.reference.product} over {r.reference.period}.{' '}
                    {r.difference_notes.join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </FeedFrame>
  )
}

/** Provenance of the results already in the app. These are real pipeline outputs, so they need no feed. */
export function SiteProvenance({ sites }: { sites: Summary[] }) {
  return (
    <section className="grid gap-4">
      <h3 className="text-lg font-medium">Where each site's numbers come from</h3>
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((s) => (
          <article key={s.site.id} className="grid content-start gap-1.5">
            <h4 className="font-medium">{s.site.name}</h4>
            <p className="tabular text-xs text-ink-muted">
              {s.site.lat_deg}°, {s.site.lon_deg_east}°E. Algorithm {s.provenance.algorithm_version}. {s.provenance.frame}. Observer{' '}
              {s.site.observer_height_m} m.
            </p>
            <p className="text-ink-muted text-pretty">{s.site.source}</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-faint">
              {s.provenance.known_limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
