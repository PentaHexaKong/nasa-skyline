import { Slider } from '@base-ui/react/slider'
import { Collapsible } from '@cloudflare/kumo/components/collapsible'
import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, DownloadSimpleIcon, PauseIcon, PlayIcon, PlusIcon } from '@phosphor-icons/react'
import { Link, useHydrated } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react'
import { OrbitView } from '~/components/lab/OrbitView'
import { moment } from '~/components/Moment'
import { Panorama } from '~/components/Panorama'
import { Bubble, Mascot } from '~/components/story'
import { TerrainImage } from '~/components/TerrainImage'
import { loadMoonEphemeris, type Summary } from '~/lib/data'
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
 * the 3D model of the real terrain, capture two observations, explain what changed. Steps stay in the modal;
 * the exported scenario link reopens its question, place, moment and step. Notes stay in this browser tab.
 */
export type LabSearch = { step?: LabStep; q?: Investigation['id']; site?: string; day?: number }

type Notes = { prediction: string; tested: boolean; observations: Observation[]; explanation: string }
const EMPTY: Notes = { prediction: '', tested: false, observations: [], explanation: '' }

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
                  on ? 'border-flare bg-[#0e141c] ring-1 ring-flare' : 'border-line bg-[#0e141c] hover:border-line-strong'
                }`}
              >
                <span className={`readout text-sm ${on ? 'text-flare' : 'text-ink-faint'}`}>{String(i + 1).padStart(2, '0')}</span>
                <span className="grid">
                  <span className="font-medium">{s.label}</span>
                  <span className={`hidden text-xs sm:block ${on ? 'text-flare' : 'text-ink-faint'}`}>{s.hint}</span>
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
      <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto_22rem]">
        <h2 id="choose-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.5rem)] leading-[1.02] font-medium">
          What would you
          <br />
          <span className="text-flare">like to discover?</span>
        </h2>
        <div className="flex items-end gap-2">
          <Mascot pose="scientist-question" className="size-28" />
        </div>
        <p className="text-ink-muted text-pretty">
          A ridge can hide the Sun. Another viewpoint can reveal Earth. Pick a question, change one thing, and see what happens.
        </p>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-3 border-y border-line py-3 text-sm">
        <span>
          <span className="eyebrow mr-3 text-flare">What you will learn</span>
          How <strong className="font-medium">place, terrain and time</strong> change a view of the Sun and Earth.
        </span>
        <span className="eyebrow text-ink-faint">Real LOLA terrain · SPICE geometry · computed by Skyline</span>
      </p>
      <ul className="grid gap-4 md:grid-cols-3">
        {INVESTIGATIONS.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => onPick(i.id)}
              aria-pressed={current?.id === i.id}
              className={`group grid h-full min-h-52 w-full cursor-pointer content-between overflow-hidden rounded-lg border text-left transition-colors ${
                current?.id === i.id ? 'border-flare bg-flare/10' : 'border-line bg-surface/50 hover:border-flare/60 hover:bg-flare/5'
              }`}
            >
              <TerrainImage siteId={i.site} className="h-40 w-full" />
              <span className="flex items-start justify-between gap-3 px-5">
                <span className="eyebrow text-ink-faint">{i.kicker}</span>
                <ArrowRightIcon
                  aria-hidden
                  className="size-4 -rotate-45 text-ink-faint transition-transform group-hover:-translate-y-0.5"
                />
              </span>
              <span className="px-5 text-xl leading-tight font-medium">{i.question}</span>
              <span className="px-5 pb-5 text-sm text-ink-muted">{i.change}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-md border border-line bg-surface/50 p-6">
        <div className="grid gap-1">
          <p className="eyebrow text-flare">Prefer to experiment freely?</p>
          <p className="text-2xl font-medium">Take the controls.</p>
          <p className="text-sm text-ink-muted">
            Move through time in the true-scale Moon, Earth and Sun, and watch the orbit. No worksheet required.
          </p>
        </div>
        <button type="button" onClick={onOrbit} className="rounded-md bg-flare px-5 py-3 font-medium text-white hover:brightness-110">
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
  const [diagram, setDiagram] = useState(false)
  const { date, minute } = dayToMoment(site.params.start, day)
  const track = tracks?.[date]
  const m = moment(site, track, date, minute)
  const comms = earthTarget(site, track, date, minute)
  const obs = observe(site, track, day)

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => go({ day: Math.min(LUNAR_DAYS, Math.round((day + 1 / 24) * 24) / 24) }), 120)
    if (day >= LUNAR_DAYS) setPlaying(false)
    return () => window.clearInterval(id)
  }, [playing, day, go])

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
            className="grid content-start gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setNotes({ tested: true })
              go({ step: 'observe' })
            }}
          >
            <p className="eyebrow text-ink-muted">Before you try / your prediction</p>
            <label htmlFor="prediction" id="predict-title" className="text-lg font-medium">
              Before you try: what do you predict?
            </label>
            <p className="text-sm text-ink-muted">{q.task}</p>
            <textarea
              id="prediction"
              rows={4}
              value={notes.prediction}
              onChange={(e) => setNotes({ prediction: e.target.value })}
              placeholder="I predict… because…"
              className="w-full rounded-md border border-line-strong bg-black/40 p-3 text-base outline-none focus:border-flare"
            />
            <div>
              <button type="submit" className="rounded-md bg-flare px-5 py-3 font-medium text-white hover:brightness-110">
                Test my prediction ↗
              </button>
            </div>
          </form>
          <div className="grid content-end justify-items-center gap-2">
            <Bubble>Guess first. Being wrong is how the Moon surprises you.</Bubble>
            <Mascot pose="scientist-presenting" className="size-40" />
          </div>
        </div>
      </section>
    )

  const capture = () => {
    if (track) setNotes({ observations: [...notes.observations, obs].slice(-6) })
  }

  return (
    <section aria-labelledby="try-title" className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_28rem] lg:items-end">
        <div className="grid gap-2">
          <p className="eyebrow text-ink-muted">Step 03 / Observe</p>
          <h2 id="try-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-[1.02] font-medium">
            Move time.
            <br />
            <span className="text-flare">See the answer.</span>
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
            <span aria-hidden className="size-1.5 rounded-full bg-flare" />
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
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${tab === id ? 'border-flare bg-flare text-white' : 'border-line hover:bg-surface-hover'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-1">
            <p className="eyebrow text-flare">Try it. See it. Understand it.</p>
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
                    aria-pressed={look === w && diagram}
                    onClick={() => {
                      setLook(w)
                      setDiagram(true)
                    }}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${look === w && diagram ? 'border-flare text-flare' : 'border-line hover:bg-surface-hover'}`}
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
            onDay={(d) => go({ day: d })}
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
            onClick={capture}
            disabled={!track}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-line-strong px-3 py-2.5 text-sm hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon aria-hidden className="size-4" /> Capture observation
            <span className="readout text-ink-faint">({notes.observations.length})</span>
          </button>
          <button
            type="button"
            onClick={() =>
              document.getElementById('observe-title')?.scrollIntoView({
                behavior: reducedMotion().matches ? 'auto' : 'smooth',
                block: 'start',
              })
            }
            className="rounded-md bg-flare px-3 py-2.5 text-sm font-medium text-white hover:brightness-110"
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
          <span className="text-sm text-ink-muted">Choose day</span>
          <span className="readout text-2xl text-flare">Day {day.toFixed(1)}</span>
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
        step={1 / 24}
        onValueChange={(v) => onDay(Array.isArray(v) ? (v[0] ?? 0) : (v as number))}
        className="grid gap-1"
      >
        <Slider.Label className="sr-only">Day of the lunar month</Slider.Label>
        <Slider.Control className="flex h-6 cursor-pointer touch-none items-center">
          <Slider.Track className="relative h-1.5 w-full rounded-full bg-kumo-fill">
            <Slider.Indicator className="rounded-full bg-flare" />
            <Slider.Thumb
              getAriaValueText={() => label}
              className="size-4 rounded-full bg-flare shadow-sm outline-none has-focus-visible:ring-2 has-focus-visible:ring-kumo-focus"
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
      <p className={o.sun.inView ? 'text-sun' : 'text-ink-muted'}>
        {sunWords(o)}
        {o.sun.el != null && (
          <span className="readout text-xs text-ink-faint">
            {' '}
            · Sun {o.sun.el.toFixed(1)}°, ridge {o.sun.horizon?.toFixed(1)}°
          </span>
        )}
      </p>
      <p className={o.earth?.inView ? 'text-comms' : 'text-ink-muted'}>
        {earthWords(o)}
        {o.earth && <span className="readout text-xs text-ink-faint"> · Earth {o.earth.el.toFixed(1)}°</span>}
      </p>
    </div>
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
          Compare two <span className="text-flare">moments.</span>
        </h2>
        <p className="max-w-[60ch] text-ink-muted">{q.change} Your last two observations are compared here.</p>
      </div>
      {a && b ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ObservationCard o={a} n={notes.observations.length - 1} />
            <ObservationCard o={b} n={notes.observations.length} />
          </div>
          <div className="grid gap-2 rounded-md border border-flare/40 bg-flare/5 p-4">
            <p className="eyebrow text-flare">What changed</p>
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
        <div className="flex flex-wrap items-end gap-4 rounded-md border border-line bg-surface/50 p-6">
          <Mascot pose="scientist-sun" className="size-28" />
          <p className="max-w-[46ch] text-ink-muted">
            Your observations will appear here. Capture a baseline, change one variable, then capture again. You have{' '}
            {notes.observations.length} so far.
          </p>
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
          className="rounded-md bg-flare px-4 py-2.5 font-medium text-white hover:brightness-110"
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
  const used = summaries.filter((site) => notes.observations.some((observation) => observation.site === site.site.id))
  return (
    <section aria-labelledby="explain-title" className="grid gap-6">
      <p className="eyebrow text-ink-muted">Step 04 / Explain your finding</p>
      <h2 id="explain-title" className="text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-medium">
        {q.question}
      </h2>
      <div className="flex items-center gap-4">
        <Mascot pose="explorer-happy" className="size-20 shrink-0" />
        <Bubble>Keep your prediction and what you saw side by side.</Bubble>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-4 rounded-lg border border-line bg-[#0e141c] p-5">
          <p className="eyebrow text-ink-muted">Before you try / your prediction</p>
          <p className="whitespace-pre-wrap">{notes.prediction.trim() || 'No prediction written.'}</p>
        </div>
        <div className="grid content-start gap-4 rounded-lg border border-line bg-[#0e141c] p-5">
          <p className="eyebrow text-ink-muted">What you saw</p>
          {notes.observations.length ? (
            notes.observations
              .slice(-2)
              .map((observation, i) => <ObservationCard key={`${observation.site}-${observation.day}-${i}`} o={observation} n={i + 1} />)
          ) : (
            <div className="grid gap-3">
              <p className="text-ink-muted">No observations captured yet.</p>
              <button type="button" onClick={() => go({ step: 'observe' })} className="w-max cursor-pointer underline underline-offset-4">
                Open the model and capture two moments →
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 rounded-lg border border-line bg-[#0e141c] p-5">
        <label htmlFor="explanation" className="eyebrow text-ink-muted">
          What changed — and what is your evidence?
        </label>
        <textarea
          id="explanation"
          rows={7}
          value={notes.explanation}
          onChange={(event) => setNotes({ explanation: event.target.value })}
          placeholder="Write what changed, what stayed the same, and your evidence."
          className="w-full rounded-md border border-line-strong bg-[#161d26] p-3 outline-none focus:border-flare"
        />
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() =>
              saveText(
                investigationRecord({
                  investigation: q,
                  prediction: notes.prediction,
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
            className="flex cursor-pointer items-center gap-2 rounded-md bg-flare px-5 py-3 font-medium text-black"
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
