import { createFileRoute, useHydrated, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useMoonScene } from '~/components/MoonStage'
import type { MoonScene } from '~/components/ParallaxMoon'
import { AddonsStep } from '~/components/planner/AddonsStep'
import { type Plan, type PlanActions, type PlanSearch, planSearch, type StepId, stepOf } from '~/components/planner/plan'
import { resolvePlan } from '~/components/planner/resolvePlan'
import { ScientificBaseline, ScientificDates } from '~/components/planner/ScientificBaseline'
import { SetupStep } from '~/components/planner/SetupStep'
import { missionShort, SlipButtons, StepBar } from '~/components/planner/StepBar'
import { Shell } from '~/components/Shell'
import { loadMoonEphemeris, loadSummary, MOON_SITES } from '~/lib/data'
import { buildScientificBrief } from '~/lib/dynamicPlanner'
import { useScientificPlan } from '~/lib/useScientificPlan'

// The flow starts at Set up; links that mean the answer ask for Result by name.
const DEFAULT_STEP: StepId = 'setup'

export const Route = createFileRoute('/analyze/')({
  validateSearch: planSearch,
  loader: async () => {
    const [eph, all] = await Promise.all([loadMoonEphemeris(), Promise.all(MOON_SITES.map((s) => loadSummary(s.id)))])
    return { eph, all }
  },
  head: () => ({ meta: [{ title: 'Analyze · Skyline' }] }),
  component: PlannerPage,
})

/** The shared Moon glides into Set up's Moon and hands over to it (MissionMoon's `handoff`). */
const PLANNER_MOON: MoonScene = { kind: 'planner' }

function saveText(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'skyline-mission-brief.md'
  a.click()
  URL.revokeObjectURL(url)
}

function PlannerPage() {
  const { eph, all } = Route.useLoaderData()
  useMoonScene(PLANNER_MOON, eph)
  const params = Route.useSearch()
  const hydrated = useHydrated()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = (s: Partial<PlanSearch>) => navigate({ search: (prev) => ({ ...prev, ...s }), replace: true, resetScroll: false })
  const p = useMemo(() => (hydrated ? params : ({} as PlanSearch)), [hydrated, params])
  const selected: Plan = useMemo(() => resolvePlan(all, p), [all, p])
  const { plan, rows, refresh } = useScientificPlan(selected, hydrated, p.focus)
  const { dates, index, date, sites } = plan
  const chosenIds = sites.map((s) => s.data.site.id)
  // The step lives in the URL, so it is the same on the server: read it before hydration too, or a link to Set up
  // flashes Result first.
  const step = stepOf(params.step) ?? DEFAULT_STEP

  const actions: PlanActions = {
    go,
    setStep: (next) => navigate({ search: (prev) => ({ ...prev, step: next }) }),
    chooseProfile: (id) =>
      navigate({ search: (prev) => ({ step: prev.step, profile: id as PlanSearch['profile'] }), replace: true, resetScroll: false }),
    selectDay: (i) => {
      const d = dates[Math.max(0, Math.min(dates.length - 1, i))]
      if (d) go({ day: d, base: undefined })
    },
    slipBy: (k) => {
      const d = dates[index + k]
      if (d) go({ day: d, base: plan.base ?? date })
    },
    toggleSite: (id, on) => {
      const next = all.filter((s) => (s.site.id === id ? on : chosenIds.includes(s.site.id))).map((s) => s.site.id)
      if (next.length > 0) go({ sites: next.join(',') })
    },
    downloadBrief: () => saveText(buildScientificBrief(plan, rows)),
  }

  const baseline = <ScientificBaseline plan={plan} rows={rows} refresh={refresh} />

  return (
    <Shell>
      <h1 className="sr-only">Analyze a landing</h1>
      <StepBar step={step} plan={plan} actions={actions} />
      {step === 'setup' ? (
        // Set up is one full-width screen that fits the viewport.
        <main>
          <SetupStep plan={plan} actions={actions} />
        </main>
      ) : (
        <main className="mx-auto grid max-w-7xl gap-8 px-4 pt-6 pb-10 sm:px-6">
          {step === 'result' && (
            <>
              {baseline}
              <button type="button" className="cursor-pointer underline" onClick={() => actions.setStep('dates')}>
                Try another date
              </button>
              <button type="button" className="cursor-pointer underline" onClick={() => actions.setStep('addons')}>
                Explore add-ons
              </button>
            </>
          )}
          {step === 'dates' && (
            <>
              <ScientificDates plan={plan} actions={actions} />
              {baseline}
            </>
          )}
          {step === 'addons' && <AddonsStep plan={plan} actions={actions} search={p} scientificBaseline={baseline} />}
        </main>
      )}
      {step !== 'setup' && (
        <div className="sticky bottom-0 z-(--z-sticky) flex items-center justify-between gap-3 border-t border-line bg-bg px-4 py-2 sm:hidden">
          <span className="tabular min-w-0 truncate text-xs text-ink-muted">{missionShort(plan)}</span>
          <SlipButtons plan={plan} actions={actions} compact />
        </div>
      )}
    </Shell>
  )
}
