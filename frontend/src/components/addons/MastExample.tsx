import { Badge } from '@cloudflare/kumo/components/badge'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { InfoIcon } from '@phosphor-icons/react'
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
      <div className="flex gap-3 rounded-lg border border-line-strong px-4 py-3">
        <span className="flex h-lh items-center">
          <InfoIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </span>
        <p className="max-w-[72ch] text-sm text-pretty">
          <span className="font-medium">
            Worked example: {site}, {longDate(data.period.start_utc.slice(0, 10))}, {hours} hours.
          </span>{' '}
          <span className="text-ink-muted">
            It shows how a mast changes sunlight and Earth contact at one site. It is not computed for your plan, your site or your dates.
          </span>
        </p>
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Computed · example</Badge>
        </div>
        <h2 id="mast-example" className="text-xl leading-snug font-medium text-balance">
          What a mast changes
        </h2>
        <p className="max-w-[68ch] text-sm text-ink-muted text-pretty">
          The mission science service tried {data.candidates.length} spots within{' '}
          {Math.round(Math.max(...data.candidates.map((c) => Math.hypot(c.east_m, c.north_m))))} m of the landing, with the panels at{' '}
          {heights.map((h) => `${h} m`).join(' and ')} above the ground, and measured the Sun and Earth over the period at each.
        </p>
      </div>
      <Tabs variant="segmented" size="sm" tabs={VIEWS} value={view} onValueChange={(v) => setView(v as View)} />
      {view === 'plan' ? <MastPlan data={data} /> : view === 'section' ? <MastSection data={data} /> : <MastTrade data={data} />}
      <p className="max-w-[72ch] text-xs text-ink-faint text-pretty">{data.rule}</p>
    </section>
  )
}
