import { ArrowRightIcon, ArrowUpRightIcon, CubeIcon } from '@phosphor-icons/react'
import { Link, type LinkProps, useRouterState } from '@tanstack/react-router'
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { understandBack } from '~/lib/useSiteView'

/**
 * Pieces shared by the story pages (Home, Explore, Understand): the mascot, its speech bubble, the call-to-action
 * button and the scroll-driven parallax. The mascot art is the team's own, cut from the storyboard into
 * `public/mascot/`: the scarf explorer guides Explore, the scientist in glasses guides Understand, and the planner with
 * the clipboard guides Analyze.
 */

const EXPLORER = ['lookup', 'pointing', 'magnifier', 'waving', 'thinking', 'happy', 'wondering', 'hello'] as const
const SCIENTIST = ['globe', 'slider', 'sun', 'earth', 'question', 'moons', 'sparkle', 'presenting'] as const
const PLANNER = ['clipboard', 'surprised', 'thinking', 'magnifier', 'pointing', 'presenting', 'excited', 'confused', 'cheer'] as const

export type MascotPose =
  | `explorer-${(typeof EXPLORER)[number]}`
  | `scientist-${(typeof SCIENTIST)[number]}`
  | `planner-${(typeof PLANNER)[number]}`

/** All three guides are transparent cutouts with opaque white faces, readable against the dark page. */
export function Mascot({ pose, className = '' }: { pose: MascotPose; className?: string }) {
  const src = `/mascot/cutouts/${pose}.png`
  const img = <img src={src} alt="" aria-hidden draggable={false} className="block h-full w-full object-contain select-none" />
  return <div className={`mascot ${className}`}>{img}</div>
}

/** `anchor`: the lesson section this button sits in, so the 3D view can lead back to it. */
export function StandHereLink({ href, label, anchor }: { href: string; label: string; anchor?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <a
      href={`${href}?back=${encodeURIComponent(understandBack(path, anchor))}`}
      className="group inline-flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-xl border border-line-strong bg-[#111720] p-3 text-sm transition-[border-color,background-color,transform] duration-200 hover:border-white/60 hover:bg-[#1a2330] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-safe:hover:-translate-y-0.5"
    >
      <Mascot pose="explorer-pointing" className="size-16 shrink-0 transition-transform duration-200 motion-safe:group-hover:-rotate-3" />
      <span className="grid flex-1 gap-1">
        <span className="flex items-center gap-2 text-xs text-ink-muted">
          <CubeIcon aria-hidden className="size-3.5" />
          Explore this place in 3D
        </span>
        <span className="font-medium text-ink">{label}</span>
      </span>
      <ArrowUpRightIcon
        aria-hidden
        className="size-5 shrink-0 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
      />
    </a>
  )
}

/**
 * What the mascot says: one short line. With `more`, the line gains a "Tell me more" that opens a plain explanation
 * inside the bubble, for the reader who wants it; the page never depends on it being opened.
 */
export function Bubble({
  children,
  more,
  className = '',
}: {
  children: ReactNode
  /** The fuller explanation, and optionally a way to the deeper chart. */
  more?: { text: ReactNode; link?: { href: string; label: string } }
  className?: string
}) {
  if (!more) return <p className={`bubble max-w-[16rem] ${className}`}>{children}</p>
  return (
    <div className={`bubble max-w-[20rem] ${className}`}>
      <p>{children}</p>
      <details className="bubble-more group">
        <summary className="mt-1.5 inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-story underline-offset-2 hover:underline">
          <span className="group-open:hidden">Tell me more</span>
          <span className="hidden group-open:inline">Show less</span>
        </summary>
        <div className="mt-2 grid gap-2 border-t border-black/10 pt-2 text-pretty">
          <p>{more.text}</p>
          {more.link && (
            <a href={more.link.href} className="inline-flex items-center gap-1 text-xs font-medium text-story hover:underline">
              {more.link.label}
              <ArrowRightIcon aria-hidden weight="bold" className="size-3" />
            </a>
          )}
        </div>
      </details>
    </div>
  )
}

/** The mascot with what it says beside it. The words are also in the page's text, so the bubble is not the only place a reader finds them. */
export function Guide({
  pose,
  says,
  className = '',
  size = 'size-24',
}: {
  pose: MascotPose
  says: ReactNode
  className?: string
  size?: string
}) {
  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <Mascot pose={pose} className={`${size} shrink-0`} />
      <Bubble className="mb-6">{says}</Bubble>
    </div>
  )
}

export function StoryLink({ children, ...link }: LinkProps & { children: ReactNode; className?: string }) {
  return (
    <Link {...link} className={`story-button ${link.className ?? ''}`}>
      <span>{children}</span>
      <ArrowRightIcon aria-hidden weight="bold" className="size-4" />
    </Link>
  )
}

/**
 * Writes how far a section has scrolled through the screen into its `--p` (0 when its top meets the bottom of the
 * screen, 1 when its bottom leaves the top), once per frame. Children with `.parallax` or `.zoom-in` move with it.
 */
export function useScrollProgress<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const read = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const h = window.innerHeight
      const p = Math.max(0, Math.min(1, (h - r.top) / (h + r.height)))
      el.style.setProperty('--p', p.toFixed(4))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return ref
}

/** A parallax layer: `depth` is how far, in px, it travels while its section crosses the screen. */
export const depth = (px: number) => ({ '--depth': `${px}px` }) as CSSProperties

/** The thin blue orbits behind the closing sections. */
export function Orbits() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div data-spin className="orbit-ring top-[18%] left-[-10%] h-[70%] w-[120%]" />
      <div className="orbit-ring top-[30%] left-[5%] h-[52%] w-[90%] opacity-60" />
    </div>
  )
}
