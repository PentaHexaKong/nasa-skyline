import type { ReactNode } from 'react'
import type { InvestigationId } from '~/lib/investigation'

/**
 * One small picture per question, in the same language as the skyline chart (white terrain line, amber Sun, cyan Earth),
 * so the card shows what the question is about rather than a bare patch of terrain.
 */
const STARS: [number, number][] = [
  [24, 20],
  [70, 44],
  [118, 16],
  [176, 34],
  [232, 14],
  [286, 40],
  [300, 76],
]

function Sky({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 160" role="img" aria-hidden className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="160" fill="#06090d" />
      {STARS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="white" opacity="0.45" />
      ))}
      {children}
    </svg>
  )
}

const RIDGE = 'fill-[#11151b] stroke-white/80'

export function ScenarioArt({ id, className = '' }: { id: InvestigationId; className?: string }) {
  return (
    <div className={`overflow-hidden bg-[#06090d] ${className}`}>
      {id === 'mountain' && (
        <Sky>
          <path d="M20 132 Q160 -20 300 118" fill="none" className="stroke-sun" strokeWidth="1.5" strokeDasharray="4 5" opacity="0.7" />
          <circle cx="236" cy="78" r="17" className="fill-sun" />
          <path
            d="M0 160 V116 L38 102 L78 118 L126 80 L168 94 L212 82 L262 104 L320 96 V160Z"
            className={RIDGE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </Sky>
      )}
      {id === 'light' && (
        <Sky>
          <line x1="160" x2="160" y1="14" y2="146" stroke="white" strokeOpacity="0.2" strokeDasharray="3 5" />
          {/* Left: lots of sunlight, Earth hidden behind the near hill. */}
          <circle cx="86" cy="60" r="15" className="fill-sun" />
          <circle cx="42" cy="104" r="6" className="fill-comms" />
          <path
            d="M0 160 V122 L22 112 L52 110 L84 126 L130 118 L160 124 V160Z"
            className={RIDGE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M24 160 V118 L52 100 L78 122 V160Z" className={RIDGE} strokeWidth="1.5" strokeLinejoin="round" />
          {/* Right: a tall ridge hides the Sun, Earth clears it. */}
          <circle cx="262" cy="108" r="15" className="fill-sun" />
          <circle cx="224" cy="48" r="6" className="fill-comms" />
          <path
            d="M160 160 V128 L190 112 L226 96 L252 74 L282 92 L320 104 V160Z"
            className={RIDGE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </Sky>
      )}
      {id === 'later' && (
        <Sky>
          <path
            d="M14 118 Q96 6 178 66 T306 118"
            fill="none"
            className="stroke-sun"
            strokeWidth="1.5"
            strokeDasharray="4 5"
            opacity="0.7"
          />
          <circle cx="92" cy="50" r="14" className="fill-sun" />
          <circle cx="232" cy="92" r="14" className="stroke-sun" fill="#06090d" strokeWidth="2" strokeDasharray="3 3" />
          <path d="M112 46 H204" stroke="white" strokeOpacity="0.55" strokeWidth="1.5" />
          <path d="M198 40 L206 46 L198 52" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.5" />
          <path
            d="M0 160 V120 L46 108 L98 122 L154 104 L204 110 L250 96 L320 112 V160Z"
            className={RIDGE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </Sky>
      )}
    </div>
  )
}
