import { Link as KLink } from '@cloudflare/kumo/components/link'
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DayField, NumberField, TimeSlider } from '~/components/Controls'
import { Deck, PEEK } from '~/components/planner/Deck'
import MissionMoon, { type MoonMarker } from '~/components/planner/MissionMoon'
import { ProfileCards } from '~/components/planner/ProfilePicker'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { SiteList, useDayPreview } from '~/components/planner/SiteSelector'
import { Eyebrow } from '~/components/Shell'
import { REQUIREMENTS, shortName } from '~/lib/mission'
import { useReducedMotion } from '~/lib/motion'
import { longDate, minuteLabel, shortDate } from '~/lib/time'

type OptionId = 'mission' | 'sites' | 'when' | 'limits'

/** The four questions, in deck order. */
const OPTIONS: { id: OptionId; label: string; title: string; desc: string }[] = [
  {
    id: 'mission',
    label: 'Mission',
    title: 'What kind of mission?',
    desc: 'Pick an example mission. It fills in the other three answers, and you can still change them.',
  },
  { id: 'sites', label: 'Where', title: 'Where do you land?', desc: 'Pick which south-pole sites to compare.' },
  {
    id: 'when',
    label: 'When',
    title: 'When do you land, and for how long?',
    desc: 'Pick the landing day, the time and how long you stay.',
  },
  {
    id: 'limits',
    label: 'Limits',
    title: 'What must the site give you?',
    desc: 'How much Sun and Earth the stay needs, and the longest gap without them.',
  },
]

type Key = (typeof REQUIREMENTS)[number]['key']
const MEANS: Record<Key, string> = {
  minSun: 'Share of the stay with the Sun above the skyline. Sunlight is power.',
  maxNoSun: 'The longest spell in shadow. Batteries must last through it.',
  minEarth: 'Share of the stay with Earth above the skyline, for direct contact.',
  maxNoEarth: 'The longest spell with Earth hidden: no direct contact.',
}
const GROUPS = [
  { title: 'Sunlight', dot: 'rounded-full bg-sun', keys: ['minSun', 'maxNoSun'] },
  { title: 'Contact with Earth', dot: 'rotate-45 bg-comms', keys: ['minEarth', 'maxNoEarth'] },
] as const

function useWide() {
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const q = window.matchMedia('(min-width: 768px)')
    const on = () => setWide(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return wide
}

/**
 * Set up as one screen with no scrolling: the Moon, lit by the SPICE Sun at the landing time, and the four questions as a
 * deck of cards in front of it. Pointing at a card lifts it and says what it is for; choosing it lifts it toward its side
 * and grows its panel out of it while the camera moves in on the Moon. Set up only asks: no site is said to work or
 * fail here (the dots, the site list and the bar stay neutral). Every answer is Result's.
 */
export function SetupStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const stage = useRef<HTMLElement>(null)
  const cards = useRef<Record<string, HTMLButtonElement | null>>({})
  const [open, setOpen] = useState<OptionId | null>(null)
  const [closing, setClosing] = useState<OptionId | null>(null)
  // The question in front of the deck, and whether a panel is changing over to the next one.
  const [front, setFront] = useState(0)
  const [size, setSize] = useState({ w: 1280, h: 720 })
  const deckRef = useRef<HTMLDivElement>(null)
  const [deckBox, setDeckBox] = useState(0)
  const wide = useWide()
  const reduced = useReducedMotion()
  const preview = useDayPreview(plan, actions)
  // The questions opened this visit. They all start answered (the example mission fills them in), so "checked" means
  // the reader has looked, not that a value exists.
  const [seen, setSeen] = useState<ReadonlySet<OptionId>>(() => new Set())
  const see = (id: OptionId) => setSeen((s) => (s.has(id) ? s : new Set(s).add(id)))

  // Exactly the space under the header and step bar, so this step never scrolls. It is measured again after every render,
  // since a note above it (MotionNotice) can come and go.
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    el.style.height = `calc(100svh - ${Math.round(top)}px)`
  })
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.height = `calc(100svh - ${Math.round(top)}px)`
    }
    fit()
    window.addEventListener('resize', fit)
    // Anything above the stage changing height (the motion note coming or going) changes the page's height and moves the
    // stage's top, so watching the page's frame catches it.
    const frame = el.parentElement?.parentElement
    const ro = frame ? new ResizeObserver(fit) : null
    if (frame) ro?.observe(frame)
    return () => {
      window.removeEventListener('resize', fit)
      ro?.disconnect()
    }
  }, [])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
      if (deckRef.current) setDeckBox(deckRef.current.offsetHeight)
    })
    ro.observe(el)
    if (deckRef.current) ro.observe(deckRef.current)
    return () => ro.disconnect()
  }, [])

  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const close = () => {
    if (!open) return
    const was = open
    setClosing(was)
    setOpen(null)
    window.clearTimeout(timer.current)
    // The panel shrinks back into its card first, then leaves.
    timer.current = window.setTimeout(
      () => {
        setClosing(null)
        cards.current[was]?.focus({ preventScroll: true })
      },
      reduced ? 0 : 320,
    )
  }
  const choose = (id: OptionId) => {
    window.clearTimeout(timer.current)
    setClosing(null)
    setOpen(id)
    see(id)
  }
  /**
   * To another question. With none open the deck moves. With one open, the row of cards on the Moon slides: the next
   * question's card swings into the middle and becomes its form.
   */
  const toQuestion = (i: number) => {
    const target = OPTIONS[i]?.id
    if (!target || i === front) return
    setFront(i)
    if (!open) return
    setOpen(target)
    see(target)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      // Left and right move between questions, unless the reader is typing or moving a slider.
      const t = e.target as HTMLElement | null
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !t?.closest('input, textarea, select, [role="slider"]')) {
        e.preventDefault()
        toQuestion(front + (e.key === 'ArrowLeft' ? -1 : 1))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const shown = open ?? closing
  const option = OPTIONS.find((o) => o.id === shown)
  // At rest the disc sits behind the deck. With a question open the camera moves in, the disc centred behind its form so
  // the form sits on the Moon with the glow of the limb around it.
  const zoom = open ? (wide ? 0.6 : 0.85) : wide ? 1.2 : 0.95
  const aim: [number, number] = open ? [0, wide ? -0.03 : -0.06] : [0, wide ? -0.1 : -0.17]

  // Each option's current answer to its own question, with a second line where one is needed. Whether the plan works is
  // Result's job.
  const detail: Partial<Record<OptionId, string>> = { when: `${plan.stay}-day stay` }
  const value: Record<OptionId, string> = {
    mission: `${plan.profile.name}${plan.edited ? ' (edited)' : ''}`,
    sites: plan.sites.length === 1 && plan.sites[0] ? shortName(plan.sites[0].data) : `${plan.sites.length} sites to compare`,
    when: `${shortDate(plan.date)} ${plan.date.slice(0, 4)}, ${minuteLabel(plan.minute)} UTC`,
    limits: `Sun ≥ ${plan.requirements.minSun}% · Earth ≥ ${plan.requirements.minEarth}%`,
  }
  // The large question card sits in the centre of the stage; an open panel docks the deck beside the Moon.
  const cardW = Math.min(wide ? 520 : 440, size.w - 32 - 56 - 12)
  // Small enough to leave most of the Moon in view: the card sits low, just above the answer bar.
  const cardH = wide ? Math.max(190, Math.min(230, size.h * 0.28)) : size.h < 600 ? 170 : 190
  const deckW = cardW + 12 + 44
  // The deck's own height (the card or the track beside it, whichever is taller), measured; one back card peeks above.
  const deckH = Math.max(cardH, deckBox) + PEEK
  // The deck sits in the middle of the stage; it steps away while a question is open on the Moon.
  const deckX = size.w / 2 - deckW / 2
  // The bar to Result stays out of the way until the reader opens a question; then it slides up and stays.
  const bar = seen.size > 0
  const deckY = size.h - (bar ? (wide ? 84 : 76) : wide ? 32 : 24) - deckH + PEEK
  const items = OPTIONS.map((o) => ({ id: o.id, title: o.title, desc: o.desc, value: value[o.id], detail: detail[o.id] }))
  const markers: MoonMarker[] = plan.all.map((data) => {
    const site = plan.sites.find((s) => s.data.site.id === data.site.id)
    return {
      id: data.site.id,
      name: shortName(data),
      lat: data.site.lat_deg,
      lon: data.site.lon_deg_east,
      selected: !!site,
      // Neutral: a dot for each site in the plan, faint for the rest. Works and fails are Result's.
      status: site ? 'not-computed' : 'not-selected',
    }
  })

  /** What each question's panel holds. Also built once, hidden, while the page is idle, so a first opening is smooth. */
  const content = (id: OptionId) => (
    <>
      {id === 'mission' && <ProfileCards plan={plan} actions={actions} compact />}
      {id === 'sites' && (
        <div className="grid gap-3">
          {preview.previewing && (
            <p className="eyebrow text-ink-muted">
              Preview · {longDate(preview.date)}, {minuteLabel(plan.minute)} UTC
            </p>
          )}
          <SiteList plan={plan} actions={actions} day={preview.day} verdicts={false} />
          <p className="text-2xs leading-relaxed text-ink-faint text-pretty">
            Dots on the Moon sit on the pipeline’s coordinates (Moon ME frame, longitude °E). Whether each site works is on Result.
          </p>
        </div>
      )}
      {id === 'when' && (
        <div className="grid gap-5">
          <div className="grid items-end gap-x-6 gap-y-4 sm:grid-cols-[auto_auto]">
            <div className="grid gap-2">
              <span className="font-medium">Landing day</span>
              <DayField dates={plan.dates} index={plan.index} onSelect={actions.selectDay} />
            </div>
            <NumberField
              label="Stay (days)"
              value={plan.stay}
              min={1}
              max={60}
              onCommit={(value) => actions.go({ stay: Math.round(value) })}
            />
          </div>
          <TimeSlider value={plan.minute} onChange={(value) => actions.go({ t: value })} />
          <p className="text-xs text-ink-faint">
            All times UTC. The data covers {longDate(plan.dates[0] ?? plan.date)} to {longDate(plan.dates.at(-1) ?? plan.date)}. To see
            which days work across the year, open{' '}
            <KLink render={<button type="button" onClick={() => actions.setStep('dates')} />} className="cursor-pointer">
              Dates
            </KLink>
            .
          </p>
        </div>
      )}
      {id === 'limits' && (
        <div className="grid gap-4">
          {GROUPS.map((group) => (
            <fieldset key={group.title} className="grid content-start gap-5 rounded-xl border border-line p-4">
              <legend className="flex items-center gap-2 px-1 font-medium">
                <span aria-hidden className={`size-2.5 ${group.dot}`} />
                {group.title}
              </legend>
              {group.keys.map((key) => {
                const q = REQUIREMENTS.find((r) => r.key === key)
                if (!q) return null
                return (
                  <div key={key} className="grid gap-1.5">
                    <NumberField
                      wide
                      label={`${q.label}, ${q.bound} (${q.unit})`}
                      value={plan.requirements[key]}
                      min={0}
                      max={q.unit === '%' ? 100 : 8760}
                      onCommit={(value) => actions.go({ [key]: value })}
                    />
                    <p className="text-xs text-ink-faint">{MEANS[key]}</p>
                  </div>
                )
              })}
            </fieldset>
          ))}
          <p className="text-xs text-ink-faint">Measured over the whole stay. Mission limits are examples; change any of them.</p>
        </div>
      )}
    </>
  )
  // Prewarm: once the page is idle, build every panel's contents once out of sight and drop them. The first real opening
  // then costs what a second one does, instead of stalling a frame on first-time work.
  const [warm, setWarm] = useState<'cold' | 'warming' | 'done'>('cold')
  useEffect(() => {
    if (warm === 'cold') {
      const start = () => setWarm('warming')
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
        cancelIdleCallback?: (id: number) => void
      }
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(start, { timeout: 2500 })
        return () => w.cancelIdleCallback?.(id)
      }
      const id = window.setTimeout(start, 1500)
      return () => window.clearTimeout(id)
    }
    if (warm === 'warming') {
      const id = window.setTimeout(() => setWarm('done'), 50)
      return () => window.clearTimeout(id)
    }
  }, [warm])

  return (
    <section
      ref={stage}
      aria-labelledby="stage-title"
      data-open={open ?? undefined}
      // No fill of its own: the page is black already, and the shared Moon glides in behind this box (MissionMoon `handoff`).
      className="plan-stage relative isolate h-[calc(100svh-6.5rem)] min-h-[32rem] overflow-hidden"
    >
      <MissionMoon
        markers={markers}
        at={preview.at}
        // Dots only: labels would collide with the four choices at the corners, and the answer bar names each site.
        labels={false}
        controls={false}
        zoom={zoom}
        aim={aim}
        sway
        handoff
        footClassName={
          wide
            ? open
              ? 'top-1.5 left-1/2 -translate-x-1/2 justify-center whitespace-nowrap rounded-full bg-black/75 px-3 py-0.5'
              : size.w >= 1100
                ? 'top-3 right-4 justify-end'
                : 'inset-x-3 top-[8.25rem] justify-center'
            : open
              ? 'top-1.5 left-1/2 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center rounded-xl bg-black/75 px-3 py-0.5 text-center'
              : 'inset-x-3 top-1.5 justify-center'
        }
        className="absolute inset-0"
      />

      <header
        className={`scene-text pointer-events-none absolute inset-x-0 top-0 z-10 grid justify-items-center gap-1.5 px-4 text-center transition-opacity duration-500 pt-12 sm:pt-6 ${open ? 'opacity-0' : ''}`}
      >
        <h2 id="stage-title" className="text-[clamp(1.15rem,0.85rem+1.3vw,1.875rem)] leading-tight font-medium text-balance">
          Check four choices for your <span className="text-story-ink">landing</span>
        </h2>
      </header>

      {/* The deck: the four questions stacked in the middle, thrown aside one by one. */}
      <div
        ref={deckRef}
        className={`plan-deck absolute top-0 left-0 z-20 origin-top-left ${open ? 'plan-deck-away' : ''}`}
        style={
          {
            '--card-w': `${cardW}px`,
            '--card-h': `${cardH}px`,
            width: deckW,
            transform: `translate(${deckX.toFixed(1)}px, ${deckY.toFixed(1)}px)`,
          } as CSSProperties
        }
      >
        <Deck
          items={items}
          front={front}
          width={size.w * 0.6 + cardW}
          hideFront={open != null}
          reduced={reduced}
          onFront={toQuestion}
          onOpen={(i) => {
            const id = OPTIONS[i]?.id
            if (id) choose(id)
          }}
          cardRef={(id, el) => {
            cards.current[id] = el
          }}
        />
      </div>

      {warm === 'warming' && !open && (
        <div hidden aria-hidden inert>
          {OPTIONS.map((o) => (
            <div key={o.id}>{content(o.id)}</div>
          ))}
        </div>
      )}

      {option && (
        <QuestionRow
          items={items}
          index={OPTIONS.indexOf(option)}
          size={size}
          wide={wide}
          closing={!open}
          reduced={reduced}
          cardRect={() => cards.current[option.id]?.getBoundingClientRect()}
          onGo={toQuestion}
          onClose={close}
        >
          {content(option.id)}
        </QuestionRow>
      )}

      {/* Set up only asks: how far the reader has looked, and the way to the answer. Hidden until a question is opened. */}
      <div
        inert={!bar}
        className={`absolute inset-x-2 bottom-2 z-30 flex items-center justify-between gap-4 rounded-xl border border-line-strong bg-black/90 py-2 pr-2 pl-4 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.2,0.85,0.25,1)] motion-reduce:transition-none sm:inset-x-auto sm:left-1/2 sm:w-[min(34rem,calc(100%-2rem))] sm:-translate-x-1/2 ${bar ? '' : 'pointer-events-none translate-y-[calc(100%+1rem)] opacity-0'}`}
      >
        <p aria-live="polite" className="flex min-w-0 items-center gap-3 text-sm text-ink-muted">
          <span aria-hidden className="flex gap-1">
            {OPTIONS.map((o) => (
              <span
                key={o.id}
                className={`h-1 w-4 rounded-full transition-colors duration-300 ${seen.has(o.id) ? 'bg-ink' : 'bg-white/20'}`}
              />
            ))}
          </span>
          <span className="truncate">
            {seen.size === OPTIONS.length ? (
              'All four checked'
            ) : (
              <>
                <span className="readout text-ink">{seen.size}</span> of 4 checked
              </>
            )}
          </span>
        </p>
        <button
          type="button"
          onClick={() => actions.setStep('result')}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md bg-story px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-story-hover"
        >
          See the result <ArrowRightIcon aria-hidden weight="bold" />
        </button>
      </div>
    </section>
  )
}

/** Room above the row for the light caption: one line on wide screens, up to two on phones. */
const rowTop = (wide: boolean) => (wide ? 28 : 48)
const ROW_BOTTOM = 92
const SIDE_SCALE = 0.66
const SIDE_TURN = 26

/**
 * An open question, on the Moon: its form in the middle, the questions before and after it as cards turned toward it on
 * either side (in perspective, like covers on a shelf). Choosing a side card, the arrows in the form's header, swiping
 * the header or the arrow keys slide the row, and the card that reaches the middle becomes the form. Opening grows the
 * form out of the deck's front card and fans the side cards out from behind it; closing shrinks the form back into it.
 * Only transform and opacity move.
 */
function QuestionRow({
  items,
  index,
  size,
  wide,
  closing,
  reduced,
  cardRect,
  onGo,
  onClose,
  children,
}: {
  items: { id: string; title: string; desc: string; value: string; detail?: string }[]
  index: number
  size: { w: number; h: number }
  wide: boolean
  closing: boolean
  reduced: boolean
  cardRect: () => DOMRect | undefined
  onGo: (i: number) => void
  onClose: () => void
  children: ReactNode
}) {
  const n = items.length
  const W = wide ? Math.min(560, Math.max(400, size.w * 0.42)) : size.w - 48
  const H = Math.max(320, size.h - rowTop(wide) - ROW_BOTTOM)
  const gap = wide ? 28 : 8
  const slots = useRef<(HTMLDivElement | null)[]>([])
  const center = () => slots.current[index]
  const transformOf = (o: number) => {
    if (o === 0) return 'none'
    const sign = Math.sign(o)
    const x = sign * (W / 2 + gap + (W * SIDE_SCALE * 0.9) / 2) + (o - sign) * W * 0.5
    return `translateX(${x.toFixed(1)}px) rotateY(${-sign * SIDE_TURN}deg) scale(${SIDE_SCALE})`
  }
  /** The transform that puts the form exactly over the deck's front card (FLIP). */
  const overCard = () => {
    const el = center()
    const r = cardRect()
    if (!el || !r || !r.width || !r.height) return null
    const p = el.getBoundingClientRect()
    return `translate(${(r.left - p.left).toFixed(1)}px, ${(r.top - p.top).toFixed(1)}px) scale(${(r.width / p.width).toFixed(4)}, ${(r.height / p.height).toFixed(4)})`
  }
  useLayoutEffect(() => {
    if (reduced) return
    const runs: Animation[] = []
    const el = center()
    const from = overCard()
    if (el && from && typeof el.animate === 'function') {
      el.style.transformOrigin = '0 0'
      const a = el.animate(
        [
          { transform: from, opacity: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 620, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)', fill: 'backwards' },
      )
      a.finished.then(
        () => {
          el.style.transformOrigin = ''
        },
        () => {},
      )
      runs.push(a)
    }
    // The side cards fan out from behind the form.
    slots.current.forEach((s, i) => {
      if (!s || i === index || typeof s.animate !== 'function') return
      runs.push(
        s.animate(
          [
            { transform: 'translateX(0px) rotateY(0deg) scale(0.7)', opacity: 0 },
            { transform: transformOf(i - index), opacity: Math.abs(i - index) === 1 ? 1 : 0 },
          ],
          { duration: 640, delay: 180, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)', fill: 'backwards' },
        ),
      )
    })
    return () => {
      for (const a of runs) a.cancel()
    }
  }, [])
  useLayoutEffect(() => {
    if (!closing || reduced) return
    const el = center()
    const to = overCard()
    if (el && to && typeof el.animate === 'function') {
      el.style.transformOrigin = '0 0'
      el.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: to, opacity: 0 },
        ],
        { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.8, 0.4)', fill: 'forwards' },
      )
    }
    slots.current.forEach((s, i) => {
      if (s && i !== index && typeof s.animate === 'function')
        s.animate([{ opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
    })
  }, [closing])

  // A horizontal swipe on the form's header moves to the next or previous question.
  const swipe = useRef<{ x: number; id: number } | null>(null)

  return (
    <div className="pointer-events-none absolute inset-0 z-20 [perspective:1600px]" style={{ perspectiveOrigin: '50% 45%' }}>
      {items.map((it, i) => {
        const o = i - index
        const isCenter = o === 0
        return (
          <div
            key={it.id}
            ref={(el) => {
              slots.current[i] = el
            }}
            className="plan-slot absolute"
            data-center={isCenter ? '' : undefined}
            style={{
              left: (size.w - W) / 2,
              top: rowTop(wide),
              width: W,
              height: H,
              transform: transformOf(o),
              opacity: Math.abs(o) <= 1 ? 1 : 0,
              zIndex: 10 - Math.abs(o),
            }}
          >
            {/* The card face: what a side card shows, and what the form grows out of. */}
            <button
              type="button"
              tabIndex={Math.abs(o) === 1 ? 0 : -1}
              aria-hidden={Math.abs(o) !== 1 || undefined}
              aria-label={`${o < 0 ? 'Previous' : 'Next'} question, ${i + 1} of ${n}: ${it.title} Current answer: ${it.value}`}
              onClick={() => onGo(i)}
              className={`plan-slot-face pointer-events-auto absolute inset-0 flex cursor-pointer flex-col justify-between gap-3 overflow-hidden rounded-3xl border border-white/15 bg-[#121212] p-6 text-left ${isCenter ? 'opacity-0' : ''}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="readout text-sm text-ink-faint">
                  {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
                </span>
                <span className="eyebrow text-ink-muted">{o < 0 ? 'Back' : 'Next'}</span>
              </span>
              <span className="grid gap-3">
                <span className="text-xl text-ink/80 text-balance">{it.title}</span>
                <span className="text-[clamp(1.75rem,1.3rem+1.6vw,2.75rem)] leading-tight font-medium text-balance">{it.value}</span>
                {it.detail && <span className="text-ink-muted">{it.detail}</span>}
              </span>
              <span className="text-sm text-ink-muted text-pretty">{it.desc}</span>
            </button>
            {isCenter && (
              <section
                id="plan-panel"
                role="dialog"
                aria-labelledby="plan-panel-title"
                className="plan-form pointer-events-auto absolute inset-0 flex flex-col overflow-hidden rounded-3xl border border-white/20 bg-black/85 shadow-[0_30px_80px_rgb(0_0_0/0.7)]"
              >
                <header
                  className="plan-panel-head flex touch-pan-y items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-3.5 sm:px-6"
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return
                    swipe.current = { x: e.clientX, id: e.pointerId }
                    // Keep the swipe's release even when it ends off the header.
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerUp={(e) => {
                    const sw = swipe.current
                    swipe.current = null
                    if (!sw || sw.id !== e.pointerId) return
                    const dx = e.clientX - sw.x
                    if (Math.abs(dx) > 60) onGo(index + (dx < 0 ? 1 : -1))
                  }}
                  onPointerCancel={() => {
                    swipe.current = null
                  }}
                >
                  <FormHeading index={index} n={n} item={it} />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onGo(index - 1)}
                      disabled={index === 0}
                      aria-label="Previous question"
                      className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/15 transition-colors hover:border-white/60 disabled:cursor-default disabled:opacity-30"
                    >
                      <ArrowLeftIcon aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onGo(index + 1)}
                      disabled={index === n - 1}
                      aria-label="Next question"
                      className="grid size-9 cursor-pointer place-items-center rounded-full border border-white/15 transition-colors hover:border-white/60 disabled:cursor-default disabled:opacity-30"
                    >
                      <ArrowRightIcon aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close and go back to the Moon"
                      className="ml-1 grid size-9 cursor-pointer place-items-center rounded-full bg-white text-black transition-opacity hover:opacity-90"
                    >
                      <XIcon aria-hidden weight="bold" />
                    </button>
                  </div>
                </header>
                <FormBody key={it.id} reduced={reduced}>
                  {children}
                </FormBody>
              </section>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FormHeading({ index, n, item }: { index: number; n: number; item: { title: string; desc: string } }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div key={index} className="grid min-w-0 gap-1">
      <Eyebrow pip>
        {String(index + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
      </Eyebrow>
      <h3 id="plan-panel-title" ref={heading} tabIndex={-1} className="text-xl leading-tight font-medium outline-none sm:text-2xl">
        {item.title}
      </h3>
      <p className="text-sm text-ink-muted text-pretty">{item.desc}</p>
    </div>
  )
}

/** The form's contents, built as the card settles in the middle so building them never holds up the slide. */
function FormBody({ reduced, children }: { reduced: boolean; children: ReactNode }) {
  const [filled, setFilled] = useState(reduced)
  useEffect(() => {
    const id = window.setTimeout(() => setFilled(true), reduced ? 0 : 300)
    return () => window.clearTimeout(id)
  }, [reduced])
  return (
    <div className="plan-panel-body grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
      {filled && children}
    </div>
  )
}
