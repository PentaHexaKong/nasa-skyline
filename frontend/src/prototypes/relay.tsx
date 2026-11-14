import { type PointerEvent, useState } from 'react'
import { Fig } from '~/components/scene/terrain'
import type { RelayData } from '~/lib/feed-schemas'
import { DAY_MS, HOUR_MS, type MissionWindow, type Span, toSpans } from '~/lib/mission'
import { shortDate } from '~/lib/time'

const pct = (x: number) => `${(x * 100).toFixed(0)} %`
const hoursOf = ([a, b]: Span) => (b - a) / HOUR_MS
const stamp = (t: number) => `${shortDate(new Date(t).toISOString().slice(0, 10))}, ${new Date(t).toISOString().slice(11, 16)} UTC`

/** The parts of the window not covered by `spans`. */
function gapsOf(spans: Span[], w: MissionWindow): Span[] {
  const out: Span[] = []
  let t = w.start
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (a > t) out.push([t, Math.min(a, w.end)])
    t = Math.max(t, b)
  }
  if (t < w.end) out.push([t, w.end])
  return out
}
/** The parts of `a` that `b` does not cover. */
const minus = (a: Span[], b: Span[], w: MissionWindow) =>
  a.flatMap((s) => gapsOf(b, { start: s[0], end: s[1] })).filter(([p, q]) => q > p && p < w.end)

type Rung = RelayData['scenarios'][number] & { spans: Span[]; gaps: Span[]; longest?: Span }
function rungs(data: RelayData) {
  const w = { start: Date.parse(data.period.start_utc), end: Date.parse(data.period.end_utc) }
  const list: Rung[] = data.scenarios.map((s) => {
    const spans = toSpans(s.intervals)
    const gaps = gapsOf(spans, w)
    return { ...s, spans, gaps, longest: [...gaps].sort((a, b) => hoursOf(b) - hoursOf(a))[0] }
  })
  return { w, list }
}
const inContact = (r: Rung, t: number) => r.spans.some(([a, b]) => t >= a && t < b)
const weekTicks = (w: MissionWindow) =>
  Array.from({ length: Math.ceil((w.end - w.start) / (7 * DAY_MS)) }, (_, i) => w.start + i * 7 * DAY_MS)

/** 1. A ladder: each rung shows only what it adds, and brackets the longest gap it leaves. */
export function RelayFill({ data }: { data: RelayData }) {
  const { w, list } = rungs(data)
  const [cursor, setCursor] = useState<number>()
  const left = (t: number) => `${((t - w.start) / (w.end - w.start)) * 100}%`
  const width = ([a, b]: Span) => `${((b - a) / (w.end - w.start)) * 100}%`
  const track = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const f = (e.clientX - box.left) / box.width
    setCursor(f >= 0 && f <= 1 ? w.start + f * (w.end - w.start) : undefined)
  }

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)_6.5rem] items-start gap-x-5 gap-y-7">
        {list.map((r, i) => {
          const before = list[i - 1]
          const added = before ? minus(r.spans, before.spans, w) : r.spans
          return (
            <div key={r.id} className="rise col-span-full grid grid-cols-subgrid" style={{ '--i': i } as React.CSSProperties}>
              <div className="pt-0.5">
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-ink-muted">
                  {before ? `adds ${pct(r.contact_share - before.contact_share).replace(' %', ' pts')}` : 'no relay'}
                </p>
              </div>
              <div>
                <div
                  className="relative h-7 outline -outline-offset-1 outline-line"
                  onPointerMove={track}
                  onPointerLeave={() => setCursor(undefined)}
                >
                  {before?.spans.map((s) => (
                    <i key={s[0]} className="absolute inset-y-0 bg-ink-faint/35" style={{ left: left(s[0]), width: width(s) }} />
                  ))}
                  {added.map((s) => (
                    <i
                      key={s[0]}
                      className={`absolute inset-y-0 ${i === 0 ? 'bg-comms' : 'lane-relay'}`}
                      style={{ left: left(s[0]), width: width(s) }}
                    />
                  ))}
                  {cursor != null && <span className="absolute -inset-y-1 w-px bg-now" style={{ left: left(cursor) }} />}
                </div>
                {r.longest && (
                  <div className="relative mt-1 h-6">
                    <div
                      className="absolute top-0 h-1.5 border-x border-b border-ink"
                      style={{ left: left(r.longest[0]), width: width(r.longest) }}
                    />
                    <span
                      className="readout absolute top-2 -translate-x-1/2 text-xs font-normal whitespace-nowrap"
                      style={{ left: left((r.longest[0] + r.longest[1]) / 2) }}
                    >
                      longest gap {hoursOf(r.longest).toFixed(0)} h
                    </span>
                  </div>
                )}
              </div>
              <p className="readout text-right text-2xl leading-7">{pct(r.contact_share)}</p>
            </div>
          )
        })}
        <div className="relative col-start-2 -mt-4 h-4">
          {weekTicks(w).map((t) => (
            <span key={t} className="absolute font-mono text-2xs whitespace-nowrap text-ink-faint" style={{ left: left(t) }}>
              {shortDate(new Date(t).toISOString().slice(0, 10))}
            </span>
          ))}
        </div>
      </div>
      <p className="min-h-5 text-sm text-ink-muted" aria-live="off">
        {cursor == null
          ? 'Move over a bar to read one moment.'
          : `${stamp(cursor)}: ${list.map((r) => `${r.label.replace('+ ', 'with ')} ${inContact(r, cursor) ? 'in view' : 'no line of sight'}`).join(' · ')}`}
      </p>
      <Fig>
        Grey is contact the rung above already had. Colour is what this rung adds; relay contact is dashed. The bracket marks the longest
        stretch still left without line of sight.
      </Fig>
    </div>
  )
}

const DIAL = { size: 460, r0: 196, step: 34, band: 20 }

/** 2. A dial: the month as one turn, a ring per scenario, the gaps as missing arc. */
export function RelayDial({ data }: { data: RelayData }) {
  const { w, list } = rungs(data)
  const [pick, setPick] = useState(list.length - 1)
  const [cursor, setCursor] = useState<number>()
  const c = DIAL.size / 2
  const angle = (t: number) => ((t - w.start) / (w.end - w.start)) * 2 * Math.PI
  const point = (r: number, a: number) => `${c + r * Math.sin(a)} ${c - r * Math.cos(a)}`
  const sweep = (r: number, [a, b]: Span) => {
    const p = angle(a)
    const q = Math.min(angle(b), p + 2 * Math.PI - 0.001)
    return `M${point(r, p)}A${r} ${r} 0 ${q - p > Math.PI ? 1 : 0} 1 ${point(r, q)}`
  }
  const days = Math.round((w.end - w.start) / DAY_MS)
  const chosen = list[pick] as Rung
  const track = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - box.left - box.width / 2
    const dy = e.clientY - box.top - box.height / 2
    const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)
    setCursor(w.start + (a / (2 * Math.PI)) * (w.end - w.start))
  }

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,29rem)_minmax(0,1fr)]">
      <svg
        viewBox={`-28 -28 ${DIAL.size + 56} ${DIAL.size + 56}`}
        role="img"
        aria-label="Contact through the month for each relay scenario, as rings"
        className="block w-full touch-none"
        onPointerMove={track}
        onPointerLeave={() => setCursor(undefined)}
      >
        {Array.from({ length: Math.ceil(days / 5) }, (_, i) => i * 5).map((d) => {
          const a = angle(w.start + d * DAY_MS)
          return (
            <g key={d}>
              <path d={`M${point(DIAL.r0 + DIAL.band / 2 + 3, a)}L${point(DIAL.r0 + DIAL.band / 2 + 9, a)}`} className="stroke-ink-faint" />
              <text
                x={c + (DIAL.r0 + 26) * Math.sin(a)}
                y={c - (DIAL.r0 + 26) * Math.cos(a) + 4}
                textAnchor="middle"
                className="fill-ink-faint font-mono text-2xs"
              >
                {d === 0 ? shortDate(data.period.start_utc.slice(0, 10)) : `+${d} d`}
              </text>
            </g>
          )
        })}
        {list.map((r, i) => {
          const radius = DIAL.r0 - i * DIAL.step
          return (
            <g
              key={r.id}
              className="rise cursor-pointer"
              style={{ '--i': i } as React.CSSProperties}
              opacity={i === pick ? 1 : 0.6}
              onClick={() => setPick(i)}
            >
              <circle cx={c} cy={c} r={radius} className="fill-none stroke-line" strokeWidth={DIAL.band} />
              {r.spans.map((s) => (
                <path
                  key={s[0]}
                  d={sweep(radius, s)}
                  className={`fill-none ${i === 0 ? 'stroke-comms' : 'stroke-relay'}`}
                  strokeWidth={DIAL.band}
                  strokeDasharray={i === 0 ? undefined : '6 3'}
                />
              ))}
              {i === pick && r.longest && (
                <>
                  <path d={sweep(radius + DIAL.band / 2 + 2, r.longest)} className="fill-none stroke-ink" strokeWidth={1.5} />
                  <path d={sweep(radius - DIAL.band / 2 - 2, r.longest)} className="fill-none stroke-ink" strokeWidth={1.5} />
                </>
              )}
            </g>
          )
        })}
        {cursor != null && (
          <path
            d={`M${point(DIAL.r0 - list.length * DIAL.step + 14, angle(cursor))}L${point(DIAL.r0 + DIAL.band / 2 + 4, angle(cursor))}`}
            className="stroke-now"
            strokeWidth={1.5}
          />
        )}
        <text x={c} y={c - 6} textAnchor="middle" className="readout fill-ink text-3xl">
          {pct(chosen.contact_share)}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="fill-ink-muted text-xs">
          {cursor == null ? 'in line of sight' : inContact(chosen, cursor) ? 'in view now' : 'no line of sight now'}
        </text>
      </svg>
      <div className="grid content-start gap-5">
        <div role="group" aria-label="Relay scenario" className="grid">
          {list.map((r, i) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={i === pick}
              onClick={() => setPick(i)}
              className={`grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-3 text-left transition-colors duration-(--duration-fast) hover:bg-surface-hover ${i === pick ? '' : 'text-ink-muted'}`}
            >
              <span aria-hidden className={`h-2.5 w-5 self-center ${i === 0 ? 'bg-comms' : 'lane-relay'}`} />
              <span className={i === pick ? 'font-medium' : ''}>{r.label}</span>
              <span className="readout font-normal">
                {pct(r.contact_share)} · longest gap {r.longest ? hoursOf(r.longest).toFixed(0) : 0} h
              </span>
            </button>
          ))}
        </div>
        <p className="min-h-5 text-sm text-ink-muted">{cursor == null ? 'Move around the dial to read one moment.' : stamp(cursor)}</p>
        <Fig>
          One turn is the {days}-day period, clockwise from the top. The outer ring is direct to Earth; each ring inward adds a relay. The
          outlined arc is the longest gap on the chosen ring.
        </Fig>
      </div>
    </div>
  )
}

/** 3. A ledger: forget the calendar, lay every gap end to end, longest first, against what you can bridge. */
export function RelayGaps({ data }: { data: RelayData }) {
  const { w, list } = rungs(data)
  const [bridge, setBridge] = useState(48)
  const total = (w.end - w.start) / HOUR_MS
  const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total)

  return (
    <div className="grid gap-6">
      <label className="grid gap-1.5 justify-self-start">
        <span className="text-sm text-ink-muted">
          Longest gap the mission can bridge <span className="readout text-ink">{bridge} h</span>
        </span>
        <input
          type="range"
          min={2}
          max={120}
          step={2}
          value={bridge}
          onChange={(e) => setBridge(Number(e.target.value))}
          className="h-9 w-72 accent-(--brand)"
        />
      </label>
      <div className="grid gap-7">
        {list.map((r, i) => {
          const sorted = [...r.gaps].sort((a, b) => hoursOf(b) - hoursOf(a))
          const over = sorted.filter((g) => hoursOf(g) > bridge)
          const sum = sorted.reduce((n, g) => n + hoursOf(g), 0)
          return (
            <div key={r.id} className="rise grid gap-2" style={{ '--i': i } as React.CSSProperties}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6">
                <p>
                  <span className="font-medium">{r.label}</span>{' '}
                  <span className="text-ink-muted">
                    {sorted.length} {sorted.length === 1 ? 'gap' : 'gaps'}, {sum.toFixed(0)} h without line of sight
                  </span>
                </p>
                <p className={over.length ? '' : 'text-ink-muted'}>
                  {over.length === 0 ? `None longer than ${bridge} h` : `${over.length} longer than ${bridge} h`}
                </p>
              </div>
              <div className="relative flex h-10 gap-px">
                {sorted.map((g) => {
                  const h = hoursOf(g)
                  return (
                    <div
                      key={g[0]}
                      title={`${h.toFixed(0)} h, from ${stamp(g[0])}`}
                      className={`grid shrink-0 place-items-center overflow-hidden outline -outline-offset-1 ${h > bridge ? 'bg-ink text-bg outline-ink' : 'outline-ink-faint'}`}
                      style={{ width: `${(h / total) * 100}%` }}
                    >
                      {h / total > 0.06 && <span className="readout text-xs font-normal">{h.toFixed(0)} h</span>}
                    </div>
                  )
                })}
                <span aria-hidden className="absolute -inset-y-1.5 w-px bg-now" style={{ left: `${(bridge / total) * 100}%` }} />
              </div>
            </div>
          )
        })}
        <div className="relative -mt-4 h-4">
          {axis.map((h) => (
            <span
              key={h}
              className="absolute font-mono text-2xs whitespace-nowrap text-ink-faint"
              style={{ left: `${(h / total) * 100}%`, translate: h === total ? '-100%' : undefined }}
            >
              {h.toFixed(0)} h
            </span>
          ))}
        </div>
      </div>
      <Fig>
        Each block is one stretch without line of sight, widest first, on a scale where the full width is the whole {total.toFixed(0)}-hour
        period. Filled blocks are longer than the mission can bridge. The red line is that limit against the first block.
      </Fig>
    </div>
  )
}
