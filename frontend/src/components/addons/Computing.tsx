/**
 * Loading for the add-ons: a small drawing of what is being computed, and placeholder rows where the answer will land.
 *
 * - `relay`: a relay rounds its orbit and drops behind the site's horizon, as the service follows it over the stay.
 * - `sun`: the Sun runs its arc over a mast at the landing spot.
 * - `rover`: reach spreads out from the landing over the ground.
 *
 * Constant motion is linear; the reach rings ease out. Under reduced motion the drawing holds still and breathes in
 * opacity instead, so the panel still reads as working (styles.css, "Add-on loading").
 */
export type ComputingKind = 'relay' | 'sun' | 'rover'

/** Relay and rover reach share the contact colour the rover map tints its reach with; the mast's is the Sun. */
const TONE: Record<ComputingKind, string> = { relay: 'text-comms', sun: 'text-sun', rover: 'text-comms' }

/** The ridge line the drawings stand on, in a 96 × 48 box, with the landing spot at x = 48. */
const RIDGE = 'M0 36 L12 33 L22 35 L33 30 L41 33 L48 32 L56 34 L66 29 L76 33 L86 31 L96 34'

export function ComputingMark({ kind, className = '' }: { kind: ComputingKind; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 96 48"
      fill="none"
      className={`computing-mark h-14 w-28 shrink-0 overflow-visible ${TONE[kind]} ${className}`}
    >
      <defs>
        {/* Everything in the sky is cut off at the ridge, so the relay and the Sun set behind real ground. */}
        <clipPath id={`computing-sky-${kind}`}>
          <path d={`${RIDGE} L96 0 L0 0 Z`} />
        </clipPath>
      </defs>

      {kind === 'relay' && (
        <g clipPath={`url(#computing-sky-${kind})`}>
          <circle cx="48" cy="40" r="30" stroke="currentColor" strokeOpacity="0.45" strokeDasharray="2 3" />
          <g className="computing-orbit">
            <circle cx="48" cy="10" r="3" fill="currentColor" />
            <path d="M44 10 H40 M52 10 H56" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </g>
      )}

      {kind === 'sun' && (
        <>
          <g clipPath={`url(#computing-sky-${kind})`}>
            <g className="computing-orbit computing-orbit-slow">
              <circle cx="48" cy="12" r="4" fill="currentColor" />
            </g>
          </g>
          <path d="M48 32 V18 M44 18 H52" stroke="var(--color-ink)" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}

      {kind === 'rover' && (
        <>
          <ellipse
            className="computing-ping"
            cx="48"
            cy="33"
            rx="40"
            ry="9"
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <ellipse
            className="computing-ping computing-ping-late"
            cx="48"
            cy="33"
            rx="40"
            ry="9"
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </>
      )}

      <path d={RIDGE} stroke="var(--color-ink)" strokeOpacity="0.45" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx="48" cy="32" r="2" fill="var(--color-ink)" />
    </svg>
  )
}

/**
 * Where the answer will land: a label and a bar per row, with a light sweep across them. Widths vary so the block
 * reads as content to come rather than a striped panel.
 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  const widths = ['92%', '74%', '86%', '62%', '80%', '70%']
  return (
    <div aria-hidden className="grid gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4">
          <span className="skeleton-line h-3 rounded-full" />
          <span className="skeleton-line h-5 rounded-md" style={{ width: widths[i % widths.length] }} />
        </div>
      ))}
    </div>
  )
}
