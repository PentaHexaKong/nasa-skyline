import { createFileRoute, redirect } from '@tanstack/react-router'
import { planSearch } from '~/components/planner/plan'
import { addonsSearch } from '~/components/planner/resolvePlan'
import { SCENARIO_PIECES, type ScenarioPiece } from '~/lib/scenarios'

/** The follow-up tools are now Analyze's Add-ons step; older links land there with every plan setting kept. */
export const Route = createFileRoute('/analyze/scenario/$piece')({
  validateSearch: planSearch,
  beforeLoad: ({ params, search }) => {
    const piece = SCENARIO_PIECES.includes(params.piece as ScenarioPiece) ? (params.piece as ScenarioPiece) : undefined
    throw redirect({ to: '/analyze', search: addonsSearch(search, piece), replace: true })
  },
})
