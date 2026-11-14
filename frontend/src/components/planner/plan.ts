import { z } from 'zod'
import type { Summary } from '~/lib/data'
import type { MissionWindow, Requirements, SitePlan } from '~/lib/mission'
import { PROFILE_IDS, type Profile } from '~/lib/profiles'
import { SCENARIO_PIECES } from '~/lib/scenarios'
import { forgiving } from '~/lib/useSiteView'

/**
 * The flow, in order. A step's `next` is the label of the button that moves on from it. Result carries what Review used
 * to (what to do next, the brief, the follow-ups), so the answer and the way forward sit on one page.
 */
export const STEPS = [
  { id: 'setup', label: 'Set up', next: 'See the result' },
  { id: 'result', label: 'Result', next: 'See dates' },
  { id: 'dates', label: 'Dates', next: 'See add-ons' },
  { id: 'addons', label: 'Add-ons', next: null },
] as const
export type StepId = (typeof STEPS)[number]['id']
/** `review` is kept so older links still open; it now shows Result. */
export const stepOf = (s: PlanSearch['step']): StepId | undefined => (s === 'review' ? 'result' : s)

export const planSearch = z.object({
  profile: forgiving(z.enum(PROFILE_IDS)),
  step: forgiving(z.enum(['setup', 'result', 'dates', 'addons', 'review'])),
  sites: forgiving(z.string()),
  day: forgiving(z.iso.date()),
  base: forgiving(z.iso.date()),
  t: forgiving(z.coerce.number().int().min(0).max(1439)),
  stay: forgiving(z.coerce.number().int().min(1).max(60)),
  minSun: forgiving(z.coerce.number().min(0).max(100)),
  maxNoSun: forgiving(z.coerce.number().min(0)),
  minEarth: forgiving(z.coerce.number().min(0).max(100)),
  maxNoEarth: forgiving(z.coerce.number().min(0)),
  focus: forgiving(z.string()),
  /** The Add-ons tool on show. */
  piece: forgiving(z.enum(SCENARIO_PIECES)),
})
export type PlanSearch = z.infer<typeof planSearch>

export type Plan = {
  profile: Profile
  /** The user changed something the profile set. */
  edited: boolean
  all: Summary[]
  sites: SitePlan[]
  dates: string[]
  index: number
  date: string
  minute: number
  stay: number
  requirements: Requirements
  window: MissionWindow
  /** The date slips are measured from, set by the first slip and cleared by choosing a day directly. */
  base: string | null
  slip: number
  focus: string | undefined
}

export type PlanActions = {
  go: (s: Partial<PlanSearch>) => void
  setStep: (step: StepId) => void
  chooseProfile: (id: string) => void
  selectDay: (i: number) => void
  slipBy: (days: number) => void
  toggleSite: (id: string, on: boolean) => void
  downloadBrief: () => void
}
