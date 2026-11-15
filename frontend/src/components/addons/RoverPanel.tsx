import { RoverReach } from '~/components/addons/RoverReach'
import type { Plan } from '~/components/planner/plan'

/** Scientific reachability is evaluated by the bounded Python rover service. */
export function RoverPanel({ plan }: { plan: Plan }) {
  return <RoverReach key={plan.focus} plan={plan} />
}
