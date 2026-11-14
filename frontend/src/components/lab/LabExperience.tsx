import { Slider } from '@base-ui/react/slider'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, DownloadSimpleIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { Link, useHydrated } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { OrbitView } from '~/components/lab/OrbitView'
import { ScenarioArt } from '~/components/lab/ScenarioArt'
import { moment } from '~/components/Moment'
import { Panorama } from '~/components/Panorama'
import { Bubble, Mascot } from '~/components/story'
import { loadMoonEphemeris, loadTracks, type Summary } from '~/lib/data'
import {
  dayToMoment,
  differences,
  earthWords,
  hiddenSunDay,
  INVESTIGATIONS,
  type Investigation,
  investigationById,
  investigationRecord,
  LAB_STEPS,
  type LabStep,
  LUNAR_DAYS,
  type Observation,
  observe,
  type PredictionItem,
  predictionItems,
  predictionTruth,
  sunWords,
} from '~/lib/investigation'
import { shortName } from '~/lib/mission'
import { earthTarget } from '~/lib/target'
import { longDate, minuteLabel } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

const SiteIsland = lazy(() => import('~/components/SiteIsland'))

/**
 * The lab: one question at a time, in four steps. Choose a question, write a prediction, move time (or the place) in
 * the 3D model of the real terrain, look at two moments, explain why. Steps stay in the modal;
 * the exported scenario link reopens its question, place, moment and step. Notes stay in this browser tab.
 */
export type LabSearch = { step?: LabStep; q?: Investigation['id']; site?: string; day?: number }

type Guess = 'yes' | 'no'
/** `items` are the exact questions the learner answered, kept so Explain can set each guess beside the computed answer. */
type Notes = {
  prediction: string
  guesses: Record<string, Guess>
  items: PredictionItem[]
  tested: boolean
  observations: Observation[]
  explanation: string
}
const EMPTY: Notes = { prediction: '', guesses: {}, items: [], tested: false, observations: [], explanation: '' }

/** How fast Play runs: one Earth day of the slider per second, in steps of one minute. */
const DAYS_PER_S = 1

/** The learner's words for one question, kept in this tab only (sessionStorage), never sent anywhere. */
function useNotes(q: string | undefined) {
  const key = `skyline-lab-${q ?? 'none'}`
  const [notes, setNotes] = useState<Notes>(EMPTY)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      setNotes(raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY)
    } catch {
      setNotes(EMPTY)
    }
  }, [key])
  const update = (patch: Partial<Notes>) =>
    setNotes((n) => {
      const next = { ...n, ...patch }
      try {
        sessionStorage.setItem(key, JSON.stringify(next))
      } catch {}
      return next
    })
  return [notes, update] as const
}

export default function LabExperience({
  eph,
  summaries,
  search,
  onChange,
}: {
  eph: Awaited<ReturnType<typeof loadMoonEphemeris>>
  summaries: Summary[]
  search: LabSearch
  onChange: (patch: Partial<LabSearch>) => void
}) {
  const hydrated = useHydrated()
  const go = (patch: Partial<LabSearch>, _push = false) => onChange(patch)
  const q = investigationById(search.q)
  const step: LabStep = search.step ?? 'choose'
  const site = summaries.find((s) => s.site.id === (search.site ?? q?.site)) ?? summaries[0]
  const [notes, setNotes] = useNotes(q?.id)
  const [freeOrbit, setFreeOrbit] = useState(false)
  const scenarioLink =
    typeof window === 'undefined'
      ? ''
      : new URL(
          '/understand/lab?' +
            new URLSearchParams(
              Object.entries(search)
                .filter(([, v]) => v != null)
                .map(([k, v]) => [k, String(v)]),
            ),
          window.location.origin,
        ).href
  if (!site) return null
  return (
    <div className="grid gap-7 p-5 text-ink sm:p-7">
      <StepBar step={step} onStep={(next) => go({ step: next, q: next === 'choose' ? search.q : (search.q ?? 'mountain') })} />
      <div key={step} className="lab-step-content grid min-w-0 gap-7">
        {step === 'choose' && (
          <Choose
            current={q}
            onPick={(id) => {
              setFreeOrbit(false)
              go({ q: id, step: 'try', site: undefined, day: undefined })
            }}
            onOrbit={() => {
              setFreeOrbit(true)
              go({ q: 'mountain', step: 'observe' })
            }}
          />
        )}
        {q && step === 'try' && (
          <Try
            q={q}
            site={site}
            summaries={summaries}
            eph={eph}
            day={search.day}
            notes={notes}
            setNotes={setNotes}
            go={go}
            hydrated={hydrated}
          />
        )}
        {q && step === 'observe' && (
          <>
            <Try
              model
              initialOrbit={freeOrbit}
              q={q}
              site={site}
              summaries={summaries}
              eph={eph}
              day={search.day}
              notes={notes}
              setNotes={setNotes}
              go={go}
              hydrated={hydrated}
            />
            <Observe q={q} notes={notes} setNotes={setNotes} go={go} />
          </>
        )}
        {q && step === 'explain' && (
          <Explain q={q} notes={notes} setNotes={setNotes} summaries={summaries} go={go} scenarioLink={scenarioLink} />
        )}
      </div>
    </div>
  )
}

function StepBar({ step, onStep }: { step: LabStep; onStep: (s: LabStep) => void }) {
  return (
    <nav aria-label="Investigation steps">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LAB_STEPS.map((s, i) => {
          const on = s.id === step
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={on ? 'step' : undefined}
                onClick={() => onStep(s.id)}
                className={`grid h-full w-full cursor-pointer content-start gap-1 rounded-md border px-3 py-3 text-left transition-colors ${
                  on ? 'border-story bg-[#0e141c] ring-1 ring-story' : 'border-line bg-[#0e141c] hover:border-line-strong'
                }`}
              >
                <span className={`readout text-sm ${on ? 'text-story-ink' : 'text-ink-faint'}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className="grid">
                  <span className="font-medium">{s.label}</span>
                  <span className={`hidden text-xs sm:block ${on ? 'text-story-ink' : 'text-ink-faint'}`}>{s.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Step 01: the three questions, and a way out for anyone who would rather just play. */
function Choose({ current, onPick, onOrbit }: { current?: Investigation; onPick: (id: Investigation['id']) => void; onOrbit: () => void }) {
  return (
    <section aria-labelledby="choose-title" className="grid gap-8">
      <div className="grid items-center gap-6 lg:grid-cols-[1fr_minmax(0,27rem)]">
        <h2 id="choose-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.5rem)] leading-[1.02] font-medium">
          What would you
          <br />
          <span className="text-story-ink">like to discover?</span>
        </h2>
        <div className="flex items-center gap-5">
          <Mascot pose="scientist-question" className="size-28 shrink-0" />
          <p className="text-ink-muted text-pretty">
            A ridge can hide the Sun. Another viewpoint can reveal Earth. Pick a question, change one thing, and see what happens.
          </p>
        </div>
      </div>
      <p className="border-y border-line py-3 text-sm">
        <span className="eyebrow mr-3 text-story-ink">What you will learn</span>
        How <strong className="font-medium">place, terrain and time</strong> change a view of the Sun and Earth.
      </p>
      <ul className="grid gap-4 md:grid-cols-3">
        {INVESTIGATIONS.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onPick(i.id)}
              aria-pressed={current?.id === i.id}
              className={`group grid h-full w-full cursor-pointer grid-rows-[auto_1fr] overflow-hidden rounded-lg border text-left transition-colors ${
                current?.id === i.id ? 'border-story bg-story/10' : 'border-line bg-surface/50 hover:border-story/60 hover:bg-story/5'
              }`}
            >
              <ScenarioArt id={i.id} className="h-40 w-full" />
              <span className="grid content-start gap-2 p-5">
                <span className="flex items-start justify-between gap-3">
                  <span className="eyebrow text-ink-faint">{i.kicker}</span>
                  <ArrowRightIcon
                    aria-hidden
                    className="size-4 shrink-0 -rotate-45 text-ink-faint transition-transform group-hover:-translate-y-0.5"
                  />
                </span>
                <span className="text-xl leading-tight font-medium">{i.question}</span>
                <span className="text-sm text-ink-muted">{i.change}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-md border border-line bg-surface/50 p-6">
        <div className="grid gap-1">
          <p className="eyebrow text-story-ink">Prefer to experiment freely?</p>
          <p className="text-2xl font-medium">Take the controls.</p>
          <p className="text-sm text-ink-muted">
            Move through time in the true-scale Moon, Earth and Sun, and watch the orbit. No worksheet required.
          </p>
        </div>
        <button type="button" onClick={onOrbit} className="rounded-md bg-story px-5 py-3 font-medium text-white hover:brightness-110">
          Explore the orbit freely ↗
        </button>
      </div>
    </section>
  )
}

/** Step 02: predict first, then the model. */
function Try({
  q,
  site,
  summaries,
  eph,
  day: urlDay,
  notes,
  setNotes,
  go,
  hydrated,
  model = false,
  initialOrbit = false,
}: {
  q: Investigation
  site: Summary
  summaries: Summary[]
  eph: Awaited<ReturnType<typeof loadMoonEphemeris>>
  day?: number
  notes: Notes
  setNotes: (p: Partial<Notes>) => void
  go: (s: { step?: LabStep; site?: string; day?: number }, push?: boolean) => void
  hydrated: boolean
  model?: boolean
  initialOrbit?: boolean
}) {
  const tracks = useTracks(site.site.id)
  const opening = useMemo(() => (tracks && q.id === 'mountain' ? hiddenSunDay(site, tracks) : null), [tracks, q.id, site])
  const day = urlDay ?? opening ?? 8
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState<'light' | 'orbit'>(initialOrbit ? 'orbit' : 'light')
  const [look, setLook] = useState<'sun' | 'earth'>('sun')
  const [focus, setFocus] = useState<{ target: 'sun' | 'earth'; nonce: number }>()
  const [diagram, setDiagram] = useState(false)
  const { date, minute } = dayToMoment(site.params.start, day)
  const track = tracks?.[date]
  const m = moment(site, track, date, minute)
  const comms = earthTarget(site, track, date, minute)
  const obs = observe(site, track, day)

  // Play: one slider day per second, advanced a frame at a time and read out to the minute.
  const dayNow = useRef(day)
  dayNow.current = day
  const goNow = useRef(go)
  goNow.current = go
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    let at = dayNow.current >= LUNAR_DAYS ? 0 : dayNow.current
    const tick = (now: number) => {
      at = Math.min(LUNAR_DAYS, at + ((now - last) / 1000) * DAYS_PER_S)
      last = now
      goNow.current({ day: Math.round(at * 1440) / 1440 })
      if (at >= LUNAR_DAYS) return setPlaying(false)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // The exact moments the prediction asks about. The mountain question opens on the first moment the ridge hides the Sun.
  const items = useMemo(() => predictionItems(q, opening), [q, opening])
  const ready = q.id !== 'mountain' || tracks !== undefined
  const answered = items.every((item) => notes.guesses[item.id])

  // No button to press: the moments the learner stops on are remembered, and the last two are compared in the next step.
  const seen = useRef(notes.observations)
  seen.current = notes.observations
  const remember = useRef(setNotes)
  remember.current = setNotes
  useEffect(() => {
    if (!model || !track || playing) return
    const id = window.setTimeout(() => {
      const last = seen.current.at(-1)
      if (last && last.site === obs.site && last.day === obs.day) return
      remember.current({ observations: [...seen.current, obs].slice(-6) })
    }, 900)
    return () => window.clearTimeout(id)
  }, [model, track, playing, obs.site, obs.day])

  if (!model)
    return (
      <section aria-labelledby="predict-title" className="grid gap-6">
        <p className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 text-sm text-ink-muted">
          <span>
            Selected: <span className="text-ink">{q.question}</span>
          </span>
          <button
            type="button"
            onClick={() => go({ step: 'choose' }, true)}
            className="cursor-pointer underline underline-offset-3 hover:text-ink"
          >
            Choose another question
          </button>
        </p>
        <div className="grid gap-6 rounded-md border border-line bg-surface/50 p-6 lg:grid-cols-[1fr_16rem]">
          <form
            className="grid content-start gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              setNotes({ tested: true, items })
              go({ step: 'observe', day: items[0]?.day })
            }}
          >
            <p className="eyebrow text-ink-muted">Before you try / your prediction</p>
            <div className="grid gap-1">
              <h3 id="predict-title" className="text-lg font-medium">
                Guess first: what would an observer see?
              </h3>
              <p className="text-sm text-ink-muted">{q.task}</p>
            </div>
            {ready ? (
              <div className="grid gap-4">
                {items.map((item, n) => (
                  <GuessRow
                    key={item.id}
                    n={n + 1}
                    item={item}
                    summaries={summaries}
                    value={notes.guesses[item.id]}
                    onChange={(v) => setNotes({ guesses: { ...notes.guesses, [item.id]: v } })}
                  />
                ))}
                <label className="grid gap-2">
                  <span className="font-medium">Why do you think so?</span>
                  <span className="text-sm text-ink-muted">
                    One or two sentences. Think about how high the Sun and Earth stand, and how high the ridge is in that direction.
                  </span>
                  <textarea
                    id="prediction"
                    rows={3}
                    value={notes.prediction}
                    onChange={(e) => setNotes({ prediction: e.target.value })}
                    placeholder="I think… because…"
                    className="w-full rounded-md border border-line-strong bg-black/40 p-3 text-base outline-none focus:border-story"
                  />
                </label>
              </div>
            ) : (
              <p role="status" className="text-ink-muted">
                Finding the moment to ask about…
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={!ready || !answered}
                className="cursor-pointer rounded-md bg-story px-5 py-3 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Test my prediction ↗
              </button>
              {ready && !answered && <span className="text-sm text-ink-muted">Answer every question to continue.</span>}
            </div>
          </form>
          <div className="grid content-end justify-items-center gap-2">
            <Bubble>Guess first. Being wrong is how the Moon surprises you.</Bubble>
            <Mascot pose="scientist-presenting" className="size-40" />
          </div>
        </div>
      </section>
    )

  return (
    <section aria-labelledby="try-title" className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_28rem] lg:items-end">
        <div className="grid gap-2">
          <p className="eyebrow text-ink-muted">Step 03 / Observe</p>
          <h2 id="try-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-[1.02] font-medium">
            Move time.
            <br />
            <span className="text-story-ink">See the answer.</span>
          </h2>
        </div>
        <p className="text-ink-muted text-pretty">
          Use the controls beside the 3D view. The landscape, Sun and Earth update together with the result. Switch to “Play with orbit” to
          see where the Moon is on its way around Earth.
        </p>
      </div>
      <div className="grid overflow-hidden rounded-md border border-line lg:grid-cols-[1fr_22rem]">
        <div className="relative min-h-[28rem] bg-black lg:min-h-[36rem]">
          <p className="eyebrow absolute top-3 left-3 z-[2] flex items-center gap-2 text-ink">
            <span aria-hidden className="size-1.5 rounded-full bg-story" />
            Lunar observatory
            <span className="text-ink-faint">· NASA LRO terrain model · {track ? 'ready' : 'loading'}</span>
          </p>
          {hydrated && (
            <Suspense fallback={null}>
              <SiteIsland
                fill
                siteId={site.site.id}
                place={shortName(site)}
                track={track}
                now={m.sun}
                inSun={m.phase === 'sun'}
                horizon={m.horizon}
                comms={comms}
                skyline={site.skyline.elevation_deg}
                azStep={site.skyline.az_step_deg}
                skylineKm={site.params.skyline_max_km}
                focus={focus}
                label={`3D model of the terrain around ${site.site.name}, ${longDate(date)} ${minuteLabel(minute)} UTC. ${sunWords(obs)}.`}
              />
            </Suspense>
          )}
          <div className="scene-text pointer-events-none absolute bottom-16 left-3 z-[2] grid max-w-[18rem] gap-1">
            <p className="eyebrow text-ink-faint">The local perspective</p>
            <p className="text-xl font-medium">What can you see from down here?</p>
            <p className="text-xs text-ink-muted">Real terrain · fixed observer · change time in the panel</p>
          </div>
        </div>
        <aside className="grid content-start gap-5 border-t border-line bg-[#111317] p-5 lg:border-t-0 lg:border-l">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['light', 'Light & landscape'],
                ['orbit', 'Play with orbit'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${tab === id ? 'border-story bg-story text-white' : 'border-line hover:bg-surface-hover'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-1">
            <h3 className="text-2xl leading-tight font-medium">{q.question}</h3>
            <p className="text-sm text-ink-muted">{q.change} Watch from the observer’s position. Read the result right here.</p>
          </div>
          {tab === 'light' ? (
            <>
              <div className="grid gap-1.5">
                <span id="region" className="eyebrow text-ink-faint">
                  Study region
                </span>
                <Select
                  aria-labelledby="region"
                  value={site.site.id}
                  items={Object.fromEntries(summaries.map((s, i) => [s.site.id, `0${i + 1} · ${shortName(s)}`]))}
                  onValueChange={(v) => go({ site: String(v) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['sun', 'earth'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={focus?.target === w}
                    onClick={() => {
                      setLook(w)
                      setFocus({ target: w, nonce: Date.now() })
                    }}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${focus?.target === w ? 'border-story text-story-ink' : 'border-line hover:bg-surface-hover'}`}
                  >
                    Look at {w === 'sun' ? 'the Sun' : 'Earth'}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <OrbitView eph={eph} hours={(Date.parse(`${date}T00:00:00Z`) - Date.parse(eph.start)) / 3_600_000 + minute / 60} />
          )}
          <DayControl
            day={day}
            playing={playing}
            onPlay={() => setPlaying((p) => !p)}
            onDay={(d) => {
              setPlaying(false)
              go({ day: d })
            }}
            label={`${longDate(date)}, ${minuteLabel(minute)} UTC`}
          />
          <Reading
            kicker="01 / Solar opportunity"
            title={track ? sunWords(obs) : 'Sun geometry not loaded'}
            tone={track && obs.sun.inView ? 'sun' : 'off'}
          >
            {!track
              ? 'The computed track is needed to read the Sun against the local horizon.'
              : obs.sun.inView
                ? 'The Sun clears the ridge from the observer’s position. Solar-powered equipment could receive direct light.'
                : obs.sun.up
                  ? `The Sun is ${obs.sun.el?.toFixed(1)}° up, but the terrain in its direction rises to ${obs.sun.horizon?.toFixed(1)}°. The observer is in shadow.`
                  : 'The Sun is below the horizon here.'}
          </Reading>
          <Reading kicker="02 / A view of home" title={earthWords(obs)} tone={obs.earth?.inView ? 'earth' : 'off'}>
            {obs.earth == null
              ? 'Earth’s position is not computed for this moment.'
              : obs.earth.inView
                ? `Earth is ${obs.earth.el.toFixed(1)}° up and clears the skyline: a direct line of sight, not a guaranteed radio link.`
                : `Earth is ${obs.earth.el.toFixed(1)}° up; the skyline in its direction is ${(obs.earth.el - obs.earth.clearance).toFixed(1)}°. No direct line of sight.`}
          </Reading>
          <button
            type="button"
            onClick={() =>
              document.getElementById('observe-title')?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start',
              })
            }
            className="rounded-md bg-story px-3 py-2.5 text-sm font-medium text-white hover:brightness-110"
          >
            Next: compare two moments →
          </button>
        </aside>
      </div>
      <Collapsible.Root open={diagram} onOpenChange={setDiagram}>
        <Collapsible.DefaultTrigger>Why is it blocked? Open the optional 2D horizon diagram</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="grid gap-4 pt-2">
            <p className="eyebrow text-ink-faint">{site.site.name}</p>
            <Panorama
              skyline={site.skyline.elevation_deg}
              azStep={site.skyline.az_step_deg}
              track={track}
              now={m.sun}
              comms={comms}
              height={260}
              azRange={azAround(look === 'sun' ? m.sun?.az : comms?.reference.az_deg)}
              label={`The skyline around ${site.site.name} with the Sun and Earth`}
            />
            <dl className="grid gap-3 sm:grid-cols-3">
              <Card
                label="The Sun"
                value={
                  obs.sun.el == null ? 'Not up' : `${obs.sun.el.toFixed(1)}° elevation · ${(obs.sun.clearance ?? 0).toFixed(1)}° clearance`
                }
              >
                <strong className="text-ink">Elevation</strong> is how high the Sun stands above a flat horizon.{' '}
                <strong className="text-ink">Clearance</strong> is its height above the terrain skyline in its direction: above 0° it clears
                the ridge.
              </Card>
              <Card
                label="The Earth"
                value={obs.earth ? `${obs.earth.el.toFixed(1)}° elevation · ${obs.earth.clearance.toFixed(1)}° clearance` : 'Not computed'}
              >
                Earth counts as in view when its centre clears the skyline.
              </Card>
              <Card label="The timeline" value="1 day = 24 Earth hours">
                Day {day.toFixed(1)} is {day.toFixed(1)} Earth days after {longDate(site.params.start)}, 00:00 UTC. One lunar day and night
                lasts about 29.5 Earth days.
              </Card>
            </dl>
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </section>
  )
}

const azAround = (az: number | undefined): [number, number] => (az == null ? [0, 360] : [Math.max(0, az - 70), Math.min(360, az + 70)])

function Card({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1 rounded-md border border-line bg-surface/50 p-4">
      <dt className="eyebrow text-ink-faint">{label}</dt>
      <dd className="text-lg font-medium">{value}</dd>
      <dd className="text-xs text-ink-muted">{children}</dd>
    </div>
  )
}

function Reading({ kicker, title, tone, children }: { kicker: string; title: string; tone: 'sun' | 'earth' | 'off'; children: ReactNode }) {
  return (
    <div aria-live="polite" className="grid gap-1 border-t border-line pt-4">
      <p className="eyebrow text-ink-faint">{kicker}</p>
      <p className={`text-xl font-medium ${tone === 'sun' ? 'text-sun' : tone === 'earth' ? 'text-comms' : 'text-ink-muted'}`}>{title}</p>
      <p className="text-sm text-ink-muted">{children}</p>
    </div>
  )
}

function DayControl({
  day,
  playing,
  onPlay,
  onDay,
  label,
}: {
  day: number
  playing: boolean
  onPlay: () => void
  onDay: (d: number) => void
  label: string
}) {
  return (
    <div className="grid gap-2 border-t border-line pt-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play through the lunar day'}
          onClick={onPlay}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md border border-line hover:bg-surface-hover"
        >
          {playing ? <PauseIcon aria-hidden weight="fill" /> : <PlayIcon aria-hidden weight="fill" />}
        </button>
        <div className="grid flex-1">
          <span className="text-sm text-ink-muted">Day of the lunar month</span>
          <span className="readout text-2xl text-story-ink">Day {day.toFixed(1)}</span>
        </div>
        <button
          type="button"
          onClick={() => onDay(Math.min(LUNAR_DAYS, day + 1))}
          className="cursor-pointer rounded-md border border-line px-2.5 py-2 text-xs hover:bg-surface-hover"
        >
          +24 h ↗
        </button>
      </div>
      <Slider.Root
        value={day}
        min={0}
        max={LUNAR_DAYS}
        step={1 / 1440}
        onValueChange={(v) => onDay(Array.isArray(v) ? (v[0] ?? 0) : (v as number))}
        className="grid gap-1"
      >
        <Slider.Label className="sr-only">Day of the lunar month</Slider.Label>
        <Slider.Control className="flex h-6 cursor-pointer touch-none items-center">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-kumo-fill">
            <Slider.Indicator className="rounded-full bg-story" />
            <Slider.Thumb
              getAriaValueText={() => label}
              className="size-4 rounded-full bg-story shadow-sm outline-none has-focus-visible:ring-2 has-focus-visible:ring-kumo-focus"
            />
          </Slider.Track>
        </Slider.Control>
        <div className="eyebrow flex justify-between text-2xs text-ink-faint">
          <span>Day 0</span>
          <span>Day 15</span>
          <span>Day 29.5</span>
        </div>
      </Slider.Root>
      <p className="readout text-xs text-ink-muted">{label}</p>
    </div>
  )
}

function ObservationCard({ o, n }: { o: Observation; n: number }) {
  return (
    <div className="grid content-start gap-2 rounded-md border border-line bg-surface/50 p-4">
      <p className="eyebrow text-ink-faint">Observation {n}</p>
      <p className="font-medium">{o.siteName}</p>
      <p className="readout text-xs text-ink-muted">
        Day {o.day.toFixed(1)} · {longDate(o.date)} {minuteLabel(o.minute)} UTC
      </p>
      <ul className="grid list-disc gap-1.5 pl-5 marker:text-ink-faint">
        <li className={o.sun.inView ? 'text-sun' : 'text-ink-muted'}>
          {sunWords(o)}
          {o.sun.el != null && (
            <span className="readout text-xs text-ink-faint">
              {' '}
              · Sun {o.sun.el.toFixed(1)}°, ridge {o.sun.horizon?.toFixed(1)}°
            </span>
          )}
        </li>
        <li className={o.earth?.inView ? 'text-comms' : 'text-ink-muted'}>
          {earthWords(o)}
          {o.earth && <span className="readout text-xs text-ink-faint"> · Earth {o.earth.el.toFixed(1)}°</span>}
        </li>
      </ul>
    </div>
  )
}

/** The place, the moment and the plain question for one thing to guess. */
function describe(item: PredictionItem, summaries: Summary[]) {
  const data = summaries.find((s) => s.site.id === item.site)
  const place = data ? shortName(data) : item.site
  const { date, minute } = dayToMoment(data?.params.start ?? '2026-01-01', item.day)
  return {
    place,
    when: `Day ${item.day.toFixed(1)} · ${longDate(date)} ${minuteLabel(minute)} UTC`,
    question: item.about === 'sun' ? `Will the Sun be in view at ${place}?` : `Will Earth be in view at ${place}?`,
  }
}

const guessWords = (g: Guess | undefined) => (g === 'yes' ? 'Yes, in view' : g === 'no' ? 'No, not in view' : 'No answer')

/** One yes/no guess, with the exact place and moment spelled out so there is nothing to interpret. */
function GuessRow({
  n,
  item,
  summaries,
  value,
  onChange,
}: {
  n: number
  item: PredictionItem
  summaries: Summary[]
  value: Guess | undefined
  onChange: (v: Guess) => void
}) {
  const d = describe(item, summaries)
  return (
    <fieldset className="grid gap-3 rounded-md border border-line bg-[#0e141c] p-4">
      <legend className="sr-only">{d.question}</legend>
      <p className="readout text-xs text-ink-muted">{d.when}</p>
      <p className="text-lg leading-snug font-medium">
        {n}. {d.question}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className="cursor-pointer rounded-md border border-line px-3 py-2.5 text-center text-sm transition-colors hover:bg-surface-hover has-[:checked]:border-story has-[:checked]:bg-story/10 has-[:checked]:text-story-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-story"
          >
            <input type="radio" className="sr-only" name={item.id} value={v} checked={value === v} onChange={() => onChange(v)} />
            {guessWords(v)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Step 03: two moments side by side, and what changed between them. */
function Observe({
  q,
  notes,
  setNotes,
  go,
}: {
  q: Investigation
  notes: Notes
  setNotes: (p: Partial<Notes>) => void
  go: (s: { step?: LabStep }, push?: boolean) => void
}) {
  const [a, b] = notes.observations.slice(-2)
  return (
    <section aria-labelledby="observe-title" className="grid gap-6">
      <div className="grid gap-2">
        <p className="eyebrow text-ink-muted">Step 03 / Observe</p>
        <h2 id="observe-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-[1.02] font-medium">
          Compare two <span className="text-story-ink">moments.</span>
        </h2>
        <p className="max-w-[60ch] text-ink-muted">{q.change} Your last two observations are compared here.</p>
      </div>
      {a && b ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ObservationCard o={a} n={notes.observations.length - 1} />
            <ObservationCard o={b} n={notes.observations.length} />
          </div>
          <div className="grid gap-2 rounded-md border border-story/40 bg-story/5 p-4">
            <p className="eyebrow text-story-ink">What changed</p>
            <ul className="grid gap-1">
              {differences(a, b).map((d) => (
                <li key={d}>{d}</li>
              ))}
              {differences(a, b).length === 0 && (
                <li className="text-ink-muted">Nothing: both observations are the same moment and place.</li>
              )}
            </ul>
          </div>
        </>
      ) : (
        <div className="grid items-center gap-5 rounded-md border border-line bg-surface/50 p-6 sm:grid-cols-[auto_1fr]">
          <Mascot pose="scientist-sun" className="size-28 shrink-0" />
          <div className="grid gap-2">
            <p className="text-lg font-medium">No observations yet.</p>
            <ol className="grid max-w-[52ch] list-decimal gap-1 pl-5 text-ink-muted">
              <li>Look at the model above. The moment you stop on is remembered as your baseline.</li>
              <li>Change one thing: the time, or the place.</li>
              <li>Stop again, and the two moments are compared here.</li>
            </ol>
            <p className="readout text-xs text-ink-faint">{notes.observations.length} of 2 moments remembered</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => document.querySelector('#try-title')?.scrollIntoView({ block: 'start' })}
          className="cursor-pointer rounded-md border border-line px-4 py-2.5 hover:bg-surface-hover"
        >
          ← Back to the model
        </button>
        {notes.observations.length > 0 && (
          <button
            type="button"
            onClick={() => setNotes({ observations: [] })}
            className="cursor-pointer rounded-md border border-line px-4 py-2.5 text-ink-muted hover:bg-surface-hover"
          >
            Clear observations
          </button>
        )}
        <button
          type="button"
          onClick={() => go({ step: 'explain' }, true)}
          className="rounded-md bg-story px-4 py-2.5 font-medium text-white hover:brightness-110"
        >
          Next: explain your discovery →
        </button>
      </div>
    </section>
  )
}

function saveText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Step 04: predict, test, explain, on one sheet; download it or share the scenario. */
function Explain({
  q,
  notes,
  setNotes,
  summaries,
  go,
  scenarioLink,
}: {
  q: Investigation
  notes: Notes
  setNotes: (patch: Partial<Notes>) => void
  summaries: Summary[]
  go: (patch: { step?: LabStep }) => void
  scenarioLink: string
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  // What the computed data says at each moment the learner was asked about.
  const [truth, setTruth] = useState<Record<string, boolean | null>>({})
  useEffect(() => {
    let live = true
    const ids = [...new Set(notes.items.map((item) => item.site))]
    Promise.all(ids.map(async (id) => [id, await loadTracks(id)] as const)).then((loaded) => {
      if (!live) return
      const bySite = Object.fromEntries(loaded)
      setTruth(
        Object.fromEntries(
          notes.items.map((item) => {
            const data = summaries.find((s) => s.site.id === item.site)
            if (!data) return [item.id, null]
            return [item.id, predictionTruth(item, data, bySite[item.site]?.[dayToMoment(data.params.start, item.day).date])]
          }),
        ),
      )
    })
    return () => {
      live = false
    }
  }, [notes.items, summaries])
  const guessLines = notes.items.map((item) => {
    const d = describe(item, summaries)
    const actual = truth[item.id]
    const result = actual == null ? 'not computed' : actual ? 'in view' : 'not in view'
    return `${d.when} · ${d.question} You guessed: ${guessWords(notes.guesses[item.id])}. The data says: ${result}.`
  })
  const used = summaries.filter((site) => notes.observations.some((observation) => observation.site === site.site.id))
  return (
    <section aria-labelledby="explain-title" className="grid gap-6">
      <p className="eyebrow text-ink-muted">Step 04 / Explain your finding</p>
      <h2 id="explain-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-medium">
        {q.question}
      </h2>
      <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr] sm:justify-start">
        <Mascot pose="explorer-happy" className="size-20 shrink-0" />
        <Bubble className="justify-self-start">Set your guesses beside what you saw, then say why.</Bubble>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-4 rounded-lg border border-line bg-[#0e141c] p-5">
          <p className="eyebrow text-ink-muted">Your prediction</p>
          {notes.items.length ? (
            <ol className="grid gap-5">
              {notes.items.map((item, n) => {
                const d = describe(item, summaries)
                const actual = truth[item.id]
                const guess = notes.guesses[item.id]
                const match = actual == null || !guess ? null : (guess === 'yes') === actual
                return (
                  <li key={item.id} className="grid gap-2">
                    <p className="readout text-xs text-ink-muted">{d.when}</p>
                    <p className="font-medium">
                      {n + 1}. {d.question}
                    </p>
                    <ul className="grid list-disc gap-1 pl-5 text-sm marker:text-ink-faint">
                      <li>You guessed: {guessWords(guess)}</li>
                      <li>
                        The data says: {actual == null ? 'not computed' : actual ? 'In view' : 'Not in view'}
                        {match != null && (
                          <span className={match ? 'text-comms' : 'text-story-ink'}>
                            {match ? ' · you were right' : ' · different from your guess'}
                          </span>
                        )}
                      </li>
                    </ul>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="text-ink-muted">No prediction written.</p>
          )}
          {notes.prediction.trim() && (
            <div className="grid gap-1 border-t border-line pt-3">
              <p className="eyebrow text-ink-faint">Your reason</p>
              <p className="whitespace-pre-wrap">{notes.prediction.trim()}</p>
            </div>
          )}
        </div>
        <div className="grid content-start gap-4 rounded-lg border border-line bg-[#0e141c] p-5">
          <p className="eyebrow text-ink-muted">What you saw</p>
          {notes.observations.length ? (
            notes.observations
              .slice(-2)
              .map((observation, i) => <ObservationCard key={`${observation.site}-${observation.day}-${i}`} o={observation} n={i + 1} />)
          ) : (
            <div className="grid gap-3">
              <p className="text-ink-muted">No moments looked at yet.</p>
              <button type="button" onClick={() => go({ step: 'observe' })} className="w-max cursor-pointer underline underline-offset-4">
                Open the model and look at two moments →
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 rounded-lg border border-line bg-[#0e141c] p-5">
        <div className="grid gap-2">
          <label htmlFor="explanation" className="text-xl font-medium">
            Why did it happen?
          </label>
          <p className="text-sm text-ink-muted">Look at your guesses and what you saw. Answer in your own words:</p>
          <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-muted marker:text-ink-faint">
            <li>How high was the Sun (or Earth) above the flat horizon?</li>
            <li>How high was the ridge in that direction? Which one was higher?</li>
            <li>What changed between your two observations, and why did that change the view?</li>
          </ul>
        </div>
        <textarea
          id="explanation"
          rows={6}
          value={notes.explanation}
          onChange={(event) => setNotes({ explanation: event.target.value })}
          placeholder="It happened because…"
          className="w-full rounded-md border border-line-strong bg-[#161d26] p-3 outline-none focus:border-story"
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() =>
              saveText(
                investigationRecord({
                  investigation: q,
                  prediction: notes.prediction,
                  guesses: guessLines,
                  observations: notes.observations,
                  explanation: notes.explanation,
                  sources: used.map((site) => ({
                    site: site.site.name,
                    algorithm: site.provenance.algorithm_version,
                    provenance: site.provenance,
                  })),
                  link: scenarioLink,
                }),
                `skyline-investigation-${q.id}.md`,
              )
            }
            className="flex cursor-pointer items-center gap-2 rounded-md bg-story px-5 py-3 font-medium text-white"
          >
            Download investigation <DownloadSimpleIcon aria-hidden />
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(scenarioLink)
                setCopied(true)
                setCopyFailed(false)
              } catch {
                setCopyFailed(true)
              }
            }}
            className="cursor-pointer text-sm underline underline-offset-4"
          >
            {copied ? 'Link copied' : 'Copy this scenario link'}
          </button>
        </div>
        {copyFailed && (
          <label className="grid gap-2 text-sm text-ink-muted">
            Copy this scenario URL:
            <input
              readOnly
              value={scenarioLink}
              onFocus={(event) => event.target.select()}
              className="w-full rounded border border-line bg-black/50 p-2 text-ink"
            />
          </label>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">
        These observations describe geometric sunlight and Earth visibility under the stated terrain and visibility assumptions. They do not
        establish delivered power or a working radio link. The downloaded record includes its data sources and algorithm versions.
      </p>
      <Link to="/analyze" search={{ step: 'setup' }} className="w-max text-sm underline underline-offset-4">
        Plan a landing →
      </Link>
    </section>
  )
}
