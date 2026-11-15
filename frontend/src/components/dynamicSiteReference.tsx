import { ArrowRightIcon, ArrowSquareOutIcon, ArrowsClockwiseIcon, CubeIcon } from '@phosphor-icons/react'
import { Link, useHydrated } from '@tanstack/react-router'
import { useState } from 'react'
import { Panorama } from '~/components/Panorama'
import { GLOBAL_TERRAIN_M, hasTerrain, MOON_SITES, REFERENCE_SITES, type ReferenceSite } from '~/lib/data'
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
import { longDate } from '~/lib/time'
import { useAnnualReference, useReferenceInstant, useReferenceWindow } from '~/lib/useReferenceScience'
import type { SiteSearch } from '~/lib/useSiteView'

const percentage = (value: number) => `${(value * 100).toFixed(1)} %`
const hours = (value: number) => `${(value / 3600).toFixed(2)} h`
/** "2026-11-14T06:12:09Z" → "06:12:09 UTC". */
const utcTime = (timestamp: string) => `${timestamp.slice(11, 19)} UTC`
const EVENT: Record<string, string> = {
  sunrise: 'Sun rises',
  sunset: 'Sun sets',
  earthrise: 'Earth rises',
  earthset: 'Earth sets',
  grazing: 'Sun grazes the horizon',
}
const DISK: Record<string, string> = { fully_visible: 'fully up', partially_visible: 'partly up', obscured: 'hidden' }
const coordinate = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} · ${(((lon % 360) + 360) % 360).toFixed(3)}°E`
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
}
const button =
  'inline-flex items-center gap-2 rounded-md border border-line-strong px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:bg-white/[0.04]'

const STATE_HEADLINE = {
  loading: 'Computing…',
  not_computed: 'Not computed yet',
  unsupported: 'Not available for this site',
  unavailable: 'The science service is unavailable',
  failed: 'The computation failed',
} as const

export function ReferenceStateMessage({ row }: { row: ReferenceState | PlannerRow }) {
  if (row.state === 'computed') return null
  return (
    <div role="status" aria-busy={row.state === 'loading'} className="grid gap-1 rounded-lg border border-line p-4">
      <p className="font-medium">{STATE_HEADLINE[row.state]}</p>
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
          {REFERENCE_SITES.map((site) => (
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
          ['Sun in view', percentage(result.metrics.sunlightAvailabilityFraction)],
          ['Earth in view', percentage(result.metrics.directEarthAvailabilityFraction)],
          ['Longest without Sun', hours(result.metrics.longestDarkness.durationS)],
          ['Longest without Earth', hours(result.metrics.longestDirectEarthBlackout.durationS)],
        ].map(([label, value]) => (
          <dl key={label} className="grid gap-1 rounded-xl border border-line p-4">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="readout text-xl">{value}</dd>
          </dl>
        ))}
      </div>
      <p className="text-sm text-ink-muted text-pretty">
        Over {longDate(result.period.startUtc.slice(0, 10))}, midnight to midnight UTC.
        {result.metrics.longestDarkness.touchesCoverageBoundary && ' The longest stretch without Sun runs past the edge of the day.'}
        {result.metrics.longestDirectEarthBlackout.touchesCoverageBoundary &&
          ' The longest stretch without Earth runs past the edge of the day.'}
      </p>
      <ReferenceStateMessage row={instant} />
      {now && (
        <div aria-label="The sky at the selected moment" className="grid gap-2 rounded-xl border border-line p-4">
          <h2 className="font-medium">At {utcTime(now.timestampUtc)}</h2>
          <p className="text-sm">
            <span className="text-sun">Sun</span> {DISK[now.sun.diskState] ?? now.sun.diskState} (
            {Math.round(now.sun.visibleDiskFraction * 100)} % of the disk), {now.sun.elevationDeg.toFixed(1)}° up at azimuth{' '}
            {now.sun.azimuthDeg.toFixed(1)}°, {Math.abs(now.sun.clearanceDeg).toFixed(1)}° {now.sun.clearanceDeg >= 0 ? 'above' : 'below'}{' '}
            the terrain.
          </p>
          <p className="text-sm">
            <span className="text-comms">Earth</span> {now.earth.centerVisible ? 'in view' : 'hidden'}, {now.earth.elevationDeg.toFixed(1)}°
            up at azimuth {now.earth.azimuthDeg.toFixed(1)}°, {Math.abs(now.earth.clearanceDeg).toFixed(1)}°{' '}
            {now.earth.clearanceDeg >= 0 ? 'above' : 'below'} the terrain.
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
      <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
        The white line is the horizon the engine computed, never below 0°. The Sun and Earth tracks join samples ten minutes apart; the
        readings above are computed for the exact moment.
      </p>
      <ReferenceVisibilityLanes response={response} />
      <section aria-label="Refined daily visibility events" className="grid gap-3">
        <h2 className="text-xl font-medium">Rises and sets this day</h2>
        {events.length ? (
          <ul className="grid gap-1.5 text-sm">
            {events.map((event) => (
              <li key={`${event.body}-${event.timestampUtc}-${event.eventType}`} className="flex gap-4">
                <span className="readout w-28 shrink-0 text-ink-muted">{utcTime(event.timestampUtc)}</span>
                <span>{EVENT[event.eventType] ?? event.eventType}</span>
                <span className="text-ink-faint">± {event.numericalToleranceS} s</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Nothing rises or sets this day.</p>
        )}
      </section>
      <details className="text-sm">
        <summary className="cursor-pointer">Full engine response and provenance</summary>
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
      <header className="grid gap-4">
        <div className="grid max-w-[48rem] gap-2">
          <p className="text-sm font-medium text-story-ink">
            {site.site.terrainResolutionM === GLOBAL_TERRAIN_M ? 'Live check · exploratory' : 'Live check'}
          </p>
          <h1 className="text-[clamp(1.75rem,1.3rem+1.8vw,2.75rem)] leading-[1.08] font-medium text-balance">{site.site.name}</h1>
          <p className="text-ink-muted text-pretty">
            The Sun and Earth over a day and a year at this spot, computed on request
            {site.site.terrainResolutionM === GLOBAL_TERRAIN_M
              ? ' from global terrain about 1.9 km apart, so small ridges are missed.'
              : ' from the 80 m south-polar terrain.'}
          </p>
        </div>
        <ReferenceControls site={site} date={view.date} minute={view.minute} go={go} onSite={onSite} />
        <div className="flex flex-wrap gap-3">
          {MOON_SITES.some((entry) => entry.id === site.site.id) && (
            <a className={button} href={`/analyze?sites=${site.site.id}&day=${view.date}&t=${view.minute}&step=result`}>
              Plan a landing here
              <ArrowRightIcon aria-hidden weight="bold" />
            </a>
          )}
          {hasTerrain(site.site.id) && (
            <Link className={button} to="/explore/$siteId" params={{ siteId: site.site.id }} search={{ day: view.date, t: view.minute }}>
              <CubeIcon aria-hidden />
              Explore in 3D
            </Link>
          )}
          <button type="button" onClick={view.refresh} className={`${button} cursor-pointer`}>
            <ArrowsClockwiseIcon aria-hidden />
            Compute again
          </button>
        </div>
      </header>
      {site.catalogue && (
        <section
          aria-label="Where this position comes from"
          className="grid gap-x-8 gap-y-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-3"
        >
          <div className="grid gap-1">
            <p className="text-ink-muted">Position</p>
            <p className="readout">{coordinate(site.catalogue.latitudeDeg, site.catalogue.longitudeDegEast)}</p>
            <p className="text-xs text-ink-faint first-letter:uppercase">{site.catalogue.locationRole}</p>
          </div>
          <div className="grid gap-1">
            <p className="text-ink-muted">Observer</p>
            <p>{site.site.observer_height_m} m above the terrain map’s ground</p>
            <p className="text-xs text-ink-faint">
              {site.catalogue.publishedElevationM === null
                ? 'No published elevation.'
                : `Published elevation ${site.catalogue.publishedElevationM.toLocaleString('en-GB')} m, from its own source and datum.`}
            </p>
          </div>
          <div className="grid content-start gap-1.5">
            <a
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink"
              href={site.catalogue.coordinateSource}
              target="_blank"
              rel="noreferrer"
            >
              Position from {host(site.catalogue.coordinateSource)}
              <ArrowSquareOutIcon aria-hidden />
            </a>
            <Link to="/sites" className="underline underline-offset-2 hover:text-ink">
              All landing sites
            </Link>
          </div>
        </section>
      )}
      <ReferenceDayView site={site} view={view} />
      <section aria-label="Dynamic annual scientific reference" className="grid gap-5 rounded-xl border border-line p-5">
        <h2 className="text-2xl font-medium">The year {year}</h2>
        <p role="status" className="text-sm">
          {annual.state === 'computed'
            ? `All ${dates.length} days computed.`
            : `${daily.size} of ${dates.length} days computed${annual.state === 'loading' ? ' so far' : ''}.`}
        </p>
        {annual.state !== 'unsupported' && annual.state !== 'loading' && <p className="text-sm text-ink-muted">{annual.message}</p>}
        {annual.state === 'loading' && (
          <button type="button" onClick={annual.stop} className={`${button} w-fit cursor-pointer`}>
            Stop computing the year
          </button>
        )}
        {summary && (
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ['Sun in view', percentage(summary.sunlightAvailabilityFraction)],
              ['Earth in view', percentage(summary.directEarthAvailabilityFraction)],
              ['Longest without Sun', hours(summary.longestDarkness.durationS)],
              ['Longest without Earth', hours(summary.longestDirectEarthBlackout.durationS)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="readout text-xl">{value}</dd>
              </div>
            ))}
            {(summary.longestDarkness.touchesCoverageBoundary || summary.longestDirectEarthBlackout.touchesCoverageBoundary) && (
              <p className="col-span-2 text-sm text-ink-muted lg:col-span-4">
                {summary.longestDarkness.touchesCoverageBoundary && 'The longest stretch without Sun runs past the edge of the year. '}
                {summary.longestDirectEarthBlackout.touchesCoverageBoundary &&
                  'The longest stretch without Earth runs past the edge of the year.'}
              </p>
            )}
          </dl>
        )}
        <p className="text-sm text-ink-muted">
          Each day shows its sunlight in amber and Earth in view in blue; a dashed day isn’t computed yet. Pick a day to see it above. The
          year is searched hour by hour.
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
          <summary className="cursor-pointer">How the year is computed, and its limits</summary>
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
