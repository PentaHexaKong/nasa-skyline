import { ArrowRightIcon, CheckIcon } from '@phosphor-icons/react'
import { type CSSProperties, type PointerEvent, useLayoutEffect, useRef } from 'react'

/** `seen`: the reader has opened this question this visit (its point on the track gets a tick). */
export type DeckItem = { id: string; title: string; desc: string; value: string; detail?: string; seen?: boolean }

/**
 * How far the card behind the front one peeks out above it, and how much smaller it is. Only that one card shows: the
 * rest wait exactly behind it, so the stack reads as "more questions" without a pile of edges.
 */
export const PEEK = 15
const SHRINK = 0.055
const THROW_MS = 470
const RETURN_MS = 540
/** A drag this far (or a fifth of the card) throws the card. */
const THROW_AT = 90

const poseOf = (depth: number) => {
  const d = Math.min(depth, 1)
  return `translate(0px, ${(-d * PEEK).toFixed(1)}px) rotate(0deg) scale(${(1 - d * SHRINK).toFixed(3)})`
}
const outOf = (dir: number, w: number) => `translate(${(dir * w).toFixed(0)}px, 46px) rotate(${dir * 24}deg) scale(0.94)`
const FACE = ['#0a0a0a', '#151515', '#1e1e1e', '#272727']

/**
 * The four questions as one stack of cards in the middle of the stage. The front card is the question in hand; the
 * others peek out behind it. Moving forward throws the front card off the stage, right then left in turn (or the way it
 * was dragged), and it rejoins the back of the stack; moving back pulls the card in from the side. The arrows and the
 * numbered points beside the stack bring any question to the front. Only transform and opacity change, so it stays smooth on phones.
 */
export function Deck({
  items,
  front,
  width,
  hideFront,
  reduced,
  onFront,
  onOpen,
  cardRef,
}: {
  items: DeckItem[]
  front: number
  /** How far a thrown card travels, in px: past the edge of the stage. */
  width: number
  /** The front card has become its panel. */
  hideFront: boolean
  reduced: boolean
  onFront: (i: number) => void
  onOpen: (i: number) => void
  cardRef: (id: string, el: HTMLButtonElement | null) => void
}) {
  const n = items.length
  const cards = useRef<(HTMLLIElement | null)[]>([])
  const prev = useRef(front)
  const throws = useRef(0)
  // A drag hands the throw its start and its direction.
  const drag = useRef<{ id: number; x0: number; dx: number; moved: boolean } | null>(null)
  const dragOut = useRef<{ from: string; dir: number } | null>(null)
  const depthOf = (i: number) => (i - front + n) % n

  useLayoutEffect(() => {
    const was = prev.current
    prev.current = front
    if (was === front || reduced) {
      dragOut.current = null
      return
    }
    const fly = (el: HTMLLIElement, frames: Keyframe[], delay: number, duration: number, easing: string, after?: Keyframe[]) => {
      for (const a of el.getAnimations()) a.cancel()
      // The card's own transition would fight the throw, so it steps aside until the card is back in the stack.
      el.style.transition = 'none'
      const a = el.animate(frames, { duration, delay, easing, fill: 'backwards' })
      a.finished
        .then(() => {
          if (!after) return
          return el.animate(after, { duration: 380, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }).finished
        })
        .then(() => {
          el.style.transition = ''
        })
        .catch(() => {
          el.style.transition = ''
        })
    }
    const forward = (front - was + n) % n
    if (forward <= n / 2) {
      // Throw the cards that were in front, one after another, right then left.
      for (let j = 0; j < forward; j++) {
        const i = (was + j) % n
        const el = cards.current[i]
        if (!el) continue
        const dragged = j === 0 ? dragOut.current : null
        const dir = dragged?.dir ?? (throws.current++ % 2 === 0 ? 1 : -1)
        const back = poseOf(depthOf(i))
        fly(
          el,
          [
            { transform: dragged?.from ?? poseOf(j), opacity: 1 },
            { transform: outOf(dir, width), opacity: 0 },
          ],
          j * 110,
          THROW_MS,
          'cubic-bezier(0.45, 0, 0.85, 0.4)',
          [
            { transform: `${back} translate(0px, -26px)`, opacity: 0 },
            { transform: back, opacity: 1 },
          ],
        )
      }
    } else {
      // Pull cards back in from the side, the way the last one went out.
      for (let j = 0; j < n - forward; j++) {
        const i = (was - 1 - j + n) % n
        const el = cards.current[i]
        if (!el) continue
        const dir = --throws.current % 2 === 0 ? 1 : -1
        fly(
          el,
          [
            { transform: outOf(dir, width), opacity: 0 },
            { transform: poseOf(depthOf(i)), opacity: 1 },
          ],
          j * 110,
          RETURN_MS,
          'cubic-bezier(0.2, 0.9, 0.3, 1.05)',
        )
      }
    }
    dragOut.current = null
  })

  const go = (i: number) => onFront(((i % n) + n) % n)

  const onDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (depthOf(i) !== 0 || hideFront) return
    drag.current = { id: e.pointerId, x0: e.clientX, dx: 0, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    const d = drag.current
    const el = cards.current[i]
    if (!d || d.id !== e.pointerId || !el) return
    d.dx = e.clientX - d.x0
    if (Math.abs(d.dx) > 6) d.moved = true
    if (!d.moved || reduced) return
    el.style.transition = 'none'
    el.style.transform = `${poseOf(0)} translate(${d.dx.toFixed(1)}px, 0px) rotate(${(d.dx * 0.05).toFixed(2)}deg)`
  }
  const onUp = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    const d = drag.current
    const el = cards.current[i]
    if (!d || d.id !== e.pointerId || !el) return
    drag.current = null
    if (!d.moved) return
    if (Math.abs(d.dx) >= Math.min(THROW_AT, el.offsetWidth / 5)) {
      dragOut.current = { from: el.style.transform, dir: Math.sign(d.dx) }
      go(front + 1)
    } else {
      el.style.transition = ''
      el.style.transform = poseOf(0)
    }
    // The pointer-up of a drag must not also open the card.
    el.dataset.dragged = ''
    window.setTimeout(() => {
      delete el.dataset.dragged
    }, 0)
  }

  return (
    <div className="flex items-end gap-3 sm:gap-4">
      <ul aria-label="The four questions" className="relative h-[var(--card-h)] w-[var(--card-w)]">
        {items.map((it, i) => {
          const depth = depthOf(i)
          const isFront = depth === 0
          return (
            <li
              key={it.id}
              ref={(el) => {
                cards.current[i] = el
              }}
              aria-hidden={!(isFront || (hideFront && depth === 1)) || undefined}
              className="plan-card absolute inset-0"
              data-depth={depth}
              style={{
                transform: poseOf(depth),
                transformOrigin: '50% 0%',
                zIndex: n - depth,
                opacity: isFront && hideFront ? 0 : 1,
              }}
            >
              <div className="plan-card-in h-full" style={{ '--i': n - 1 - i } as CSSProperties}>
                <button
                  type="button"
                  tabIndex={(isFront && !hideFront) || (hideFront && depth === 1) ? 0 : -1}
                  ref={(el) => cardRef(it.id, el)}
                  onClick={() => {
                    if (cards.current[i]?.dataset.dragged != null) return
                    if (isFront) onOpen(i)
                    else go(i)
                  }}
                  onPointerDown={(e) => onDown(e, i)}
                  onPointerMove={(e) => onMove(e, i)}
                  onPointerUp={(e) => onUp(e, i)}
                  onPointerCancel={() => {
                    drag.current = null
                    const el = cards.current[i]
                    if (el) {
                      el.style.transition = ''
                      el.style.transform = poseOf(0)
                    }
                  }}
                  aria-label={
                    hideFront && depth === 1
                      ? `Up next, question ${i + 1} of ${n}: ${it.title}`
                      : `Question ${i + 1} of ${n}: ${it.title} Current answer: ${it.value}${it.detail ? `, ${it.detail}` : ''}. Open to change it.`
                  }
                  className="plan-card-face group flex h-full w-full cursor-pointer touch-pan-y flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-white/15 p-5 text-left select-none sm:rounded-3xl sm:p-8"
                  style={{ backgroundColor: FACE[depth] }}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="readout text-xs text-ink-faint">
                      {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
                    </span>
                    <span className="text-right text-sm text-ink/80 sm:text-base">{it.title}</span>
                  </span>
                  <span className="grid gap-1">
                    <span className="text-[clamp(1.6rem,1.05rem+1.7vw,2.5rem)] leading-tight font-medium text-balance">{it.value}</span>
                    {it.detail && <span className="text-sm text-ink-muted sm:text-base">{it.detail}</span>}
                  </span>
                  {/* The way in, said out loud: the answer is filled in already, and this is where to change it. */}
                  <span className="flex items-end justify-between gap-4">
                    <span className="text-sm leading-relaxed text-ink-muted text-pretty max-sm:sr-only">{it.desc}</span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white py-1.5 pr-3 pl-3.5 text-sm font-medium text-black max-sm:ml-auto">
                      Change
                      <ArrowRightIcon aria-hidden weight="bold" className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* The track: one point per question; click one to bring it to the front. */}
      <nav aria-label="Questions" className="flex flex-col items-center">
        <ol className="flex flex-col items-center gap-1">
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === front ? 'step' : undefined}
                aria-label={`Question ${i + 1}: ${it.title}${it.seen ? ' (checked)' : ''}`}
                title={it.title}
                className="group grid h-9 w-11 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
              >
                <span
                  aria-hidden
                  className={`readout grid h-7 place-items-center rounded-full text-xs transition-all duration-300 ${
                    i === front ? 'w-10 bg-white text-black' : 'w-7 border border-white/40 bg-black/60 text-ink group-hover:border-white'
                  }`}
                >
                  {it.seen && i !== front ? <CheckIcon weight="bold" /> : i + 1}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}
