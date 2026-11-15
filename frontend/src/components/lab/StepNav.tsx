import { LAB_STEPS, type LabStep } from '~/lib/investigation'

/**
 * The four steps as tabs in the modal's sticky header, so where you are stays in view while a step scrolls.
 * Steps after Choose need a question; until there is one they stay visible but disabled, rather than quietly
 * picking a question for you.
 */
export function StepNav({ step, ready, onStep }: { step: LabStep; ready: boolean; onStep: (s: LabStep) => void }) {
  return (
    <nav aria-label="Investigation steps" className="h-full min-w-0">
      <ol className="flex h-full items-stretch">
        {LAB_STEPS.map((s, i) => {
          const on = s.id === step
          return (
            <li key={s.id} className="flex">
              <button
                type="button"
                aria-current={on ? 'step' : undefined}
                disabled={!ready && i > 0}
                title={s.hint}
                onClick={() => onStep(s.id)}
                className={`relative flex cursor-pointer items-center gap-2 px-2.5 text-sm transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:text-ink-faint/60 sm:px-3 ${
                  on ? 'text-ink' : 'text-ink-muted enabled:hover:text-ink'
                }`}
              >
                <span className={`readout text-xs ${on ? 'text-story-ink' : ''}`}>0{i + 1}</span>
                <span className={on ? '' : 'hidden md:inline'}>{s.label}</span>
                <span
                  aria-hidden
                  className={`absolute inset-x-2.5 -bottom-px h-0.5 rounded-full sm:inset-x-3 ${on ? 'bg-story-ink' : 'bg-transparent'}`}
                />
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
