import { Slider } from '@base-ui/react/slider'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Select } from '@cloudflare/kumo/components/select'
import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  LinkIcon,
  MapPinIcon,
  PauseIcon,
  PlayIcon,
} from '@phosphor-icons/react'
import { Link, useHydrated } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { OrbitView } from '~/components/lab/OrbitView'
import { ScenarioArt } from '~/components/lab/ScenarioArt'
import { moment } from '~/components/Moment'
import { Panorama } from '~/components/Panorama'
import { Guide, Mascot } from '~/components/story'
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
import { reducedMotion } from '~/lib/motion'
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
  // A new step starts at its top, with its title focused so a screen reader says where you are. Not on first open.
  const root = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (!opened.current) {
      opened.current = true
      return
    }
    root.current?.closest('dialog')?.scrollTo({ top: 0 })
    root.current?.querySelector<HTMLElement>('[data-step-title]')?.focus({ preventScroll: true })
  }, [step])
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
    <div ref={root} className="p-5 text-ink sm:p-8">
      <div key={step} className="lab-step-content grid min-w-0 gap-10">
        {step === 'choose' && (
          <Choose
            summaries={summaries}
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
            onChangeQuestion={() => go({ step: 'choose' })}
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
              onChangeQuestion={() => go({ step: 'choose' })}
              site={site}
              summaries={summaries}
              eph={eph}
              day={search.day}
              notes={notes}
              setNotes={setNotes}
              go={go}
              hydrated={hydrated}
            />
            <Observe notes={notes} setNotes={setNotes} go={go} />
          </>
        )}
        {q && step === 'explain' && (
          <Explain q={q} notes={notes} setNotes={setNotes} summaries={summaries} go={go} scenarioLink={scenarioLink} />
        )}
      </div>
    </div>
  )
}

/* One set of controls for every step, so a button means the same thing on each page. */
const BTN =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-story'
const PRIMARY = `${BTN} bg-story text-white enabled:hover:bg-story-hover`
const SECONDARY = `${BTN} border border-line-strong text-ink enabled:hover:bg-surface-hover`
const QUIET = `${BTN} text-ink-muted enabled:hover:bg-surface-hover enabled:hover:text-ink`
const TEXT_LINK =
  'inline-flex w-max cursor-pointer items-center gap-1.5 text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink'
const FIELD =
  'w-full rounded-md border border-line-strong bg-black/30 p-3 text-base outline-none transition-colors duration-150 placeholder:text-ink-faint focus:border-story'
const SURFACE = 'rounded-xl border border-line bg-[#0c1016]'
const INSET = 'rounded-lg border border-line bg-black/25'

/** Every step opens the same way: what it is about, its title, one line on what to do, and the guide beside it. */
function StepHead({
  id,
  kicker,
  title,
  lede,
  aside,
}: {
  id: string
  kicker?: ReactNode
  title: ReactNode
  lede?: ReactNode
  aside?: ReactNode
}) {
  return (
    <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="grid gap-3">
        {kicker}
        <h3
          id={id}
          data-step-title
          tabIndex={-1}
          className="text-[clamp(1.875rem,1.4rem+1.9vw,2.875rem)] leading-[1.05] font-medium text-balance outline-none"
        >
          {title}
        </h3>
        {lede && <p className="max-w-[62ch] text-ink-muted text-pretty">{lede}</p>}
      </div>
      {aside}
    </header>
  )
}

/** The question this step belongs to, with the way back to pick another. */
function QuestionKicker({ q, onChange }: { q: Investigation; onChange: () => void }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span className="text-story-ink">{q.question}</span>
      <button type="button" onClick={onChange} className={TEXT_LINK}>
        Change question
      </button>
    </p>
  )
}

/** Step 01: the three questions as the page's content, and a quiet way out for anyone who would rather just play. */
function Choose({ summaries, onPick, onOrbit }: { summaries: Summary[]; onPick: (id: Investigation['id']) => void; onOrbit: () => void }) {
  return (
    <section aria-labelledby="choose-title" className="grid gap-8">
      <StepHead
        id="choose-title"
        title="Pick a question to investigate"
        lede="Each question changes one thing and keeps the rest still, so you can see how place, terrain and time decide whether the Sun and Earth are in view."
      />
      <ul className="grid gap-4 md:grid-cols-3">
        {INVESTIGATIONS.map((i) => {
          const place = summaries.find((s) => s.site.id === i.site)
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onPick(i.id)}
                className={`group grid h-full w-full cursor-pointer grid-rows-[auto_1fr] overflow-hidden text-left transition-[border-color,background-color,scale] duration-150 ease-out hover:border-story/70 hover:bg-[#0f1520] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-story active:scale-[0.98] ${SURFACE}`}
              >
                <span className="block overflow-hidden border-b border-line">
                  <ScenarioArt
                    id={i.id}
                    className="h-44 w-full transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:scale-[1.03]"
                  />
                </span>
                <span className="grid grid-rows-[1fr_auto] gap-5 p-5">
                  <span className="grid content-start gap-1.5">
                    <span className="text-xl leading-snug font-medium text-balance">{i.question}</span>
                    <span className="text-sm text-ink-muted">{i.change}</span>
                  </span>
                  <span className="flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 text-ink-muted">
                      <MapPinIcon aria-hidden weight="fill" className="size-3.5 shrink-0 text-ink-faint" />
                      <span className="truncate">{place ? shortName(place) : i.site}</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-medium text-story-ink">
                      Start
                      <ArrowRightIcon
                        aria-hidden
                        weight="bold"
                        className="size-3.5 transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
                      />
                    </span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <p className="text-sm text-ink-muted">
          <span className="text-ink">No question in mind?</span> Move through time in the true-scale Moon, Earth and Sun.
        </p>
        <button type="button" onClick={onOrbit} className={SECONDARY}>
          Explore the orbit freely
          <ArrowRightIcon aria-hidden weight="bold" className="size-3.5" />
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
  onChangeQuestion,
}: {
  q: Investigation
  onChangeQuestion: () => void
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
      <section aria-labelledby="predict-title" className="grid gap-8">
        <StepHead
          id="predict-title"
          kicker={<QuestionKicker q={q} onChange={onChangeQuestion} />}
          title={
            <>
              Guess first. <span className="text-story-ink">Then test it.</span>
            </>
          }
          lede={q.task}
          aside={<Guide pose="scientist-presenting" says="Being wrong is how the Moon surprises you." className="hidden lg:flex" />}
        />
        <form
          className={`grid gap-6 p-5 sm:p-6 ${SURFACE}`}
          onSubmit={(e) => {
            e.preventDefault()
            setNotes({ tested: true, items })
            go({ step: 'observe', day: items[0]?.day })
          }}
        >
          {ready ? (
            <>
              <div className="grid gap-3">
                {items.map((item, n) => {
                  const when = describe(item, summaries).when
                  const prev = items[n - 1]
                  return (
                    <GuessRow
                      key={item.id}
                      n={n + 1}
                      item={item}
                      summaries={summaries}
                      showWhen={!prev || describe(prev, summaries).when !== when}
                      value={notes.guesses[item.id]}
                      onChange={(v) => setNotes({ guesses: { ...notes.guesses, [item.id]: v } })}
                    />
                  )
                })}
              </div>
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
                  className={FIELD}
                />
              </label>
            </>
          ) : (
            <p role="status" className="text-ink-muted">
              Finding the moment to ask about…
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
            <button type="submit" disabled={!ready || !answered} className={PRIMARY}>
              Test my prediction
              <ArrowRightIcon aria-hidden weight="bold" className="size-3.5" />
            </button>
            {ready && !answered && <span className="text-sm text-ink-muted">Answer every question to continue.</span>}
          </div>
        </form>
      </section>
    )

  return (
    <section aria-labelledby="try-title" className="grid gap-6">
      <StepHead
        id="try-title"
        kicker={<QuestionKicker q={q} onChange={onChangeQuestion} />}
        title={
          <>
            Move time. <span className="text-story-ink">See the answer.</span>
          </>
        }
        lede="Drag the day or press play. The terrain, Sun and Earth move together, and the readings beside the model follow them."
      />
      <div className="grid overflow-hidden rounded-xl border border-line lg:grid-cols-[minmax(0,1fr)_22rem]">
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
        </div>
        <aside className="grid content-start gap-5 border-t border-line bg-[#0c1016] p-5 lg:border-t-0 lg:border-l">
          <div
            role="group"
            aria-label="What the panel shows"
            className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/30 p-1"
          >
            {(
              [
                ['light', 'Sun & Earth'],
                ['orbit', 'Orbit'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition-[background-color,color] duration-150 ease-out ${tab === id ? 'bg-white/10 text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-muted">{q.change}</p>
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
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${focus?.target === w ? 'border-story bg-story/10 text-story-ink' : 'border-line-strong hover:bg-surface-hover'}`}
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
                behavior: reducedMotion().matches ? 'auto' : 'smooth',
                block: 'start',
              })
            }
            className={`${PRIMARY} w-full`}
          >
            Next: compare two moments
            <ArrowDownIcon aria-hidden weight="bold" className="size-3.5" />
          </button>
        </aside>
      </div>
      <Collapsible.Root open={diagram} onOpenChange={setDiagram}>
        <Collapsible.DefaultTrigger>Why is it blocked? Show the horizon diagram</Collapsible.DefaultTrigger>
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
    <div className={`grid content-start gap-1 p-4 ${INSET}`}>
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
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md border border-line-strong transition-[background-color,scale] duration-150 ease-out hover:bg-surface-hover active:scale-[0.96]"
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
          className="cursor-pointer rounded-md border border-line-strong px-2.5 py-2 text-xs transition-[background-color,scale] duration-150 ease-out hover:bg-surface-hover active:scale-[0.96]"
        >
          +1 day
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
    <div className={`grid content-start gap-2 p-4 ${INSET}`}>
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
  showWhen,
  value,
  onChange,
}: {
  n: number
  item: PredictionItem
  summaries: Summary[]
  showWhen: boolean
  value: Guess | undefined
  onChange: (v: Guess) => void
}) {
  const d = describe(item, summaries)
  return (
    <fieldset className={`grid gap-3 p-4 ${INSET}`}>
      <legend className="sr-only">{d.question}</legend>
      {showWhen && <p className="readout text-xs text-ink-muted">{d.when}</p>}
      <p className="text-lg leading-snug font-medium">
        <span className="readout mr-2 text-sm text-ink-faint">0{n}</span>
        {d.question}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-line px-3 py-2.5 text-sm transition-[background-color,border-color,color,scale] duration-150 ease-out hover:bg-surface-hover active:scale-[0.98] has-[:checked]:border-story has-[:checked]:bg-story/10 has-[:checked]:text-story-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-story"
          >
            <input type="radio" className="peer sr-only" name={item.id} value={v} checked={value === v} onChange={() => onChange(v)} />
            <CheckIcon aria-hidden weight="bold" className="hidden size-3.5 peer-checked:block" />
            {guessWords(v)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Step 03: two moments side by side, and what changed between them. */
function Observe({
  notes,
  setNotes,
  go,
}: {
  notes: Notes
  setNotes: (p: Partial<Notes>) => void
  go: (s: { step?: LabStep }, push?: boolean) => void
}) {
  const [a, b] = notes.observations.slice(-2)
  return (
    <section aria-labelledby="observe-title" className="grid gap-6 border-t border-line pt-10">
      <div className="grid gap-2">
        <h3 id="observe-title" className="text-[clamp(1.5rem,1.2rem+1.2vw,2.125rem)] leading-[1.1] font-medium text-balance">
          Compare two <span className="text-story-ink">moments.</span>
        </h3>
        <p className="max-w-[60ch] text-ink-muted text-pretty">
          Stop on a moment, change one thing, stop again. Your last two stops are set side by side here.
        </p>
      </div>
      {a && b ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ObservationCard o={a} n={notes.observations.length - 1} />
            <ObservationCard o={b} n={notes.observations.length} />
          </div>
          <div className="grid gap-2 rounded-lg border border-story/40 bg-story/5 p-4">
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
        <div className={`grid items-center gap-5 p-6 sm:grid-cols-[auto_1fr] ${SURFACE}`}>
          <Mascot pose="scientist-sun" className="size-24 shrink-0" />
          <div className="grid gap-2">
            <p className="text-lg font-medium">{notes.observations.length === 0 ? 'No moments yet.' : 'One more moment to go.'}</p>
            <ol className="grid max-w-[52ch] list-decimal gap-1 pl-5 text-ink-muted marker:text-ink-faint">
              <li>Stop on a moment in the model above. It becomes your baseline.</li>
              <li>Change one thing: the time, or the place.</li>
              <li>Stop again. The two moments appear here, side by side.</li>
            </ol>
            <p className="readout text-xs text-ink-faint">{notes.observations.length} of 2 moments remembered</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => go({ step: 'explain' }, true)} className={PRIMARY}>
          Next: explain what you saw
          <ArrowRightIcon aria-hidden weight="bold" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            document.querySelector('#try-title')?.scrollIntoView({ behavior: reducedMotion().matches ? 'auto' : 'smooth', block: 'start' })
          }
          className={SECONDARY}
        >
          Back to the model
        </button>
        {notes.observations.length > 0 && (
          <button type="button" onClick={() => setNotes({ observations: [] })} className={QUIET}>
            Clear moments
          </button>
        )}
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
    <section aria-labelledby="explain-title" className="grid gap-8">
      <StepHead
        id="explain-title"
        kicker={<p className="text-sm text-story-ink">Explain your finding</p>}
        title={q.question}
        lede="Put your guesses beside what the model showed, then say in your own words why it happened."
        aside={<Guide pose="explorer-happy" says="A wrong guess makes the best explanation." className="hidden lg:flex" />}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`grid content-start gap-4 p-5 ${SURFACE}`}>
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
                      <span className="readout mr-2 text-sm text-ink-faint">0{n + 1}</span>
                      {d.question}
                    </p>
                    <ul className="grid list-disc gap-1 pl-5 text-sm marker:text-ink-faint">
                      <li>You guessed: {guessWords(guess)}</li>
                      <li>
                        The data says: {actual == null ? 'not computed' : actual ? 'In view' : 'Not in view'}
                        {match != null && (
                          <span className={`ml-2 inline-flex items-center gap-1 ${match ? 'text-comms' : 'text-story-ink'}`}>
                            {match && <CheckIcon aria-hidden weight="bold" className="size-3" />}
                            {match ? 'You were right' : 'Different from your guess'}
                          </span>
                        )}
                      </li>
                    </ul>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="grid gap-3">
              <p className="text-ink-muted">You haven’t made a prediction for this question yet.</p>
              <button type="button" onClick={() => go({ step: 'try' })} className={TEXT_LINK}>
                Make a prediction
                <ArrowRightIcon aria-hidden weight="bold" className="size-3" />
              </button>
            </div>
          )}
          {notes.prediction.trim() && (
            <div className="grid gap-1 border-t border-line pt-3">
              <p className="eyebrow text-ink-faint">Your reason</p>
              <p className="whitespace-pre-wrap">{notes.prediction.trim()}</p>
            </div>
          )}
        </div>
        <div className={`grid content-start gap-4 p-5 ${SURFACE}`}>
          <p className="eyebrow text-ink-muted">What you saw</p>
          {notes.observations.length ? (
            notes.observations
              .slice(-2)
              .map((observation, i) => <ObservationCard key={`${observation.site}-${observation.day}-${i}`} o={observation} n={i + 1} />)
          ) : (
            <div className="grid gap-3">
              <p className="text-ink-muted">You haven’t stopped on any moments yet.</p>
              <button type="button" onClick={() => go({ step: 'observe' })} className={TEXT_LINK}>
                Open the model
                <ArrowRightIcon aria-hidden weight="bold" className="size-3" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={`grid gap-5 p-5 sm:p-6 ${SURFACE}`}>
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
          className={FIELD}
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
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
            className={PRIMARY}
          >
            <DownloadSimpleIcon aria-hidden weight="bold" className="size-4" />
            Download investigation
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(scenarioLink)
                setCopied(true)
                setCopyFailed(false)
                window.setTimeout(() => setCopied(false), 2000)
              } catch {
                setCopyFailed(true)
              }
            }}
            className={SECONDARY}
          >
            {copied ? (
              <CheckIcon aria-hidden weight="bold" className="size-4 text-comms" />
            ) : (
              <LinkIcon aria-hidden weight="bold" className="size-4" />
            )}
            <span aria-live="polite">{copied ? 'Link copied' : 'Copy link to this investigation'}</span>
          </button>
        </div>
        {copyFailed && (
          <label className="grid gap-2 text-sm text-ink-muted">
            Unable to copy automatically. Select the link and copy it:
            <input readOnly value={scenarioLink} onFocus={(event) => event.target.select()} className={`${FIELD} readout text-sm`} />
          </label>
        )}
      </div>
      <footer className="grid gap-4 border-t border-line pt-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-10">
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink-faint">
          These observations describe geometric sunlight and Earth visibility under the stated terrain and visibility assumptions. They do
          not establish delivered power or a working radio link. The downloaded record includes its data sources and algorithm versions.
        </p>
        <Link to="/analyze" search={{ step: 'setup' }} className={TEXT_LINK}>
          Use this to plan a landing
          <ArrowRightIcon aria-hidden weight="bold" className="size-3" />
        </Link>
      </footer>
    </section>
  )
}
