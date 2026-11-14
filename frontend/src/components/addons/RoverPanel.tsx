import { Badge } from '@cloudflare/kumo/components/badge'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { RoverReach as RoverServiceCheck } from '~/components/addons/RoverReach'
import type { Plan } from '~/components/planner/plan'
import { Fig, rgbOf, ScaleBar, TerrainMap, type Tint, useDark, useTerrain, type View } from '~/components/scene/terrain'
import type { Terrain } from '~/lib/data'
import type { Span } from '~/lib/mission'
import { contactSpans, RELAY_MAX_S, suggestedRelays, useRelayLadder } from '~/lib/relayLive'
import { ROVER_TERMS } from '~/lib/roverLive'
import { areaByDay, type RoverSimInput, type RoverSimResult, skySamples } from '~/lib/roverSim'
import { useRoverSim } from '~/lib/useRoverSim'
import { useTracks } from '~/lib/useTracks'

const COUNTS = [0, 1, 2, 3, 4] as const
const WHOLE: View = { east: 0, north: 0, half: 10000 }
const km = (x: number) => (x < 10 ? x.toFixed(1) : x.toFixed(0))
const hrs = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`)

type Run = { status: 'running'; progress: number } | { status: 'ready'; result: RoverSimResult } | { status: 'error'; message: string }
const asRun = (s: ReturnType<typeof useRoverSim>): Run => ('progress' in s ? { status: 'running', progress: s.progress } : s)

/** The sim input for the plan's site and stay; `relaySpans` empty for direct contact only. Memoised by its parts. */
function useSimInput(terrain: Terrain | null, tracks: ReturnType<typeof useTracks>, plan: Plan, relaySpans: Span[] | null) {
  const startMs = plan.window.start
  const stayS = Math.round((plan.window.end - startMs) / 1000)
  // ponytail: phones simulate on cells twice as coarse; the whole tile still fits in about a quarter of the time.
  const stride = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 8 : 4
  return useMemo<RoverSimInput | undefined>(() => {
    if (!terrain || !tracks || !relaySpans) return undefined
    return {
      terrain,
      startMs,
      stayS,
      ...skySamples(tracks, startMs, Math.ceil(stayS / 86400)),
      relaySpans,
      speedMps: ROVER_TERMS.speedMps,
      maxSlopeDeg: ROVER_TERMS.maximumSlopeDeg,
      stride,
    }
  }, [terrain, tracks, startMs, stayS, relaySpans, stride])
}

const NO_RELAYS: Span[] = []

/** Rover reach for the plan, simulated in the browser over the whole terrain tile and the whole stay. */
export function RoverPanel({ plan }: { plan: Plan }) {
  const siteId = plan.focus ?? ''
  const [relays, setRelays] = useState(0)
  return (
    <div className="grid gap-8">
      {relays === 0 ? (
        <RoverResult plan={plan} relays={0} setRelays={setRelays} relaySpans={NO_RELAYS} />
      ) : (
        <WithRelays plan={plan} relays={relays} setRelays={setRelays} />
      )}
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

/** Loads the relay comparison, then simulates with relay-only contact for the chosen number of relays. */
function WithRelays({ plan, relays, setRelays }: { plan: Plan; relays: number; setRelays: (n: number) => void }) {
  const stayS = Math.round((plan.window.end - plan.window.start) / 1000)
  const load = useRelayLadder(plan.focus ?? '', plan.window.start, stayS)
  const track = load.status === 'ready' ? load.ladder.track : null
  // Relay links only: direct contact is judged cell by cell from the terrain, not taken from the landing site.
  const relaySpans = useMemo(
    () => (track ? contactSpans({ ...track, direct: track.direct.map(() => false) }, relays) : null),
    [track, relays],
  )
  const suggested = load.status === 'ready' ? suggestedRelays(load.ladder.steps) : undefined
  const waiting =
    load.status === 'unavailable'
      ? load.message
      : load.status === 'loading'
        ? 'Loading relay coverage for your stay. It takes up to a minute.'
        : stayS > RELAY_MAX_S
          ? `Relay coverage is computed for the first ${RELAY_MAX_S / 86400} days; after that the rover has direct contact only.`
          : undefined
  return <RoverResult plan={plan} relays={relays} setRelays={setRelays} relaySpans={relaySpans} suggested={suggested} note={waiting} />
}

function RoverResult({
  plan,
  relays,
  setRelays,
  relaySpans,
  suggested,
  note,
}: {
  plan: Plan
  relays: number
  setRelays: (n: number) => void
  relaySpans: Span[] | null
  suggested?: number
  note?: string
}) {
  const siteId = plan.focus ?? ''
  const terrain = useTerrain(siteId)
  const tracks = useTracks(siteId)
  const direct = asRun(useRoverSim(useSimInput(terrain, tracks, plan, NO_RELAYS)))
  const relayed = asRun(useRoverSim(useSimInput(terrain, tracks, plan, relays > 0 ? relaySpans : null)))
  const best = relays > 0 ? relayed : direct
  const [view, setView] = useState<'map' | 'days'>('map')
  const days = Math.max(1, Math.round((plan.window.end - plan.window.start) / 86_400_000))

  if (direct.status === 'error' || best.status === 'error')
    return (
      <section className="flex gap-3 rounded-xl border border-line-strong px-4 py-3.5">
        <span className="flex h-lh items-center">
          <WarningCircleIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </span>
        <p className="text-sm text-ink-muted">
          The rover simulation failed: {direct.status === 'error' ? direct.message : best.status === 'error' ? best.message : ''}
        </p>
      </section>
    )

  const ready = best.status === 'ready' ? best.result : null
  const base = direct.status === 'ready' ? direct.result : null
  const progress = best.status === 'running' ? best.progress : 1

  return (
    <section aria-labelledby="rover-result" aria-busy={!ready} className="grid gap-5 rounded-xl border border-line px-5 py-4 lg:py-5">
      <div className="grid gap-2">
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
            note && relays > 0 && relaySpans === null ? (
              note
            ) : (
              <>
                Simulating every cell of the 20 km terrain tile, hour by hour ·{' '}
                <span className="tabular">{Math.round(progress * 100)} %</span>
              </>
            )
          ) : ready.summary.cellsReached <= 1 ? (
            'The landing spot is never both lit and in contact with Earth long enough to leave, so this model keeps the rover there. Try another landing time from Dates.'
          ) : (
            <>
              {!ready.startAdmitted && 'At landing the spot is not yet both lit and in contact, so the rover waits before it sets off. '}
              On the way to the farthest point it drives for {hrs(ready.summary.drivingH)} and waits {hrs(ready.summary.waitingH)} for
              sunlight and contact.
              {relays > 0 &&
                base &&
                ` Relays add ${km(Math.max(0, ready.summary.areaKm2 - base.summary.areaKm2))} km² to direct contact alone.`}
              {note && relays > 0 ? ` ${note}` : ''}
            </>
          )}
        </p>
        {!ready && (
          <div aria-hidden className="h-0.5 max-w-64 bg-line">
            <div className="h-full bg-ink" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="grid gap-1.5">
          <span id="rover-relays" className="text-sm text-ink-muted">
            Relays{suggested !== undefined && <span className="text-ink-faint"> · comparison suggests {suggested}</span>}
          </span>
          <Tabs
            aria-labelledby="rover-relays"
            variant="segmented"
            size="sm"
            tabs={COUNTS.map((n) => ({ value: String(n), label: n === 0 ? 'None' : String(n) }))}
            value={String(relays)}
            onValueChange={(v) => setRelays(Number(v))}
          />
        </div>
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
        <ReachMap terrain={terrain} direct={base} relayed={relays > 0 && ready ? ready : null} stayS={days * 86400} />
      ) : view === 'days' && base ? (
        <ReachDays direct={base} relayed={relays > 0 && ready ? ready : null} days={days} />
      ) : (
        <div className="aspect-square w-full max-w-[36rem] outline -outline-offset-1 outline-line" />
      )}

      <div className="grid gap-1.5 border-t border-line pt-4">
        <h3 className="text-sm font-medium">How this is computed</h3>
        <ul className="grid max-w-[72ch] list-disc gap-1 pl-4 text-sm text-ink-muted text-pretty">
          <li>
            The rover drives at {ROVER_TERMS.speedMps} m/s on ground no steeper than {ROVER_TERMS.maximumSlopeDeg}°, and only while the
            ground it is on and the ground it moves to are lit and in contact with Earth. It waits anywhere.
          </li>
          <li>Shadows and Earth’s view come from terrain inside the 20 km tile only; hills beyond it are left out.</li>
          <li>Relay contact is taken at the landing site and applied across the tile. Light and contact are checked once an hour.</li>
          <li>
            Battery, heat, rocks and holes smaller than the terrain map, and route finding are left out. Read reachable as possible, not
            safe.
          </li>
        </ul>
      </div>
    </section>
  )
}

/** Earliest arrival as a tint on the terrain: brighter is sooner; relay stripes where only relays get the rover there. */
function ReachMap({
  terrain,
  direct,
  relayed,
  stayS,
}: {
  terrain: Terrain
  direct: RoverSimResult | null
  relayed: RoverSimResult | null
  stayS: number
}) {
  const dark = useDark()
  const palette = useMemo(() => ({ comms: rgbOf('--comms'), relay: rgbOf('--relay') }), [dark])
  const cell = (r: RoverSimResult, col: number, row: number) =>
    Math.min(r.g - 1, Math.round(row / r.stride)) * r.g + Math.min(r.g - 1, Math.round(col / r.stride))
  const tint: Tint = (col, row, px, py) => {
    const d = direct ? (direct.arrivalS[cell(direct, col, row)] as number) : Number.POSITIVE_INFINITY
    if (Number.isFinite(d)) return [...palette.comms, 0.75 - 0.5 * Math.min(1, d / stayS)]
    const r = relayed ? (relayed.arrivalS[cell(relayed, col, row)] as number) : Number.POSITIVE_INFINITY
    if (Number.isFinite(r)) return (px + py) % 6 < 3 ? [...palette.relay, 0.75] : undefined
    return undefined
  }
  return (
    <figure className="grid gap-2.5">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
        <TerrainMap
          terrain={terrain}
          view={WHOLE}
          tint={tint}
          stamp={`${direct?.summary.cellsReached}-${relayed?.summary.cellsReached}`}
          label="Where a rover could reach over the stay, on shaded terrain"
        >
          <path d="M-260 0H260M0 -260V260" className="stroke-ink" strokeWidth={70} />
          <ScaleBar view={WHOLE} metres={5000} />
        </TerrainMap>
        <ul className="grid content-start gap-2 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-5 bg-comms" />
            Reached with direct contact, brighter sooner
          </li>
          {relayed && (
            <li className="flex items-center gap-2">
              <span aria-hidden className="lane-relay h-2.5 w-5" />
              Reached only with relays
            </li>
          )}
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

/** Area reached by the end of each day: one line for direct contact, a dashed one with relays. */
function ReachDays({ direct, relayed, days }: { direct: RoverSimResult; relayed: RoverSimResult | null; days: number }) {
  const a = areaByDay(direct, days)
  const b = relayed ? areaByDay(relayed, days) : null
  const top = Math.max(1, ...(b ?? a))
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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Area reached by day: ${km(a.at(-1) ?? 0)} km² direct${b ? `, ${km(b.at(-1) ?? 0)} km² with relays` : ''}`}
      >
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
        {b && <path d={line(b)} className="fill-none stroke-relay" strokeWidth={2} strokeDasharray="5 4" />}
      </svg>
      <Fig>
        Ground the rover could have reached by the end of each day, in km². Flat stretches are days the rover spends waiting for sunlight or
        contact.
      </Fig>
    </figure>
  )
}
