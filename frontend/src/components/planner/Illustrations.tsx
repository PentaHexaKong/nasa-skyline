import type { Summary } from '~/lib/data'

/**
 * Pictures for Analyze. A site's thumbnail is its own computed skyline drawn as a ridge against the sky, never a stock
 * photo of somewhere else.
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
