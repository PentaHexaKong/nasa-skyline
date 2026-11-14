import { Button } from '@cloudflare/kumo/components/button'
import { CaretLeftIcon, CaretRightIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Lanes } from '~/components/Lanes'
import { type Summary } from '~/lib/data'
import { DAY_MS, HOUR_MS, measure, siteSpans } from '~/lib/mission'

const SYNODIC_MS = 29.53 * DAY_MS
const PLAY_STEP = 3 * HOUR_MS
const PLAY_TICK_MS = 125

const pct = (x: number) => `${(x * 100).toFixed(0)}%`

/** One lunar day at a time: Sun, Earth and both across 29.5 days, scrubbed or played. */
export function MonthTimeline({ data, at, onSeek }: { data: Summary; at: number; onSeek: (t: number) => void }) {
  const spans = useMemo(() => siteSpans(data), [data])
  const { coverage } = spans
  const pages = Math.ceil((coverage.end - coverage.start) / SYNODIC_MS)
  const page = Math.max(0, Math.min(pages - 1, Math.floor((at - coverage.start) / SYNODIC_MS)))
  const start = coverage.start + page * SYNODIC_MS
  const window = { start, end: Math.min(start + SYNODIC_MS, coverage.end) }
  const m = measure(spans, window)

  const [playing, setPlaying] = useState(false)
  const latest = useRef({ at, onSeek })
  latest.current = { at, onSeek }
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const next = latest.current.at + PLAY_STEP
      if (next >= coverage.end) setPlaying(false)
      else latest.current.onSeek(next)
    }, PLAY_TICK_MS)
    return () => clearInterval(id)
  }, [playing, coverage.end])

  const turn = (by: number) => {
    setPlaying(false)
    onSeek(coverage.start + Math.max(0, Math.min(pages - 1, page + by)) * SYNODIC_MS)
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          shape="square"
          aria-label="Previous lunar day"
          disabled={page === 0}
          icon={CaretLeftIcon}
          onClick={() => turn(-1)}
        />
        <Button
          variant="secondary"
          shape="square"
          aria-label={playing ? 'Pause' : 'Play through the lunar day'}
          aria-pressed={playing}
          icon={playing ? PauseIcon : PlayIcon}
          onClick={() => setPlaying(!playing)}
        />
        <Button
          variant="secondary"
          shape="square"
          aria-label="Next lunar day"
          disabled={page === pages - 1}
          icon={CaretRightIcon}
          onClick={() => turn(1)}
        />
        <span className="tabular pl-2 text-xs text-ink-faint">
          Lunar day {page + 1} of {pages}
        </span>
      </div>
      <Lanes
        window={window}
        cursor={at}
        onScrub={onSeek}
        label="Moment within the lunar day, UTC"
        lanes={[
          { key: 'sun', label: 'Sun', spans: m.sun, fill: 'bg-sun', value: pct(m.sunShare) },
          { key: 'earth', label: 'Earth', spans: m.earth, fill: 'bg-comms', value: pct(m.earthShare) },
          { key: 'both', label: 'Both', spans: m.both, fill: 'bg-ink', value: pct(m.bothShare) },
        ]}
      />
    </div>
  )
}
