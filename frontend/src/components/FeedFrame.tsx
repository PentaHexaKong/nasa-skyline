import { Badge } from '@cloudflare/kumo/components/badge'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import type { ReactNode } from 'react'
import type { Feed } from '~/lib/feeds'

type Delivered = {
  origin: 'computed' | 'fixture'
  provenance: { algorithm_version: string; sources: string[]; assumptions: string[] }
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border border-line px-5 py-4">
      <p className="font-medium">{title}</p>
      <div className="max-w-[68ch] text-ink-muted text-pretty">{children}</div>
    </div>
  )
}

/** A wide table that scrolls on its own: focusable, so keyboard users can scroll it too. */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      {children}
    </div>
  )
}

/** Every pipeline-fed panel goes through here, so loading, missing, invalid and synthetic results read the same everywhere. */
export function FeedFrame<T extends Delivered>({
  feed,
  title,
  what,
  limit,
  children,
}: {
  feed: Feed<T>
  title: string
  /** What this panel will show, for the not-computed state. */
  what: string
  /** The claim boundary, next to the result. */
  limit: string
  children: (data: T) => ReactNode
}) {
  const dev = import.meta.env.DEV
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-medium">{title}</h3>
        {feed.state === 'ready' && feed.data.origin === 'fixture' && <Badge variant="destructive">Fixture, not a result</Badge>}
      </div>
      {feed.state === 'loading' && <div aria-busy className="h-24 border border-line" />}
      {feed.state === 'not_computed' && (
        <Notice title={feed.reason ? 'Select a scenario' : 'Not computed yet'}>
          <p>{feed.reason ?? what}</p>
          {dev && <p className="mt-1 font-mono text-xs">frontend/data/feeds/{feed.path}</p>}
        </Notice>
      )}
      {feed.state === 'invalid' && (
        <Notice title="Result hidden">
          <p>This result does not match its contract, so it is not shown.</p>
          {dev && <pre className="mt-2 font-mono text-xs whitespace-pre-wrap">{`${feed.path}\n${feed.issues.slice(0, 8).join('\n')}`}</pre>}
        </Notice>
      )}
      {feed.state === 'ready' && (
        <>
          {children(feed.data)}
          <p className="max-w-[68ch] text-xs text-ink-faint text-pretty">{limit}</p>
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>Assumptions and sources</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <div className="grid max-w-[68ch] gap-3 text-ink-muted">
                <ul className="list-disc space-y-1 pl-4">
                  {feed.data.provenance.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <ul className="list-disc space-y-1 pl-4">
                  {feed.data.provenance.sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <p className="tabular text-xs">Algorithm {feed.data.provenance.algorithm_version}</p>
              </div>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        </>
      )}
    </section>
  )
}
