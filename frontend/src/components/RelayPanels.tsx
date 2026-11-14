import { CheckIcon } from '@phosphor-icons/react'
import { scaleLinear } from 'd3-scale'
import { useState } from 'react'
import { NumberField } from '~/components/Controls'
import { FeedFrame, TableScroll } from '~/components/FeedFrame'
import { type Lane, Lanes } from '~/components/Lanes'
import { OpenEnd } from '~/components/Shell'
import type { RelayData, RelayStudyData } from '~/lib/feed-schemas'
import { useFeed } from '~/lib/feeds'
import { paretoFront, STUDY_OBJECTIVES, type StudyRow, smallestMeeting, studyRows, toSpans } from '~/lib/mission'
import { useWidth } from '~/lib/useWidth'

const pct = (x: number) => `${(x * 100).toFixed(1)} %`

const LINE_OF_SIGHT = 'Geometric line of sight from planned orbits. Not a radio link, capacity or guaranteed contact.'

const STATUS: Record<RelayData['scenarios'][number]['orbit_status'], string> = {
  none: 'No relay',
  published: 'Published orbit',
  indicative: 'Indicative orbit',
  illustrative: 'Illustrative orbit',
}

function CoverageResults({ data }: { data: RelayData }) {
  const window = { start: Date.parse(data.period.start_utc), end: Date.parse(data.period.end_utc) }
  const lanes: Lane[] = data.scenarios.map((s, i) => ({
    key: s.id,
    label: s.label,
    spans: toSpans(s.intervals),
    fill: i === 0 ? 'bg-comms' : 'lane-relay',
    value: `${(s.contact_share * 100).toFixed(0)} %`,
  }))
  return (
    <div className="grid gap-5">
      {'contractVersion' in data && data.contractVersion && (
        <p className="text-sm text-ink-muted">
          Sampled geometric availability on a {data.comparison.grid.cadenceS} s grid. Interval edges are sample-bin boundaries. Continuous
          availability and RF performance remain unvalidated.
        </p>
      )}
      <Lanes window={window} lanes={lanes} label="Contact spans for each relay scenario" />
      <TableScroll label="Contact and longest gap for each relay scenario">
        <table className="w-full min-w-[36rem] border-collapse">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="sticky left-0 bg-bg pb-2 text-left font-normal">Scenario</th>
              <th className="pb-2 text-right font-normal">Contact</th>
              <th className="pb-2 text-right font-normal">Longest gap</th>
              <th className="pb-2 pl-6 text-left font-normal">Orbit basis</th>
            </tr>
          </thead>
          <tbody>
            {data.scenarios.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="sticky left-0 bg-bg py-2">{s.label}</td>
                <td className="readout py-2 text-right font-normal">{pct(s.contact_share)}</td>
                <td className="readout py-2 text-right font-normal">
                  {s.longest_gap_h.toFixed(1)} h<OpenEnd open={s.longest_gap_truncated} />
                </td>
                <td className="py-2 pl-6 text-ink-muted">
                  {STATUS[s.orbit_status]}. {s.source}, as of {s.as_of}.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  )
}

export function RelayCoverage({ siteId, scenarioId }: { siteId: string; scenarioId?: string }) {
  const feed = useFeed('relay', siteId, scenarioId)
  return (
    <FeedFrame
      feed={feed}
      title="What each relay adds"
      what="Compare direct Earth visibility with the evaluated relay scenarios and their remaining geometric gaps."
      limit={LINE_OF_SIGHT}
    >
      {(data) => <CoverageResults data={data} />}
    </FeedFrame>
  )
}

const HEIGHT = 300
const M = { t: 14, r: 12, b: 38, l: 46 }

function StudyPlot({ rows, front, pick, minShare }: { rows: StudyRow[]; front: Set<StudyRow>; pick?: StudyRow; minShare?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const counts = rows.map((r) => r.relays)
  const hi = Math.max(...counts)
  const x = scaleLinear([Math.min(...counts) - 0.5, hi + 0.5], [M.l, width - M.r])
  const y = scaleLinear([0, 100], [HEIGHT - M.b, M.t])
  const line = [...front].sort((a, b) => a.relays - b.relays || a.share - b.share)
  return (
    <div ref={ref}>
      <svg
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Each tested configuration by relay count and worst-site contact share"
        className="block w-full overflow-visible"
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} className="stroke-grid" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-faint font-mono text-2xs">
              {v}%
            </text>
          </g>
        ))}
        {[...new Set(counts)].map((c) => (
          <text key={c} x={x(c)} y={HEIGHT - M.b + 16} textAnchor="middle" className="fill-ink-faint font-mono text-2xs">
            {c}
          </text>
        ))}
        <text x={(M.l + width - M.r) / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-ink-muted text-xs">
          Number of relays
        </text>
        {minShare != null && (
          <line
            x1={M.l}
            x2={width - M.r}
            y1={y(minShare * 100)}
            y2={y(minShare * 100)}
            className="stroke-ink-muted"
            strokeDasharray="2 5"
          />
        )}
        <polyline
          points={line.map((r) => `${x(r.relays)},${y(r.share * 100)}`).join(' ')}
          className="fill-none stroke-relay"
          strokeDasharray="5 4"
          strokeWidth={1.5}
        />
        {rows.map((r) => (
          <circle
            key={r.candidate.id}
            cx={x(r.relays)}
            cy={y(r.share * 100)}
            r={front.has(r) ? 5 : 3}
            className={front.has(r) ? 'fill-relay' : 'fill-none stroke-ink-faint'}
          >
            <title>{`${r.candidate.label}: ${pct(r.share)}, longest gap ${r.gapH.toFixed(1)} h`}</title>
          </circle>
        ))}
        {pick && <circle cx={x(pick.relays)} cy={y(pick.share * 100)} r={10} className="fill-none stroke-ink" strokeWidth={1.5} />}
      </svg>
    </div>
  )
}

function StudyResults({ data, siteIds, names }: { data: RelayStudyData; siteIds: string[]; names: Record<string, string> }) {
  const usable = siteIds.filter((id) => data.site_ids.includes(id))
  const judged = usable.length > 0 ? usable : data.site_ids
  const rows = studyRows(data.candidates, judged)
  const front = new Set(paretoFront(rows, STUDY_OBJECTIVES))
  const [minShare, setMinShare] = useState(data.target ? data.target.min_share * 100 : undefined)
  const [maxGap, setMaxGap] = useState(data.target?.max_gap_h)
  const target = minShare != null && maxGap != null ? { minShare: minShare / 100, maxGapH: maxGap } : undefined
  const pick = target && smallestMeeting(rows, target)
  const table = [...front].sort((a, b) => a.relays - b.relays || b.share - a.share)

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <NumberField label="Target: worst-site contact (%)" value={minShare} min={0} max={100} optional onCommit={setMinShare} />
        <NumberField label="Target: longest gap (h)" value={maxGap} min={0} max={8760} optional onCommit={setMaxGap} />
      </div>
      <p className="max-w-[68ch] text-lg text-pretty">
        {!target
          ? 'Set a target to see the smallest tested configuration that meets it.'
          : pick
            ? `Of the ${data.search.candidates_tested} configurations tested, ${pick.candidate.label} is the smallest that meets this target at every chosen site.`
            : `None of the ${data.search.candidates_tested} configurations tested meets this target at every chosen site.`}
      </p>
      {data.target && <p className="text-xs text-ink-faint">Preloaded target source: {data.target.source}.</p>}
      <StudyPlot rows={rows} front={front} pick={pick} minShare={target?.minShare} />
      <TableScroll label="Configurations no other tested option beats">
        <table className="w-full min-w-[36rem] border-collapse">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="sticky left-0 bg-bg pb-2 text-left font-normal">Not beaten by another tested configuration</th>
              <th className="pb-2 text-right font-normal">Relays</th>
              <th className="pb-2 text-right font-normal">Worst-site contact</th>
              <th className="pb-2 text-right font-normal">Longest gap</th>
              <th className="pb-2 text-right font-normal">Meets target</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.candidate.id} className="border-t border-line">
                <td className="sticky left-0 bg-bg py-2">
                  {r.candidate.label} <span className="text-ink-muted">{r.candidate.family}</span>
                </td>
                <td className="readout py-2 text-right font-normal">{r.relays}</td>
                <td className="readout py-2 text-right font-normal">{pct(r.share)}</td>
                <td className="readout py-2 text-right font-normal">{r.gapH.toFixed(1)} h</td>
                <td className="py-2 text-right">
                  {!target ? (
                    '–'
                  ) : r.share >= target.minShare && r.gapH <= target.maxGapH ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckIcon aria-hidden /> Yes
                    </span>
                  ) : (
                    <span className="text-ink-muted">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="text-xs text-ink-faint">
        Search: {data.search.method}, {data.search.bounds}. Judged on: {judged.map((id) => names[id] ?? id).join(', ')}.
      </p>
    </div>
  )
}

export function RelayStudy({ siteIds, names }: { siteIds: string[]; names: Record<string, string> }) {
  const feed = useFeed('relay-study')
  return (
    <FeedFrame
      feed={feed}
      title="What if we designed the relays?"
      what="A what-if over tested relay configurations: how many relays against coverage, and which options no other tested option beats."
      limit={`A what-if study under stated assumptions, not a sizing requirement. ${LINE_OF_SIGHT}`}
    >
      {(data) => <StudyResults data={data} siteIds={siteIds} names={names} />}
    </FeedFrame>
  )
}
