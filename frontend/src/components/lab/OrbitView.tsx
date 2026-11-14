import type { MoonEphemeris } from '~/lib/data'
import { subPoints } from '~/lib/moonLight'

/**
 * "Play with orbit": the Earth–Moon–Sun geometry, seen from above the Moon's orbit, at the lab's moment. The angle
 * between the Sun and Earth seen from the Moon is the angle between the sub-solar and sub-Earth points of the
 * pipeline's SPICE ephemeris; nothing is animated on its own, it follows the day slider. Not to scale.
 */
export function OrbitView({ eph, hours }: { eph: MoonEphemeris; hours: number }) {
  const { sun, earth } = subPoints(eph, Math.max(0, hours))
  const rad = (d: number) => (d * Math.PI) / 180
  // Angle Sun–Moon–Earth: the great-circle angle between the two sub-points.
  const cos =
    Math.sin(rad(sun.lat)) * Math.sin(rad(earth.lat)) +
    Math.cos(rad(sun.lat)) * Math.cos(rad(earth.lat)) * Math.cos(rad(sun.lon - earth.lon))
  const phase = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
  // Waxing or waning: which side of the sub-Earth meridian the sub-solar point is on.
  const sign = Math.sin(rad(sun.lon - earth.lon)) >= 0 ? 1 : -1
  // The Sun is far off to the right. The Moon sits on its orbit where its Sun and Earth directions meet at `phase`.
  const theta = rad(180 - phase) * sign
  const R = 84
  const mx = 120 + R * Math.cos(theta)
  const my = 110 - R * Math.sin(theta)
  const lit = Math.round(((1 + Math.cos(rad(phase))) / 2) * 100)
  return (
    <figure className="grid gap-2">
      <svg
        viewBox="0 0 260 220"
        role="img"
        aria-label={`Moon on its orbit; seen from the Moon the Sun and Earth are ${Math.round(phase)}° apart`}
        className="w-full"
      >
        <defs>
          <linearGradient id="sunrays" x1="1" x2="0">
            <stop offset="0" stopColor="var(--color-sun)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--color-sun)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="160" y="0" width="100" height="220" fill="url(#sunrays)" />
        <text x="252" y="16" textAnchor="end" className="fill-sun text-[10px]">
          Sun →
        </text>
        <circle cx="120" cy="110" r={R} fill="none" stroke="var(--color-story)" strokeOpacity="0.6" strokeDasharray="3 4" />
        <circle cx="120" cy="110" r="13" fill="var(--color-comms)" />
        <text x="120" y="138" textAnchor="middle" className="fill-ink-muted text-[10px]">
          Earth
        </text>
        <g transform={`translate(${mx} ${my})`}>
          <circle r="8" fill="#555" />
          {/* The half facing the Sun (to the right) is lit. */}
          <path d="M0 -8 A8 8 0 0 1 0 8 Z" fill="#ddd" />
          <text y="-13" textAnchor="middle" className="fill-ink text-[10px]">
            Moon
          </text>
        </g>
        <line x1={mx} y1={my} x2="120" y2="110" stroke="var(--color-comms)" strokeOpacity="0.5" />
      </svg>
      <figcaption className="grid gap-1 text-xs text-ink-muted">
        <span>
          From the Moon, the Sun and Earth are <span className="readout text-ink">{Math.round(phase)}°</span> apart. From Earth, about{' '}
          <span className="readout text-ink">{lit} %</span> of the Moon’s near side looks lit.
        </span>
        <span className="text-ink-faint">Top view, not to scale. From the SPICE ephemeris the pipeline computed.</span>
      </figcaption>
    </figure>
  )
}
