import type { Evaluation, MissionWindow, SitePlan } from './mission'

export const SCENARIO_PIECES = ['mast', 'relay', 'rover'] as const
export type ScenarioPiece = (typeof SCENARIO_PIECES)[number]

export const SCENARIOS = {
  mast: {
    title: 'Explore mast placement',
    name: 'Mast placement',
    question: 'Could a different mast position or height help?',
    detail: 'Check nearby positions and heights for sunlight and Earth visibility. Any improvement still needs to be computed.',
  },
  relay: {
    title: 'Compare with relays',
    name: 'Relay coverage',
    question: 'Could relays reduce the contact gaps?',
    detail: 'Compare direct Earth visibility with relay-assisted contact windows and the gaps that remain.',
  },
  rover: {
    title: 'Explore rover reach',
    name: 'Rover reach',
    question: 'What could a rover reach from here?',
    detail: 'Explore reach under the chosen sunlight, contact and slope constraints. This is a follow-up to choosing a site.',
  },
} as const

/** Summary-only feeds cannot be rescaled to another period. Fixtures never count as a scenario result. */
export function matchesScenario(
  data: { origin: string; site_id: string; period: { start_utc: string; end_utc: string } },
  siteId: string,
  window: MissionWindow,
) {
  return (
    data.origin === 'computed' &&
    data.site_id === siteId &&
    Date.parse(data.period.start_utc) === window.start &&
    Date.parse(data.period.end_utc) === window.end
  )
}

export type RequirementCheck = Evaluation['checks'][number]

/** Use the same whole-stay checks as Result. Touchdown alone never ranks an intervention. */
export function scenarioGuidance(site: Pick<SitePlan, 'stay' | 'checks' | 'touchdown'>) {
  const checks = site.stay ? site.checks : null
  const missed = checks?.checks.filter((c) => !c.pass) ?? []
  const sun = missed.filter((c) => c.key === 'minSun' || c.key === 'maxNoSun')
  const earth = missed.filter((c) => c.key === 'minEarth' || c.key === 'maxNoEarth')
  const priority: ScenarioPiece[] = [...(sun.length ? ['mast' as const] : []), ...(earth.length ? ['relay' as const] : [])]
  return {
    sun,
    earth,
    priority,
    optional: SCENARIO_PIECES.filter((p) => !priority.includes(p)),
    headline: !checks
      ? 'This stay is not fully computed.'
      : missed.length > 0
        ? 'Start with the limits this site misses.'
        : 'This site meets your limits over the stay.',
    detail: !checks
      ? 'Choose an earlier date or a shorter stay before comparing changes.'
      : missed.length > 0
        ? 'Try another landing date or compare sites first. You can also investigate the changes below.'
        : site.touchdown !== 'both'
          ? 'Sun or Earth is hidden at touchdown. Check another landing time before exploring additional scenarios.'
          : 'The Sun and Earth are also in view at touchdown. Explore additional scenarios if they fit your mission.',
  }
}
