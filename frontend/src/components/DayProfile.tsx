import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import { type KeyboardEvent, type PointerEvent, useRef } from 'react'
import type { SkyTarget, Track } from '~/lib/data'
import { minuteLabel } from '~/lib/time'
import { useWidth } from '~/lib/useWidth'

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24]
const KEYS: Record<string, number> = { ArrowLeft: -10, ArrowRight: 10, PageUp: -60, PageDown: 60, Home: -1440, End: 1440 }

/** Minute ranges [start, end) where the Sun's centre is above the flat horizon, merged across samples. */
export function daylightSpans(track: Track, stepMin: number): [number, number][] {
  const spans: [number, number][] = []
  track.t_min.forEach((t, i) => {
    if ((track.el_deg[i] ?? -90) <= 0) return
    const last = spans.at(-1)
    if (last && t - last[1] <= stepMin / 2 + 1e-9) last[1] = t + stepMin / 2
    else spans.push([t - stepMin / 2, t + stepMin / 2])
  })
  return spans
}

/**
 * Minute ranges where any part of the Sun's disk clears the ridge: the pipeline's rule for direct sun, so a fraction
 * above 0 % counts.
 */
function directSpans(track: Track, stepMin: number): [number, number][] {
  const spans: [number, number][] = []
  track.t_min.forEach((t, i) => {
    if ((track.direct_fraction[i] ?? 0) <= 0) return
    const last = spans.at(-1)
    if (last && t - last[1] <= stepMin / 2 + 1e-9) last[1] = t + stepMin / 2
    else spans.push([t - stepMin / 2, t + stepMin / 2])
  })
  return spans
}

/** Minutes of the day with line of sight to Earth, from the intervals. */
function laneSpans(t: SkyTarget): [number, number][] {
  return t.lane ?? (t.reference.visible ? [[0, 1440]] : [])
}

/** The pipeline stores the Sun's track only above −1°, and hill tops can be lit below that. */
export function NoTrackNote({ track }: { track?: Track }) {
  if (!track || track.t_min.length > 0) return null
  return (
    <p className="text-xs text-ink-muted">
      Sun path not stored for this day: the Sun stays below −1° of a flat horizon, so this chart is empty. High ground can still catch the
      Sun at these angles.
    </p>
  )
}

/**
 * One UTC day as stacked lanes: visible share of the solar disk, and line of sight to the comms target.
 * The whole chart is a slider for the time of day.
 */
export function DayProfile({
  track,
  stepMin,
  comms,
  minute,
  onMinute,
}: {
  track?: Track
  stepMin: number
  comms?: SkyTarget
  minute: number
  onMinute: (m: number) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const dragging = useRef(false)
  const SUN_H = 150
  const LANE_H = 22
  const GAP = 14
  // A lane for direct sun, so the threshold reads as a yes or no and not only as a curve; and one for Earth.
  const LANES = comms ? 2 : 1
  const M = { t: 8, r: 8, b: 26, l: 84 }
  const HEIGHT = M.t + SUN_H + LANES * (GAP + LANE_H) + M.b
  const x = scaleLinear([0, 1440], [M.l, width - M.r])
  const y = scaleLinear([0, 1], [M.t + SUN_H, M.t])
  const points = track ? track.t_min.map((t, i): [number, number] => [t, track.direct_fraction[i] ?? 0]) : []
  const fill = area<[number, number]>(
    ([t]) => x(t),
    y(0),
    ([, f]) => y(f),
  )
  const edge = line<[number, number]>(
    ([t]) => x(t),
    ([, f]) => y(f),
  )
  const sunY = M.t + SUN_H + GAP
  const laneY = sunY + LANE_H + GAP
  const clamp = (m: number) => Math.max(0, Math.min(1439, Math.round(m)))
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onMinute(clamp(x.invert(e.clientX - r.left)))
  }
  const onKey = (e: KeyboardEvent) => {
    const step = KEYS[e.key]
    if (step) {
      e.preventDefault()
      onMinute(clamp(minute + step))
    }
  }

  return (
    <>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Time of day, UTC"
        aria-valuemin={0}
        aria-valuemax={1439}
        aria-valuenow={minute}
        aria-valuetext={`${minuteLabel(minute)} UTC`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => {
          dragging.current = false
        }}
        className="cursor-ew-resize touch-none select-none rounded-sm"
      >
        <svg height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden className="block w-full overflow-visible font-mono text-2xs">
          {track &&
            daylightSpans(track, stepMin).map(([a, b]) => (
              <rect key={a} x={x(a)} y={M.t} width={x(b) - x(a)} height={SUN_H} className="fill-daylight" />
            ))}
          {HOURS.map((h) => (
            <g key={h}>
              <line x1={x(h * 60)} x2={x(h * 60)} y1={M.t} y2={HEIGHT - M.b} className="stroke-grid" />
              {Math.abs(x(h * 60) - x(minute)) > 34 && (
                <text x={x(h * 60)} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-faint">
                  {String(h).padStart(2, '0')}
                </text>
              )}
            </g>
          ))}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={M.l - 6} y={y(f) + 3.5} textAnchor="end" className="fill-ink-faint">
              {f * 100}%
            </text>
          ))}
          {points.length > 0 && (
            <>
              <path d={fill(points) ?? ''} className="fill-sun-fill" />
              <path d={edge(points) ?? ''} fill="none" className="stroke-sun" strokeWidth={1.75} />
            </>
          )}
          <line x1={M.l} x2={width - M.r} y1={y(0)} y2={y(0)} className="stroke-line-strong" />

          <g>
            <text x={M.l - 6} y={sunY + LANE_H / 2 + 3.5} textAnchor="end" className="fill-ink-faint">
              Direct sun
            </text>
            <line
              x1={M.l}
              x2={width - M.r}
              y1={sunY + LANE_H / 2}
              y2={sunY + LANE_H / 2}
              className="stroke-sun opacity-40"
              strokeDasharray="2 3"
            />
            {track &&
              directSpans(track, stepMin).map(([a, b]) => (
                <rect
                  key={a}
                  x={x(a)}
                  y={sunY + 4}
                  width={Math.max(1, x(b) - x(a))}
                  height={LANE_H - 8}
                  rx={2}
                  className="fill-sun-fill stroke-sun"
                />
              ))}
          </g>

          {comms && (
            <g>
              <text x={M.l - 6} y={laneY + LANE_H / 2 + 3.5} textAnchor="end" className="fill-ink-faint">
                {comms.label}
              </text>
              <line
                x1={M.l}
                x2={width - M.r}
                y1={laneY + LANE_H / 2}
                y2={laneY + LANE_H / 2}
                className="stroke-comms opacity-60"
                strokeDasharray="2 3"
              />
              {laneSpans(comms).map(([a, b]) => (
                <rect
                  key={a}
                  x={x(a)}
                  y={laneY + 4}
                  width={Math.max(1, x(b) - x(a))}
                  height={LANE_H - 8}
                  rx={2}
                  className="fill-comms-fill stroke-comms"
                />
              ))}
            </g>
          )}

          <g transform={`translate(${x(minute)},0)`}>
            <line y1={M.t - 4} y2={HEIGHT - M.b + 2} className="stroke-now" strokeWidth={1.25} />
            <rect x={-22} y={HEIGHT - M.b + 4} width={44} height={16} rx={3} className="fill-now" />
            <text y={HEIGHT - M.b + 15.5} textAnchor="middle" className="fill-bg font-medium">
              {minuteLabel(minute)}
            </text>
          </g>
        </svg>
      </div>
      <p className="text-xs text-ink-muted">
        Direct sun counts as soon as any part of the Sun’s disk clears the ridge, so any share above 0 % is direct sun.
      </p>
      <NoTrackNote track={track} />
    </>
  )
}
