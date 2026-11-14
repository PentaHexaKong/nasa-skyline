import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { DAY_MS, HOUR_MS, type MissionWindow, type Span } from '~/lib/mission'
import { shortDate } from '~/lib/time'

export type Lane = { key: string; label: string; spans: Span[]; fill: string; value?: string }

const KEYS: Record<string, number> = { ArrowLeft: -HOUR_MS, ArrowRight: HOUR_MS, PageUp: -DAY_MS, PageDown: DAY_MS }

function tickStep(w: MissionWindow) {
  const days = (w.end - w.start) / DAY_MS
  return days <= 4 ? 1 : days <= 16 ? 2 : 7
}

function ticks(w: MissionWindow) {
  const step = tickStep(w)
  const first = Math.ceil(w.start / DAY_MS) * DAY_MS
  return Array.from({ length: Math.floor((w.end - first) / (step * DAY_MS)) + 1 }, (_, i) => first + i * step * DAY_MS).filter(
    (t) => t < w.end,
  )
}

/** Room one date label needs, in px ("30 Dec" in the 2xs mono face, plus a gap). */
const TICK_PX = 48
/** Width of one date label alone, in px. */
const LABEL_PX = 40

/**
 * Keep every date label while they fit; on a narrow row (a phone, or a lane with a long label) keep every second or
 * fourth one so they never overlap. `width` is the row's width in px, 0 before it is measured.
 */
export function tickStride(w: MissionWindow, width: number) {
  if (width <= 0) return 1
  const gap = (width * tickStep(w) * DAY_MS) / (w.end - w.start)
  let stride = 1
  while (gap * stride < TICK_PX && stride < 8) stride *= 2
  return stride
}

/** The width of an element, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Rows of [start, end) spans over one window. An empty stretch of a lane is hidden, drawn as an outline only. */
export function Lanes({
  window: w,
  lanes,
  cursor,
  onScrub,
  label,
}: {
  window: MissionWindow
  lanes: Lane[]
  cursor?: number
  onScrub?: (t: number) => void
  label: string
}) {
  const pct = (t: number) => ((t - w.start) / (w.end - w.start)) * 100
  const [axis, axisWidth] = useWidth<HTMLDivElement>()
  const stride = tickStride(w, axisWidth)
  const clampT = (t: number) => Math.max(w.start, Math.min(w.end - 60_000, t))
  const from = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onScrub?.(clampT(w.start + ((e.clientX - r.left) / r.width) * (w.end - w.start)))
  }
  const onKey = (e: KeyboardEvent) => {
    const step = KEYS[e.key]
    if (step && cursor != null) {
      e.preventDefault()
      onScrub?.(clampT(cursor + step))
    }
  }
  const scrub = onScrub
    ? {
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          from(e)
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          if (e.buttons) from(e)
        },
      }
    : {}
  const slider =
    onScrub && cursor != null
      ? {
          role: 'slider',
          tabIndex: 0,
          'aria-label': label,
          'aria-valuemin': w.start,
          'aria-valuemax': w.end,
          'aria-valuenow': cursor,
          'aria-valuetext': `${new Date(cursor).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
          onKeyDown: onKey,
        }
      : { role: 'img', 'aria-label': label }
  const shown = lanes.some((l) => l.value)
  // A label may run past the row's end into the value column, but not off a narrow row with nothing beside it.
  const fits = (t: number) => axisWidth <= 0 || (pct(t) / 100) * axisWidth + LABEL_PX <= axisWidth + (shown ? 60 : 8)

  return (
    <div
      {...slider}
      className={`grid gap-1.5 rounded-sm ${shown ? 'grid-cols-[auto_minmax(0,1fr)_3.75rem]' : 'grid-cols-[auto_minmax(0,1fr)]'} items-center`}
    >
      {lanes.map((l) => (
        <div key={l.key} className="col-span-full grid grid-cols-subgrid items-center">
          <span className="pr-1 text-xs whitespace-nowrap text-ink-muted">{l.label}</span>
          <div {...scrub} className={`relative h-3 touch-none outline -outline-offset-1 outline-line ${onScrub ? 'cursor-ew-resize' : ''}`}>
            {l.spans.map(([a, b]) => (
              <i key={a} className={`absolute inset-y-0 ${l.fill}`} style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />
            ))}
            {cursor != null && cursor >= w.start && cursor < w.end && (
              <span className="absolute -inset-y-1 w-0.5 -translate-x-px bg-now" style={{ left: `${pct(cursor)}%` }} />
            )}
          </div>
          {shown && <span className="readout text-right text-xs">{l.value}</span>}
        </div>
      ))}
      <div ref={axis} className="relative col-start-2 h-4">
        {ticks(w)
          .filter((t, i) => i % stride === 0 && fits(t))
          .map((t) => (
            <span key={t} className="absolute top-0 font-mono text-2xs whitespace-nowrap text-ink-faint" style={{ left: `${pct(t)}%` }}>
              {shortDate(new Date(t).toISOString().slice(0, 10))}
            </span>
          ))}
      </div>
    </div>
  )
}
