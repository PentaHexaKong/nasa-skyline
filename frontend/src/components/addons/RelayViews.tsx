import { type PointerEvent, type ReactNode, useState } from 'react'
import type { Span } from '~/lib/mission'
import type { RelayLadder } from '~/lib/relayLive'
import { clock, shortDate } from '~/lib/time'
import { duration, hoursOf, inContact, minus, pct, rungsOf, ticksOf, windowOf } from './relayTrack'

const day = (t: number) => new Date(t).toISOString().slice(0, 10)
const stamp = (t: number) => `${shortDate(day(t))}, ${clock(new Date(t))} UTC`
const tickLabel = (t: number, label: string | null) => label ?? shortDate(day(t))

export function Caption({ children }: { children: ReactNode }) {
  return <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">{children}</p>
}

/** A ladder: each rung shows only what it adds over the one before, and brackets the longest gap it leaves. */
export function RelayFill({ ladder }: { ladder: RelayLadder }) {
  const w = windowOf(ladder.track)
  const list = rungsOf(ladder)
  const [cursor, setCursor] = useState<number>()
  const left = (t: number) => `${((t - w.start) / (w.end - w.start)) * 100}%`
  const width = ([a, b]: Span) => `${((b - a) / (w.end - w.start)) * 100}%`
  const track = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const f = (e.clientX - box.left) / box.width
    setCursor(f >= 0 && f <= 1 ? w.start + f * (w.end - w.start) : undefined)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-5">
        {list.map((r, i) => {
          const before = list[i - 1]
          const added = before ? minus(r.spans, before.spans) : r.spans
          return (
            <div key={r.relays} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <p>
                  <span className="font-medium">{r.label}</span>{' '}
                  <span className="tabular text-ink-muted">
                    {before ? `adds ${((r.share - before.share) * 100).toFixed(1)} pts` : 'direct to Earth'}
                  </span>
                </p>
                <p className="readout">{pct(r.share)}</p>
              </div>
              <div
                className="relative h-6 overflow-hidden outline -outline-offset-1 outline-line"
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
                <div className="relative h-6">
                  <div
                    className="absolute top-0 h-1.5 border-x border-b border-ink"
                    style={{ left: left(r.longest[0]), width: width(r.longest) }}
                  />
                  <span
                    className="tabular absolute top-2 text-xs whitespace-nowrap text-ink-muted"
                    style={
                      (r.longest[0] + r.longest[1]) / 2 - w.start < (w.end - w.start) / 2
                        ? { left: left(r.longest[0]) }
                        : { right: `${((w.end - r.longest[1]) / (w.end - w.start)) * 100}%` }
                    }
                  >
                    Longest gap {duration(hoursOf(r.longest) * 3600)}
                  </span>
                </div>
              )}
            </div>
          )
        })}
        <div aria-hidden className="relative h-4 overflow-hidden">
          {ticksOf(w).map(({ t, label }) => (
            <span key={t} className="absolute font-mono text-2xs whitespace-nowrap text-ink-faint" style={{ left: left(t) }}>
              {tickLabel(t, label)}
            </span>
          ))}
        </div>
      </div>
      <p className="min-h-5 text-sm text-ink-muted max-sm:hidden">
        {cursor == null
          ? 'Move over a bar to read one moment.'
          : `${stamp(cursor)}: ${list.map((r) => `${r.label.toLowerCase()} ${inContact(r, cursor) ? 'in contact' : 'no line of sight'}`).join(' · ')}`}
      </p>
      <Caption>
        Cyan is direct contact with Earth. Dashed pink is what each added relay brings; grey is contact the rung above already had. The
        bracket marks the longest stretch still left without contact.
      </Caption>
    </div>
  )
}

const DIAL = { size: 460, r0: 196, step: 30, band: 20 }

/** A dial: the stay as one turn, a ring per relay count, the gaps as missing arc. */
export function RelayDial({ ladder }: { ladder: RelayLadder }) {
  const w = windowOf(ladder.track)
  const list = rungsOf(ladder)
  const [pick, setPick] = useState(list.length - 1)
  const [cursor, setCursor] = useState<number>()
  const c = DIAL.size / 2
  // The readout sits inside the innermost ring with room to spare: seven mono figures are about 4.2 em wide.
  const hole = DIAL.r0 - (list.length - 1) * DIAL.step - DIAL.band / 2
  const big = Math.min(32, ((hole - 12) * 2) / 4.2)
  const angle = (t: number) => ((t - w.start) / (w.end - w.start)) * 2 * Math.PI
  const point = (r: number, a: number) => `${c + r * Math.sin(a)} ${c - r * Math.cos(a)}`
  const sweep = (r: number, [a, b]: Span) => {
    const p = angle(a)
    const q = Math.min(angle(b), p + 2 * Math.PI - 0.001)
    return `M${point(r, p)}A${r} ${r} 0 ${q - p > Math.PI ? 1 : 0} 1 ${point(r, q)}`
  }
  const chosen = list[pick] ?? list[0]
  const track = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - box.left - box.width / 2
    const dy = e.clientY - box.top - box.height / 2
    const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)
    setCursor(w.start + (a / (2 * Math.PI)) * (w.end - w.start))
  }
  if (!chosen) return null

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <svg
        viewBox={`-28 -28 ${DIAL.size + 56} ${DIAL.size + 56}`}
        role="img"
        aria-label="Contact over the stay for each number of relays, as rings"
        className="mx-auto block w-full max-w-md touch-none"
        onPointerMove={track}
        onPointerLeave={() => setCursor(undefined)}
      >
        {ticksOf(w).map(({ t, label }) => {
          const a = angle(t)
          return (
            <g key={t}>
              <path d={`M${point(DIAL.r0 + DIAL.band / 2 + 3, a)}L${point(DIAL.r0 + DIAL.band / 2 + 9, a)}`} className="stroke-ink-faint" />
              <text
                x={c + (DIAL.r0 + 26) * Math.sin(a)}
                y={c - (DIAL.r0 + 26) * Math.cos(a) + 4}
                textAnchor="middle"
                className="fill-ink-faint font-mono text-xs"
              >
                {tickLabel(t, label)}
              </text>
            </g>
          )
        })}
        {list.map((r, i) => {
          const radius = DIAL.r0 - i * DIAL.step
          return (
            <g key={r.relays} className="cursor-pointer" opacity={i === pick ? 1 : 0.6} onClick={() => setPick(i)}>
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
        <text x={c} y={c + big * 0.1} textAnchor="middle" className="readout fill-ink" fontSize={big}>
          {pct(chosen.share)}
        </text>
        <text x={c} y={c + big * 0.1 + 18} textAnchor="middle" className="fill-ink-muted" fontSize={12}>
          {cursor == null ? 'in contact' : inContact(chosen, cursor) ? 'in contact now' : 'no contact now'}
        </text>
      </svg>
      <div className="grid content-start gap-4">
        <div role="group" aria-label="Number of relays" className="grid">
          {list.map((r, i) => (
            <button
              key={r.relays}
              type="button"
              aria-pressed={i === pick}
              onClick={() => setPick(i)}
              className={`grid cursor-pointer grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-t border-line py-2.5 text-left text-sm hover:bg-surface-hover ${i === pick ? '' : 'text-ink-muted'}`}
            >
              <span aria-hidden className={`h-2.5 w-5 self-center ${i === 0 ? 'bg-comms' : 'lane-relay'}`} />
              <span className={i === pick ? 'font-medium' : ''}>{r.label}</span>
              <span className="tabular text-right">
                {pct(r.share)} · gap {r.longest ? duration(hoursOf(r.longest) * 3600) : 'none'}
              </span>
            </button>
          ))}
        </div>
        <p className="min-h-5 text-sm text-ink-muted max-sm:hidden">
          {cursor == null ? 'Move around the dial to read one moment.' : stamp(cursor)}
        </p>
        <Caption>
          One turn is the whole stay, clockwise from the top. The outer ring is direct to Earth; each ring inward adds a relay. The outlined
          arc is the longest gap on the chosen ring.
        </Caption>
      </div>
    </div>
  )
}

/** A ledger: forget the calendar, lay every gap end to end, longest first, against what the mission can bridge. */
export function RelayGaps({ ladder, limitH }: { ladder: RelayLadder; limitH: number }) {
  const w = windowOf(ladder.track)
  const list = rungsOf(ladder)
  const total = (w.end - w.start) / 3_600_000
  const most = Math.max(2, Math.ceil(Math.min(total, 240) / 2) * 2)
  const [bridge, setBridge] = useState(Math.min(most, Math.max(2, Math.round(limitH))))
  const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total)

  return (
    <div className="grid gap-6">
      <label className="grid max-w-80 gap-1.5">
        <span className="text-sm text-ink-muted">
          Longest gap the mission can bridge <span className="tabular text-ink">{bridge} h</span>
        </span>
        <input
          type="range"
          min={2}
          max={most}
          step={2}
          value={bridge}
          onChange={(e) => setBridge(Number(e.target.value))}
          className="h-9 w-full accent-(--brand)"
        />
      </label>
      <div className="grid gap-6">
        {list.map((r) => {
          const sorted = [...r.gaps].sort((a, b) => hoursOf(b) - hoursOf(a))
          const over = sorted.filter((g) => hoursOf(g) > bridge)
          const sum = sorted.reduce((n, g) => n + hoursOf(g), 0)
          return (
            <div key={r.relays} className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 text-sm">
                <p>
                  <span className="font-medium">{r.label}</span>{' '}
                  <span className="tabular text-ink-muted">
                    {sorted.length === 0
                      ? 'no gaps'
                      : `${sorted.length} ${sorted.length === 1 ? 'gap' : 'gaps'}, ${duration(sum * 3600)} without contact`}
                  </span>
                </p>
                <p className={`tabular ${over.length ? '' : 'text-ink-muted'}`}>
                  {over.length === 0 ? `None longer than ${bridge} h` : `${over.length} longer than ${bridge} h`}
                </p>
              </div>
              <div className="relative flex h-10 overflow-hidden">
                {sorted.map((g) => {
                  const h = hoursOf(g)
                  return (
                    <div
                      key={g[0]}
                      title={`${duration(h * 3600)}, from ${stamp(g[0])}`}
                      className={`grid shrink-0 place-items-center overflow-hidden outline -outline-offset-1 ${h > bridge ? 'bg-ink text-bg outline-bg' : 'outline-ink-faint'}`}
                      style={{ width: `${(h / total) * 100}%` }}
                    >
                      {h / total > 0.08 && <span className="tabular text-xs">{duration(h * 3600)}</span>}
                    </div>
                  )
                })}
                {bridge < total && (
                  <span aria-hidden className="absolute inset-y-0 w-0.5 bg-miss" style={{ left: `${(bridge / total) * 100}%` }} />
                )}
              </div>
            </div>
          )
        })}
        <div aria-hidden className="relative -mt-3 h-4">
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
      <Caption>
        Each block is one stretch without contact, longest first, on a scale where the full width is the whole {total.toFixed(0)}-hour
        comparison. Solid blocks are longer than the mission can bridge, outlined ones are within it, and the red line marks that limit
        against the first block. The slider starts at your own limit, Earth out of view for at most {Math.round(limitH)} h.
      </Caption>
    </div>
  )
}
