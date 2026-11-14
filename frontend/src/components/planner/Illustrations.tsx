import type { ReactNode } from 'react'
import { MOON_PREVIEW } from '~/components/moonTextures'
import type { Summary } from '~/lib/data'
import type { ScenarioPiece } from '~/lib/scenarios'

/**
 * Pictures for Analyze. A site's thumbnail is its own computed skyline drawn as a ridge against the sky, never a stock
 * photo of somewhere else. The follow-up scenes are drawings, labelled as such where they appear.
 */

/** The site's real terrain horizon, unrolled from north round to north, as a small landscape. */
export function SiteThumb({ site, className = '' }: { site: Summary; className?: string }) {
  const W = 120
  const H = 72
  const els = site.skyline.elevation_deg.filter((_, i) => i % 12 === 0)
  const lo = Math.min(...els) - 0.5
  const hi = Math.max(...els, lo + 4) + 1.5
  const y = (e: number) => H - 6 - ((H * 0.62 - 6) * (e - lo)) / (hi - lo)
  const ridge = els.map((e, i) => `${((W * i) / (els.length - 1)).toFixed(1)},${y(e).toFixed(1)}`).join(' ')
  const id = `thumb-${site.site.id}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden preserveAspectRatio="none" className={`block ${className}`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05060a" />
          <stop offset="1" stopColor="#1a1d26" />
        </linearGradient>
        <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfd1d6" />
          <stop offset="0.25" stopColor="#7d8088" />
          <stop offset="1" stopColor="#2b2d33" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <polygon points={`0,${H} ${ridge} ${W},${H}`} fill={`url(#${id}-ground)`} />
      <polyline points={ridge} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="0.8" />
    </svg>
  )
}

/** The dark lunar backdrop of the feasibility summary: the Moon's limb from the NASA colour map, and Earth above it. */
export function MoonBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(100deg,#0a1220_0%,#0d1626_40%,#141a24_100%)]" />
      <div
        className="absolute -right-[12%] -bottom-[160%] aspect-square w-[75%] rounded-full bg-cover opacity-80 shadow-[inset_30px_40px_80px_rgb(0_0_0/0.85)]"
        style={{ backgroundImage: `url(${MOON_PREVIEW.color})`, backgroundSize: '260% 100%', backgroundPosition: '30% 50%' }}
      />
      <div className="absolute top-[14%] right-[22%] size-9 rounded-full bg-[radial-gradient(circle_at_35%_35%,#e8f4ff_0%,#5aa9e6_35%,#1d4f8f_70%,#0b1f3d_100%)] shadow-[inset_-6px_-3px_10px_rgb(0_0_0/0.8)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#0a1220_0%,rgb(10_18_32/0.92)_45%,transparent_80%)]" />
    </div>
  )
}

function Scene({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 240 110" role="img" aria-label={label} className="block h-28 w-full">
      <defs>
        <linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2030" />
          <stop offset="1" stopColor="#2e3342" />
        </linearGradient>
      </defs>
      <rect width="240" height="110" fill="url(#scene-sky)" />
      <path d="M0 80 C40 66 70 74 100 70 S170 60 240 72 V110 H0Z" fill="#8a8e98" />
      <path d="M0 92 C50 82 90 90 130 86 S200 80 240 88 V110 H0Z" fill="#5f636c" />
      {children}
    </svg>
  )
}

/** Drawings for the three follow-ups: a mast on the terrain, a relay spacecraft's arc to Earth, a rover's path. */
export function ScenarioScene({ piece }: { piece: ScenarioPiece }) {
  if (piece === 'mast')
    return (
      <Scene label="Drawing: a mast on the lunar surface">
        <path d="M120 76 L108 98 M120 76 L132 98 M120 76 V40 M112 88 H128" stroke="#e8e9ec" strokeWidth="2" fill="none" />
        <rect x="112" y="30" width="16" height="11" rx="1.5" fill="none" stroke="#e8e9ec" strokeWidth="2" />
        <path
          d="M104 28 a18 18 0 0 0 0 16 M136 28 a18 18 0 0 1 0 16 M98 24 a26 26 0 0 0 0 24 M142 24 a26 26 0 0 1 0 24"
          stroke="var(--color-sun)"
          strokeWidth="1.6"
          fill="none"
        />
      </Scene>
    )
  if (piece === 'relay')
    return (
      <Scene label="Drawing: a relay spacecraft between the surface and Earth">
        <circle cx="206" cy="40" r="20" fill="var(--color-comms)" opacity="0.85" />
        <path d="M30 78 Q 100 0 196 50" stroke="var(--color-relay)" strokeWidth="1.6" strokeDasharray="3 4" fill="none" />
        <g transform="translate(92 26) rotate(-18)">
          <rect x="-16" y="-3" width="12" height="6" fill="#8fa3d9" />
          <rect x="4" y="-3" width="12" height="6" fill="#8fa3d9" />
          <rect x="-4" y="-4" width="8" height="8" fill="#e8e9ec" />
        </g>
      </Scene>
    )
  return (
    <Scene label="Drawing: a rover and its path across the terrain">
      <path
        d="M96 90 C130 84 150 88 170 76 S200 60 214 46"
        stroke="var(--color-comms)"
        strokeWidth="1.6"
        strokeDasharray="3 4"
        fill="none"
      />
      <path d="M214 46 c0 -8 -10 -8 -10 0 c0 6 5 10 5 10 s5 -4 5 -10z" fill="var(--color-comms)" />
      <g stroke="#e8e9ec" strokeWidth="2" fill="none">
        <rect x="58" y="74" width="34" height="10" rx="2" />
        <path d="M64 74 V64 H78 M71 64 V58 H82 V64" />
        <circle cx="62" cy="88" r="4.5" />
        <circle cx="75" cy="88" r="4.5" />
        <circle cx="88" cy="88" r="4.5" />
      </g>
    </Scene>
  )
}
