import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { scaleLinear } from 'd3-scale'
import { type KeyboardEvent, type PointerEvent, useState } from 'react'
import { Fig, ScaleBar, TerrainMap, useTerrain, type View } from '~/components/scene/terrain'
import type { LegacyMastData as MastData, MastOutcome } from '~/lib/feed-schemas'
import { paretoFront } from '~/lib/mission'

const pct = (x: number) => `${(x * 100).toFixed(1)} %`
const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts`

export type Spot = MastData['candidates'][number] & { distance: number }
export const spots = (data: MastData): Spot[] => data.candidates.map((c) => ({ ...c, distance: Math.hypot(c.east_m, c.north_m) }))
export const heightsOf = (data: MastData) => data.candidates[0]?.outcomes.map((o) => o.mast_m) ?? []
export const at = (s: Spot, h: number) => s.outcomes.find((o) => o.mast_m === h) as MastOutcome

export function frontOf(reach: Spot[], h: number) {
  return new Set(
    paretoFront(reach, [
      { read: (s) => at(s, h).sun_share, better: 'high' },
      { read: (s) => at(s, h).earth_center_share, better: 'high' },
    ]).map((s) => s.id),
  )
}

export function Heights({ heights, value, onChange }: { heights: number[]; value: number; onChange: (h: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <span id="proto-mast-h" className="text-sm text-ink-muted">
        Mast height
      </span>
      <ButtonGroup aria-labelledby="proto-mast-h">
        {heights.map((h) => (
          <Button
            key={h}
            variant={h === value ? 'primary' : 'secondary'}
            aria-pressed={h === value}
            className="tabular"
            onClick={() => onChange(h)}
          >
            {h} m
          </Button>
        ))}
      </ButtonGroup>
    </div>
  )
}

export function Radius({ value, onChange }: { value: number; onChange: (r: number) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm text-ink-muted">
        Cable reach <span className="readout text-ink">{value} m</span>
      </span>
      <input
        type="range"
        min={100}
        max={1600}
        step={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-56 accent-(--brand)"
      />
    </label>
  )
}

/** An arc of `share` of a full turn, clockwise from the top. */
function arc(cx: number, cy: number, r: number, share: number) {
  const a = Math.min(share, 0.9999) * 2 * Math.PI
  return `M${cx} ${cy - r}A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`
}

const PLAN: View = { east: 0, north: 0, half: 1650 }

/** 1. The answer is a place: spots on the real terrain, the cable as a ring you drag. */
export function MastPlan({ data }: { data: MastData }) {
  const terrain = useTerrain()
  const heights = heightsOf(data)
  const [height, setHeight] = useState(heights.at(-2) ?? 0)
  const [radius, setRadius] = useState(1000)
  const all = spots(data)
  const reach = all.filter((s) => s.distance <= radius)
  const front = frontOf(reach, height)
  const best = [...reach].sort((a, b) => at(b, height).sun_share - at(a, height).sun_share)[0]
  const [picked, setPicked] = useState<string>()
  const shown = all.find((s) => s.id === picked) ?? best
  const u = PLAN.half / 100

  const drag = (e: PointerEvent<SVGElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg || !e.buttons) return
    const box = svg.getBoundingClientRect()
    const m = (2 * PLAN.half) / box.width
    const r = Math.hypot((e.clientX - box.left - box.width / 2) * m, (e.clientY - box.top - box.height / 2) * m)
    setRadius(Math.max(100, Math.min(1600, Math.round(r / 50) * 50)))
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Heights heights={heights} value={height} onChange={setHeight} />
        <Radius value={radius} onChange={setRadius} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          {terrain ? (
            <TerrainMap terrain={terrain} view={PLAN} label={`Mast spots within ${radius} m of the site, on shaded terrain`}>
              <circle r={radius} className="fill-none stroke-ink" strokeWidth={0.5 * u} strokeDasharray={`${2 * u} ${2 * u}`} />
              <path d={`M${-3 * u} 0H${3 * u}M0 ${-3 * u}V${3 * u}`} className="stroke-ink" strokeWidth={0.5 * u} />
              {all.map((s) => {
                const o = at(s, height)
                const inside = s.distance <= radius
                const on = s.id === shown?.id
                return (
                  <g
                    key={s.id}
                    className="cursor-pointer"
                    opacity={inside ? 1 : 0.35}
                    onPointerEnter={() => setPicked(s.id)}
                    onClick={() => setPicked(s.id)}
                  >
                    <circle cx={s.east_m} cy={-s.north_m} r={8 * u} className="fill-transparent" />
                    {on && <circle cx={s.east_m} cy={-s.north_m} r={6.4 * u} className="fill-bg/70 stroke-ink" strokeWidth={0.4 * u} />}
                    <path d={arc(s.east_m, -s.north_m, 4.6 * u, o.sun_share)} className="fill-none stroke-sun" strokeWidth={1.3 * u} />
                    <path
                      d={arc(s.east_m, -s.north_m, 2.8 * u, o.earth_center_share)}
                      className="fill-none stroke-comms"
                      strokeWidth={1.3 * u}
                    />
                    <circle
                      cx={s.east_m}
                      cy={-s.north_m}
                      r={1.1 * u}
                      className={front.has(s.id) ? 'fill-ink' : 'fill-bg stroke-ink'}
                      strokeWidth={0.3 * u}
                    />
                  </g>
                )
              })}
              <rect
                x={radius - 2.4 * u}
                y={-2.4 * u}
                width={4.8 * u}
                height={4.8 * u}
                className="cursor-ew-resize fill-bg stroke-ink"
                strokeWidth={0.5 * u}
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerMove={drag}
              />
              <ScaleBar view={PLAN} metres={500} />
            </TerrainMap>
          ) : (
            <div className="aspect-square outline -outline-offset-1 outline-line" />
          )}
          <Fig>
            Each spot carries two arcs: the outer is its share of the month with Sun, the inner with Earth. A full circle is 100 %. Drag the
            square to change the cable reach. North is up.
          </Fig>
        </div>
        {shown && <SpotCard spot={shown} height={height} heights={heights} radius={radius} onFront={front.has(shown.id)} />}
      </div>
    </div>
  )
}

export function SpotCard({
  spot,
  height,
  heights,
  radius,
  onFront,
}: {
  spot: Spot
  height: number
  heights: number[]
  radius: number
  onFront: boolean
}) {
  const o = at(spot, height)
  const bearing = (Math.round((Math.atan2(spot.east_m, spot.north_m) * 180) / Math.PI) + 360) % 360
  return (
    <div className="grid content-start gap-5">
      <div>
        <p className="eyebrow text-ink-muted">
          Spot {spot.id} · {Math.round(spot.distance)} m at {bearing}°
        </p>
        <p className="mt-1 text-xl text-pretty">
          {spot.distance > radius
            ? 'Out of cable reach.'
            : onFront
              ? 'No other spot in reach beats it on both Sun and Earth.'
              : 'In reach, but another spot beats it on both Sun and Earth.'}
        </p>
      </div>
      <dl className="flex gap-10">
        <div>
          <dt className="text-sm text-ink-muted">Sun at {height} m</dt>
          <dd className="readout text-3xl text-sun">{pct(o.sun_share)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Earth at {height} m</dt>
          <dd className="readout text-3xl text-comms">{pct(o.earth_center_share)}</dd>
        </div>
      </dl>
      <table className="w-full max-w-md border-collapse">
        <thead>
          <tr className="text-xs text-ink-muted">
            <th className="pb-2 text-left font-normal">Height</th>
            <th className="pb-2 text-right font-normal">Sun</th>
            <th className="pb-2 text-right font-normal">Earth</th>
            <th className="pb-2 text-right font-normal">Longest without Sun</th>
          </tr>
        </thead>
        <tbody className="readout font-normal">
          {heights.map((h) => (
            <tr key={h} className={`border-t border-line ${h === height ? '' : 'text-ink-muted'}`}>
              <td className="py-2">{h} m</td>
              <td className="py-2 text-right">{pct(at(spot, h).sun_share)}</td>
              <td className="py-2 text-right">{pct(at(spot, h).earth_center_share)}</td>
              <td className="py-2 text-right">{at(spot, h).longest_no_sun_h.toFixed(0)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-ink-muted">Ground slope {spot.slope_deg == null ? 'not given' : `${spot.slope_deg.toFixed(1)}°`}.</p>
    </div>
  )
}

const SEC = { w: 720, h: 420, pole: 96, left: 190, right: 560, top: 28, ground: 372 }

/** 2. The answer is a height: the mast drawn to scale, and what each step up the pole buys. */
export function MastSection({ data }: { data: MastData }) {
  const heights = heightsOf(data)
  const all = spots(data)
  const [id, setId] = useState(all[0]?.id)
  const [height, setHeight] = useState(heights.at(-2) ?? 0)
  const spot = all.find((s) => s.id === id) ?? all[0]
  if (!spot) return null
  const top = Math.max(...heights)
  const y = scaleLinear([0, top * 1.06], [SEC.ground, SEC.top])
  const x = scaleLinear([0, 1], [SEC.left, SEC.right])
  const line = (read: (o: MastOutcome) => number) => heights.map((h) => `${x(read(at(spot, h)))},${y(h)}`).join(' ')
  const o = at(spot, height)

  const nearest = (clientY: number, box: DOMRect) => {
    const m = y.invert(((clientY - box.top) / box.height) * SEC.h)
    setHeight(heights.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a)))
  }
  const onKey = (e: KeyboardEvent) => {
    const i = heights.indexOf(height) + (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0)
    if (i !== heights.indexOf(height) && heights[i] != null) {
      e.preventDefault()
      setHeight(heights[i] as number)
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <span id="proto-mast-spot" className="text-sm text-ink-muted">
          Spot
        </span>
        <div role="group" aria-labelledby="proto-mast-spot" className="flex flex-wrap gap-1">
          {all.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === spot.id}
              onClick={() => setId(s.id)}
              className={`readout h-9 px-2.5 text-sm outline -outline-offset-1 transition-colors duration-(--duration-fast) ${s.id === spot.id ? 'bg-brand text-bg outline-brand' : 'outline-line hover:bg-surface-hover'}`}
            >
              {s.id}
            </button>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,45rem)_minmax(0,1fr)]">
        <svg
          viewBox={`0 0 ${SEC.w} ${SEC.h}`}
          role="slider"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Mast height"
          aria-valuemin={heights[0]}
          aria-valuemax={top}
          aria-valuenow={height}
          aria-valuetext={`${height} m`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            nearest(e.clientY, e.currentTarget.getBoundingClientRect())
          }}
          onPointerMove={(e) => e.buttons && nearest(e.clientY, e.currentTarget.getBoundingClientRect())}
          className="block w-full cursor-ns-resize touch-none overflow-visible"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={SEC.top} y2={SEC.ground} className="stroke-grid" />
              <text x={x(v)} y={SEC.ground + 18} textAnchor="middle" className="fill-ink-faint font-mono text-2xs">
                {v * 100}%
              </text>
            </g>
          ))}
          <text x={(SEC.left + SEC.right) / 2} y={SEC.ground + 38} textAnchor="middle" className="fill-ink-muted text-xs">
            Share of the month in view
          </text>
          <line x1={24} x2={SEC.w} y1={SEC.ground} y2={SEC.ground} className="stroke-terrain-edge" />
          <rect x={24} y={SEC.ground} width={SEC.w - 24} height={10} className="fill-terrain" />
          <line x1={SEC.pole} x2={SEC.pole} y1={y(top)} y2={SEC.ground} className="stroke-ink" strokeWidth={2} />
          {heights.map((h) => (
            <g key={h} opacity={h === height ? 1 : 0.55}>
              <line x1={SEC.pole - 7} x2={SEC.pole + 7} y1={y(h)} y2={y(h)} className="stroke-ink" strokeWidth={h === height ? 2 : 1} />
              <text
                x={SEC.pole - 14}
                y={y(h) + 4}
                textAnchor="end"
                className={`fill-ink font-mono text-xs ${h === height ? 'font-medium' : ''}`}
              >
                {h} m
              </text>
            </g>
          ))}
          <line x1={SEC.pole} x2={SEC.right + 8} y1={y(height)} y2={y(height)} className="stroke-ink" strokeDasharray="2 4" />
          <polyline points={line((v) => v.sun_share)} className="fill-none stroke-sun" strokeWidth={2} />
          <polyline points={line((v) => v.earth_center_share)} className="fill-none stroke-comms" strokeWidth={2} />
          {heights.map((h) => (
            <g key={h}>
              <circle
                cx={x(at(spot, h).sun_share)}
                cy={y(h)}
                r={h === height ? 5.5 : 3.5}
                className="fill-sun stroke-bg"
                strokeWidth={1.5}
              />
              <circle
                cx={x(at(spot, h).earth_center_share)}
                cy={y(h)}
                r={h === height ? 5.5 : 3.5}
                className="fill-comms stroke-bg"
                strokeWidth={1.5}
              />
              <text x={SEC.right + 20} y={y(h) + 4} className={`font-mono text-xs ${h === height ? 'fill-ink' : 'fill-ink-faint'}`}>
                dark {at(spot, h).longest_no_sun_h.toFixed(0)} h
              </text>
            </g>
          ))}
        </svg>
        <div className="grid content-start gap-5">
          <dl className="flex gap-10">
            <div>
              <dt className="text-sm text-ink-muted">Sun at {height} m</dt>
              <dd className="readout text-3xl text-sun">{pct(o.sun_share)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Earth at {height} m</dt>
              <dd className="readout text-3xl text-comms">{pct(o.earth_center_share)}</dd>
            </div>
          </dl>
          <ol className="grid max-w-md">
            {heights.slice(1).map((h, i) => {
              const below = at(spot, heights[i] as number)
              const here = at(spot, h)
              return (
                <li key={h} className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-t border-line py-2.5">
                  <span className="readout font-normal">
                    {heights[i]} → {h} m
                  </span>
                  <span className="text-ink-muted">
                    Sun <span className="tabular text-ink">{pts(here.sun_share - below.sun_share)}</span>, Earth{' '}
                    <span className="tabular text-ink">{pts(here.earth_center_share - below.earth_center_share)}</span>, longest dark{' '}
                    <span className="tabular text-ink">
                      {here.longest_no_sun_h - below.longest_no_sun_h <= 0 ? '−' : '+'}
                      {Math.abs(here.longest_no_sun_h - below.longest_no_sun_h).toFixed(0)} h
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
          <Fig>The pole is to scale. Drag up and down it, or focus the chart and use the arrow keys.</Fig>
        </div>
      </div>
    </div>
  )
}

const TR = { w: 640, h: 440, l: 52, r: 16, t: 16, b: 44 }

/** 3. The answer is a trade: every spot as a path through Sun and Earth as the mast grows. */
export function MastTrade({ data }: { data: MastData }) {
  const heights = heightsOf(data)
  const [height, setHeight] = useState(heights.at(-2) ?? 0)
  const [radius, setRadius] = useState(1000)
  const [hover, setHover] = useState<string>()
  const all = spots(data)
  const reach = all.filter((s) => s.distance <= radius)
  const front = frontOf(reach, height)
  const every = all.flatMap((s) => s.outcomes)
  const pad = (lo: number, hi: number): [number, number] => [Math.max(0, lo - (hi - lo) * 0.08), Math.min(1, hi + (hi - lo) * 0.08)]
  const x = scaleLinear(pad(Math.min(...every.map((o) => o.sun_share)), Math.max(...every.map((o) => o.sun_share))), [TR.l, TR.w - TR.r])
  const y = scaleLinear(pad(Math.min(...every.map((o) => o.earth_center_share)), Math.max(...every.map((o) => o.earth_center_share))), [
    TR.h - TR.b,
    TR.t,
  ])
  const ranked = [...reach].sort(
    (a, b) => Number(front.has(b.id)) - Number(front.has(a.id)) || at(b, height).sun_share - at(a, height).sun_share,
  )
  const edge = ranked.filter((s) => front.has(s.id)).sort((a, b) => at(a, height).sun_share - at(b, height).sun_share)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Heights heights={heights} value={height} onChange={setHeight} />
        <Radius value={radius} onChange={setRadius} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <svg
            viewBox={`0 0 ${TR.w} ${TR.h}`}
            role="img"
            aria-label="Each mast spot by Sun share and Earth share"
            className="block w-full overflow-visible"
          >
            {x.ticks(5).map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={TR.t} y2={TR.h - TR.b} className="stroke-grid" />
                <text x={x(v)} y={TR.h - TR.b + 16} textAnchor="middle" className="fill-ink-faint font-mono text-2xs">
                  {Math.round(v * 100)}%
                </text>
              </g>
            ))}
            {y.ticks(5).map((v) => (
              <g key={v}>
                <line x1={TR.l} x2={TR.w - TR.r} y1={y(v)} y2={y(v)} className="stroke-grid" />
                <text x={TR.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-faint font-mono text-2xs">
                  {Math.round(v * 100)}%
                </text>
              </g>
            ))}
            <text x={(TR.l + TR.w - TR.r) / 2} y={TR.h - 6} textAnchor="middle" className="fill-sun text-xs">
              More Sun →
            </text>
            <text transform={`translate(13 ${(TR.t + TR.h - TR.b) / 2}) rotate(-90)`} textAnchor="middle" className="fill-comms text-xs">
              More Earth →
            </text>
            <polyline
              points={edge.map((s) => `${x(at(s, height).sun_share)},${y(at(s, height).earth_center_share)}`).join(' ')}
              className="fill-none stroke-ink"
              strokeDasharray="2 4"
            />
            {all.map((s) => {
              const inside = s.distance <= radius
              const on = hover === s.id
              const o = at(s, height)
              return (
                <g
                  key={s.id}
                  opacity={hover && !on ? 0.3 : inside ? 1 : 0.4}
                  onPointerEnter={() => setHover(s.id)}
                  onPointerLeave={() => setHover(undefined)}
                >
                  {(on || front.has(s.id)) && (
                    <polyline
                      points={s.outcomes.map((v) => `${x(v.sun_share)},${y(v.earth_center_share)}`).join(' ')}
                      className={`fill-none ${on ? 'stroke-ink' : 'stroke-ink-faint'}`}
                      strokeWidth={on ? 1.5 : 1}
                    />
                  )}
                  {on &&
                    s.outcomes.map((v) => (
                      <text key={v.mast_m} x={x(v.sun_share) + 8} y={y(v.earth_center_share) - 6} className="fill-ink font-mono text-2xs">
                        {v.mast_m} m
                      </text>
                    ))}
                  <circle cx={x(o.sun_share)} cy={y(o.earth_center_share)} r={12} className="fill-transparent" />
                  <circle
                    cx={x(o.sun_share)}
                    cy={y(o.earth_center_share)}
                    r={front.has(s.id) ? 5.5 : 4}
                    className={!inside ? 'fill-bg stroke-ink-faint' : front.has(s.id) ? 'fill-ink' : 'fill-bg stroke-ink'}
                    strokeWidth={1.5}
                  />
                </g>
              )
            })}
          </svg>
          <Fig>
            A line shows one spot as its mast grows from {heights[0]} to {heights.at(-1)} m; the dot is where it stands at {height} m.
            Filled dots are not beaten on both axes by any other spot in cable reach. Hollow grey dots are out of reach. Lines show for
            those unbeaten spots, and for any spot you point at.
          </Fig>
        </div>
        <ol className="grid content-start">
          {ranked.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onPointerEnter={() => setHover(s.id)}
                onPointerLeave={() => setHover(undefined)}
                onFocus={() => setHover(s.id)}
                onBlur={() => setHover(undefined)}
                className={`grid w-full grid-cols-[1rem_3rem_1fr_1fr_4rem] items-baseline gap-x-3 border-t border-line py-2.5 text-left transition-colors duration-(--duration-fast) ${hover === s.id ? 'bg-surface-hover' : ''}`}
              >
                <span aria-hidden className={`size-2.5 self-center rounded-full outline outline-ink ${front.has(s.id) ? 'bg-ink' : ''}`} />
                <span className="readout font-normal">{s.id}</span>
                <span className="readout text-right font-normal text-sun">{pct(at(s, height).sun_share)}</span>
                <span className="readout text-right font-normal text-comms">{pct(at(s, height).earth_center_share)}</span>
                <span className="readout text-right text-sm font-normal text-ink-muted">{Math.round(s.distance)} m</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
