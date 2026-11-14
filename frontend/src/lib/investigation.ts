import { horizonAt } from '~/components/Moment'
import type { Summary, Track } from './data'
import { DAY_MS } from './mission'
import { dataEnd, instant, longDate, minuteLabel, sunAt, sunStateAt } from './time'

/**
 * The Understand lab: choose a question, predict, move one thing, observe, explain. Every reading in an observation
 * comes from the site's pipeline file (Sun and Earth tracks, the 1 s intervals, the computed skyline); nothing here is
 * typed in.
 */

export const INVESTIGATIONS = [
  {
    id: 'mountain',
    kicker: '01 / Light & landscape',
    question: 'Can a mountain hide the Sun?',
    change: 'Keep the place. Change the time.',
    task: 'Here is one exact moment at one place. Guess what an observer standing there would see, then test your guess in the 3D model.',
    variable: 'time',
    site: 'connecting-ridge',
  },
  {
    id: 'light',
    kicker: '02 / Think in trade-offs',
    question: 'Is more light always better?',
    change: 'Keep the time. Compare two places.',
    task: 'Here is one exact moment at two places. Guess what an observer would see at each one, then test your guesses in the 3D model.',
    variable: 'place',
    site: 'shackleton-rim',
  },
  {
    id: 'later',
    kicker: '03 / A change of plans',
    question: 'What if we arrive a day later?',
    change: 'Keep the place. Delay arrival.',
    task: 'Here is one place on two days, one day apart. Guess what an observer would see on each day, then test your guesses in the 3D model.',
    variable: 'day',
    site: 'de-gerlache-rim',
  },
] as const

export type InvestigationId = (typeof INVESTIGATIONS)[number]['id']
export type Investigation = (typeof INVESTIGATIONS)[number]
export const INVESTIGATION_IDS = INVESTIGATIONS.map((i) => i.id) as [InvestigationId, ...InvestigationId[]]
export const investigationById = (id: string | undefined): Investigation | undefined => INVESTIGATIONS.find((i) => i.id === id)

export const LAB_STEPS = [
  { id: 'choose', label: 'Choose', hint: 'Pick a question to explore.' },
  { id: 'try', label: 'Try', hint: 'Make a prediction before you test.' },
  { id: 'observe', label: 'Observe', hint: 'Move time and watch what changes.' },
  { id: 'explain', label: 'Explain', hint: 'Say why it happened.' },
] as const
export type LabStep = (typeof LAB_STEPS)[number]['id']

/** One thing to guess: whether the Sun, or Earth, is in view at one place on one slider day. */
export type PredictionItem = { id: string; site: string; day: number; about: 'sun' | 'earth' }

/** The default moment the questions open on, when no ridge moment is found. */
export const DEFAULT_DAY = 8

/**
 * The exact moments a learner is asked about, so a guess can be checked against the computed answer.
 * `openingDay` is the first moment the Sun is up but hidden (found from the tracks), used by the mountain question.
 */
export function predictionItems(q: Investigation, openingDay: number | null): PredictionItem[] {
  const pair = (site: string, day: number, key: string): PredictionItem[] => [
    { id: `${key}-sun`, site, day, about: 'sun' },
    { id: `${key}-earth`, site, day, about: 'earth' },
  ]
  if (q.id === 'mountain') return pair(q.site, openingDay ?? DEFAULT_DAY, 'a')
  if (q.id === 'light') return [...pair('shackleton-rim', DEFAULT_DAY, 'a'), ...pair('connecting-ridge', DEFAULT_DAY, 'b')]
  return [...pair(q.site, DEFAULT_DAY, 'a'), ...pair(q.site, DEFAULT_DAY + 1, 'b')]
}

/** One synodic month: the slider runs over one lunar day and night. */
export const LUNAR_DAYS = 29.5

/** A slider day (0 to 29.5, from the start of the computed window) as a UTC date and minute. */
export function dayToMoment(start: string, day: number) {
  const t = Date.parse(`${start}T00:00:00Z`) + Math.round(day * 1440) * 60_000
  const date = new Date(Math.floor(t / DAY_MS) * DAY_MS).toISOString().slice(0, 10)
  return { date, minute: Math.round((t % DAY_MS) / 60_000) }
}

export type Observation = {
  site: string
  siteName: string
  date: string
  minute: number
  day: number
  sun: { el: number | null; horizon: number | null; clearance: number | null; inView: boolean; up: boolean }
  earth: { el: number; clearance: number; inView: boolean } | null
}

/** What the observer sees at one moment: the Sun's and Earth's elevation, the ridge under each, and whether each is in view. */
export function observe(data: Summary, track: Track | undefined, day: number): Observation {
  const { date, minute } = dayToMoment(data.params.start, day)
  const at = instant(date, minute)
  const end = dataEnd(data.params)
  const sun = sunAt(track, minute)
  const horizon = sun ? horizonAt(data.skyline.elevation_deg, data.skyline.az_step_deg, sun.az) : null
  const inView = sunStateAt(data.intervals, at, end).inSun
  let earth: Observation['earth'] = null
  const e = track?.earth
  if (e && data.earth_intervals) {
    // Earth moves slowly; the nearest hourly sample is enough for a reading at the slider's resolution.
    let best = 0
    e.t_min.forEach((t, i) => {
      if (Math.abs(t - minute) < Math.abs((e.t_min[best] ?? 0) - minute)) best = i
    })
    const az = e.az_deg[best] ?? 0
    const el = e.el_deg[best] ?? 0
    earth = {
      el,
      clearance: el - horizonAt(data.skyline.elevation_deg, data.skyline.az_step_deg, az),
      inView: sunStateAt(data.earth_intervals, at, end).inSun,
    }
  }
  return {
    site: data.site.id,
    siteName: data.site.name.split(',')[0] ?? data.site.name,
    date,
    minute,
    day,
    sun: {
      el: sun?.el ?? null,
      horizon,
      clearance: sun && horizon != null ? sun.el - horizon : null,
      inView,
      up: (sun?.el ?? -90) > -0.27,
    },
    earth,
  }
}

/** The first moment in the month when the Sun is up but the terrain hides all of it: where "Can a mountain hide the Sun?" opens. */
export function hiddenSunDay(data: Summary, tracks: Record<string, Track>): number | null {
  for (let day = 0; day <= LUNAR_DAYS; day += 1 / 24) {
    const { date } = dayToMoment(data.params.start, day)
    const o = observe(data, tracks[date], day)
    if (o.sun.el != null && o.sun.el > 0.5 && !o.sun.inView) return Math.round(day * 24) / 24
  }
  return null
}

/** What the computed data says about one guess: true when the Sun, or Earth, is in view; null when it was not computed. */
export function predictionTruth(item: PredictionItem, data: Summary, track: Track | undefined): boolean | null {
  const o = observe(data, track, item.day)
  return item.about === 'sun' ? o.sun.inView : (o.earth?.inView ?? null)
}

const deg = (x: number | null) => (x == null ? 'not computed' : `${x.toFixed(1)}°`)

export const sunWords = (o: Observation) => (o.sun.inView ? 'Sun in view' : o.sun.up ? 'Sun behind terrain' : 'Sun below the horizon')
export const earthWords = (o: Observation) =>
  o.earth == null ? 'Earth not computed' : o.earth.inView ? 'Earth in view' : 'Earth behind terrain'

/** The two observations side by side: what changed between them. */
export function differences(a: Observation, b: Observation) {
  const out: string[] = []
  if (a.site !== b.site) out.push(`Place: ${a.siteName} → ${b.siteName}`)
  if (a.date !== b.date || a.minute !== b.minute)
    out.push(`Time: ${longDate(a.date)} ${minuteLabel(a.minute)} → ${longDate(b.date)} ${minuteLabel(b.minute)} UTC`)
  if (a.sun.inView !== b.sun.inView || a.sun.up !== b.sun.up) out.push(`Sun: ${sunWords(a)} → ${sunWords(b)}`)
  if ((a.earth?.inView ?? null) !== (b.earth?.inView ?? null)) out.push(`Earth: ${earthWords(a)} → ${earthWords(b)}`)
  return out
}

/** The investigation as a Markdown file the learner keeps: question, prediction, evidence, explanation, sources. */
export function investigationRecord(input: {
  investigation: Investigation
  prediction: string
  guesses?: string[]
  observations: Observation[]
  explanation: string
  sources: { site: string; algorithm: string; provenance?: Summary['provenance'] }[]
  link: string
}) {
  const { investigation: q, prediction, observations, explanation, sources, link, guesses = [] } = input
  const lines = [
    `# ${q.question}`,
    '',
    `${q.change} Skyline investigation, ${q.kicker.replace(/^\d+ \/ /, '')}.`,
    '',
    '## 1 · Predict',
    '',
    ...(guesses.length ? [...guesses.map((g) => `- ${g}`), ''] : []),
    prediction.trim() || '_No reason written._',
    '',
    '## 2 · Test',
    '',
    '| # | Place | Time (UTC) | Sun elevation | Ridge under the Sun | Sun | Earth |',
    '| - | - | - | - | - | - | - |',
    ...observations.map(
      (o, i) =>
        `| ${i + 1} | ${o.siteName} | ${longDate(o.date)} ${minuteLabel(o.minute)} | ${deg(o.sun.el)} | ${deg(o.sun.horizon)} | ${sunWords(o)} | ${earthWords(o)} |`,
    ),
    ...(observations.length >= 2
      ? [
          '',
          'What changed between the last two:',
          '',
          ...differences(observations.at(-2) as Observation, observations.at(-1) as Observation).map((d) => `- ${d}`),
        ]
      : []),
    '',
    '## 3 · Why?',
    '',
    explanation.trim() || '_No explanation written._',
    '',
    '## Where the numbers come from',
    '',
    ...sources.flatMap((s) => [
      `- ${s.site}: Skyline pipeline algorithm ${s.algorithm}.`,
      ...(s.provenance ? ['', '```json', JSON.stringify(s.provenance, null, 2), '```', ''] : []),
    ]),
    '- Sun "in view" means any part of the disc clears the terrain skyline; Earth counts when its centre clears it. No atmosphere.',
    '- These are geometric opportunities under stated assumptions, not delivered power or a working radio link.',
    '',
    `Open this investigation again: ${link}`,
    '',
  ]
  return lines.join('\n')
}
