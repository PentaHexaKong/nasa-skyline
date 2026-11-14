import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DayField, NumberField, TimeSlider } from '~/components/Controls'
import MissionMoon, { type MoonMarker } from '~/components/planner/MissionMoon'
import { ProfileCards } from '~/components/planner/ProfilePicker'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { StatusWord } from '~/components/planner/Section'
import { SiteList, siteAnswer, useDayPreview, Year } from '~/components/planner/SiteSelector'
import { Eyebrow } from '~/components/Shell'
import { Mascot, type MascotPose } from '~/components/story'
import { REQUIREMENTS, shortName, siteResult, verdict } from '~/lib/mission'
import { longDate, minuteLabel, shortDate } from '~/lib/time'

type OptionId = 'mission' | 'sites' | 'when' | 'limits'
type Corner = 'tl' | 'tr' | 'bl' | 'br'

/**
 * The four choices, at uneven corners around the Moon. `pos` places each one per breakpoint; `depth` is how far it follows
 * the pointer, `drift` sets its own float, `tilt` turns it toward the Moon.
 */
const OPTIONS: {
  id: OptionId
  label: string
  title: string
  desc: string
  corner: Corner
  pos: string
  /** Its zero-gravity drift: speed in px/s and the starting heading in radians. */
  drift: { speed: number; angle: number }
  style: Record<string, string | number>
}[] = [
  {
    id: 'mission',
    label: 'Mission',
    title: 'Start from a mission',
    desc: 'An example mission sets the sites, day, stay and limits in one tap.',
    corner: 'tl',
    pos: 'top-[19%] left-[4%] sm:top-[20%] sm:left-[8%] lg:top-[21%] lg:left-[11%]',
    drift: { speed: 11, angle: 0.6 },
    style: { '--depth': 18, '--tilt': '16deg', '--tilt-x': '6deg' },
  },
  {
    id: 'sites',
    label: 'Sites',
    title: 'Choose where to land',
    desc: 'Pick which south-polar sites to compare, and see which one works.',
    corner: 'tr',
    pos: 'top-[26%] right-[4%] sm:top-[24%] sm:right-[7%] lg:top-[15%] lg:right-[13%]',
    drift: { speed: 14, angle: 2.4 },
    style: { '--depth': 26, '--tilt': '-18deg', '--tilt-x': '5deg' },
  },
  {
    id: 'when',
    label: 'When',
    title: 'Choose when, and for how long',
    desc: 'The landing day, time and stay. Play through the year to find a day that works.',
    corner: 'bl',
    pos: 'bottom-[29%] left-[5%] sm:bottom-[27%] sm:left-[10%] lg:bottom-[22%] lg:left-[15%]',
    drift: { speed: 12, angle: 4.1 },
    style: { '--depth': 22, '--tilt': '14deg', '--tilt-x': '-6deg' },
  },
  {
    id: 'limits',
    label: 'Limits',
    title: 'Set what the site must give you',
    desc: 'How much Sun and Earth the stay needs, and the longest gap without them.',
    corner: 'br',
    pos: 'bottom-[22%] right-[5%] sm:bottom-[21%] sm:right-[8%] lg:bottom-[27%] lg:right-[9%]',
    drift: { speed: 10, angle: 5.5 },
    style: { '--depth': 15, '--tilt': '-15deg', '--tilt-x': '-5deg' },
  },
]

/** Where a panel grows from, per corner, so it seems to come out of the option that opened it. */
const ORIGIN: Record<Corner, { origin: string; x: string; y: string }> = {
  tl: { origin: 'top left', x: '-2rem', y: '-1rem' },
  tr: { origin: 'top right', x: '2rem', y: '-1rem' },
  bl: { origin: 'bottom left', x: '-2rem', y: '1rem' },
  br: { origin: 'bottom right', x: '2rem', y: '1rem' },
}

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
 * Set up as one screen with no scrolling: the Moon in the middle, lit by the SPICE Sun at the landing time, and four
 * choices floating around it. Pointing at a choice wobbles it and says what it is for; choosing it zooms the camera in and
 * opens its panel beside the Moon. The answer stays at the bottom the whole time. Every status is Result's own.
 */
export function SetupStep({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const stage = useRef<HTMLElement>(null)
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const [open, setOpen] = useState<OptionId | null>(null)
  const [closing, setClosing] = useState<OptionId | null>(null)
  const [emerging, setEmerging] = useState(false)
  // Each Next or Back turns the Moon once around; `entry` says how the panel arrives (out of the Moon, or with the turn).
  const [spin, setSpin] = useState(0)
  const [entry, setEntry] = useState<'hole' | 'turn'>('hole')
  const holders = useRef<Record<string, HTMLDivElement | null>>({})
  const floats = useRef<Record<string, HTMLDivElement | null>>({})
  const wide = useWide()
  const preview = useDayPreview(plan, actions)
  const v = verdict(verdictRows(plan), plan.slip)

  // Exactly the space under the header and step bar, so this step never scrolls.
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.height = `calc(100svh - ${Math.round(top)}px)`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  // The options follow the pointer a little, once per frame, without re-rendering.
  useEffect(() => {
    const el = stage.current
    if (!el || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return
    let raf = 0
    let mx = 0
    let my = 0
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      mx = ((e.clientX - r.left) / r.width) * 2 - 1
      my = ((e.clientY - r.top) / r.height) * 2 - 1
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          el.style.setProperty('--mx', mx.toFixed(3))
          el.style.setProperty('--my', my.toFixed(3))
        })
    }
    el.addEventListener('pointermove', move)
    return () => {
      el.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])

  /*
   * Zero gravity: each option drifts inside a small circle, bouncing off its edge, with a faint pull back toward its place
   * so the paths curve; it leans with its motion. One loop for all four, written straight to the elements, paused while a
   * panel is open, off screen or in a hidden tab. Reduced motion holds them still.
   */
  useEffect(() => {
    const el = stage.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bodies = OPTIONS.map((o) => ({
      id: o.id,
      speed: o.drift.speed,
      x: 0,
      y: 0,
      vx: Math.cos(o.drift.angle) * o.drift.speed,
      vy: Math.sin(o.drift.angle) * o.drift.speed,
    }))
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (document.hidden || el.dataset.open != null) return
      const range = el.clientWidth < 640 ? 9 : 16
      for (const b of bodies) {
        b.vx -= b.x * 0.5 * dt
        b.vy -= b.y * 0.5 * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        const d = Math.hypot(b.x, b.y)
        if (d > range) {
          // Bounce: reflect the velocity off the edge of its range.
          const nx = b.x / d
          const ny = b.y / d
          const dot = b.vx * nx + b.vy * ny
          if (dot > 0) {
            b.vx -= 2 * dot * nx
            b.vy -= 2 * dot * ny
          }
          b.x = nx * range
          b.y = ny * range
        }
        // Keep each one at its own lively speed.
        const sp = Math.hypot(b.vx, b.vy) || 1
        const k = 1 + ((b.speed - sp) / sp) * Math.min(1, dt * 2)
        b.vx *= k
        b.vy *= k
        const node = floats.current[b.id]
        if (node) {
          node.style.translate = `${b.x.toFixed(2)}px ${b.y.toFixed(2)}px`
          node.style.rotate = `${(b.vx * 0.22).toFixed(2)}deg`
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const close = () => {
    if (!open) return
    const was = open
    setClosing(was)
    setOpen(null)
    // The options come back out of the Moon along the same spiral.
    setEmerging(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setClosing(null)
      buttons.current[was]?.focus({ preventScroll: true })
    }, 260)
    window.setTimeout(() => setEmerging(false), 1100)
  }
  /** From the stage: every option falls into the middle of the Moon, the chosen one first, then its panel opens. */
  const choose = (id: OptionId) => {
    const el = stage.current
    if (el) {
      const r = el.getBoundingClientRect()
      const hx = r.left + r.width / 2
      const hy = r.top + r.height * 0.535
      const order = [id, ...OPTIONS.map((o) => o.id).filter((x) => x !== id)]
      for (const o of OPTIONS) {
        const node = holders.current[o.id]
        if (!node) continue
        const b = node.getBoundingClientRect()
        const dx = hx - (b.left + b.width / 2)
        const dy = hy - (b.top + b.height / 2)
        // The path bends a quarter turn on the way in, so it spirals rather than runs straight.
        node.style.setProperty('--hole-x', `${dx.toFixed(1)}px`)
        node.style.setProperty('--hole-y', `${dy.toFixed(1)}px`)
        node.style.setProperty('--mid-x', `${(dx * 0.5 - dy * 0.3).toFixed(1)}px`)
        node.style.setProperty('--mid-y', `${(dy * 0.5 + dx * 0.3).toFixed(1)}px`)
        node.style.setProperty('--stagger', `${order.indexOf(o.id) * 70}ms`)
      }
    }
    window.clearTimeout(timer.current)
    setEmerging(false)
    setClosing(null)
    setEntry('hole')
    setOpen(id)
  }
  /** From a panel to the next or previous one: the Moon turns once around while the panel changes. */
  const step = (id: OptionId) => {
    setEntry('turn')
    setSpin((n) => n + 1)
    setOpen(id)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const shown = open ?? closing
  const option = OPTIONS.find((o) => o.id === shown)
  const side = option && (option.corner === 'tl' || option.corner === 'bl') ? 'left' : 'right'
  // The camera moves in on the Moon and steps aside for the panel: beside it on wide screens, above it on narrow ones.
  // At rest the disc sits a little small and low, clear of the title; Sites lifts it so the south pole sits mid-screen.
  const zoom = open ? (wide ? (open === 'sites' ? 0.62 : 0.72) : 0.8) : wide ? 1.15 : 1.05
  const aim: [number, number] = !open
    ? [0, 0.035]
    : wide
      ? [side === 'left' ? 0.25 : -0.25, open === 'sites' ? -0.34 : 0]
      : [0, open === 'sites' ? -0.42 : -0.3]

  const works = plan.sites.filter((s) => siteResult(s).works).length
  const openIndex = OPTIONS.findIndex((o) => o.id === open)
  const prev = openIndex > 0 ? OPTIONS[openIndex - 1] : undefined
  const next = openIndex >= 0 ? OPTIONS[openIndex + 1] : undefined
  const pose: MascotPose = open
    ? 'planner-pointing'
    : works > 0 && works === plan.sites.length
      ? 'planner-cheer'
      : works > 0
        ? 'planner-excited'
        : 'planner-thinking'
  const value: Record<OptionId, string> = {
    mission: `${plan.profile.name}${plan.edited ? ' · edited' : ''}`,
    sites: `${plan.sites.length} site${plan.sites.length === 1 ? '' : 's'} · ${works} work${works === 1 ? 's' : ''}`,
    when: `${shortDate(plan.date)} · ${minuteLabel(plan.minute)} UTC · ${plan.stay} d`,
    limits: `Sun ≥ ${plan.requirements.minSun}% · Earth ≥ ${plan.requirements.minEarth}%`,
  }
  const markers: MoonMarker[] = plan.all.map((data) => {
    const site = plan.sites.find((s) => s.data.site.id === data.site.id)
    const a = site && siteAnswer(site, plan, preview.day)
    return {
      id: data.site.id,
      name: shortName(data),
      lat: data.site.lat_deg,
      lon: data.site.lon_deg_east,
      selected: !!site,
      status: !a ? 'not-selected' : !a.computed ? 'not-computed' : a.works ? 'works' : 'fails',
    }
  })

  return (
    <section
      ref={stage}
      aria-labelledby="stage-title"
      data-open={open ?? undefined}
      data-emerge={emerging && !open ? '' : undefined}
      // No fill of its own: the page is black already, and the shared Moon glides in behind this box (MissionMoon `handoff`).
      className="plan-stage relative isolate h-[calc(100svh-6.5rem)] min-h-[32rem] overflow-hidden"
    >
      <MissionMoon
        markers={markers}
        at={preview.at}
        labels={false}
        controls={false}
        zoom={zoom}
        aim={aim}
        sway
        spin={spin}
        handoff
        footClassName={
          open && wide
            ? `bottom-[5.6rem] ${side === 'left' ? 'right-6 justify-end' : 'left-6 justify-start'}`
            : 'inset-x-3 bottom-[5.6rem] justify-center sm:bottom-[5.2rem]'
        }
        className="absolute inset-0"
      />

      <header
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 grid justify-items-center gap-1.5 px-4 pt-4 text-center transition-opacity duration-500 sm:pt-6 ${open ? 'opacity-0' : ''}`}
      >
        <Eyebrow pip>Plan a landing</Eyebrow>
        <h2 id="stage-title" className="text-[clamp(1.35rem,1rem+1.6vw,2.25rem)] leading-tight font-medium text-balance">
          Where and when should you land?
        </h2>
        <p className="text-sm text-ink-muted">Choose one of the four around the Moon.</p>
      </header>

      {OPTIONS.map((o, i) => (
        <div
          key={o.id}
          ref={(el) => {
            holders.current[o.id] = el
          }}
          className={`plan-option absolute z-10 ${o.pos}`}
          style={o.style as CSSProperties}
        >
          <div
            ref={(el) => {
              floats.current[o.id] = el
            }}
            className="plan-option-float relative"
          >
            <button
              type="button"
              ref={(el) => {
                buttons.current[o.id] = el
              }}
              aria-expanded={open === o.id}
              aria-controls="plan-panel"
              aria-describedby={`plan-tip-${o.id}`}
              tabIndex={open ? -1 : 0}
              onClick={() => choose(o.id)}
              className={`plan-option-body grid max-w-[10.5rem] cursor-pointer gap-1 text-left sm:max-w-[15rem] ${o.corner.endsWith('r') ? 'justify-items-end text-right' : ''}`}
            >
              <span className="eyebrow text-ink-muted">
                {String(i + 1).padStart(2, '0')} · {o.label}
              </span>
              <span className="text-[clamp(0.95rem,0.75rem+0.9vw,1.5rem)] leading-tight font-medium text-balance">{value[o.id]}</span>
              <span aria-hidden className="plan-bracket mt-1 w-full" />
            </button>
            <span
              id={`plan-tip-${o.id}`}
              role="tooltip"
              className={`plan-tip absolute z-20 w-56 rounded-lg bg-white px-3 py-2 text-xs leading-snug text-black shadow-[0_8px_30px_rgb(0_0_0/0.5)] ${o.corner.startsWith('t') ? 'top-full mt-3' : 'bottom-full mb-3'} ${o.corner.endsWith('r') ? 'right-0' : 'left-0'}`}
            >
              {o.desc}
            </span>
          </div>
        </div>
      ))}

      {option && (
        <Panel
          key={option.id}
          option={option}
          index={OPTIONS.indexOf(option)}
          side={side ?? 'left'}
          closing={!open}
          delay={entry === 'hole' ? 380 : 120}
          onClose={close}
        >
          {option.id === 'mission' && <ProfileCards plan={plan} actions={actions} compact />}
          {option.id === 'sites' && (
            <div className="grid gap-3">
              {preview.previewing && (
                <p className="eyebrow text-ink-muted">
                  Preview · {longDate(preview.date)}, {minuteLabel(plan.minute)} UTC
                </p>
              )}
              <SiteList plan={plan} actions={actions} day={preview.day} />
              <p className="text-2xs leading-relaxed text-ink-faint text-pretty">
                Dots on the Moon sit on the pipeline’s coordinates (Moon ME frame, longitude °E). Sunlight is the SPICE Sun at the landing
                time. Works means the Sun and Earth are in view at touchdown and every limit holds over the stay: a geometric opportunity,
                not delivered power or a working radio link.
              </p>
            </div>
          )}
          {option.id === 'when' && (
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
              <div className="rounded-xl border border-line">
                <Year {...preview.year} />
              </div>
              <p className="text-xs text-ink-faint">
                All times UTC. The data covers {longDate(plan.dates[0] ?? plan.date)} to {longDate(plan.dates.at(-1) ?? plan.date)}.
              </p>
            </div>
          )}
          {option.id === 'limits' && (
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
        </Panel>
      )}

      {/* Next and back ride on the Moon, which turns once around with each step. */}
      {open && (
        <div
          className="plan-moon-nav absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(0.5 + aim[0]) * 100}%`, top: `${(0.5 + aim[1]) * 100}%` }}
        >
          <div key={open} className="flex items-center gap-2">
            {prev && (
              <button
                type="button"
                onClick={() => step(prev.id)}
                aria-label={`Back to ${prev.label}`}
                title={`Back to ${prev.label}`}
                className="grid size-11 cursor-pointer place-items-center rounded-full border border-white/25 bg-black/60 backdrop-blur-md transition-[border-color,scale] hover:border-white/70 active:scale-95"
              >
                <ArrowLeftIcon aria-hidden weight="bold" />
              </button>
            )}
            {next ? (
              <button
                type="button"
                onClick={() => step(next.id)}
                className="group inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/25 bg-black/60 py-1.5 pr-1.5 pl-5 backdrop-blur-md transition-[border-color,scale] hover:border-white/70 active:scale-95"
              >
                <span className="grid text-left leading-tight">
                  <span className="eyebrow text-2xs text-ink-muted">Next · {String(openIndex + 2).padStart(2, '0')}</span>
                  <span className="font-medium">{next.label}</span>
                </span>
                <span className="grid size-9 place-items-center rounded-full bg-white text-black transition-transform group-hover:translate-x-0.5">
                  <ArrowRightIcon aria-hidden weight="bold" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                className="group inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/25 bg-black/60 py-1.5 pr-1.5 pl-5 backdrop-blur-md transition-[border-color,scale] hover:border-white/70 active:scale-95"
              >
                <span className="grid text-left leading-tight">
                  <span className="eyebrow text-2xs text-ink-muted">All four set</span>
                  <span className="font-medium">Done</span>
                </span>
                <span className="grid size-9 place-items-center rounded-full bg-white text-black">
                  <CheckIcon aria-hidden weight="bold" />
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* The planner says the answer, always in view. */}
      <div className="absolute inset-x-2 bottom-2 z-30 flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-black/85 py-2.5 pr-3 pl-2 shadow-[0_16px_40px_rgb(0_0_0/0.6)] backdrop-blur-md sm:inset-x-auto sm:left-1/2 sm:w-[min(46rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:pr-4">
        <Mascot pose={pose} className="-my-5 size-14 shrink-0 sm:size-16" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p aria-live="polite" className="text-sm font-medium text-pretty sm:text-base">
            {v.headline}
          </p>
          <ul aria-label="Each site" className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs max-sm:hidden">
            {plan.sites.map((site) => (
              <li key={site.data.site.id} className="inline-flex items-baseline gap-1.5">
                <span className="text-ink-muted">{shortName(site.data)}</span>
                <StatusWord works={siteResult(site).works} computed={!!site.checks} short />
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => actions.setStep('result')}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md bg-white px-3.5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 sm:px-5 sm:py-2.5"
        >
          See the result <ArrowRightIcon aria-hidden weight="bold" />
        </button>
      </div>
    </section>
  )
}

/** One option's panel: beside the Moon on wide screens, a sheet over the lower part on narrow ones. */
function Panel({
  option,
  index,
  side,
  closing,
  delay,
  onClose,
  children,
}: {
  option: (typeof OPTIONS)[number]
  index: number
  side: 'left' | 'right'
  closing: boolean
  /** How long the panel waits, in ms: long enough for the options to fall into the Moon, or for the turn to start. */
  delay: number
  onClose: () => void
  children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  const from = ORIGIN[option.corner]
  return (
    <section
      id="plan-panel"
      role="dialog"
      aria-labelledby="plan-panel-title"
      data-closing={closing ? '' : undefined}
      className={`plan-panel absolute inset-x-2 top-[32%] bottom-[5.4rem] z-20 flex flex-col overflow-hidden rounded-2xl border border-line-strong bg-black/90 shadow-[0_24px_80px_rgb(0_0_0/0.7)] backdrop-blur-md md:top-4 md:bottom-[5.5rem] md:w-[min(34rem,46%)] ${side === 'left' ? 'md:right-auto md:left-4 lg:left-6' : 'md:right-4 md:left-auto lg:right-6'}`}
      style={{ '--origin': from.origin, '--from-x': from.x, '--from-y': from.y, '--panel-delay': `${delay}ms` } as CSSProperties}
    >
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-4 pb-3.5">
        <div className="grid gap-1">
          <Eyebrow pip>
            {String(index + 1).padStart(2, '0')} · {option.label}
          </Eyebrow>
          <h3 id="plan-panel-title" ref={heading} tabIndex={-1} className="text-xl leading-tight font-medium outline-none">
            {option.title}
          </h3>
          <p className="text-sm text-ink-muted text-pretty">{option.desc}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close and go back to the Moon"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 transition-colors hover:border-white/60"
        >
          <XIcon aria-hidden />
        </button>
      </header>
      <div className="plan-panel-body grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
    </section>
  )
}
