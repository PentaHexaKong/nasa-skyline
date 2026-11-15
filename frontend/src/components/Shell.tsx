import { type LinkComponentProps, LinkProvider } from '@cloudflare/kumo'
import { Button } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { TooltipProvider } from '@cloudflare/kumo/components/tooltip'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { forwardRef, type ReactNode, useEffect } from 'react'
import { MotionNotice } from '~/components/MotionNotice'
import { Wordmark } from '~/components/Wordmark'

/** The app is dark only: <html> ships with data-mode="dark" (Kumo's mode switch) and nothing removes it. */

/** Small uppercase DM Mono label. The pip marks a page or section start. */
export function Eyebrow({ children, pip = false, className = '' }: { children: ReactNode; pip?: boolean; className?: string }) {
  return (
    <p className={`eyebrow flex items-center gap-2 text-ink-muted ${className}`}>
      {pip && <span aria-hidden className="size-1.5 shrink-0 bg-brand" />}
      {children}
    </p>
  )
}

/* Full-height tabs: the active page gets ink text and an ink bar on the header's bottom edge (shape, not colour alone). */
const navLink =
  'relative flex h-14 shrink-0 items-center px-2 text-xs font-medium tracking-[0.06em] text-ink-muted uppercase max-[359px]:px-1 max-[359px]:tracking-normal sm:px-3 sm:tracking-[0.12em] hover:text-ink data-[status=active]:text-ink focus-visible:-outline-offset-2 after:absolute after:inset-x-2 max-[359px]:after:inset-x-1 sm:after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-transparent data-[status=active]:after:bg-brand'

/** Lets Kumo's Link and LinkButton navigate client-side: same-origin paths go through the router, the rest stay plain anchors. */
const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(function AppLink({ href, onClick, ...rest }, ref) {
  const router = useRouter()
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (!href?.startsWith('/') || rest.target) return
        e.preventDefault()
        router.navigate({ href })
      }}
      {...rest}
    />
  )
})

/** The three ways in, as numbered in the storyboard. Each owns its deeper pages (site views, lessons, the lab, reports). */
const SECTIONS = [
  { n: '01', to: '/explore', label: 'Explore', owns: (p: string) => p.startsWith('/explore') },
  { n: '02', to: '/understand', label: 'Understand', owns: (p: string) => p.startsWith('/understand') },
  { n: '03', to: '/analyze', label: 'Analyze', owns: (p: string) => p.startsWith('/analyze') },
] as const

/**
 * The header tucks away once the page has scrolled past its own height and comes back on any scroll up. It sets
 * `data-header="hidden"` on <html>, which zeroes `--header-h` so the sticky bars under it close the gap.
 */
function useTuckingHeader(on: boolean) {
  useEffect(() => {
    if (!on) return
    const root = document.documentElement
    let last = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      // A couple of pixels of slack so trackpad jitter and iOS bounce don't flicker it.
      if (Math.abs(y - last) < 3) return
      const hide = y > 56 && y > last
      if (hide) root.dataset.header = 'hidden'
      else delete root.dataset.header
      last = y
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      delete root.dataset.header
    }
  }, [on])
}

/** `bare`: no header, for a page that is its own way in (the front door). */
export function Shell({
  children,
  tools,
  bare = false,
  solid = false,
  active,
}: {
  children: ReactNode
  tools?: ReactNode
  bare?: boolean
  /** A black header, for pages whose content scrolls under it (Analyze). */
  solid?: boolean
  /** Highlight this way in instead of the one the path belongs to: a page reached from another way in keeps that way lit. */
  active?: (typeof SECTIONS)[number]['to']
}) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  useTuckingHeader(!bare)
  return (
    <LinkProvider component={AppLink}>
      <TooltipProvider>
        <div className="isolate min-h-dvh">
          {!bare && (
            <header className={`site-header sticky top-0 z-(--z-sticky) ${solid ? 'bg-bg' : ''}`}>
              <div className="mx-auto flex h-14 max-w-7xl items-center gap-x-2 px-4 sm:gap-x-4 sm:px-6">
                <Link to="/" className="shrink-0 py-2.5 sm:pr-2" aria-label="Skyline, choose your journey">
                  {/* The Y's loop rises above and dips below the letters, so shift up to centre the letters with the nav labels. */}
                  <Wordmark className="h-6 w-auto -translate-y-[7%] max-[359px]:h-5 sm:h-7" />
                </Link>
                <nav aria-label="Main" className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none]">
                  {SECTIONS.map((s) => {
                    const on = active ? s.to === active : s.owns(path)
                    return (
                      <Link
                        key={s.to}
                        to={s.to}
                        // The router lights a link by path prefix; when a page names its own way in, only that one is lit.
                        activeOptions={active ? { exact: true } : undefined}
                        data-status={on ? 'active' : undefined}
                        aria-current={on ? 'page' : undefined}
                        className={navLink}
                      >
                        <span aria-hidden className="mr-1.5 hidden font-mono text-ink-faint lg:inline">
                          {s.n}
                        </span>
                        {s.label}
                      </Link>
                    )
                  })}
                </nav>
                <div className="-mr-2 ml-auto flex items-center gap-2 sm:-mr-3">
                  {tools}
                  <Link to="/sites" className={`${navLink} max-sm:hidden`}>
                    Sites
                  </Link>
                  <Link to="/method" className={`${navLink} max-sm:hidden`}>
                    Method
                  </Link>
                </div>
              </div>
            </header>
          )}
          <MotionNotice />
          {children}
        </div>
      </TooltipProvider>
    </LinkProvider>
  )
}

/** Plain-language explanation for educators and the public. Sits next to the chart it explains. */
export function Explain({ children, summary = 'What am I looking at?' }: { children: ReactNode; summary?: string }) {
  return (
    <Collapsible.Root>
      <Collapsible.DefaultTrigger>{summary}</Collapsible.DefaultTrigger>
      <Collapsible.DefaultPanel>
        <div className="max-w-[68ch] space-y-2 leading-relaxed text-ink-muted text-pretty">{children}</div>
      </Collapsible.DefaultPanel>
    </Collapsible.Root>
  )
}

/** The + on a gap that touches the edge of its window. Always rendered, so units stay in one column. */
export function OpenEnd({ open }: { open: boolean }) {
  return <span className={open ? '' : 'invisible'}> +</span>
}

export function StepButton({ label, onClick, disabled, dir }: { label: string; onClick: () => void; disabled?: boolean; dir: -1 | 1 }) {
  return (
    <Button
      variant="secondary"
      shape="square"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      icon={dir < 0 ? CaretLeftIcon : CaretRightIcon}
      className="shrink-0"
    />
  )
}

/** Page foot for the text pages: the claims line and where the method lives. */
export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-x-8 gap-y-3 px-4 py-6 text-xs text-ink-faint sm:px-6">
        <p>Lunar Landing Site Navigation. An independent project, not affiliated with NASA.</p>
        <p>
          Geometric opportunities under stated assumptions, not delivered power or a guaranteed link.{' '}
          <Link to="/method" className="text-ink-muted underline underline-offset-3 hover:text-ink">
            How we know
          </Link>
        </p>
      </div>
    </footer>
  )
}
