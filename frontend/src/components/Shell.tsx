import { type LinkComponentProps, LinkProvider } from '@cloudflare/kumo'
import { Button } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { TooltipProvider } from '@cloudflare/kumo/components/tooltip'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { forwardRef, type ReactNode } from 'react'
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

/** Explore is one page at `/` for the public and classrooms; the site views and lessons it opens belong to it too. */
const exploreSection = (path: string) => path === '/' || path.startsWith('/explore') || path.startsWith('/understand')

export function Shell({ children, tools }: { children: ReactNode; tools?: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <LinkProvider component={AppLink}>
      <TooltipProvider>
        <div className="isolate min-h-dvh">
          <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-bg">
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-x-2 px-4 sm:gap-x-4 sm:px-6">
              <Link to="/" className="shrink-0 py-2.5 sm:pr-2">
                {/* The Y's loop rises above and dips below the letters, so shift up to centre the letters with the nav labels. */}
                <Wordmark className="h-6 w-auto -translate-y-[7%] max-[359px]:h-5 sm:h-7" />
              </Link>
              <nav aria-label="Main" className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none]">
                <Link
                  to="/"
                  activeOptions={{ exact: true, includeHash: false, includeSearch: false }}
                  data-status={exploreSection(path) ? 'active' : undefined}
                  aria-current={exploreSection(path) ? 'page' : undefined}
                  className={navLink}
                >
                  Explore
                </Link>
                <Link to="/analyze" className={navLink}>
                  Analyze
                </Link>
              </nav>
              <div className="-mr-2 ml-auto flex items-center gap-2 sm:-mr-3">
                {tools}
                <Link to="/method" className={`${navLink} max-sm:hidden`}>
                  Method
                </Link>
              </div>
            </div>
          </header>
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
