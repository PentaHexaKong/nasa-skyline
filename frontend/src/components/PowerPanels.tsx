import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { useState } from 'react'
import { NumberField } from '~/components/Controls'
import { FeedFrame, TableScroll } from '~/components/FeedFrame'
import { OpenEnd } from '~/components/Shell'
import type { LegacyMastData, MastOutcome } from '~/lib/feed-schemas'
import { useFeed } from '~/lib/feeds'
import { paretoFront } from '~/lib/mission'
import type { MastFeedV1 } from '~/lib/scientificContract.generated'

const pct = (x: number) => `${(x * 100).toFixed(1)} %`
function Gap({ h, truncated }: { h: number; truncated: boolean }) {
  return (
    <>
      {h.toFixed(1)} h<OpenEnd open={truncated} />
    </>
  )
}

const NOT_WATTS =
  'Geometric opportunity at the top of the mast. Panel potential is a 0 to 1 share, not watts. It is not delivered power or battery survival.'

function Th({ children, end = false }: { children: string; end?: boolean }) {
  return <th className={`pb-2 text-xs font-normal text-ink-muted ${end ? 'text-right' : 'sticky left-0 bg-bg text-left'}`}>{children}</th>
}

export function PowerPanel({ siteId, scenarioId }: { siteId: string; scenarioId?: string }) {
  const feed = useFeed('power', siteId, scenarioId)
  return (
    <FeedFrame
      feed={feed}
      title="What mast height buys"
      what="Sun and Earth coverage, longest gaps and geometric panel exposure at the evaluated observer heights."
      limit={NOT_WATTS}
    >
      {(data) => (
        <div className="grid gap-3">
          {data.panelGeometry && (
            <p className="text-sm">
              Sun availability follows {data.scenario?.request?.solarDefinition ?? 'the reported rule'}. Vertical-panel azimuth is{' '}
              {data.panelGeometry.verticalAzimuthDeg}° clockwise from north. Incidence uses the solar center and visible-disk fraction.
              Tracking is ideal and unconstrained.
            </p>
          )}
          <TableScroll label="Coverage at each mast height">
            <table className="w-full min-w-[40rem] border-collapse">
              <thead>
                <tr>
                  <Th>Height</Th>
                  <Th end>Sun</Th>
                  <Th end>Longest without Sun</Th>
                  <Th end>Earth centre</Th>
                  <Th end>Longest without Earth</Th>
                  <Th end>Vertical panel</Th>
                  <Th end>Flat panel</Th>
                  <Th end>Ideal tracking</Th>
                </tr>
              </thead>
              <tbody className="readout text-base font-normal">
                {data.outcomes.map((o) => (
                  <tr key={o.mast_m} className="border-t border-line">
                    <td className="sticky left-0 bg-bg py-2">{o.mast_m} m</td>
                    <td className="py-2 text-right text-sun">{pct(o.sun_share)}</td>
                    <td className="py-2 text-right">
                      <Gap h={o.longest_no_sun_h} truncated={o.longest_no_sun_truncated} />
                    </td>
                    <td className="py-2 text-right text-comms">{pct(o.earth_center_share)}</td>
                    <td className="py-2 text-right">
                      <Gap h={o.longest_no_earth_h} truncated={o.longest_no_earth_truncated} />
                    </td>
                    <td className="py-2 text-right">{o.potential_vertical.toFixed(3)}</td>
                    <td className="py-2 text-right">{o.potential_horizontal.toFixed(3)}</td>
                    <td className="py-2 text-right">{o.potential_tracking?.toFixed(3) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </FeedFrame>
  )
}

const PLOT = 320

function MastResults({ data }: { data: LegacyMastData }) {
  const heights = data.candidates[0]?.outcomes.map((o) => o.mast_m) ?? []
  const [height, setHeight] = useState(heights.at(-2) ?? heights[0] ?? 0)
  const [radius, setRadius] = useState(1000)
  const at = (o: MastOutcome[]) => o.find((x) => x.mast_m === height)
  const rows = data.candidates.flatMap((c) => {
    const outcome = at(c.outcomes)
    return outcome ? [{ ...c, outcome, distance: Math.hypot(c.east_m, c.north_m) }] : []
  })
  const reach = rows.filter((r) => r.distance <= radius)
  const front = new Set(
    paretoFront(reach, [
      { read: (r) => r.outcome.sun_share, better: 'high' },
      { read: (r) => r.outcome.earth_center_share, better: 'high' },
    ]).map((r) => r.id),
  )
  const scale = (PLOT / 2 - 12) / Math.max(radius, ...rows.map((r) => r.distance), 1)
  const ranked = [...reach].sort((a, b) => Number(front.has(b.id)) - Number(front.has(a.id)) || b.outcome.sun_share - a.outcome.sun_share)

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="grid gap-1.5">
          <span id="mast-h" className="text-base font-medium">
            Mast height
          </span>
          <ButtonGroup aria-labelledby="mast-h">
            {heights.map((h) => (
              <Button
                key={h}
                variant={h === height ? 'primary' : 'secondary'}
                aria-pressed={h === height}
                className="tabular"
                onClick={() => setHeight(h)}
              >
                {h} m
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <NumberField label="Cable radius (m)" value={radius} min={50} max={20000} onCommit={setRadius} />
      </div>
      <div className="grid items-start gap-6 md:grid-cols-[20rem_minmax(0,1fr)]">
        <svg
          viewBox={`${-PLOT / 2} ${-PLOT / 2} ${PLOT} ${PLOT}`}
          role="img"
          aria-label={`Candidate mast spots within ${radius} m of the site`}
          className="block w-full max-w-80"
        >
          <circle r={radius * scale} className="fill-none stroke-line-strong" strokeDasharray="3 4" />
          <line x1={-6} x2={6} y1={0} y2={0} className="stroke-ink-muted" />
          <line x1={0} x2={0} y1={-6} y2={6} className="stroke-ink-muted" />
          <text x={0} y={-PLOT / 2 + 11} textAnchor="middle" className="fill-ink-faint font-mono text-2xs">
            N
          </text>
          {rows.map((r) => {
            const inside = r.distance <= radius
            return (
              <circle
                key={r.id}
                cx={r.east_m * scale}
                cy={-r.north_m * scale}
                r={front.has(r.id) ? 5 : 3}
                className={!inside ? 'fill-none stroke-line-strong' : front.has(r.id) ? 'fill-ink' : 'fill-ink-faint'}
              >
                <title>{`${r.id}: Sun ${pct(r.outcome.sun_share)}, Earth ${pct(r.outcome.earth_center_share)}`}</title>
              </circle>
            )
          })}
        </svg>
        <TableScroll label="Candidate mast spots">
          <table className="w-full min-w-[32rem] border-collapse">
            <thead>
              <tr>
                <Th>Spot</Th>
                <Th end>Offset</Th>
                <Th end>Sun</Th>
                <Th end>Earth centre</Th>
                <Th end>Longest without Sun</Th>
                <Th end>Slope</Th>
              </tr>
            </thead>
            <tbody className="readout text-base font-normal">
              {ranked.slice(0, 8).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="sticky left-0 bg-bg py-2">
                    {front.has(r.id) ? '● ' : '○ '}
                    {r.id}
                  </td>
                  <td className="py-2 text-right">{Math.round(r.distance)} m</td>
                  <td className="py-2 text-right text-sun">{pct(r.outcome.sun_share)}</td>
                  <td className="py-2 text-right text-comms">{pct(r.outcome.earth_center_share)}</td>
                  <td className="py-2 text-right">
                    <Gap h={r.outcome.longest_no_sun_h} truncated={r.outcome.longest_no_sun_truncated} />
                  </td>
                  <td className="py-2 text-right">{r.slope_deg == null ? 'n/a' : `${r.slope_deg.toFixed(1)}°`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-faint">
            ● No other tested spot in reach beats this one on both Sun and Earth. Rule: {data.rule}
          </p>
        </TableScroll>
      </div>
    </div>
  )
}

function PlacementResults({ data }: { data: MastFeedV1 }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-muted">
        {data.optimization.complete
          ? 'Evaluated the complete generated grid.'
          : `Partial evaluation with ${data.optimization.unknownOutcomeCount} unresolved outcomes.`}{' '}
        Cable distances use the declared reference-sphere assumption. ● marks the server-computed nondominated set.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse">
          <thead>
            <tr>
              <Th>Offset E / N</Th>
              <Th end>Mast</Th>
              <Th end>Cable</Th>
              <Th end>Slope</Th>
              <Th end>Sun</Th>
              <Th end>Earth</Th>
              <Th end>Darkness</Th>
              <Th end>Earth blackout</Th>
              <Th end>Rank</Th>
              <Th>Feasibility</Th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.flatMap((candidate) =>
              candidate.outcomes.map((outcome) => (
                <tr
                  key={`${candidate.candidateId}-${outcome.observerHeightM}`}
                  className="border-t border-line"
                  title={`${candidate.site.latitudeDeg} deg latitude, ${candidate.site.longitudeDeg} deg signed east longitude in ${candidate.site.sourceFrame}. ${outcome.reason ?? outcome.violations.join(', ')}`}
                >
                  <td className="py-2">
                    {outcome.paretoRank === 0 ? '● ' : ''}
                    {candidate.eastM} / {candidate.northM} m
                  </td>
                  <td className="text-right">{outcome.observerHeightM} m</td>
                  <td className="text-right">{candidate.cableDistanceM.toFixed(1)} m</td>
                  <td className="text-right">{candidate.estimatedSlopeDeg == null ? '—' : `${candidate.estimatedSlopeDeg.toFixed(1)}°`}</td>
                  <td className="text-right">{outcome.metrics ? pct(outcome.metrics.sunlightAvailabilityFraction) : '—'}</td>
                  <td className="text-right">{outcome.metrics ? pct(outcome.metrics.directEarthAvailabilityFraction) : '—'}</td>
                  <td className="text-right">
                    {outcome.metrics ? (
                      <Gap
                        h={outcome.metrics.longestDarkness.durationS / 3600}
                        truncated={outcome.metrics.longestDarkness.touchesCoverageBoundary}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right">
                    {outcome.metrics ? (
                      <Gap
                        h={outcome.metrics.longestDirectEarthBlackout.durationS / 3600}
                        truncated={outcome.metrics.longestDirectEarthBlackout.touchesCoverageBoundary}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="text-right">{outcome.paretoRank ?? '—'}</td>
                  <td>{outcome.feasibilityStatus.replaceAll('_', ' ')}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-faint">
        {data.request.solarDefinition} sunlight rule. Earth-center {data.request.profile} visibility. Slopes describe a coarse DEM
        footprint. Construction safety and global optimality remain unverified.
      </p>
    </div>
  )
}

export function MastPanel({ siteId, scenarioId }: { siteId: string; scenarioId?: string }) {
  const feed = useFeed('mast', siteId, scenarioId)
  return (
    <FeedFrame
      feed={feed}
      title="Where to put the mast"
      what="Candidate mast spots around this site, scored at each height under the declared constraints."
      limit={`Results apply to the tested grid and DEM resolution. Construction suitability remains unverified. ${NOT_WATTS}`}
    >
      {(data) => (data.contractVersion === 'skyline-mast-feed/1.0.0' ? <PlacementResults data={data} /> : <MastResults data={data} />)}
    </FeedFrame>
  )
}
