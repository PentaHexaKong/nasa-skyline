import { LinkButton } from '@cloudflare/kumo/components/button'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { LESSONS, lessonById } from '~/components/lessons'
import { Eyebrow, Shell } from '~/components/Shell'
import { StandHereLink } from '~/components/story'
import { loadSummary } from '~/lib/data'

export const Route = createFileRoute('/understand/$lessonId')({
  loader: async ({ params }) => {
    const lesson = lessonById(params.lessonId)
    if (!lesson) throw notFound()
    const sites = await Promise.all(lesson.sites.map(loadSummary))
    return Object.fromEntries(sites.map((s) => [s.site.id, s]))
  },
  head: ({ params }) => ({ meta: [{ title: `${lessonById(params.lessonId)?.question ?? 'Lesson'} · Lessons · Skyline` }] }),
  component: LessonPage,
})

function Step({ n, label, children, id }: { n: number; label: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-5 border-t border-line pt-6">
      <h2 id={id} className="eyebrow flex items-center gap-3 text-ink-muted">
        <span className="readout grid size-6 place-items-center rounded-full ring-1 ring-line-strong">{n}</span>
        {label}
      </h2>
      {children}
    </section>
  )
}

function LessonPage() {
  const { lessonId } = Route.useParams()
  const data = Route.useLoaderData()
  const lesson = lessonById(lessonId)
  const [pick, setPick] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const seeRef = useRef<HTMLDivElement>(null)

  // A new lesson starts unanswered.
  useEffect(() => {
    setPick(null)
    setShown(false)
  }, [lessonId])

  if (!lesson) throw notFound()
  const index = LESSONS.indexOf(lesson)
  const prev = LESSONS[index - 1]
  const next = LESSONS[index + 1]

  const reveal = (id: string | null) => {
    setPick(id)
    setShown(true)
    requestAnimationFrame(() => seeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const right = pick === lesson.answer
  const chosen = lesson.options.find((o) => o.id === pick)
  const { See } = lesson

  return (
    <Shell>
      <main className="mx-auto grid max-w-5xl gap-10 px-4 pt-10 pb-20 sm:px-6 lg:pt-16">
        <header className="grid gap-4">
          <Eyebrow pip>
            <Link to="/understand" className="hover:text-ink">
              Understand
            </Link>
            <span aria-hidden>·</span>
            Lesson {index + 1} of {LESSONS.length}
          </Eyebrow>
          <h1 className="max-w-[20ch] text-display font-medium text-balance">{lesson.question}</h1>
          <p className="max-w-[56ch] text-lg leading-relaxed text-ink-muted text-pretty">{lesson.intro}</p>
        </header>

        <Step n={1} label="Predict" id="predict">
          <p className="text-xl font-medium text-balance">{lesson.prompt}</p>
          <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
            {lesson.options.map((o, i) => {
              const isPick = pick === o.id
              const isAnswer = shown && o.id === lesson.answer
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={shown}
                  aria-pressed={isPick}
                  onClick={() => reveal(o.id)}
                  className={`flex min-h-14 items-center gap-3 rounded-lg px-4 py-3 text-left ring-1 transition-[background-color,box-shadow] duration-150 ring-inset enabled:cursor-pointer enabled:hover:bg-surface enabled:active:scale-[0.99] ${
                    isPick ? 'bg-surface ring-2 ring-brand' : 'ring-line-strong'
                  } ${shown && !isPick && !isAnswer ? 'text-ink-muted' : ''}`}
                >
                  <span className="readout grid size-6 shrink-0 place-items-center rounded-sm bg-surface-raised text-xs ring-1 ring-line">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 font-medium">{o.label}</span>
                  {isAnswer && <CheckIcon weight="bold" aria-label="The answer" className="size-4 shrink-0" />}
                  {shown && isPick && !right && <XIcon weight="bold" aria-label="Your guess" className="size-4 shrink-0 text-now" />}
                </button>
              )
            })}
          </div>
          {!shown && (
            <button
              type="button"
              onClick={() => reveal(null)}
              className="justify-self-start text-ink-muted underline underline-offset-3 hover:text-ink"
            >
              Skip, just show me
            </button>
          )}
        </Step>

        {shown && (
          <div ref={seeRef} className="rise grid scroll-mt-20 gap-10">
            <Step n={2} label="See the real data" id="see">
              {chosen && (
                <p className="flex items-center gap-2 text-ink-muted">
                  {right ? (
                    <CheckIcon weight="bold" aria-hidden className="size-4 text-ink" />
                  ) : (
                    <XIcon weight="bold" aria-hidden className="size-4 text-now" />
                  )}
                  You said “{chosen.label}”. {right ? 'That’s right.' : 'Not quite.'}
                </p>
              )}
              <See data={data} />
            </Step>

            <Step n={3} label="Why" id="why">
              <p className="max-w-[62ch] text-lg leading-relaxed text-pretty">{lesson.why}</p>
              <ul className="flex flex-wrap gap-2">
                {lesson.tryIt.map((t) => (
                  <li key={t.href}>
                    {t.href.startsWith('/explore/') ? (
                      <StandHereLink href={t.href} label={t.label} />
                    ) : (
                      <LinkButton href={t.href} variant="secondary">
                        {t.label}
                        <ArrowRightIcon aria-hidden className="size-3.5" />
                      </LinkButton>
                    )}
                  </li>
                ))}
              </ul>
            </Step>
          </div>
        )}

        <div className="grid gap-6 border-t border-line pt-6">
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>For teachers</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <dl className="grid max-w-[62ch] gap-3 text-ink-muted sm:grid-cols-[8rem_1fr]">
                <dt className="text-ink">Goal</dt>
                <dd>{lesson.teacher.goal}</dd>
                <dt className="text-ink">Ask the class</dt>
                <dd>{lesson.teacher.ask}</dd>
                {lesson.teacher.note && (
                  <>
                    <dt className="text-ink">Keep in mind</dt>
                    <dd>{lesson.teacher.note}</dd>
                  </>
                )}
              </dl>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
          <nav aria-label="Lessons" className="flex flex-wrap justify-between gap-3">
            {prev ? (
              <LinkButton href={`/understand/${prev.id}`} variant="ghost">
                <ArrowLeftIcon aria-hidden className="size-3.5" />
                {prev.question}
              </LinkButton>
            ) : (
              <span />
            )}
            {next && (
              <LinkButton href={`/understand/${next.id}`} variant={shown ? 'primary' : 'secondary'}>
                Next: {next.question}
                <ArrowRightIcon aria-hidden className="size-3.5" />
              </LinkButton>
            )}
          </nav>
        </div>
      </main>
    </Shell>
  )
}
