import { minutes } from '~/lib/time'

const DAY_MS = 86_400_000

export type IntervalRow = { start: string; end: string; minutes: number }

/** Direct-sun intervals overlapping one UTC day, with edges outside the day shown as open. */
export function intervalsOn(intervals: [string, string][], date: string): IntervalRow[] {
  const d0 = Date.parse(`${date}T00:00:00Z`)
  const d1 = d0 + DAY_MS
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19)
  return intervals.flatMap(([a, b]) => {
    const start = Date.parse(a)
    const end = Date.parse(b)
    if (start >= d1 || end <= d0) return []
    return [
      {
        start: start < d0 ? 'before 00:00' : clock(start),
        end: end > d1 ? 'after 24:00' : clock(end),
        minutes: (Math.min(end, d1) - Math.max(start, d0)) / 60_000,
      },
    ]
  })
}

export function hhmm(min: number) {
  const m = Math.round(min)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function Intervals({ rows, daylightMin }: { rows: IntervalRow[]; daylightMin: number }) {
  if (rows.length === 0) {
    return (
      <p className="py-2 text-base text-ink-muted">
        {daylightMin > 0
          ? `No direct sun on this day. All ${minutes(daylightMin)} of daylight is behind terrain.`
          : 'No direct sun on this day: the Sun does not rise (polar night).'}
      </p>
    )
  }
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="text-xs text-ink-muted">
          <th className="border-b border-line py-1.5 pr-3 font-normal">Sun appears</th>
          <th className="border-b border-line py-1.5 pr-3 font-normal">Sun disappears</th>
          <th className="border-b border-line py-1.5 font-normal">Length</th>
        </tr>
      </thead>
      <tbody className="tabular text-xs">
        {rows.map((r) => (
          <tr key={r.start + r.end}>
            <td className="border-b border-line py-1.5 pr-3">{r.start}</td>
            <td className="border-b border-line py-1.5 pr-3">{r.end}</td>
            <td className="border-b border-line py-1.5">{hhmm(r.minutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
