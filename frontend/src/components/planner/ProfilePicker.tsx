import { Select } from '@cloudflare/kumo/components/select'
import { useEffect, useRef, useState } from 'react'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { Mascot } from '~/components/story'
import { TerrainImage } from '~/components/TerrainImage'
import { PROFILES } from '~/lib/profiles'

export function ProfileCards({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      PROFILES.findIndex((profile) => profile.id === plan.profile.id),
    ),
  )
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    setIndex(
      Math.max(
        0,
        PROFILES.findIndex((profile) => profile.id === plan.profile.id),
      ),
    )
  }, [plan.profile.id])
  const shown = PROFILES[index]
  const active = shown?.id === plan.profile.id
  const browse = (change: number) => setIndex((value) => (value + change + PROFILES.length + 1) % (PROFILES.length + 1))
  useEffect(() => {
    const strip = list.current
    const card = strip?.children[index] as HTMLElement | undefined
    if (strip && card)
      strip.scrollTo({
        left: card.offsetLeft - strip.offsetLeft,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
  }, [index])
  return (
    <section aria-labelledby="profile-picker-title" className="grid gap-5">
      <header className="grid gap-2">
        <h2 id="profile-picker-title" className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] font-medium">
          Start from a mission profile
        </h2>
        <p className="max-w-[65ch] leading-relaxed text-ink-muted">
          Profiles are starting points. Their thresholds are examples, not requirements from any mission.
        </p>
      </header>
      <div className="overflow-hidden rounded-lg border border-line bg-[#0e141c]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-[#161d26] px-4 py-3 text-xs">
          <span className="eyebrow text-comms">Select mission</span>
          <span className="readout text-ink-muted">
            0{index + 1} / 0{PROFILES.length + 1}
          </span>
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-2xs">
            {shown ? (active ? 'ACTIVE' : 'PREVIEW') : 'NOT COMPUTED'}
          </span>
        </div>
        <div className="grid md:grid-cols-[1.15fr_1fr]">
          <div className="relative min-h-64 overflow-hidden md:min-h-80">
            <TerrainImage siteId={plan.all[index % plan.all.length]?.site.id ?? 'shackleton-rim'} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-transparent to-transparent" />
            <p className="absolute top-3 left-3 rounded bg-black/75 px-2 py-1 text-2xs text-ink-muted">
              LOLA terrain · {plan.all[index % plan.all.length]?.site.name.split(',')[0]} · illustrative lighting
            </p>
            <div className="absolute inset-x-4 bottom-4 flex items-end gap-3">
              <Mascot pose="explorer-waving" className="size-20 shrink-0" />
              <p className="rounded-lg border border-line bg-[#0e141c]/95 px-3 py-2 text-xs">
                Pick a mission. You can tweak the limits after.
              </p>
            </div>
          </div>
          <div key={index} className="lab-step-content grid content-center gap-4 p-5 sm:p-6">
            <h3 className="text-3xl leading-tight font-medium uppercase">{shown?.name ?? 'Pole versus equator'}</h3>
            <p className="text-sm text-ink-muted">
              {shown?.pitch ?? 'This comparison needs computed equatorial site results before it can be selected.'}
            </p>
            {shown ? (
              <>
                <p className="readout text-xs text-sun">
                  STAY {shown.stay} d · SITES {shown.sites.length}
                </p>
                <div className="grid gap-3 rounded border border-line bg-[#161d26] p-3">
                  <p className="eyebrow text-comms">Profile limits</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">SUN ≥</dt>
                      <dd>{shown.requirements.minSun} %</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">SUN GAP ≤</dt>
                      <dd>{shown.requirements.maxNoSun} h</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">EARTH ≥</dt>
                      <dd>{shown.requirements.minEarth} %</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">EARTH GAP ≤</dt>
                      <dd>{shown.requirements.maxNoEarth} h</dd>
                    </div>
                  </dl>
                </div>
                <div className="grid gap-2 text-xs">
                  <LimitBar label="Minimum Sun" value={`${shown.requirements.minSun} %`} width={shown.requirements.minSun} tone="bg-sun" />
                  <LimitBar
                    label="Minimum Earth"
                    value={`${shown.requirements.minEarth} %`}
                    width={shown.requirements.minEarth}
                    tone="bg-comms"
                  />
                  <LimitBar label="Stay (1–60 days)" value={`${shown.stay} d`} width={(shown.stay / 60) * 100} tone="bg-ink" />
                </div>
                <button
                  type="button"
                  onClick={() => actions.chooseProfile(shown.id)}
                  className="w-max cursor-pointer rounded-md bg-white px-4 py-2.5 font-medium text-black"
                >
                  {active && !plan.edited ? 'Selected mission ✓' : active ? 'Reset to this mission' : 'Select mission'}
                </button>
              </>
            ) : (
              <p className="rounded border border-line p-3 text-sm text-ink-muted">Not computed · not selectable yet</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="eyebrow text-ink-muted">Missions</p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous mission preview"
            onClick={() => browse(-1)}
            className="grid size-9 cursor-pointer place-items-center rounded border border-line hover:bg-surface-hover"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next mission preview"
            onClick={() => browse(1)}
            className="grid size-9 cursor-pointer place-items-center rounded border border-line hover:bg-surface-hover"
          >
            ›
          </button>
        </div>
      </div>
      <ul
        ref={list}
        aria-label="Mission previews"
        className="grid grid-flow-col auto-cols-[minmax(9rem,1fr)] gap-2 overflow-x-auto pb-2"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            browse(event.key === 'ArrowLeft' ? -1 : 1)
          }
          if (event.key === 'Enter' && shown) {
            event.preventDefault()
            actions.chooseProfile(shown.id)
          }
        }}
      >
        {[...PROFILES, null].map((profile, i) => (
          <li key={profile?.id ?? 'not-computed'}>
            <button
              type="button"
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
              onFocus={() => setIndex(i)}
              className={`grid h-full w-full cursor-pointer overflow-hidden rounded-lg border text-left transition-colors ${index === i ? 'border-sun ring-1 ring-sun' : 'border-line hover:border-line-strong'}`}
            >
              <TerrainImage siteId={plan.all[i % plan.all.length]?.site.id ?? 'shackleton-rim'} className="h-28 w-full" />
              <span className="grid content-start gap-2 bg-[#0e141c] p-3">
                <span className="readout flex justify-between text-2xs text-ink-muted">
                  <span>0{i + 1}</span>
                  <span>{profile ? (profile.id === plan.profile.id ? 'ACTIVE' : '') : 'NOT COMPUTED'}</span>
                </span>
                <span className="text-sm font-medium">{profile?.name ?? 'Pole versus equator'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="readout text-2xs text-ink-faint">← → browse · Enter selects · previewing keeps your current plan</p>
    </section>
  )
}

function LimitBar({ label, value, width, tone }: { label: string; value: string; width: number; tone: string }) {
  return (
    <div className="grid grid-cols-[1fr_6rem_3rem] items-center gap-3">
      <span className="eyebrow text-2xs text-ink-muted">{label}</span>
      <span aria-hidden className="h-1.5 overflow-hidden bg-white/10">
        <span className={`block h-full ${tone}`} style={{ width: `${width}%` }} />
      </span>
      <span className="readout text-right">{value}</span>
    </div>
  )
}

/** Compact profile switch for the step bar. */
export function ProfileSelect({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  return (
    <Select
      aria-label="Mission profile"
      className="w-52 shrink-0"
      value={plan.profile.id}
      items={Object.fromEntries(PROFILES.map((p) => [p.id, plan.edited && p.id === plan.profile.id ? `${p.name} (edited)` : p.name]))}
      onValueChange={(id) => id && actions.chooseProfile(id as string)}
    />
  )
}
