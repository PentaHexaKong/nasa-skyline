import { useEffect, useMemo, useState } from 'react'
import type { Plan } from '~/components/planner/plan'
import { initialPlannerRows, type PlannerRows, plannerInputs, runPlannerRequests, scientificPlan } from './dynamicPlanner'

export function useScientificPlan(selected: Plan, enabled: boolean, focus?: string) {
  // The key contains every request field, including height, date, limits and scientific settings.
  const inputKey = JSON.stringify(plannerInputs(selected))
  const inputs = useMemo(() => JSON.parse(inputKey) as ReturnType<typeof plannerInputs>, [inputKey])
  const [attempt, setAttempt] = useState(0)
  const key = `${enabled}-${attempt}-${inputKey}`
  const [evaluation, setEvaluation] = useState<{ key: string; rows: PlannerRows } | null>(null)
  const initial = useMemo(() => initialPlannerRows(inputs, enabled), [inputs, enabled])
  // Suppress stale results during render, before effect cleanup runs for a changed scenario.
  const rows = evaluation?.key === key ? evaluation.rows : initial

  useEffect(() => {
    if (!enabled) return
    let current = true
    setEvaluation({ key, rows: initial })
    const timer = setTimeout(() => {
      void runPlannerRequests(
        inputs,
        (siteId, row) => {
          setEvaluation((previous) => (previous?.key === key ? { key, rows: { ...previous.rows, [siteId]: row } } : previous))
        },
        () => current,
      )
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [key, inputs, enabled, initial])

  return { plan: scientificPlan(selected, rows, focus), rows, refresh: () => setAttempt((value) => value + 1) }
}
