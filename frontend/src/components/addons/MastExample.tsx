import { Badge } from '@cloudflare/kumo/components/badge'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { useState } from 'react'
import { MAST_EXAMPLE } from '~/components/addons/mastData'
import { MastPlan, MastSection, MastTrade } from '~/components/addons/mastViews'
import { longDate } from '~/lib/time'

type View = 'plan' | 'section' | 'trade'
const VIEWS: { value: View; label: string }[] = [
  { value: 'plan', label: 'Site plan' },
  { value: 'section', label: 'Section' },
  { value: 'trade', label: 'Trade-off' },
]

const NAMES: Record<string, string> = { CR1: 'Connecting Ridge', GR1: 'de Gerlache Rim', SR1: 'Shackleton Rim' }
const data = MAST_EXAMPLE
const site = NAMES[data.site_id] ?? data.site_id
const hours = Math.round((Date.parse(data.period.end_utc) - Date.parse(data.period.start_utc)) / 3_600_000)
const heights = [...new Set(data.candidates.flatMap((c) => c.outcomes.map((o) => o.mast_m)))]

/** What a mast changes, shown on one computed run at another site and time, under a banner that says so. */
export default function MastExample() {
  const [view, setView] = useState<View>('plan')
  return (
    <section aria-labelledby="mast-example" className="grid gap-5 rounded-xl border border-line px-5 py-4 lg:py-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Worked example · {site}, {longDate(data.period.start_utc.slice(0, 10))}
          </Badge>
        </div>
        <h2 id="mast-example" className="text-xl leading-snug font-medium text-balance">
          What a mast changes
        </h2>
        <p className="max-w-[68ch] text-sm text-ink-muted text-pretty">
          Computed once at {site} over {hours} hours, not for your plan, site or dates. The mission science service tried{' '}
          {data.candidates.length} spots within {Math.round(Math.max(...data.candidates.map((c) => Math.hypot(c.east_m, c.north_m))))} m of
          the landing, with the panels at {heights.map((h) => `${h} m`).join(' and ')} above the ground, and measured the Sun and Earth over
          the period at each.
        </p>
      </div>
      {/* Its own width, not the grid's: a segmented control stretched across the panel reads as an empty bar. */}
      <div className="justify-self-start">
        <Tabs variant="segmented" size="sm" tabs={VIEWS} value={view} onValueChange={(v) => setView(v as View)} />
      </div>
      {view === 'plan' ? <MastPlan data={data} /> : view === 'section' ? <MastSection data={data} /> : <MastTrade data={data} />}
      {/* The service's own rule, in plain words: "feasibility before exact six-objective Pareto filtering". */}
      <p className="max-w-[72ch] text-xs text-ink-faint text-pretty">
        How spots are ranked: any spot that fails a check is set aside first, then the rest are compared on six measures at once, none
        weighted above another.
      </p>
    </section>
  )
}
