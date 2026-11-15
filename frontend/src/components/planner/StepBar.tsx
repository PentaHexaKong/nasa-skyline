import { Button } from '@cloudflare/kumo/components/button'
import { ButtonGroup } from '@cloudflare/kumo/components/button-group'
import { DownloadSimpleIcon } from '@phosphor-icons/react'
import { ProfileSelect } from '~/components/planner/ProfilePicker'
import { type Plan, type PlanActions, STEPS, type StepId } from '~/components/planner/plan'
import { longDate, minuteLabel, shortDate } from '~/lib/time'

const SLIPS = [-7, -1, 1, 7] as const

export function SlipButtons({ plan, actions, compact = false }: { plan: Plan; actions: PlanActions; compact?: boolean }) {
  return (
    <ButtonGroup aria-label="Slip the landing day">
      {SLIPS.map((k) => (
        <Button
          key={k}
          variant="secondary"
          className="tabular"
          disabled={plan.index + k < 0 || plan.index + k >= plan.dates.length}
          onClick={() => actions.slipBy(k)}
        >
          {k > 0 ? `+${k}` : `−${-k}`}
          {compact ? '' : ' d'}
        </Button>
      ))}
    </ButtonGroup>
  )
}

export function missionSummary(plan: Plan) {
  const count = `${plan.sites.length} site${plan.sites.length === 1 ? '' : 's'}`
  return `${count} · ${longDate(plan.date)}, ${minuteLabel(plan.minute)} UTC · ${plan.stay}-day stay`
}

export const missionShort = (plan: Plan) => `${shortDate(plan.date)}, ${minuteLabel(plan.minute)} UTC · ${plan.stay} d`

export function StepBar({ step, plan, actions }: { step: StepId; plan: Plan; actions: PlanActions }) {
  return (
    <div className="sticky top-14 z-(--z-sticky) border-b border-line bg-bg">
      <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6">
        <nav aria-label="Planning steps" className="min-w-0">
          <ol className="flex gap-x-5 sm:gap-x-7">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={s.id === step ? 'step' : undefined}
                  onClick={() => actions.setStep(s.id)}
                  className={`-mb-px flex cursor-pointer items-baseline gap-2 border-b-2 py-3 font-medium whitespace-nowrap ${
                    s.id === step ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="hidden font-mono text-xs sm:inline">{i + 1}</span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {
          <Button variant="secondary" icon={DownloadSimpleIcon} onClick={actions.downloadBrief} className="ml-auto hidden md:inline-flex">
            Download brief
          </Button>
        }
      </div>
      {step !== 'setup' && (
        <div className="hidden border-t border-line sm:block">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 sm:px-6">
            <ProfileSelect plan={plan} actions={actions} />
            <p className="tabular min-w-0 flex-1 truncate">
              {missionSummary(plan)}
              {plan.base && (
                <span className="text-ink-muted">
                  {' '}
                  · {plan.baseline ? 'slipped from' : 'compared with'} {shortDate(plan.base)}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => actions.setStep('setup')}
              className="cursor-pointer whitespace-nowrap underline underline-offset-3"
            >
              Edit setup
            </button>
            <span className="text-ink-muted">Slip</span>
            <SlipButtons plan={plan} actions={actions} />
          </div>
        </div>
      )}
    </div>
  )
}
