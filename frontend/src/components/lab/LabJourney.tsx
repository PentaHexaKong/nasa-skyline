import { lazy, Suspense, useState } from 'react'
import type { LabSearch } from '~/components/lab/LabExperience'
import { StepNav } from '~/components/lab/StepNav'
import { SmoothDialog } from '~/components/SmoothDialog'
import { Guide } from '~/components/story'
import type { MoonEphemeris, Summary } from '~/lib/data'
import { LAB_STEPS, type LabStep } from '~/lib/investigation'

const LabExperience = lazy(() => import('~/components/lab/LabExperience'))
const hints = [
  'Pick a question to explore.',
  'Make a prediction before you test.',
  'Move time and watch what changes.',
  'Say why it happened.',
]

export function LabJourney({
  eph,
  summaries,
  embedded = false,
  initialSearch = {},
}: {
  eph: MoonEphemeris
  summaries: Summary[]
  embedded?: boolean
  initialSearch?: LabSearch
}) {
  const [search, setSearch] = useState<LabSearch>(() => ({
    ...initialSearch,
    q: initialSearch.q ?? (initialSearch.step && initialSearch.step !== 'choose' ? 'mountain' : undefined),
  }))
  const [open, setOpen] = useState(!!(initialSearch.q || initialSearch.step))
  const [loaded, setLoaded] = useState(open)
  const start = (step: LabStep) => {
    setSearch((previous) => ({ ...previous, step, q: previous.q ?? (step === 'choose' ? undefined : 'mountain') }))
    setLoaded(true)
    setOpen(true)
  }
  return (
    <section
      id={embedded ? 'your-turn' : 'learning-journey'}
      data-moon-chapter={embedded ? '' : undefined}
      aria-labelledby="journey-title"
      className="learning-journey relative grid min-h-[calc(100svh-3.5rem)] items-center bg-bg"
    >
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-9 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-stretch lg:gap-14">
        {/* The label and the guide sit at the top of the column; the headline drops to its foot, beside the steps. */}
        <div className="flex flex-col justify-between gap-6 lg:h-full">
          <p className="eyebrow text-ink-muted">Your learning journey</p>
          <Guide
            pose="explorer-waving"
            says="Choose a question, make a prediction, observe what changes. Follow the clue and see what happens."
            size="size-24"
          />
          <h2 id="journey-title" className="text-[clamp(2.25rem,1.5rem+3vw,4rem)] leading-[1.08] font-medium text-balance">
            Four steps. <span className="text-story-ink">One question at a time.</span>
          </h2>
        </div>
        <div className="grid gap-6 lg:self-end">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LAB_STEPS.map((step, i) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => start(step.id)}
                  aria-haspopup="dialog"
                  className="journey-step group grid h-full w-full cursor-pointer content-start gap-1 rounded-lg border border-line bg-[#0e141c] p-3 text-left transition-[border-color,transform] hover:-translate-y-1 hover:border-story focus-visible:outline-2 focus-visible:outline-story"
                >
                  <span className="eyebrow text-ink-muted">0{i + 1}</span>
                  <span className="font-medium">{step.label}</span>
                  <span className="text-xs leading-relaxed text-ink-muted">{hints[i]}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-faint">Open any step. Your notes stay in this browser tab.</p>
        </div>
      </div>
      <SmoothDialog
        open={open}
        onClose={() => setOpen(false)}
        nav={
          <StepNav
            step={search.step ?? 'choose'}
            ready={search.q !== undefined}
            onStep={(step) => setSearch((previous) => ({ ...previous, step }))}
          />
        }
      >
        {loaded && (
          <Suspense
            fallback={
              <p role="status" className="p-7 text-ink-muted">
                Opening your investigation…
              </p>
            }
          >
            <LabExperience
              eph={eph}
              summaries={summaries}
              search={search}
              onChange={(patch) => setSearch((previous) => ({ ...previous, ...patch }))}
            />
          </Suspense>
        )}
      </SmoothDialog>
    </section>
  )
}
