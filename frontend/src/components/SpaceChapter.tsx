import { Button } from '@cloudflare/kumo/components/button'
import { Select } from '@cloudflare/kumo/components/select'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { ArrowsInIcon, ArrowsOutIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { Link, useHydrated } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { DayField, Dock, DockDivider, TimeSlider } from '~/components/Controls'
import { Eyebrow } from '~/components/Shell'
import type { GlobeSite, SpaceView } from '~/components/SpaceScene'
import type { MoonEphemeris } from '~/lib/data'
import { bestHour, windowDays } from '~/lib/moonLight'
import { loadSpace, type Space, sampleSpace, spaceReadouts, spanHours } from '~/lib/space'
import { minuteLabel, shortDate } from '~/lib/time'

const SpaceScene = lazy(() => import('~/components/SpaceScene'))

export const VIEWS: { value: SpaceView; label: string }[] = [
  { value: 'moon', label: 'Moon' },
  { value: 'earth', label: 'Earth' },
  { value: 'pair', label: 'Moon and Earth' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'fromEarth', label: 'From Earth' },
  { value: 'sun', label: 'Sun' },
]
/** Views where Earth's distance can be shortened without misleading: the outside views that frame both bodies. */
const SCALABLE: SpaceView[] = ['earth', 'pair', 'orbit', 'sun']
const SPEEDS = { '1': '1 h/s', '6': '6 h/s', '24': '1 day/s', '72': '3 days/s' }

const pct = (v: number | null | undefined) => (v == null ? 'n/a' : `${Math.round(v * 100)} %`)
const km = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} million km` : `${Math.round(v).toLocaleString('en-GB')} km`)

export type SpaceSearch = { from?: string; day?: string; t?: number; view?: SpaceView; scale?: 'closer' }

/**
 * The true-scale Moon, Earth and Sun, placed by SPICE, as one chapter of the landing page. It sits in the page
 * (the wheel and a swipe keep scrolling) until the reader opens it full screen. Picking a site flies down to it.
 */
export function SpaceChapter({
  eph,
  sites,
  search,
  onSearch,
  onArrive,
  onFull,
}: {
  eph: MoonEphemeris
  sites: GlobeSite[]
  search: SpaceSearch
  onSearch: (s: SpaceSearch) => void
  onArrive: (id: string, day: string, minute: number) => void
  /** Full screen opened or closed, so the page can lift this layer above its header. */
  onFull?: (full: boolean) => void
}) {
  const hydrated = useHydrated()
  const days = windowDays(eph)
  const view = search.view ?? 'moon'
  const closer = search.scale === 'closer' && SCALABLE.includes(view)
  const urlHours = search.day ? Math.max(0, days.indexOf(search.day)) * 24 + (search.t ?? 720) / 60 : bestHour(eph, sites)
  const [hours, setHours] = useState(urlHours)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('24')
  const [space, setSpace] = useState<Space>()
  const [full, setFull] = useState(false)
  // The scene hands its Moon view to the page's Moon, which also draws the starry sky here (moonBridge.ts). Until then,
  // and in the other views, this chapter lays its own black ground under the scene.
  const [shared, setShared] = useState(false)
  // The scene and its 1 MB of positions load only when the chapter comes near, or straight away for a shared link.
  const [near, setNear] = useState(!!(search.from || search.view || search.day))
  const box = useRef<HTMLDivElement>(null)
  const span = space ? spanHours(space) : days.length * 24

  useEffect(() => {
    if (near || !box.current) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '100% 0px' })
    io.observe(box.current)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    if (!near) return
    let live = true
    loadSpace().then(
      (s) => live && setSpace(s),
      (e) => console.error(e),
    )
    return () => {
      live = false
    }
  }, [near])

  // Full screen: the page behind stops scrolling and Escape comes back.
  useEffect(() => {
    onFull?.(full)
    if (!full) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = before
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  // Time runs in the page so the dock and the readouts move with the scene; the URL catches up on pause.
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setHours((h) => {
        const next = h + dt * Number(speed)
        if (next >= span) {
          setPlaying(false)
          return span
        }
        return next
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, span])

  const index = Math.min(days.length - 1, Math.floor(hours / 24))
  const date = days[index] ?? days[0] ?? ''
  const minute = Math.min(1439, Math.round((hours - index * 24) * 60))
  const go = (s: SpaceSearch) => onSearch({ ...s, from: undefined })
  const seek = (h: number) => {
    setPlaying(false)
    const clamped = Math.max(0, Math.min(span, h))
    setHours(clamped)
    const i = Math.min(days.length - 1, Math.floor(clamped / 24))
    go({ day: days[i], t: Math.min(1439, Math.round((clamped - i * 24) * 60)) })
  }
  const togglePlay = () => {
    if (playing) seek(hours)
    else setPlaying(true)
  }

  const r = space ? spaceReadouts(sampleSpace(space, hours)) : undefined
  const when = `${shortDate(date)} ${minuteLabel(minute)} UTC`
  const lede: Record<SpaceView, string> = {
    moon: `Sunlight as it falls on ${when}. Pick a site to fly down and stand on it.`,
    earth:
      'Earth as the Moon sees it. From the near side it stays in the same patch of sky all month, and its phase runs opposite to the Moon’s.',
    pair: r
      ? `The Moon and Earth at true size, ${Math.round(r.earthKm / (2 * 6371))} Earth widths apart. Earth is 3.7 times as wide as the Moon.`
      : 'The Moon and Earth at true size and distance.',
    orbit: `The Moon’s path around Earth over the ${days.length} days from ${shortDate(days[0] ?? '')}. The path shifts a little each month, so the loops never quite close.`,
    fromEarth: r
      ? `The Moon through a 4° lens from Earth. To the eye it spans ${(2 * Math.asin(1737.4 / r.earthKm) * (180 / Math.PI)).toFixed(2)}°.`
      : 'The Moon through a 4° lens from Earth.',
    sun: 'Out toward the Sun. At this distance Earth and the Moon are far smaller than a pixel; the label marks where they are.',
  }

  return (
    <div
      ref={box}
      data-mode="dark"
      className={`overflow-hidden text-kumo-default ${full ? 'fixed inset-0 z-(--z-popover) bg-black' : 'relative h-[calc(100svh-3.5rem)] min-h-[34rem]'}`}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? 'The Moon, Earth and the Sun at true scale, full screen' : undefined}
    >
      {/* The night sky's ground. Its top and bottom edges fade into the page, as the sky itself does (.sky-edges). */}
      <div
        aria-hidden
        className={`absolute inset-0 bg-black transition-opacity duration-700 ${full ? '' : 'sky-edges'} ${shared && !full ? 'opacity-0' : 'opacity-100'}`}
      />
      {hydrated && near && space && (
        <Suspense fallback={null}>
          <SpaceScene
            space={space}
            hours={hours}
            view={view}
            closer={closer}
            sites={sites}
            from={search.from}
            gestures={full ? 'all' : 'page'}
            onHandoff={setShared}
            onFlight={() => setPlaying(false)}
            onArrive={(id) => onArrive(id, date, minute)}
            label={`The Moon, Earth and the Sun at true scale on ${when}, ${VIEWS.find((v) => v.value === view)?.label} view, with ${sites.length} landing sites marked`}
          />
        </Suspense>
      )}
      {near && !space && (
        <p className="absolute inset-0 grid place-items-center text-sm text-ink-muted" aria-live="polite">
          Loading positions…
        </p>
      )}

      {/* One header row: text on the left, view controls on the right; on phones the controls sit above the text. */}
      <div
        className={`pointer-events-none absolute inset-x-4 flex flex-col gap-3 sm:right-(--page-edge) sm:left-(--page-edge) sm:flex-row sm:items-start sm:justify-between ${full ? 'top-4' : 'top-(--sky-fade)'}`}
      >
        <div className="scene-text grid max-w-[30rem] gap-3">
          <Eyebrow pip>The whole system, at true scale</Eyebrow>
          <h2 id="space-title" className="text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.05] font-medium text-balance">
            Pick a place on the Moon.
          </h2>
          <p className="hidden max-w-[46ch] text-sm leading-relaxed text-kumo-subtle sm:block">{lede[view]}</p>
          <dl className="readouts hidden gap-x-6 gap-y-1.5 text-sm md:grid" aria-live="off">
            <dt>Earth</dt>
            <dd className="tabular">{r ? `${km(r.earthKm)} · ${r.earthDeg.toFixed(2)}° wide · ${pct(r.earthLit)} lit` : '…'}</dd>
            <dt>Sun</dt>
            <dd className="tabular">{r ? `${km(r.sunKm)} · ${r.sunDeg.toFixed(2)}° wide` : '…'}</dd>
            <dt>Moon from Earth</dt>
            <dd className="tabular">{r ? `${pct(r.moonLit)} lit` : '…'}</dd>
          </dl>
          {closer && <p className="text-xs text-kumo-subtle">Earth drawn 10× closer. Sizes and lighting are true.</p>}
        </div>

        <div className="pointer-events-auto order-first flex flex-wrap items-center gap-2 sm:order-none sm:flex-col sm:items-end">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="hidden lg:block">
              <Tabs variant="segmented" size="sm" tabs={VIEWS} value={view} onValueChange={(v) => go({ view: v as SpaceView })} />
            </div>
            <Select
              aria-label="View"
              className="w-44 lg:hidden"
              value={view}
              items={Object.fromEntries(VIEWS.map((v) => [v.value, v.label]))}
              onValueChange={(v) => v && go({ view: v as SpaceView })}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={full ? ArrowsInIcon : ArrowsOutIcon}
              onClick={() => setFull((f) => !f)}
              aria-pressed={full}
            >
              {full ? 'Exit full screen' : 'Full screen'}
            </Button>
          </div>
          {SCALABLE.includes(view) && (
            <Tabs
              variant="segmented"
              size="sm"
              tabs={[
                { value: 'true', label: 'True scale' },
                { value: 'closer', label: 'Earth 10× closer' },
              ]}
              value={closer ? 'closer' : 'true'}
              onValueChange={(v) => go({ scale: v === 'closer' ? 'closer' : undefined })}
            />
          )}
        </div>
      </div>

      <p
        className={`scene-text absolute left-4 hidden text-xs text-kumo-subtle sm:left-(--page-edge) lg:block ${full ? 'bottom-24' : 'bottom-[calc(var(--sky-fade)+5rem)]'}`}
      >
        Positions from NASA JPL SPICE. Imagery from NASA. {full ? 'Scroll to zoom.' : 'Drag to turn; open full screen to zoom.'}{' '}
        <Link to="/method" hash="credits" className="underline underline-offset-3 hover:text-kumo-default">
          Sources
        </Link>
      </p>

      <div className={`absolute inset-x-0 bottom-0 ${full ? 'pb-4' : 'pb-(--sky-fade)'}`}>
        <Dock label="Day, time and playback">
          <DayField dates={days} index={index} onSelect={(i) => seek(Math.max(0, Math.min(days.length - 1, i)) * 24 + minute / 60)} />
          <DockDivider />
          <Button
            variant="ghost"
            shape="square"
            aria-label={playing ? 'Pause' : 'Play'}
            aria-pressed={playing}
            onClick={togglePlay}
            disabled={!space}
          >
            {playing ? <PauseIcon weight="fill" aria-hidden /> : <PlayIcon weight="fill" aria-hidden />}
          </Button>
          <Select
            aria-label="Playback speed"
            className="w-28"
            value={speed}
            items={SPEEDS}
            onValueChange={(v) => v && setSpeed(v as string)}
          />
          <TimeSlider inline value={minute} onChange={(v) => seek(index * 24 + v / 60)} />
        </Dock>
      </div>
    </div>
  )
}
