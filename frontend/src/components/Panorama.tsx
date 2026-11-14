import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import type { SkyTarget, Track } from '~/lib/data'
import { useWidth } from '~/lib/useWidth'

const COMPASS = [
  ['N', 0],
  ['NE', 45],
  ['E', 90],
  ['SE', 135],
  ['S', 180],
  ['SW', 225],
  ['W', 270],
  ['NW', 315],
  ['N', 360],
] as const

type Segment = { key: string; lit: boolean; points: [number, number][] }

/** Splits a track where the Sun goes in or out of terrain shadow, and at the 0/360 wrap. */
export function segments(track: Track): Segment[] {
  const out: Segment[] = []
  let cur: Segment | undefined
  track.az_deg.forEach((az, i) => {
    const el = track.el_deg[i] ?? 0
    const lit = (track.direct_fraction[i] ?? 0) > 0
    const wrap = i > 0 && Math.abs(az - (track.az_deg[i - 1] ?? az)) > 180
    // Samples are 10 min apart; a bigger time gap is a night, not a path.
    const gap = i > 0 && (track.t_min[i] ?? 0) - (track.t_min[i - 1] ?? 0) > 25
    if (!cur || cur.lit !== lit || wrap || gap) {
      if (cur && !wrap && !gap) cur.points.push([az, el])
      cur = { key: `${i}`, lit, points: [] }
      out.push(cur)
    }
    cur.points.push([az, el])
  })
  return out
}

/** Splits Earth's path into runs that clear the skyline and runs the terrain blocks. */
function arcRuns(comms: SkyTarget) {
  const runs: { key: string; clear: boolean; points: [number, number][] }[] = []
  for (const [i, p] of comms.arc.entries()) {
    const clear = p.clearance_deg >= comms.margin_deg
    const last = runs.at(-1)
    if (!last || last.clear !== clear) {
      if (last) last.points.push([p.az_deg, p.el_deg])
      runs.push({ key: `${i}`, clear, points: [] })
    }
    runs.at(-1)?.points.push([p.az_deg, p.el_deg])
  }
  return runs
}

export function elevationRange(els: number[]): [number, number] {
  const lo = Math.min(-2, Math.floor(Math.min(...els)))
  const hi = Math.max(10, Math.ceil((Math.max(...els) + 4) / 10) * 10)
  return [lo, hi]
}

export type SunMark = { az: number; el: number; fraction: number }

/** Labels drawn next to the Sun and the comms reference with a short leader line (cinematic mode). */
export type Hud = { sun?: string; comms?: string }

/**
 * Azimuth window for the cinematic view: the day's Sun path with 15° to spare, never narrower
 * than east to west, so the ridge that matters fills the width.
 */
export function azWindow(track: Track | undefined): [number, number] {
  const az = track?.az_deg ?? []
  if (az.length === 0 || Math.max(...az) - Math.min(...az) > 300) return [0, 360]
  return [Math.max(0, Math.min(90, Math.min(...az) - 15)), Math.min(360, Math.max(270, Math.max(...az) + 15))]
}

export function Panorama({
  skyline,
  azStep,
  track,
  references = [],
  now,
  comms,
  height = 320,
  compact = false,
  label = 'Terrain skyline with the Sun path',
  elRange,
  azRange = [0, 360],
  hud,
}: {
  skyline: number[]
  azStep: number
  track?: Track
  references?: { label: string; track: Track }[]
  now?: SunMark
  comms?: SkyTarget
  height?: number
  compact?: boolean
  label?: string
  /** Fixed elevation domain, so side-by-side panoramas share one scale. */
  elRange?: [number, number]
  /** Visible azimuth window in degrees; everything outside is clipped. */
  azRange?: [number, number]
  /** Cinematic mode: full-bleed, axis labels inside the plot, leader-line labels on the marks. */
  hud?: Hud
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const cine = !!hud
  const M = cine ? { t: 28, r: 0, b: 0, l: 0 } : compact ? { t: 8, r: 4, b: 18, l: 28 } : { t: 16, r: 8, b: 26, l: 40 }
  const allEl = [
    ...skyline,
    ...(track?.el_deg ?? []),
    // Cinematic scale fits the day itself; reference paths are context and may run off the top.
    ...(hud ? [] : references.flatMap((r) => r.track.el_deg)),
    ...(comms?.arc.map((p) => p.el_deg) ?? []),
  ]
  const [lo, hi] = elRange ?? elevationRange(allEl)
  const x = scaleLinear(azRange, [M.l, width - M.r])
  const y = scaleLinear([lo, hi], [height - M.b, M.t])
  const path = line<[number, number]>(
    ([az]) => x(az),
    ([, el]) => y(el),
  )
  const ridge: [number, number][] = [...skyline.map((e, i): [number, number] => [i * azStep, e]), [360, skyline[0] ?? 0]]
  const compass = (compact ? COMPASS.filter((_, i) => i % 2 === 0) : COMPASS).filter(([, az]) => az >= azRange[0] && az <= azRange[1])
  const ref0 = comms?.reference
  const clipId = `pano-${Math.round(azRange[0])}-${Math.round(azRange[1])}-${height}`

  return (
    <div ref={ref}>
      <svg
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className={`block w-full font-mono text-2xs ${cine ? 'overflow-hidden' : 'overflow-visible'}`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={M.l} y={0} width={Math.max(0, width - M.l - M.r)} height={height} />
          </clipPath>
        </defs>
        {y.ticks(compact ? 3 : 6).map((e) => (
          <g key={e}>
            <line x1={M.l} x2={width - M.r} y1={y(e)} y2={y(e)} className="stroke-grid" />
            {cine ? (
              e > lo && (
                <text x={16} y={y(e) - 5} className="fill-ink-faint">
                  {e}°
                </text>
              )
            ) : (
              <text x={M.l - 6} y={y(e) + 3.5} textAnchor="end" className="fill-ink-faint">
                {e}°
              </text>
            )}
          </g>
        ))}
        {compass.map(([name, az]) => (
          <g key={az}>
            <line x1={x(az)} x2={x(az)} y1={M.t} y2={height - M.b} className="stroke-grid" />
            {!cine && (
              <text x={x(az)} y={height - (compact ? 4 : 8)} textAnchor="middle" className="fill-ink-faint">
                {name}
              </text>
            )}
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          <path d={`${path(ridge)}L${x(360)},${y(lo)}L${x(0)},${y(lo)}Z`} className={cine ? 'fill-terrain opacity-80' : 'fill-terrain'} />
          <path
            d={path(ridge) ?? ''}
            fill="none"
            className={cine ? 'stroke-ink' : 'stroke-terrain-edge'}
            strokeWidth={cine ? 1.25 : 1}
            strokeLinejoin="round"
          />
          <line x1={M.l} x2={width - M.r} y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeDasharray="2 4" />

          {references.map((r) => {
            const peak = r.track.el_deg.indexOf(Math.max(...r.track.el_deg))
            return (
              <g key={r.label} className="stroke-ink-faint">
                {segments(r.track).map((s) => (
                  <path key={s.key} d={path(s.points) ?? ''} fill="none" strokeWidth={1} strokeDasharray="1 3" />
                ))}
                {!compact && (
                  <text
                    x={x(r.track.az_deg[peak] ?? 180)}
                    y={y(r.track.el_deg[peak] ?? 0) - 6}
                    textAnchor="middle"
                    className="fill-ink-faint stroke-none"
                  >
                    {r.label}
                  </text>
                )}
              </g>
            )
          })}

          {comms &&
            arcRuns(comms).map((r) =>
              r.clear ? (
                <path key={r.key} d={path(r.points) ?? ''} fill="none" className="stroke-comms" strokeWidth={1.5} />
              ) : (
                <path
                  key={r.key}
                  d={path(r.points) ?? ''}
                  fill="none"
                  className="stroke-comms opacity-60"
                  strokeWidth={1.25}
                  strokeDasharray="2 3"
                />
              ),
            )}
          {ref0 && (
            <g transform={`translate(${x(ref0.az_deg)},${y(ref0.el_deg)})`}>
              <rect
                x={-4}
                y={-4}
                width={8}
                height={8}
                transform="rotate(45)"
                className={ref0.visible ? 'fill-comms stroke-bg' : 'fill-bg stroke-comms'}
                strokeWidth={1.5}
              />
              {!compact && !cine && (
                <text y={-10} textAnchor="middle" className="fill-comms">
                  {ref0.name.split(' ')[0]}
                </text>
              )}
            </g>
          )}

          {track &&
            segments(track).map((s) =>
              s.lit ? (
                <path
                  key={s.key}
                  d={path(s.points) ?? ''}
                  fill="none"
                  className="stroke-sun"
                  strokeWidth={compact ? 2 : 2.5}
                  strokeLinecap="round"
                />
              ) : (
                <path
                  key={s.key}
                  d={path(s.points) ?? ''}
                  fill="none"
                  className="stroke-sun opacity-55"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              ),
            )}
        </g>

        {cine &&
          (width < 640 ? compass.filter(([, az]) => az % 90 === 0) : compass).map(([name, az]) => (
            <text
              key={`c${az}`}
              x={Math.min(width - 16, Math.max(16, x(az)))}
              y={height - 14}
              textAnchor={x(az) < 40 ? 'start' : x(az) > width - 40 ? 'end' : 'middle'}
              className="fill-ink-faint"
            >
              {width < 640 ? name : `${name} ${String(az % 360).padStart(3, '0')}°`}
            </text>
          ))}
        {cine && ref0 && hud?.comms && (
          <Leader x={x(ref0.az_deg)} y={y(ref0.el_deg)} width={width} text={hud.comms} className="fill-comms stroke-comms" />
        )}
        {cine && now && hud?.sun && <Leader x={x(now.az)} y={y(now.el)} width={width} text={hud.sun} className="fill-sun stroke-sun" />}

        {now && (
          <g transform={`translate(${x(now.az)},${y(now.el)})`}>
            <circle r={compact ? 7 : 10} className="fill-sun opacity-20" />
            <circle r={compact ? 3.5 : 5} className={now.fraction > 0 ? 'fill-sun stroke-bg' : 'fill-bg stroke-sun'} strokeWidth={1.5} />
          </g>
        )}
      </svg>
    </div>
  )
}

/**
 * A label beside a mark with a short leader line. Flips to the left near the right edge; the text
 * gets a background-coloured halo so it stays legible where it crosses the ridge or a path.
 */
function Leader({ x, y, width, text, className }: { x: number; y: number; width: number; text: string; className: string }) {
  // A narrow chart has no room beside the mark for a label this long: stack it above, anchored to stay inside the plot.
  if (width < 640) {
    const anchor = x < width / 3 ? 'start' : x > (width * 2) / 3 ? 'end' : 'middle'
    const tx = anchor === 'start' ? Math.max(4 - x, -8) : anchor === 'end' ? Math.min(width - 4 - x, 8) : 0
    return (
      <g transform={`translate(${x},${y})`} className={className}>
        <line x1={0} x2={0} y1={-8} y2={-18} strokeWidth={1} />
        <text
          x={tx}
          y={-23}
          textAnchor={anchor}
          className="stroke-bg text-2xs tracking-[0.06em] uppercase"
          strokeWidth={5}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {text}
        </text>
      </g>
    )
  }
  const left = x > width - 360
  const d = left ? -1 : 1
  return (
    <g transform={`translate(${x},${y})`} className={className}>
      <line x1={d * 12} x2={d * 44} y1={0} y2={0} strokeWidth={1} />
      <text
        x={d * 52}
        y={4}
        textAnchor={left ? 'end' : 'start'}
        className="stroke-bg text-xs tracking-[0.06em] uppercase"
        strokeWidth={5}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {text}
      </text>
    </g>
  )
}

/** Shared key for the panorama; one place so every view reads the same marks. */
export function PanoramaKey({ comms }: { comms?: SkyTarget['kind'] | false }) {
  const what = 'Earth'
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-muted">
      <li className="flex items-center gap-2">
        <svg width="22" height="8" aria-hidden className="stroke-sun">
          <path d="M1 4H21" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
        Sun clears the terrain
      </li>
      <li className="flex items-center gap-2">
        <svg width="22" height="8" aria-hidden className="stroke-sun opacity-55">
          <path d="M1 4H21" strokeWidth={1.5} strokeDasharray="3 3" />
        </svg>
        Sun behind terrain
      </li>
      {comms && (
        <>
          <li className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden className="stroke-comms">
              <path d="M1 4H21" strokeWidth={1.5} />
            </svg>
            {what} in view
          </li>
          <li className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden className="stroke-comms opacity-60">
              <path d="M1 4H21" strokeWidth={1.25} strokeDasharray="2 3" />
            </svg>
            {what} blocked
          </li>
        </>
      )}
      <li className="flex items-center gap-2">
        <svg width="22" height="8" aria-hidden className="stroke-terrain-edge">
          <path d="M1 7L7 2L12 5L16 1L21 6" fill="none" strokeWidth={1} />
        </svg>
        Terrain skyline
      </li>
    </ul>
  )
}
