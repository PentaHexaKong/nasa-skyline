import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { scaleLinear } from 'd3-scale'
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { buildModel, cellOf, drive, type Field, type Model, STRIDE } from '~/lib/roverSim'
import { Fig, type Rgb, rgbOf, ScaleBar, TerrainMap, type Tint, useDark, useTerrain, type View } from './terrain'

/**
 * FIXTURE. The terrain and its slopes are real LOLA data; everything else here is invented for the
 * prototype: where a rover is "lit and in contact" (a height band below the site) and how many
 * driving hours each relay scenario allows. The real reach comes from the pipeline (scope item 10).
 */
export const SCENARIOS = [
  { id: 'direct', label: 'Direct to Earth', short: 'Direct', hours: 135, floor: -220 },
  { id: 'pathfinder', label: '+ Pathfinder', short: '+ Pathfinder', hours: 240, floor: -480 },
  { id: 'network', label: '+ Network', short: '+ Network', hours: 291, floor: -900 },
] as const
const MONTH_D = 29.5

export { cellOf, type Field }

type BandModel = Model & { ok: Uint8Array[] }

/** The sim grid plus, per scenario, the invented "lit and in contact" height band. */
function withBands(m: Model): BandModel {
  const site = m.height[((m.g - 1) / 2) * m.g + (m.g - 1) / 2] ?? 0
  return { ...m, ok: SCENARIOS.map((s) => Uint8Array.from(m.height, (h) => (h - site >= s.floor ? 1 : 0))) }
}

export function useRover(maxSlope: number) {
  const terrain = useTerrain()
  const model = useMemo(() => terrain && withBands(buildModel(terrain)), [terrain])
  const fields = useMemo(() => model && SCENARIOS.map((_, i) => drive(model, maxSlope, model.ok[i] as Uint8Array)), [model, maxSlope])
  return { terrain, model, fields }
}

/** Driving distance at a terrain cell, interpolated between model cells so edges and contours come out smooth. */
function distAt(m: Model, dist: Float32Array, col: number, row: number) {
  const fc = Math.min(m.g - 1.001, Math.max(0, col / STRIDE))
  const fr = Math.min(m.g - 1.001, Math.max(0, row / STRIDE))
  const c = Math.floor(fc)
  const r = Math.floor(fr)
  const a = dist[r * m.g + c] as number
  const b = dist[r * m.g + c + 1] as number
  const d = dist[(r + 1) * m.g + c] as number
  const e = dist[(r + 1) * m.g + c + 1] as number
  if (!Number.isFinite(a + b + d + e)) return dist[cellOf(m, col, row)] as number
  const u = fc - c
  const v = fr - r
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + d * (1 - u) * v + e * u * v
}
export const km2 = (m: Model, cells: number) => (cells * m.cell * m.cell) / 1e6
export const reachKm = (speed: number, hours: number) => (speed * hours) / 1000

export function usePalette() {
  const dark = useDark()
  return useMemo(() => ({ comms: rgbOf('--comms'), relay: rgbOf('--relay'), ink: (dark ? [255, 255, 255] : [0, 0, 0]) as Rgb }), [dark])
}

export function Range({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm text-ink-muted">
        {label}{' '}
        <span className="readout text-ink">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-52 accent-(--brand)"
      />
    </label>
  )
}

const WHOLE: View = { east: 0, north: 0, half: 10000 }
const Site = () => <path d="M-260 0H260M0 -260V260" className="stroke-ink" strokeWidth={70} />
const Blank = () => <div className="aspect-square outline -outline-offset-1 outline-line" />
export const Swatch = ({ i }: { i: number }) => (
  <span aria-hidden className={`h-2.5 w-5 self-center ${i === 0 ? 'bg-comms' : i === 1 ? 'lane-relay' : 'lane-relay opacity-50'}`} />
)

/** 1. The answer is an area: three nested footprints on the terrain, one per relay scenario. */
export function RoverReach() {
  const [speed, setSpeed] = useState(40)
  const [maxSlope, setMaxSlope] = useState(15)
  const { terrain, model, fields } = useRover(maxSlope)
  const palette = usePalette()
  if (!terrain || !model || !fields) return <Blank />
  const limits = SCENARIOS.map((s) => reachKm(speed, s.hours))
  const level = (col: number, row: number) => fields.findIndex((f, k) => distAt(model, f.dist, col, row) <= (limits[k] as number))
  const tint: Tint = (col, row, px, py) => {
    const l = level(col, row)
    if (l === 0) return [...palette.comms, 0.62]
    if (l === 1) return (px + py) % 6 < 3 ? [...palette.relay, 0.7] : undefined
    if (l === 2) return (px + py) % 12 < 2 ? [...palette.relay, 0.7] : undefined
    return undefined
  }
  const areas = SCENARIOS.map((_, k) =>
    km2(
      model,
      (fields[k] as Field).dist.reduce((n, d) => n + (d <= (limits[k] as number) ? 1 : 0), 0),
    ),
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Range label="Average speed" value={speed} unit=" m/h" min={10} max={100} step={5} onChange={setSpeed} />
        <Range label="Steepest slope it will take" value={maxSlope} unit="°" min={5} max={25} step={1} onChange={setMaxSlope} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <TerrainMap
            terrain={terrain}
            view={WHOLE}
            tint={tint}
            stamp={`${speed}-${maxSlope}-${palette.ink[0]}`}
            label="Ground a rover could reach in one lunar month, for each relay scenario"
          >
            <Site />
            <ScaleBar view={WHOLE} metres={2000} />
          </TerrainMap>
          <Fig>
            Shaded relief of the 10 km around the site, north up. Solid is reach with direct contact only; hatching is what each relay adds.
          </Fig>
        </div>
        <div className="grid content-start gap-5">
          <p className="max-w-[40ch] text-xl text-pretty">
            Relays take the reach from <span className="tabular">{(areas[0] as number).toFixed(1)}</span> to{' '}
            <span className="tabular">{(areas[2] as number).toFixed(1)} km²</span> in one lunar month.
          </p>
          <dl className="grid max-w-md">
            {SCENARIOS.map((s, i) => (
              <div key={s.id} className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-3">
                <Swatch i={i} />
                <dt>{s.label}</dt>
                <dd className="readout text-right">
                  {(areas[i] as number).toFixed(1)} km²
                  <span className="block text-xs font-normal text-ink-muted">
                    {s.hours} h driving, {(limits[i] as number).toFixed(1)} km
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

const CH = { w: 520, h: 300, l: 44, r: 12, t: 12, b: 36 }

/** 2. The answer is a pace: the footprint growing day by day, with a five-day contour behind it. */
export function RoverDays() {
  const [speed, setSpeed] = useState(40)
  const [pick, setPick] = useState(1)
  const [day, setDay] = useState(MONTH_D)
  const [playing, setPlaying] = useState(false)
  const { terrain, model, fields } = useRover(15)
  const palette = usePalette()
  const frame = useRef(0)

  useEffect(() => {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true)
  }, [])
  useEffect(() => {
    if (!playing) return
    const t0 = performance.now()
    const tick = (now: number) => {
      const d = Math.min(MONTH_D, ((now - t0) / 6000) * MONTH_D)
      setDay(Math.round(d * 4) / 4)
      if (d < MONTH_D) frame.current = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [playing])

  const sorted = useMemo(() => fields?.map((f) => Float32Array.from(f.dist).filter(Number.isFinite).sort()), [fields])
  if (!terrain || !model || !fields || !sorted) return <Blank />
  const scenario = SCENARIOS[pick] as (typeof SCENARIOS)[number]
  const field = fields[pick] as Field
  const full = reachKm(speed, scenario.hours)
  const dayOf = (col: number, row: number) => (distAt(model, field.dist, col, row) / full) * MONTH_D
  const tint: Tint = (col, row, px, py) => {
    const d = dayOf(col, row)
    if (!(d <= MONTH_D)) return undefined
    const band = Math.floor(d / 5)
    if (band !== Math.floor(dayOf(col + 2, row) / 5) || band !== Math.floor(dayOf(col, row + 2) / 5)) return [...palette.ink, 0.85]
    if (d > day) return [...palette.ink, 0.07]
    const rgb = pick === 0 ? palette.comms : palette.relay
    return pick === 0 || (px + py) % 6 < 3 ? [...rgb, 0.62] : undefined
  }
  const count = (k: number, km: number) => {
    const a = sorted[k] as Float32Array
    let lo = 0
    let hi = a.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((a[mid] as number) <= km) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const area = (k: number, d: number) =>
    km2(model, count(k, (reachKm(speed, (SCENARIOS[k] as (typeof SCENARIOS)[number]).hours) * d) / MONTH_D))
  const days = Array.from({ length: 60 }, (_, i) => (i / 59) * MONTH_D)
  const x = scaleLinear([0, MONTH_D], [CH.l, CH.w - CH.r])
  const y = scaleLinear([0, area(2, MONTH_D) * 1.05], [CH.h - CH.b, CH.t]).nice()
  const scrub = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setPlaying(false)
    setDay(Math.max(0, Math.min(MONTH_D, Math.round(x.invert(((e.clientX - box.left) / box.width) * CH.w) * 4) / 4)))
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="grid gap-1.5">
          <span id="proto-rover-s" className="text-sm text-ink-muted">
            Relays
          </span>
          <ButtonGroup aria-labelledby="proto-rover-s">
            {SCENARIOS.map((s, i) => (
              <Button key={s.id} variant={i === pick ? 'primary' : 'secondary'} aria-pressed={i === pick} onClick={() => setPick(i)}>
                {s.short}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <Range label="Average speed" value={speed} unit=" m/h" min={10} max={100} step={5} onChange={setSpeed} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <TerrainMap
          terrain={terrain}
          view={WHOLE}
          tint={tint}
          stamp={`${speed}-${pick}-${day}-${palette.ink[0]}`}
          label={`Ground reached by day ${day.toFixed(1)} with ${scenario.label}`}
        >
          <Site />
          <ScaleBar view={WHOLE} metres={2000} />
        </TerrainMap>
        <div className="grid content-start gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              shape="square"
              aria-label={playing ? 'Pause' : 'Play the month'}
              onClick={() => {
                if (!playing && day >= MONTH_D) setDay(0)
                setPlaying(!playing)
              }}
            >
              {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
            </Button>
            <p>
              <span className="readout text-2xl">Day {day.toFixed(1)}</span>{' '}
              <span className="text-lg text-ink-muted">
                · <span className="tabular text-ink">{area(pick, day).toFixed(1)} km²</span> reached
              </span>
            </p>
          </div>
          <svg
            viewBox={`0 0 ${CH.w} ${CH.h}`}
            role="img"
            aria-label="Area reached against days since landing, for each relay scenario"
            className="block w-full cursor-ew-resize touch-none overflow-visible"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              scrub(e)
            }}
            onPointerMove={(e) => e.buttons && scrub(e)}
          >
            {y.ticks(4).map((v) => (
              <g key={v}>
                <line x1={CH.l} x2={CH.w - CH.r} y1={y(v)} y2={y(v)} className="stroke-grid" />
                <text x={CH.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-faint font-mono text-2xs">
                  {v}
                </text>
              </g>
            ))}
            {[0, 5, 10, 15, 20, 25].map((d) => (
              <text key={d} x={x(d)} y={CH.h - CH.b + 16} textAnchor="middle" className="fill-ink-faint font-mono text-2xs">
                {d}
              </text>
            ))}
            <text x={(CH.l + CH.w - CH.r) / 2} y={CH.h - 2} textAnchor="middle" className="fill-ink-muted text-xs">
              Days since landing
            </text>
            {SCENARIOS.map((s, k) => (
              <polyline
                key={s.id}
                points={days.map((d) => `${x(d)},${y(area(k, d))}`).join(' ')}
                className={`fill-none ${k === 0 ? 'stroke-comms' : 'stroke-relay'}`}
                strokeWidth={k === pick ? 2.5 : 1.25}
                strokeDasharray={k === 0 ? undefined : k === 1 ? '6 3' : '2 3'}
                opacity={k === pick ? 1 : 0.6}
              />
            ))}
            <line x1={x(day)} x2={x(day)} y1={CH.t} y2={CH.h - CH.b} className="stroke-now" />
            <circle cx={x(day)} cy={y(area(pick, day))} r={4.5} className="fill-bg stroke-ink" strokeWidth={1.5} />
          </svg>
          <Fig>
            Area in km². White lines on the map are five-day steps; the faint ground beyond the colour is still to come this month. Drag the
            chart to move through the month.
          </Fig>
        </div>
      </div>
    </div>
  )
}

const PR = { w: 640, h: 230, l: 48, r: 12, t: 14, b: 8 }

/** 3. The answer is a route: pick a destination, read the drive as a section with contact along it. */
export function RoverCorridor() {
  const [speed, setSpeed] = useState(40)
  const [maxSlope, setMaxSlope] = useState(15)
  const [target, setTarget] = useState<number>()
  const { terrain, model, fields } = useRover(maxSlope)
  if (!terrain || !model || !fields) return <Blank />
  const field = fields[2] as Field
  // Default destination: the farthest cell inside 5 km of driving.
  const goal =
    target ??
    field.dist.reduce(
      (best, d, i) => (d <= 5 && d > (field.dist[best] as number) ? i : best),
      ((model.g - 1) / 2) * model.g + (model.g - 1) / 2,
    )
  const path: number[] = []
  if (Number.isFinite(field.dist[goal])) for (let i = goal; i >= 0; i = field.prev[i] as number) path.unshift(i)
  const east = (i: number) => (i % model.g) * model.cell - model.half
  const south = (i: number) => Math.floor(i / model.g) * model.cell - model.half
  const km = path.map((i) => field.dist[i] as number)
  const total = km.at(-1) ?? 0
  const heights = path.map((i) => model.height[i] as number)
  const x = scaleLinear([0, total || 1], [PR.l, PR.w - PR.r])
  const y = scaleLinear([Math.min(...heights) - 20, Math.max(...heights) + 20], [PR.h - PR.b, PR.t])
  const steepest = Math.max(0, ...path.map((i) => model.slope[i] as number))
  const share = (k: number) => path.filter((i) => (model.ok[k] as Uint8Array)[i]).length / (path.length || 1)
  const runs = (k: number) => {
    const out: [number, number][] = []
    path.forEach((i, n) => {
      if (!(model.ok[k] as Uint8Array)[i]) return
      const a = km[Math.max(0, n - 1)] as number
      const last = out.at(-1)
      if (last && last[1] >= a) last[1] = km[n] as number
      else out.push([a, km[n] as number])
    })
    return out
  }
  const choose = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const c = Math.round(((e.clientX - box.left) / box.width) * (model.g - 1))
    const r = Math.round(((e.clientY - box.top) / box.height) * (model.g - 1))
    setTarget(r * model.g + c)
  }
  const tint: Tint = (col, row) => ((model.slope[cellOf(model, col, row)] as number) > maxSlope ? [128, 128, 128, 0.3] : undefined)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Range label="Average speed" value={speed} unit=" m/h" min={10} max={100} step={5} onChange={setSpeed} />
        <Range label="Steepest slope it will take" value={maxSlope} unit="°" min={5} max={25} step={1} onChange={setMaxSlope} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <TerrainMap terrain={terrain} view={WHOLE} tint={tint} stamp={maxSlope} label="Pick a destination on the terrain">
            <rect
              x={-model.half}
              y={-model.half}
              width={2 * model.half}
              height={2 * model.half}
              className="cursor-crosshair fill-transparent"
              onPointerDown={choose}
            />
            <polyline
              points={path.map((i) => `${east(i)},${south(i)}`).join(' ')}
              className="pointer-events-none fill-none stroke-ink"
              strokeWidth={110}
              strokeLinejoin="round"
            />
            <Site />
            <circle cx={east(goal)} cy={south(goal)} r={280} className="pointer-events-none fill-bg stroke-ink" strokeWidth={90} />
          </TerrainMap>
          <Fig>Click anywhere to set the destination. Grey ground is steeper than the rover will take.</Fig>
        </div>
        {path.length < 2 ? (
          <p className="text-xl text-pretty">No route to that point under a {maxSlope}° slope limit. Pick another, or raise the limit.</p>
        ) : (
          <div className="grid content-start gap-5">
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              {[
                ['Drive', `${total.toFixed(1)} km`],
                ['Driving time', `${((total * 1000) / speed).toFixed(0)} h`],
                ['Steepest', `${steepest.toFixed(0)}°`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-ink-muted">{k}</dt>
                  <dd className="readout text-2xl">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <svg viewBox={`0 0 ${PR.w} ${PR.h}`} role="img" aria-label="Height along the route" className="block w-full overflow-visible">
                {y.ticks(4).map((v) => (
                  <g key={v}>
                    <line x1={PR.l} x2={PR.w - PR.r} y1={y(v)} y2={y(v)} className="stroke-grid" />
                    <text x={PR.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-faint font-mono text-2xs">
                      {v} m
                    </text>
                  </g>
                ))}
                <path
                  d={`M${x(0)} ${PR.h - PR.b}${path.map((_, n) => `L${x(km[n] as number)} ${y(heights[n] as number)}`).join('')}L${x(total)} ${PR.h - PR.b}Z`}
                  className="fill-terrain stroke-terrain-edge"
                />
              </svg>
              <div className="grid gap-1.5" style={{ paddingLeft: `${(PR.l / PR.w) * 100}%`, paddingRight: `${(PR.r / PR.w) * 100}%` }}>
                {SCENARIOS.map((s, k) => (
                  <div key={s.id} className="relative h-3 outline -outline-offset-1 outline-line">
                    {runs(k).map(([a, b]) => (
                      <i
                        key={a}
                        className={`absolute inset-y-0 ${k === 0 ? 'bg-comms' : 'lane-relay'}`}
                        style={{ left: `${(a / total) * 100}%`, width: `${((b - a) / total) * 100}%` }}
                      />
                    ))}
                  </div>
                ))}
                <div className="flex justify-between font-mono text-2xs text-ink-faint">
                  <span>Site</span>
                  <span>{(total / 2).toFixed(1)} km</span>
                  <span>{total.toFixed(1)} km</span>
                </div>
              </div>
            </div>
            <ul className="grid max-w-md">
              {SCENARIOS.map((s, k) => (
                <li key={s.id} className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-2.5">
                  <Swatch i={k === 0 ? 0 : 1} />
                  <span>{s.label}</span>
                  <span className="readout font-normal">{(share(k) * 100).toFixed(0)} % of the route</span>
                </li>
              ))}
            </ul>
            <Fig>
              The three bars under the section show where along the route the rover is lit and in contact: direct first, then with each
              relay added.
            </Fig>
          </div>
        )}
      </div>
    </div>
  )
}
