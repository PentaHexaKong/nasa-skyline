import { type ReactNode, useId } from 'react'
import type { InvestigationId } from '~/lib/investigation'

/**
 * One picture per question, as the view from the surface: ridges fade with distance, the Sun is a small hard disc
 * with a glow (no air to soften it), the ridge it sits behind is rim-lit, and Earth is a lit sphere, not a dot.
 *
 * Every scene draws on one 400×176 canvas, cropped from the middle, so anything that matters stays between x 40 and
 * 360 (the crop takes up to ~35px a side at phone width). Ridges stroke only their top edge, never the canvas edges.
 */

type Pt = readonly [number, number]
const W = 400
const H = 176

const line = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join(' L')}`
const area = (pts: readonly Pt[]) => {
  const first = pts[0]
  const last = pts.at(-1)
  return first && last ? `${line(pts)} L${last[0]} ${H + 4} L${first[0]} ${H + 4} Z` : ''
}

const FAR = 'oklch(0.2 0.004 250)'
const MID = 'oklch(0.155 0.004 250)'
const NEAR = 'oklch(0.11 0.004 250)'

/** Fixed, uneven stars, so the sky is never a grid. [x, y, opacity] */
const STARS: readonly (readonly [number, number, number])[] = [
  [52, 22, 0.5],
  [88, 48, 0.25],
  [131, 14, 0.4],
  [168, 36, 0.2],
  [214, 18, 0.35],
  [246, 44, 0.2],
  [292, 12, 0.45],
  [326, 34, 0.25],
  [352, 58, 0.3],
  [74, 74, 0.15],
  [198, 64, 0.15],
]

function Label({
  x,
  y,
  children,
  className = 'fill-ink-faint',
  anchor = 'middle',
}: {
  x: number
  y: number
  children: ReactNode
  className?: string
  anchor?: 'start' | 'middle' | 'end'
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={className} style={{ font: '500 8px var(--font-mono)', letterSpacing: '0.08em' }}>
      {children}
    </text>
  )
}

function Ridge({ pts, fill, rim }: { pts: readonly Pt[]; fill: string; rim?: string }) {
  return (
    <>
      <path d={area(pts)} fill={fill} />
      {rim && <path d={line(pts)} fill="none" stroke={`url(#${rim})`} strokeWidth={1.25} strokeLinejoin="round" />}
    </>
  )
}

/** Warm light along a ridge edge, brightest where it faces the Sun at `x`. */
function RimGradient({ id, x, spread = 90 }: { id: string; x: number; spread?: number }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x - spread} x2={x + spread} y1={0} y2={0}>
      <stop offset="0" stopColor="var(--color-sun)" stopOpacity={0} />
      <stop offset="0.5" stopColor="var(--color-sun)" stopOpacity={0.9} />
      <stop offset="1" stopColor="var(--color-sun)" stopOpacity={0} />
    </linearGradient>
  )
}

function Sun({ x, y, glow, r = 7, ghost = false }: { x: number; y: number; glow: string; r?: number; ghost?: boolean }) {
  if (ghost)
    return (
      <circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        stroke="var(--color-sun)"
        strokeOpacity={0.5}
        strokeDasharray="1.5 2.5"
        strokeLinecap="round"
      />
    )
  return (
    <>
      <circle cx={x} cy={y} r={r * 8} fill={`url(#${glow})`} />
      <circle cx={x} cy={y} r={r} fill="oklch(0.95 0.06 85)" />
    </>
  )
}

/** Earth as the Moon sees it: mostly lit, with a dark limb, so it reads as a world rather than a second moon. */
function Earth({ x, y, uid, r = 9 }: { x: number; y: number; uid: string; r?: number }) {
  const mask = `${uid}-earth`
  return (
    <g>
      <defs>
        <mask id={mask}>
          <circle cx={x} cy={y} r={r} fill="white" />
          <circle cx={x + r * 1.45} cy={y + r * 0.25} r={r} fill="black" />
        </mask>
      </defs>
      <circle cx={x} cy={y} r={r} fill="oklch(0.2 0.03 230)" />
      <circle cx={x} cy={y} r={r} fill="var(--color-comms)" mask={`url(#${mask})`} />
      <circle cx={x} cy={y} r={r + 0.5} fill="none" stroke="var(--color-comms)" strokeOpacity={0.35} strokeWidth={0.75} />
    </g>
  )
}

export function ScenarioArt({ id, className = '' }: { id: InvestigationId; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const glow = `${uid}-glow`
  const rim = `${uid}-rim`
  return (
    <div className={`overflow-hidden bg-[#030507] ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={glow}>
            <stop offset="0" stopColor="var(--color-sun)" stopOpacity={0.45} />
            <stop offset="0.35" stopColor="var(--color-sun)" stopOpacity={0.12} />
            <stop offset="1" stopColor="var(--color-sun)" stopOpacity={0} />
          </radialGradient>
        </defs>
        <g className="fill-white">
          {STARS.map(([x, y, o]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={o > 0.3 ? 0.9 : 0.6} opacity={o} />
          ))}
        </g>
        {id === 'mountain' && (
          <>
            <defs>
              <RimGradient id={rim} x={256} />
            </defs>
            <Ridge
              pts={[
                [-10, 118],
                [50, 110],
                [110, 116],
                [170, 102],
                [230, 108],
                [300, 96],
                [360, 104],
                [410, 100],
              ]}
              fill={FAR}
            />
            <Ridge
              pts={[
                [-10, 132],
                [60, 124],
                [120, 130],
                [170, 120],
                [220, 126],
                [290, 116],
                [350, 122],
                [410, 118],
              ]}
              fill={MID}
            />
            {/* The Sun sits behind the near peak: its lower half is already gone. */}
            <Sun x={256} y={80} glow={glow} r={8} />
            <Ridge
              pts={[
                [-10, 150],
                [40, 140],
                [90, 146],
                [140, 128],
                [190, 112],
                [228, 92],
                [248, 82],
                [262, 80],
                [282, 94],
                [320, 118],
                [360, 130],
                [410, 136],
              ]}
              fill={NEAR}
              rim={rim}
            />
          </>
        )}
        {id === 'light' && (
          <>
            <defs>
              <RimGradient id={rim} x={110} spread={120} />
              <RimGradient id={`${rim}-b`} x={286} spread={50} />
              <clipPath id={`${uid}-a`}>
                <rect x={-10} y={0} width={208} height={H} />
              </clipPath>
              <clipPath id={`${uid}-b`}>
                <rect x={202} y={0} width={210} height={H} />
              </clipPath>
            </defs>
            {/* Place A: high ground in full sunlight, no Earth above its horizon. */}
            <g clipPath={`url(#${uid}-a)`}>
              <Sun x={112} y={50} glow={glow} />
              <Ridge
                pts={[
                  [-10, 120],
                  [40, 114],
                  [90, 118],
                  [140, 110],
                  [210, 116],
                ]}
                fill={MID}
              />
              <Ridge
                pts={[
                  [-10, 140],
                  [50, 130],
                  [100, 134],
                  [150, 124],
                  [210, 130],
                ]}
                fill="oklch(0.16 0.006 75)"
                rim={rim}
              />
            </g>
            {/* Place B: a ridge stands in front of the Sun, and Earth hangs clear above it. */}
            <g clipPath={`url(#${uid}-b)`}>
              <Earth x={340} y={46} uid={uid} />
              <Sun x={290} y={92} glow={glow} />
              <Ridge
                pts={[
                  [190, 128],
                  [240, 106],
                  [270, 86],
                  [290, 80],
                  [312, 90],
                  [350, 112],
                  [410, 120],
                ]}
                fill={NEAR}
                rim={`${rim}-b`}
              />
            </g>
            <line x1={200} x2={200} y1={0} y2={H} stroke="#090c11" strokeWidth={4} />
            <Label x={58} y={26} anchor="start">
              A
            </Label>
            <Label x={342} y={26} anchor="end">
              B
            </Label>
          </>
        )}
        {id === 'later' && (
          <>
            <defs>
              <RimGradient id={rim} x={270} spread={80} />
            </defs>
            <Ridge
              pts={[
                [-10, 116],
                [60, 108],
                [120, 114],
                [180, 104],
                [240, 110],
                [310, 100],
                [410, 106],
              ]}
              fill={FAR}
            />
            {/* Day 1: a ghost of where the Sun stood. Day 2: the same Sun, now slipping behind the ridge. */}
            <path
              d="M150 66 Q216 62 268 86"
              fill="none"
              stroke="var(--color-sun)"
              strokeOpacity={0.4}
              strokeDasharray="1 4"
              strokeLinecap="round"
            />
            <Sun x={146} y={66} glow={glow} ghost />
            <Sun x={270} y={90} glow={glow} />
            <Ridge
              pts={[
                [-10, 148],
                [50, 138],
                [110, 142],
                [170, 126],
                [214, 112],
                [248, 96],
                [268, 90],
                [288, 96],
                [330, 120],
                [410, 132],
              ]}
              fill={NEAR}
              rim={rim}
            />
            <Label x={146} y={50} className="fill-sun opacity-60">
              DAY 1
            </Label>
            <Label x={270} y={66} className="fill-sun">
              DAY 2
            </Label>
          </>
        )}
      </svg>
    </div>
  )
}
