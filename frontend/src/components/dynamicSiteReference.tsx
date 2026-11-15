import { useHydrated } from '@tanstack/react-router'
import { useState } from 'react'
import { Panorama } from '~/components/Panorama'
import { hasTerrain, type ReferenceSite, SITES } from '~/lib/data'
import type { PlannerRow } from '~/lib/dynamicPlanner'
import {
  annualSummary,
  annualWindows,
  type ReferenceState,
  referenceDays,
  referenceEarth,
  referenceSource,
  referenceTrack,
  utcDayMs,
} from '~/lib/referenceScience'
import type { ComputedResponse } from '~/lib/scientificContract.generated'
import { useAnnualReference, useReferenceInstant, useReferenceWindow } from '~/lib/useReferenceScience'
import type { SiteSearch } from '~/lib/useSiteView'

const percentage = (value: number) => `${(value * 100).toFixed(1)} %`
const hours = (value: number) => `${(value / 3600).toFixed(2)} h`

export function ReferenceStateMessage({ row }: { row: ReferenceState | PlannerRow }) {
  if (row.state === 'computed') return null
  return (
    <div role="status" aria-busy={row.state === 'loading'} className="grid gap-1 rounded-lg border border-line p-4">
      <p>{row.state}</p>
      <p className="text-sm text-ink-muted">{row.message}</p>
    </div>
  )
}

export function ReferenceControls({
  site,
  date,
  minute,
  go,
  onSite,
}: {
  site: ReferenceSite
  date: string
  minute: number
  go: (search: SiteSearch) => void
  onSite: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-bg p-4">
      <label className="grid gap-1 text-sm">
        Site
        <select
          aria-label="Scientific reference site"
          className="rounded border border-line bg-bg p-2"
          value={site.site.id}
          onChange={(event) => onSite(event.target.value)}
        >
          {SITES.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        UTC date
        <input
          aria-label="Scientific reference UTC date"
          className="rounded border border-line bg-bg p-2"
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) go({ day: event.target.value })
          }}
        />
      </label>
      <label className="grid gap-1 text-sm">
        UTC time
        <input
          aria-label="Scientific reference UTC time"
          className="rounded border border-line bg-bg p-2"
          type="time"
          step={60}
          value={`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`}
          onChange={(event) => {
            const [hour, minute] = event.target.value.split(':').map(Number)
            if (hour !== undefined && minute !== undefined) go({ t: hour * 60 + minute })
          }}
        />
      </label>
    </div>
  )
}

export function useSelectedReference(site: ReferenceSite, search: SiteSearch, go: (search: SiteSearch) => void) {
  const enabled = useHydrated()
  const date = (enabled && search.day) || site.params.start
  const minute = enabled ? (search.t ?? 720) : 720
  const [attempt, setAttempt] = useState(0)
  const day = useReferenceWindow(site, date, enabled, attempt)
  const rawInstant = useReferenceInstant(site, date, minute, enabled, attempt)
  const instant: PlannerRow =
    day.state === 'computed' &&
    rawInstant.state === 'computed' &&
    referenceSource(day.data.response, false) !== referenceSource(rawInstant.response, false)
      ? { state: 'failed', message: 'The day and selected instant have different scientific source identities. Re-evaluate the reference.' }
      : rawInstant
  return { enabled, date, minute, day, instant, attempt, go, refresh: () => setAttempt((value) => value + 1) }
}

export function ReferenceVisibilityLanes({ response }: { response: ComputedResponse }) {
  const { result } = response
  const duration = result.period.durationS
  const lanes = [
    { name: 'Sun', fill: 'bg-sun', intervals: result.sunlightIntervals.available },
    { name: 'Earth center', fill: 'bg-comms', intervals: result.directEarthIntervals.available },
  ]
  return (
    <div role="img" aria-label="Refined daily Sun and Earth visibility" className="grid gap-3">
      {lanes.map((lane) => (
        <div key={lane.name} className="grid grid-cols-[7rem_1fr] items-center gap-3">
          <span className="text-sm">{lane.name}</span>
          <div className="relative h-4 overflow-hidden rounded border border-line">
            {lane.intervals.map((interval) => (
              <span
                key={interval.startS}
                title={`[${interval.startUtc}, ${interval.endUtc})`}
                className={`absolute inset-y-0 ${lane.fill}`}
                style={{
                  left: `${(100 * interval.startS) / duration}%`,
                  width: `${(100 * (interval.endS - interval.startS)) / duration}%`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-muted">
        0 to {(duration / 3600).toFixed(6)} elapsed SPICE ET hours within the requested UTC day. Hover an interval for its original UTC
        bounds.
      </p>
    </div>
  )
}

export function ReferenceDayView({ view, site }: { view: ReturnType<typeof useSelectedReference>; site: ReferenceSite }) {
  const { day, instant } = view
  if (day.state !== 'computed') return <ReferenceStateMessage row={day} />
  const response = day.data.response
  const result = response.result
  const now = instant.state === 'computed' ? instant.response.result.samples[0] : undefined
  const events = [
    ...result.sunlightIntervals.events.map((event) => ({ ...event, body: 'Sun' })),
    ...result.directEarthIntervals.events.map((event) => ({ ...event, body: 'Earth center' })),
  ].sort((left, right) => left.timestampUtc.localeCompare(right.timestampUtc))
  const track = referenceTrack(day.data)
  const comms = instant.state === 'computed' ? referenceEarth(day.data, instant.response) : undefined
  return (
    <section aria-label="Live daily scientific reference" className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Sunlight availability', percentage(result.metrics.sunlightAvailabilityFraction)],
          ['Direct Earth visibility', percentage(result.metrics.directEarthAvailabilityFraction)],
          ['Longest darkness', hours(result.metrics.longestDarkness.durationS)],
          ['Longest Earth blackout', hours(result.metrics.longestDirectEarthBlackout.durationS)],
        ].map(([label, value]) => (
          <dl key={label} className="grid gap-1 rounded-xl border border-line p-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="readout text-xl">{value}</dd>
          </dl>
        ))}
      </div>
      <p className="text-sm text-ink-muted">
        UTC window [{result.period.startUtc}, {result.period.endUtc}). Darkness touches window boundary{' '}
        {String(result.metrics.longestDarkness.touchesCoverageBoundary)}. Earth blackout touches window boundary{' '}
        {String(result.metrics.longestDirectEarthBlackout.touchesCoverageBoundary)}.
      </p>
      <ReferenceStateMessage row={instant} />
      {now && (
        <div aria-label="Exact selected UTC scientific sample" className="grid gap-2 rounded-xl border border-line p-4">
          <h2 className="font-medium">At {now.timestampUtc}</h2>
          <p>
            Sun · {now.sun.diskState.replaceAll('_', ' ')} · visible disk fraction {now.sun.visibleDiskFraction.toFixed(4)} · azimuth{' '}
            {now.sun.azimuthDeg.toFixed(3)}° · elevation {now.sun.elevationDeg.toFixed(3)}° · clearance {now.sun.clearanceDeg.toFixed(3)}°.
          </p>
          <p>
            Earth center · {now.earth.centerVisible ? 'visible' : 'obscured'} · azimuth {now.earth.azimuthDeg.toFixed(3)}° · elevation{' '}
            {now.earth.elevationDeg.toFixed(3)}° · clearance {now.earth.clearanceDeg.toFixed(3)}°.
          </p>
        </div>
      )}
      <Panorama
        skyline={result.skyline.visibilityHorizonElevationDeg}
        azStep={result.skyline.azimuthStepDeg}
        track={track}
        now={now ? { az: now.sun.azimuthDeg, el: now.sun.elevationDeg, fraction: now.sun.visibleDiskFraction } : undefined}
        comms={comms}
        azRange={[0, 360]}
        height={330}
        label={`Live scientific skyline and sampled Sun/Earth tracks at ${site.site.name}`}
      />
      <p className="text-sm text-ink-muted">
        The white line shows the engine's visibility horizon, including its zero-degree floor. Track curves connect ten-minute API samples
        for display. The selected-instant readouts use an exact-time API evaluation. Visibility lanes use refined half-open intervals.
      </p>
      <ReferenceVisibilityLanes response={response} />
      <section aria-label="Refined daily visibility events" className="grid gap-3">
        <h2 className="text-xl font-medium">Refined events inside this UTC day</h2>
        {events.length ? (
          <ul className="grid gap-2 text-sm">
            {events.map((event) => (
              <li key={`${event.body}-${event.timestampUtc}-${event.eventType}`}>
                {event.body} · {event.eventType} · {event.timestampUtc} · numerical tolerance {event.numericalToleranceS} s
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">No refined transitions were reported inside this day.</p>
        )}
      </section>
      <details className="text-sm">
        <summary className="cursor-pointer">Scientific response, intervals, events and provenance</summary>
        <p className="my-3">
          Geometric Earth visibility · any-visible-solar-disk sunlight · {result.observer.observerHeightM} m above terrain ·{' '}
          {result.observer.frame}. Numerical event tolerance {result.sunlightIntervals.detection.numericalRootToleranceS} s. Possible missed
          Sun events {String(result.sunlightIntervals.detection.possibleMissedEvents)}. Possible missed Earth events{' '}
          {String(result.directEarthIntervals.detection.possibleMissedEvents)}. Independently validated{' '}
          {String(response.provenance.independentlyValidated)}.
        </p>
        <pre className="max-h-96 overflow-auto rounded border border-line p-3 text-xs">{JSON.stringify(response, null, 2)}</pre>
      </details>
    </section>
  )
}

export function DynamicSiteReference({
  site,
  search,
  go,
  onSite,
}: {
  site: ReferenceSite
  search: SiteSearch
  go: (search: SiteSearch) => void
  onSite: (id: string) => void
}) {
  const view = useSelectedReference(site, search, go)
  const year = Number(view.date.slice(0, 4))
  const evaluatedAnnual = useAnnualReference(site, year, view.enabled, view.attempt)
  const changedSource =
    view.day.state === 'computed' &&
    evaluatedAnnual.chunks.length > 0 &&
    referenceSource(view.day.data.response, false) !== referenceSource(evaluatedAnnual.chunks[0]!.response, false)
  const annual = changedSource
    ? {
        ...evaluatedAnnual,
        state: 'failed' as const,
        chunks: [],
        message: 'The day and annual report have different scientific source identities. Re-evaluate the reference.',
      }
    : evaluatedAnnual
  const daily = new Map(annual.chunks.flatMap(referenceDays).map((day) => [day.date, day]))
  const summary = annual.state === 'computed' ? annualSummary(annual.chunks, year) : null
  const dates =
    year >= 1 && year <= 9998
      ? annualWindows(year).flatMap((window) =>
          Array.from({ length: (window.end - window.start) / utcDayMs }, (_, index) =>
            new Date(window.start + index * utcDayMs).toISOString().slice(0, 10),
          ),
        )
      : []
  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6">
      <header className="grid gap-3">
        <h1 className="text-3xl font-medium">{site.site.name} · scientific reference</h1>
        <p className="text-ink-muted">Daily and annual results evaluated through the scientific API with SPICE and LOLA provenance.</p>
        <ReferenceControls site={site} date={view.date} minute={view.minute} go={go} onSite={onSite} />
        <div className="flex flex-wrap gap-5 text-sm">
          <button type="button" onClick={view.refresh} className="cursor-pointer underline">
            Re-evaluate reference
          </button>
          <a className="underline" href={`/analyze?sites=${site.site.id}&day=${view.date}&t=${view.minute}&step=result`}>
            Plan a mission here
          </a>
          {hasTerrain(site.site.id) && (
            <a className="underline" href={`/explore/${site.site.id}?day=${view.date}&t=${view.minute}`}>
              Explore this live sky in 3D
            </a>
          )}
        </div>
      </header>
      <ReferenceDayView site={site} view={view} />
      <section aria-label="Dynamic annual scientific reference" className="grid gap-5 rounded-xl border border-line p-5">
        <h2 className="text-2xl font-medium">{year} UTC annual report</h2>
        <p role="status">
          {annual.state} · {annual.chunks.length} / {annual.total} bounded windows · {daily.size} / {dates.length} UTC days evaluated.
        </p>
        <p className="text-sm text-ink-muted">{annual.message}</p>
        {annual.state === 'loading' && (
          <button type="button" onClick={annual.stop} className="w-fit cursor-pointer underline">
            Stop annual evaluation
          </button>
        )}
        {summary && (
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Annual sunlight', percentage(summary.sunlightAvailabilityFraction)],
              ['Annual direct Earth', percentage(summary.directEarthAvailabilityFraction)],
              ['Longest annual darkness', hours(summary.longestDarkness.durationS)],
              ['Longest annual Earth blackout', hours(summary.longestDirectEarthBlackout.durationS)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="readout text-xl">{value}</dd>
              </div>
            ))}
            <div className="col-span-2 text-sm text-ink-muted">
              Longest darkness touches year boundary {String(summary.longestDarkness.touchesCoverageBoundary)}. Longest Earth blackout
              touches year boundary {String(summary.longestDirectEarthBlackout.touchesCoverageBoundary)}. Denominator{' '}
              {summary.durationS.toFixed(6)} SPICE ET seconds.
            </div>
          </dl>
        )}
        <p className="text-sm text-ink-muted">
          Each date shows sunlight in amber and Earth-center visibility in cyan. A dashed cell is uncomputed. Select any date for its live
          day report. Annual event searches use hourly cadence.
        </p>
        <div className="grid grid-cols-7 gap-1 sm:grid-cols-14 lg:grid-cols-31" aria-label="Annual daily scientific availability">
          {dates.map((date) => {
            const day = daily.get(date)
            const label = day
              ? `${date}, sunlight ${hours(day.sunlightDurationS)}, Earth ${hours(day.directEarthDurationS)}`
              : `${date}, not computed`
            return (
              <button
                type="button"
                key={date}
                aria-label={label}
                title={label}
                onClick={() => go({ day: date })}
                className={`grid h-12 cursor-pointer content-end gap-0.5 rounded border p-0.5 ${day ? 'border-line' : 'border-dashed border-line'} ${date === view.date ? 'outline outline-brand' : ''}`}
              >
                <span className="text-[9px] text-ink-faint">{date.slice(5)}</span>
                {day ? (
                  <>
                    <span className="block h-2 bg-sun" style={{ width: `${(100 * day.sunlightDurationS) / day.durationS}%` }} />
                    <span className="block h-2 bg-comms" style={{ width: `${(100 * day.directEarthDurationS) / day.durationS}%` }} />
                  </>
                ) : (
                  <span className="text-xs text-ink-faint">—</span>
                )}
              </button>
            )
          })}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">Annual source windows and validation limitations</summary>
          <p className="my-3">
            Annual metrics appear after complete, contiguous coverage with matching observer, terrain, kernel, algorithm and scientific
            settings. Refined event searches retain their possible-missed-event and physical-uncertainty limitations. Geometric visibility
            requires separate RF and operational qualification.
          </p>
          <pre className="max-h-96 overflow-auto text-xs">
            {JSON.stringify(
              annual.chunks.map((chunk) => ({
                scenarioId: chunk.response.scenarioId,
                window: chunk.window,
                provenance: chunk.response.provenance,
              })),
              null,
              2,
            )}
          </pre>
        </details>
      </section>
    </main>
  )
}
