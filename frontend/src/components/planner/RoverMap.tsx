import { useEffect, useMemo, useRef, useState } from 'react'
import { loadTerrain, type SiteId, type Terrain } from '~/lib/data'
import { type ReachCell, ROVER_TERMS } from '~/lib/roverLive'
import { offsetFromSite, shadedWindow } from '~/lib/roverMap'

/** Relief samples across the window; the canvas smooths them up to its size. */
const SAMPLES = 220
/** Scale bar lengths to choose from, metres. */
const BARS = [50, 100, 200, 250, 500, 1000, 2000]

type Sky = { sun: { az: number; el: number } | null; earth: { az: number; el: number } | null }

const minutes = (s: number) => {
  const m = Math.round(s / 60)
  return m < 60 ? `${m}′` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
}

/** A point on the window's edge in the direction of an azimuth (clockwise from north), in map metres. */
const edge = (azDeg: number, half: number) => {
  const a = (azDeg * Math.PI) / 180
  const k = (half * 0.84) / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)))
  return { x: Math.sin(a) * k, y: -Math.cos(a) * k }
}

function Bearing({ az, el, half, label, tone }: { az: number; el: number; half: number; label: string; tone: string }) {
  const p = edge(az, half)
  const unit = (2 * half) / 420
  const a = (az * Math.PI) / 180
  const tip = { x: p.x + Math.sin(a) * 14 * unit, y: p.y - Math.cos(a) * 14 * unit }
  return (
    <g className={tone}>
      <line x1={p.x} y1={p.y} x2={tip.x} y2={tip.y} stroke="currentColor" strokeWidth={2 * unit} markerEnd="url(#rover-arrow)" />
      <text
        x={p.x}
        y={p.y + (p.y > 0 ? -10 : 18) * unit}
        textAnchor={p.x > half * 0.4 ? 'end' : p.x < -half * 0.4 ? 'start' : 'middle'}
        fontSize={11 * unit}
        fill="currentColor"
        stroke="black"
        strokeWidth={3 * unit}
        paintOrder="stroke"
      >
        {label} {el > 0 ? `${el.toFixed(1)}° up` : 'below horizon'}
      </text>
    </g>
  )
}

/**
 * The rover's squares on the site's real terrain, seen from above: LOLA relief lit by the Sun where it stands at
 * landing, with the shadows that terrain inside the tile casts. Squares sit at the coordinates the rover service
 * returned, so the grid may sit a few metres off the tile's centre and turn against north (it follows the polar map).
 */
export function RoverMap({
  siteId,
  site,
  cells,
  sky,
}: {
  siteId: SiteId
  site: { lat: number; lon: number }
  cells: ReachCell[]
  sky: Sky
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    loadTerrain(siteId)
      .then((t) => live && setTerrain(t))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [siteId])

  const placed = useMemo(() => cells.map((c) => ({ cell: c, ...offsetFromSite(site.lat, site.lon, c.lat, c.lon) })), [cells, site])
  // One square's step along each grid axis: half the gap between the squares either side of the middle one.
  const axis = (a: number, b: number) => {
    const p = placed[a]
    const q = placed[b]
    return p && q ? { x: (q.east - p.east) / 2, y: (q.north - p.north) / 2 } : { x: ROVER_TERMS.cellM, y: 0 }
  }
  const across = axis(3, 5)
  const down = axis(1, 7)
  const reach = Math.max(...placed.map((p) => Math.hypot(p.east, p.north))) + Math.hypot(across.x, across.y)
  const half = Math.max(300, Math.ceil((reach * 2.2) / 50) * 50)
  // One CSS pixel in map metres for a map about 420 px wide, the size it renders beside the text.
  const unit = (2 * half) / 420
  const bar = BARS.find((b) => b >= half / 3.5) ?? 1000

  useEffect(() => {
    const el = canvas.current
    if (!el || !terrain) return
    const shade = shadedWindow(terrain, half, SAMPLES, sky.sun?.az ?? 0, sky.sun?.el ?? -1)
    const image = new ImageData(SAMPLES, SAMPLES)
    for (let i = 0; i < shade.length; i++) {
      // Regolith grey: a faint floor in shadow (earthshine and scattered light), the lit ground up to near white.
      const v = 14 + 226 * (shade[i] ?? 0) ** 0.75
      image.data.set([v, v, v * 0.98, 255], i * 4)
    }
    el.width = SAMPLES
    el.height = SAMPLES
    el.getContext('2d')?.putImageData(image, 0, 0)
  }, [terrain, half, sky.sun?.az, sky.sun?.el])

  if (failed) return null
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      <canvas ref={canvas} aria-hidden className={`absolute inset-0 size-full ${terrain ? '' : 'motion-safe:animate-pulse'}`} />
      <svg aria-hidden viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`} className="absolute inset-0 size-full">
        <defs>
          <marker id="rover-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        {placed.map(({ cell, east, north }, i) => {
          const corner = (s: number, t: number) => `${east + s * across.x + t * down.x},${-(north + s * across.y + t * down.y)}`
          const points = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)].join(' ')
          const reached = cell.kind === 'reached'
          const fill =
            cell.kind === 'landing'
              ? 'rgb(255 255 255 / 0.85)'
              : reached
                ? `rgb(255 255 255 / ${(0.18 + 0.4 * (1 - cell.arrivalS / ROVER_TERMS.durationS)).toFixed(3)})`
                : 'none'
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the squares are fixed grid positions
            <g key={i}>
              <polygon
                points={points}
                fill={fill}
                stroke={reached || cell.kind === 'landing' ? 'white' : 'rgb(255 255 255 / 0.7)'}
                strokeWidth={1.25 * unit}
                strokeDasharray={reached || cell.kind === 'landing' ? undefined : `${3 * unit} ${2.5 * unit}`}
              />
              {cell.kind === 'landing' && <circle cx={east} cy={-north} r={3 * unit} fill="black" />}
              {reached && Math.hypot(across.x, across.y) / unit > 26 && (
                <text
                  x={east}
                  y={-north + 4.5 * unit}
                  textAnchor="middle"
                  fontSize={12 * unit}
                  fontWeight={500}
                  fill="white"
                  stroke="black"
                  strokeWidth={2.5 * unit}
                  paintOrder="stroke"
                  className="tabular"
                >
                  {minutes(cell.arrivalS)}
                </text>
              )}
            </g>
          )
        })}
        {sky.sun && <Bearing az={sky.sun.az} el={sky.sun.el} half={half} label="Sun" tone="text-sun" />}
        {sky.earth && <Bearing az={sky.earth.az} el={sky.earth.el} half={half} label="Earth" tone="text-comms" />}
        <g className="text-ink" fontSize={11 * unit} fill="currentColor">
          <line
            x1={-half + 18 * unit}
            x2={-half + 18 * unit}
            y1={-half + 40 * unit}
            y2={-half + 26 * unit}
            stroke="currentColor"
            strokeWidth={2 * unit}
            markerEnd="url(#rover-arrow)"
          />
          <text x={-half + 18 * unit} y={-half + 20 * unit} textAnchor="middle" stroke="black" strokeWidth={3 * unit} paintOrder="stroke">
            N
          </text>
          <line
            x1={-half + 14 * unit}
            x2={-half + 14 * unit + bar}
            y1={half - 14 * unit}
            y2={half - 14 * unit}
            stroke="currentColor"
            strokeWidth={2 * unit}
          />
          <text x={-half + 14 * unit} y={half - 20 * unit} stroke="black" strokeWidth={3 * unit} paintOrder="stroke">
            {bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}
          </text>
        </g>
      </svg>
    </div>
  )
}
