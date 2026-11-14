import { CalendarBlankIcon, CaretDownIcon, MapPinIcon, RocketLaunchIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { MoonBackdrop, SiteThumb } from '~/components/planner/Illustrations'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { Explain } from '~/components/Shell'
import { Mascot } from '~/components/story'
import { type GoWindow, goWindows, type LandingStatus, nextDays, type SitePlan, shortName } from '~/lib/mission'
import { longDate, minuteLabel, shortDate } from '~/lib/time'

const STATUS: Record<LandingStatus, { word: string; cls: string }> = {
  go: { word: 'All requirements met', cls: 'fill-go' },
  arrive: { word: 'Sun and Earth at touchdown, stay misses a requirement', cls: 'fill-go-fill' },
  no: { word: 'Sun or Earth hidden at touchdown', cls: 'fill-surface' },
  outside: { word: 'Stay runs past the computed data', cls: 'fill-transparent' },
}

/**
 * Sites as rows, landing days as columns: green where the landing works, dark green where Sun and Earth are in view at
 * touchdown but the stay misses a limit, an empty track otherwise. Height tells them apart too (full, half, none).
 */
function Availability({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const n = plan.dates.length
  const [hover, setHover] = useState<number | null>(null)
  const first = plan.sites.flatMap((s) => (s.nextGo ? [plan.dates.indexOf(s.nextGo)] : [])).sort((a, b) => a - b)[0]
  const months = plan.dates.flatMap((d, i) =>
    d.endsWith('-01') ? [{ i, label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) }] : [],
  )
  const W = 1000
  const ROW = 22
  const GAP = 10
  const H = plan.sites.length * (ROW + GAP)
  const x = (i: number) => (i / n) * W
  const statusAt = (s: SitePlan, i: number) => s.runs.find((r) => i >= r.from && i < r.to)?.status ?? 'outside'
  const day = hover ?? plan.index
  return (
    <section aria-labelledby="availability" className="grid gap-4 rounded-xl border border-line p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CalendarBlankIcon aria-hidden className="mt-1 size-6 text-ink-muted" />
          <div>
            <h3 id="availability" className="text-lg font-medium">
              Landing availability across the year
            </h3>
            <p className="text-sm text-ink-muted">
              When each site meets the Sun and Earth at touchdown and your limits over the stay. Click a day to choose it.
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-4 rounded-sm bg-go" />
            All requirements met (good day)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-4 rounded-sm bg-go-fill" />
            Partial (misses a stay limit)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-4 rounded-sm border border-line" />
            Not suitable
          </li>
        </ul>
      </div>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <ul className="grid content-start" style={{ gap: GAP, paddingTop: 18 }}>
          {plan.sites.map((s) => (
            <li key={s.data.site.id} className="truncate text-sm" style={{ height: ROW, lineHeight: `${ROW}px` }}>
              {shortName(s.data)}
            </li>
          ))}
        </ul>
        <div className="relative">
          <p className="relative h-[18px] text-2xs">
            {first != null && (
              <span
                className="absolute -translate-x-1/2 rounded bg-miss-fill px-1.5 text-miss"
                style={{ left: `${(x(first + 0.5) / W) * 100}%` }}
              >
                First available day
              </span>
            )}
          </p>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full cursor-pointer"
            style={{ height: H }}
            role="img"
            aria-label={`Landing days over the computed year for ${plan.sites.map((s) => shortName(s.data)).join(', ')}`}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))))
            }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              actions.selectDay(Math.floor(((e.clientX - r.left) / r.width) * n))
            }}
          >
            {plan.sites.map((s, k) => (
              <g key={s.data.site.id} transform={`translate(0 ${k * (ROW + GAP)})`}>
                <rect width={W} height={ROW} className="fill-none stroke-line" vectorEffect="non-scaling-stroke" />
                {s.runs.map((r) =>
                  r.status === 'go' || r.status === 'arrive' ? (
                    <rect
                      key={r.from}
                      x={x(r.from)}
                      width={Math.max(0.8, x(r.to) - x(r.from))}
                      y={r.status === 'go' ? 0 : ROW / 4}
                      height={r.status === 'go' ? ROW : ROW / 2}
                      className={STATUS[r.status].cls}
                    />
                  ) : null,
                )}
              </g>
            ))}
            {first != null && (
              <line
                x1={x(first + 0.5)}
                x2={x(first + 0.5)}
                y1={0}
                y2={H}
                className="stroke-miss"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <line
              x1={x(plan.index + 0.5)}
              x2={x(plan.index + 0.5)}
              y1={0}
              y2={H}
              className="stroke-ink"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="relative mt-1 h-4 text-2xs text-ink-faint">
            {months.map((m) => (
              <span key={m.i} className="absolute" style={{ left: `${(m.i / n) * 100}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p aria-live="polite" className="readout text-xs text-ink-muted">
        {longDate(plan.dates[day] ?? plan.date)}
        {day === plan.index ? ' (chosen)' : ''}:{' '}
        {plan.sites.map((s) => `${shortName(s.data)} ${STATUS[statusAt(s, day)].word.toLowerCase()}`).join(' · ')}
      </p>
    </section>
  )
}

function WindowCard({ site, windows, plan, actions }: { site: SitePlan; windows: GoWindow[]; plan: Plan; actions: PlanActions }) {
  const [open, setOpen] = useState(false)
  const [firstW, ...rest] = windows
  const pickWindow = (w: GoWindow) => actions.selectDay(plan.dates.indexOf(w.from))
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface/30">
      <SiteThumb site={site.data} className="h-24 w-full" />
      <div className="grid gap-3 p-4">
        <h4 className="flex items-center gap-2 font-semibold">
          <MapPinIcon aria-hidden />
          {shortName(site.data)}
        </h4>
        {firstW ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => pickWindow(firstW)}
              className="grid cursor-pointer gap-0.5 rounded-md bg-surface p-2 text-left hover:bg-surface-hover"
            >
              <span className="text-2xs text-ink-muted">First window</span>
              <span className="tabular font-medium">
                {firstW.from === firstW.to ? longDate(firstW.from) : `${shortDate(firstW.from)} – ${longDate(firstW.to)}`}
              </span>
            </button>
            <button
              type="button"
              aria-expanded={open}
              disabled={rest.length === 0}
              onClick={() => setOpen((o) => !o)}
              className="grid cursor-pointer gap-0.5 rounded-md bg-surface p-2 text-left hover:bg-surface-hover disabled:cursor-default disabled:opacity-60"
            >
              <span className="text-2xs text-ink-muted">Other windows</span>
              <span className="flex items-center justify-between font-medium">
                {rest.length} more
                {rest.length > 0 && <CaretDownIcon aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
              </span>
            </button>
          </div>
        ) : (
          <p className="text-ink-muted">No later day works at this site in the computed year.</p>
        )}
        {open && (
          <ul className="grid">
            {windows.map((w) => {
              const on = plan.date >= w.from && plan.date <= w.to
              return (
                <li key={w.from} className="border-t border-line">
                  <button
                    type="button"
                    aria-current={on ? 'date' : undefined}
                    onClick={() => pickWindow(w)}
                    className="tabular -mx-2 flex w-[calc(100%+1rem)] cursor-pointer justify-between gap-3 px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
                  >
                    <span className={on ? 'font-medium' : ''}>
                      {on && <span aria-hidden className="mr-2 inline-block size-1.5 bg-go align-middle" />}
                      {shortDate(w.from)} to {longDate(w.to)}
                    </span>
                    <span className="text-ink-muted">{w.days}-day window</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </article>
  )
}

export function DatesStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="dates" className="relative isolate overflow-hidden rounded-xl border border-line">
        <MoonBackdrop />
        <div className="relative grid gap-5 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid gap-3">
            <p className="eyebrow text-ink-muted">Landing opportunity</p>
            <h2 id="dates" className="max-w-[30em] text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] leading-tight font-medium text-balance">
              {nextDays(verdictRows(plan))}
            </h2>
            <p className="max-w-[70ch] text-ink-muted text-pretty">
              Landing at {minuteLabel(plan.minute)} UTC for a {plan.stay}-day stay, across the computed year from{' '}
              {longDate(plan.dates[0] ?? plan.date)}.
            </p>
            <ul className="flex flex-wrap gap-3 pt-1">
              {plan.sites.map((s) => (
                <li key={s.data.site.id} className="flex items-center gap-2 rounded-lg border border-line bg-black/50 px-3 py-2">
                  <CalendarBlankIcon aria-hidden className="text-go" />
                  <span>
                    <span className="readout text-lg">{s.goDays}</span> <span className="text-sm">good days</span>
                    <span className="block text-2xs text-ink-muted">{shortName(s.data)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Mascot pose="planner-magnifier" className="hidden size-32 lg:block" />
        </div>
      </section>
      <Availability plan={plan} actions={actions} />
      <section aria-labelledby="windows" className="grid gap-4">
        <div className="flex items-start gap-3">
          <RocketLaunchIcon aria-hidden className="mt-1 size-6 text-ink-muted" />
          <div>
            <h3 id="windows" className="text-lg font-medium">
              Landing windows by site
            </h3>
            <p className="text-sm text-ink-muted">
              Runs of consecutive days that work, from the chosen day on. Pick one to plan around it.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plan.sites.map((s) => (
            <WindowCard key={s.data.site.id} site={s} windows={goWindows(s.runs, plan.dates, plan.index)} plan={plan} actions={actions} />
          ))}
        </div>
      </section>
      <Explain>
        <p>
          Each row is a site and each thin column is one landing day. A full green bar means the Sun and Earth are both in view at touchdown
          and every requirement holds over the stay; a thin dark-green bar means both are in view at touchdown but the stay misses a
          requirement; an empty track means the Sun or Earth is hidden at touchdown, or the stay runs past the computed data. These are
          geometric opportunities. They say nothing about slopes, hazards or the lander itself.
        </p>
      </Explain>
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => actions.setStep('result')}
          className="cursor-pointer rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
        >
          ← Back to the result for {shortDate(plan.date)}
        </button>
      </div>
    </div>
  )
}
