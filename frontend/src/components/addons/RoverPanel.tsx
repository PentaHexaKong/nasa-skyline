import { Badge } from '@cloudflare/kumo/components/badge'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { RoverReach as RoverServiceCheck } from '~/components/addons/RoverReach'
import type { Plan } from '~/components/planner/plan'
import { Fig, rgbOf, ScaleBar, TerrainMap, type Tint, useDark, useTerrain, type View } from '~/components/scene/terrain'
import type { Terrain } from '~/lib/data'
import { ROVER_TERMS } from '~/lib/roverLive'
import { areaByDay, type RoverSimInput, type RoverSimResult, skySamples } from '~/lib/roverSim'
import { useRoverSim } from '~/lib/useRoverSim'
import { useTracks } from '~/lib/useTracks'
import { ComputingMark } from './Computing'

const WHOLE: View = { east: 0, north: 0, half: 10000 }
const km = (x: number) => (x < 10 ? x.toFixed(1) : x.toFixed(0))
const hrs = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`)

type Run = { status: 'running'; progress: number } | { status: 'ready'; result: RoverSimResult } | { status: 'error'; message: string }
const asRun = (s: ReturnType<typeof useRoverSim>): Run => ('progress' in s ? { status: 'running', progress: s.progress } : s)

/** The sim input for the plan's site and stay, direct contact with Earth only. Memoised by its parts. */
function useSimInput(terrain: Terrain | null, tracks: ReturnType<typeof useTracks>, plan: Plan) {
  const startMs = plan.window.start
  const stayS = Math.round((plan.window.end - startMs) / 1000)
  // ponytail: phones simulate on cells twice as coarse; the whole tile still fits in about a quarter of the time.
  const stride = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 8 : 4
  return useMemo<RoverSimInput | undefined>(() => {
    if (!terrain || !tracks) return undefined
    return {
      terrain,
      startMs,
      stayS,
      ...skySamples(tracks, startMs, Math.ceil(stayS / 86400)),
      speedMps: ROVER_TERMS.speedMps,
      maxSlopeDeg: ROVER_TERMS.maximumSlopeDeg,
      stride,
    }
  }, [terrain, tracks, startMs, stayS, stride])
}

/** Rover reach for the plan, simulated in the browser over the whole terrain tile and the whole stay. */
export function RoverPanel({ plan }: { plan: Plan }) {
  const siteId = plan.focus ?? ''
  return (
    <div className="grid gap-8">
      <RoverResult plan={plan} />
      <section aria-labelledby="rover-check" className="grid gap-3">
        <div className="grid gap-1">
          <h3 id="rover-check" className="font-medium">
            Check against the rover service
          </h3>
          <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
            A separate model on the mission-science engine: the nine 80 m squares around the landing, for the first 2 hours, direct contact
            only. Where both cover the same ground they should broadly agree.
          </p>
        </div>
        <RoverServiceCheck key={siteId} plan={plan} />
      </section>
    </div>
  )
}

/** Rover reach for the plan, simulated in the browser over the whole terrain tile and the whole stay. */
function RoverResult({ plan }: { plan: Plan }) {
  const siteId = plan.focus ?? ''
  const terrain = useTerrain(siteId)
  const tracks = useTracks(siteId)
  const best = asRun(useRoverSim(useSimInput(terrain, tracks, plan)))
  const [view, setView] = useState<'map' | 'days'>('map')
  const days = Math.max(1, Math.round((plan.window.end - plan.window.start) / 86_400_000))

  if (best.status === 'error')
    return (
      <section className="flex gap-3 rounded-xl border border-line-strong px-4 py-3.5">
        <span className="flex h-lh items-center">
          <WarningCircleIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </span>
        <p className="text-sm text-ink-muted">The rover simulation failed: {best.message}</p>
      </section>
    )

  const ready = best.status === 'ready' ? best.result : null
  const progress = best.status === 'running' ? best.progress : 1

  return (
    <section aria-labelledby="rover-result" aria-busy={!ready} className="grid gap-5 rounded-xl border border-line px-5 py-4 lg:py-5">
      <div className="flex items-start gap-5">
        {!ready && <ComputingMark kind="rover" className="mt-1 max-sm:hidden" />}
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Computed from LOLA terrain, not validated</Badge>
          </div>
          <h2 id="rover-result" className="text-xl leading-snug font-medium text-balance">
            {!ready
              ? 'Working out how far a rover could go…'
              : ready.summary.cellsReached <= 1
                ? 'A rover can’t set off from this landing'
                : `Over the ${days}-day stay a rover could reach ground across ${km(ready.summary.areaKm2)} km², up to ${km(ready.summary.farthestKm)} km from the landing`}
          </h2>
          <p className="max-w-[68ch] text-sm text-ink-muted text-pretty">
            {!ready ? (
              <>
                Simulating every cell of the 20 km terrain tile, hour by hour ·{' '}
                <span className="tabular">{Math.round(progress * 100)} %</span>
              </>
            ) : ready.summary.cellsReached <= 1 ? (
              'The landing spot is never both lit and in contact with Earth long enough to leave, so this model keeps the rover there. Try another landing time from Dates.'
            ) : (
              <>
                {!ready.startAdmitted && 'At landing the spot is not yet both lit and in contact, so the rover waits before it sets off. '}
                On the way to the farthest point it drives for {hrs(ready.summary.drivingH)} and waits {hrs(ready.summary.waitingH)} for
                sunlight and contact.
              </>
            )}
          </p>
          {!ready && (
            <div aria-hidden className="h-0.5 max-w-64 overflow-hidden rounded-full bg-line">
              {/* Grows by scale, not width, so each step of the simulation glides instead of jumping. */}
              <div
                className="h-full origin-left bg-ink transition-[scale] duration-300 ease-out motion-reduce:transition-none"
                style={{ scale: `${progress} 1` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="grid gap-1.5">
          <span id="rover-view" className="text-sm text-ink-muted">
            View
          </span>
          <Tabs
            aria-labelledby="rover-view"
            variant="segmented"
            size="sm"
            tabs={[
              { value: 'map', label: 'Map' },
              { value: 'days', label: 'Days' },
            ]}
            value={view}
            onValueChange={(v) => setView(v as 'map' | 'days')}
          />
        </div>
      </div>

      {terrain && view === 'map' ? (
        <ReachMap terrain={terrain} direct={ready} stayS={days * 86400} />
      ) : view === 'days' && ready ? (
        <ReachDays direct={ready} days={days} />
      ) : (
        <div aria-hidden className="skeleton-line aspect-square w-full max-w-[36rem] rounded-md" />
      )}

      <div className="grid gap-1.5 border-t border-line pt-4">
        <h3 className="text-sm font-medium">How this is computed</h3>
        <ul className="grid max-w-[72ch] list-disc gap-1 pl-4 text-sm text-ink-muted text-pretty">
          <li>
            The rover drives at {ROVER_TERMS.speedMps} m/s on ground no steeper than {ROVER_TERMS.maximumSlopeDeg}°, and only while the
            ground it is on and the ground it moves to are lit and in contact with Earth. It waits anywhere.
          </li>
          <li>Shadows and Earth’s view come from terrain inside the 20 km tile only; hills beyond it are left out.</li>
          <li>
            Contact means Earth in view from each square, judged square by square; relays are left out until the engine can evaluate them
            position by position. Light and contact are checked once an hour, and a move must fit inside hours that allow it.
          </li>
          <li>
            Battery, heat, rocks and holes smaller than the terrain map, and route finding are left out. Read reachable as possible, not
            safe.
          </li>
        </ul>
      </div>
    </section>
  )
}

/** Earliest arrival as a tint on the terrain: brighter is sooner. */
function ReachMap({ terrain, direct, stayS }: { terrain: Terrain; direct: RoverSimResult | null; stayS: number }) {
  const dark = useDark()
  const palette = useMemo(() => ({ comms: rgbOf('--comms') }), [dark])
  const cell = (r: RoverSimResult, col: number, row: number) =>
    Math.min(r.g - 1, Math.round(row / r.stride)) * r.g + Math.min(r.g - 1, Math.round(col / r.stride))
  const tint: Tint = (col, row) => {
    const d = direct ? (direct.arrivalS[cell(direct, col, row)] as number) : Number.POSITIVE_INFINITY
    if (Number.isFinite(d)) return [...palette.comms, 0.75 - 0.5 * Math.min(1, d / stayS)]
    return undefined
  }
  return (
    <figure className="grid gap-2.5">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
        <TerrainMap
          terrain={terrain}
          view={WHOLE}
          tint={tint}
          stamp={`${direct?.summary.cellsReached}`}
          label="Where a rover could reach over the stay, on shaded terrain"
        >
          <path d="M-260 0H260M0 -260V260" className="stroke-ink" strokeWidth={70} />
          <ScaleBar view={WHOLE} metres={5000} />
        </TerrainMap>
        <ul className="grid content-start gap-2 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-5 bg-comms" />
            Reachable, brighter sooner
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="text-ink">
              +
            </span>
            The landing
          </li>
        </ul>
      </div>
      <Fig>The whole 20 km terrain tile, north up, shaded relief lit from the north-west by convention, not by the Sun.</Fig>
    </figure>
  )
}

/** Area reached by the end of each day. */
function ReachDays({ direct, days }: { direct: RoverSimResult; days: number }) {
  const a = areaByDay(direct, days)
  const top = Math.max(1, ...a)
  const W = 640
  const H = 280
  const L = 44
  const B = 28
  const x = (d: number) => L + (d / days) * (W - L - 8)
  const y = (v: number) => H - B - (v / top) * (H - B - 12)
  const line = (vs: number[]) => vs.map((v, d) => `${d ? 'L' : 'M'}${x(d)} ${y(v)}`).join('')
  const ticks = [0, top / 2, top]
  return (
    <figure className="grid max-w-[44rem] gap-2.5">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Area reached by day: ${km(a.at(-1) ?? 0)} km² by the end of the stay`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="stroke-line" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="readout fill-ink-faint text-[11px]">
              {km(t)}
            </text>
          </g>
        ))}
        {Array.from({ length: days + 1 }, (_, d) => d)
          .filter((d) => d % Math.max(1, Math.ceil(days / 7)) === 0 || d === days)
          .map((d) => (
            <text
              key={d}
              x={x(d)}
              y={H - 8}
              textAnchor={d === 0 ? 'start' : d === days ? 'end' : 'middle'}
              className="readout fill-ink-faint text-[11px]"
            >
              {d === 0 ? 'landing' : `day ${d}`}
            </text>
          ))}
        <path d={line(a)} className="fill-none stroke-comms" strokeWidth={2} />
      </svg>
      <Fig>
        Ground the rover could have reached by the end of each day, in km². Flat stretches are days the rover spends waiting for sunlight or
        contact.
      </Fig>
    </figure>
  )
}
