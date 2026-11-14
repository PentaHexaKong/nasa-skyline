import { Badge } from '@cloudflare/kumo/components/badge'
import { WarningCircleIcon } from '@phosphor-icons/react'
import type { Plan } from '~/components/planner/plan'
import { RoverMap } from '~/components/planner/RoverMap'
import { type ReachCell, ROVER_TERMS, useRoverReach } from '~/lib/roverLive'
import { minuteLabel, shortDate } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

const POSITION = ['top left', 'top', 'top right', 'left', 'middle', 'right', 'bottom left', 'bottom', 'bottom right']

const duration = (s: number) => {
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

function Cell({ cell, index }: { cell: ReachCell; index: number }) {
  const where = <span className="sr-only">{POSITION[index]}: </span>
  const slope = 'slopeDeg' in cell && cell.slopeDeg != null ? `${cell.slopeDeg.toFixed(1)}° slope` : null
  const box = 'grid aspect-square content-center justify-items-center gap-0.5 rounded-md p-1 text-center'
  if (cell.kind === 'landing')
    return (
      <li className={`${box} bg-ink text-bg`}>
        {where}
        <span className="text-sm font-medium">Landing</span>
        <span className="tabular text-2xs opacity-70">{slope}</span>
      </li>
    )
  if (cell.kind === 'reached')
    return (
      <li
        className={`${box} ring-1 ring-line ring-inset`}
        // Earlier arrivals read brighter: the fill fades with the share of the two hours used.
        style={{ backgroundColor: `rgb(255 255 255 / ${(0.05 + 0.17 * (1 - cell.arrivalS / ROVER_TERMS.durationS)).toFixed(3)})` }}
      >
        {where}
        <span className="tabular text-base font-medium">{duration(cell.arrivalS)}</span>
        <span className="text-2xs text-ink-muted">to arrive</span>
      </li>
    )
  const word = cell.kind === 'too-steep' ? 'Too steep' : cell.kind === 'no-terrain' ? 'No terrain data' : 'Not within 2 h'
  return (
    <li className={`${box} border border-dashed border-line text-ink-faint`}>
      {where}
      <span className="text-xs">{word}</span>
      {cell.kind === 'too-steep' && slope && <span className="tabular text-2xs">{slope}</span>}
    </li>
  )
}

function Terms() {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
      {(
        [
          ['Speed', `${ROVER_TERMS.speedMps} m/s`],
          ['Steepest slope', `${ROVER_TERMS.maximumSlopeDeg}°`],
          ['Moves', 'Square to square, no diagonals'],
          ['Needs', 'Sun and Earth in view, moving or waiting'],
        ] as const
      ).map(([term, value]) => (
        <div key={term} className="grid gap-0.5">
          <dt className="text-xs text-ink-muted">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Rover reach for the plan's landing: the nine 80 m cells around the site, computed live by the rover service. */
export function RoverReach({ plan }: { plan: Plan }) {
  const siteId = plan.focus ?? ''
  const load = useRoverReach(siteId, plan.window.start)
  const tracks = useTracks(siteId)
  const site = plan.sites.find((s) => s.data.site.id === siteId)?.data.site
  // The Sun and Earth where they stand at the landing minute, from the site's own tracks. Each keeps its own times:
  // the Sun every 10 minutes, Earth every hour.
  const day = tracks?.[plan.date]
  const closest = (t: number[]) =>
    t.reduce((best, v, i) => (Math.abs(v - plan.minute) < Math.abs((t[best] ?? 0) - plan.minute) ? i : best), 0)
  const sun = day ? closest(day.t_min) : -1
  const earth = day?.earth ? closest(day.earth.t_min) : -1
  const sky = {
    sun: day && sun >= 0 ? { az: day.az_deg[sun] ?? 0, el: day.el_deg[sun] ?? 0 } : null,
    earth: day?.earth && earth >= 0 ? { az: day.earth.az_deg[earth] ?? 0, el: day.earth.el_deg[earth] ?? 0 } : null,
  }
  const when = `${shortDate(plan.date)}, ${minuteLabel(plan.minute)} UTC`

  if (load.status === 'unavailable')
    return (
      <section aria-labelledby="rover-result" className="flex gap-3 rounded-xl border border-line-strong px-4 py-3.5">
        <span className="flex h-lh items-center">
          <WarningCircleIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </span>
        <div className="grid gap-1">
          <h2 id="rover-result" className="font-medium">
            Rover reach is unavailable right now
          </h2>
          <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">{load.message}</p>
        </div>
      </section>
    )

  const loading = load.status === 'loading'
  const reach = load.status === 'ready' ? load.reach : null
  const heading = loading
    ? 'Working out where a rover could go…'
    : reach?.kind === 'cannot-start'
      ? 'A rover can’t set off at this landing time'
      : reach?.kind === 'reach' && reach.reached === 0
        ? 'A rover stays on the landing square for the first 2 hours'
        : `A rover could reach ${reach?.kind === 'reach' ? reach.reached : 0} of the 8 squares around the landing point within 2 hours`

  return (
    <section
      aria-labelledby="rover-result"
      aria-busy={loading}
      className="grid gap-x-10 gap-y-6 rounded-xl border border-line px-5 py-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:py-5"
    >
      <figure className="grid w-full content-start gap-2.5">
        {reach?.kind === 'reach' && site && (
          <RoverMap siteId={siteId} site={{ lat: site.lat_deg, lon: site.lon_deg_east }} cells={reach.cells} sky={sky} />
        )}
        {reach?.kind === 'reach' ? (
          <ul aria-label="The nine squares around the landing point" className="sr-only">
            {reach.cells.map((cell, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the nine squares are fixed positions
              <Cell key={i} cell={cell} index={i} />
            ))}
          </ul>
        ) : (
          <div aria-hidden className="grid max-w-64 grid-cols-3 gap-1.5">
            {POSITION.map((p, i) => (
              <div
                key={p}
                className={`grid aspect-square place-items-center rounded-md text-sm font-medium text-bg ${i === 4 ? 'bg-ink/80' : 'bg-white/[0.05]'} ${loading ? 'motion-safe:animate-pulse' : ''}`}
              >
                {i === 4 && !loading && 'Landing'}
              </div>
            ))}
          </div>
        )}
        <figcaption className="text-xs text-ink-muted text-pretty">
          {reach?.kind === 'reach'
            ? `Each square is ${ROVER_TERMS.cellM} m across. Times count from landing, ${when}. Relief and shadows come from NASA’s LOLA terrain, lit as the Sun stands at landing; only terrain within 10 km casts shadow here.`
            : `Each square is ${ROVER_TERMS.cellM} m across, on the lunar terrain map. Times count from landing, ${when}.`}
        </figcaption>
      </figure>

      <div className="grid content-start gap-5">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Computed · prototype model</Badge>
          </div>
          <h2 id="rover-result" className="text-xl leading-snug font-medium text-balance">
            {heading}
          </h2>
          {loading && (
            <p className="text-sm text-ink-muted">The rover service checks every square and every 2 minutes. It takes about 15 seconds.</p>
          )}
          {reach?.kind === 'cannot-start' && (
            <p className="max-w-[68ch] text-sm text-ink-muted text-pretty">
              At {when}, the landing square doesn’t have both the Sun and Earth in view. This model only lets the rover move or wait with
              both, so it never leaves. Try another landing time from Dates.
            </p>
          )}
        </div>
        <Terms />
        <p className="max-w-[72ch] border-t border-line pt-4 text-sm text-ink-muted text-pretty">
          A prototype model from the mission-science engine. It covers the first 2 hours and the nine squares shown, and leaves out battery
          charge, heat, rocks and holes smaller than the 80 m terrain map, and how the rover finds its way. Read a reachable square as
          possible, not safe.
        </p>
      </div>
    </section>
  )
}
