import { Lanes } from '~/components/Lanes'
import type { Plan, PlanActions } from '~/components/planner/plan'
import { useDayPreview, Year } from '~/components/planner/SiteSelector'
import { type PlannerRows, plannerHeadline, scientificMeasure, scientificTouchdown } from '~/lib/dynamicPlanner'
import { evaluate, REQUIREMENTS, TOUCHDOWN_LABEL } from '~/lib/mission'

const percent = (fraction: number) => `${(fraction * 100).toFixed(1)} %`

export function ScientificBaseline({ plan, rows, refresh }: { plan: Plan; rows: PlannerRows; refresh: () => void }) {
  return (
    <section aria-label="Scientific mission baseline" className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <h2 aria-live="polite" className="text-2xl font-medium">
            {plannerHeadline(rows, plan)}
          </h2>
          <p className="text-sm text-ink-muted">The scientific engine evaluates supported missions through the Go API.</p>
        </div>
        <button type="button" className="cursor-pointer underline underline-offset-3" onClick={refresh}>
          Re-evaluate mission
        </button>
      </header>
      {plan.sites.map((site) => {
        const row = rows[site.data.site.id]
        if (row?.state !== 'computed')
          return (
            <article key={site.data.site.id} className="grid gap-2 rounded-xl border border-line p-5" aria-busy={row?.state === 'loading'}>
              <h3 className="text-lg font-medium">{site.data.site.name}</h3>
              <p role="status">{row?.state ?? 'not_computed'}</p>
              <p className="text-ink-muted">{row && 'message' in row ? row.message : 'Evaluation pending.'}</p>
            </article>
          )
        const { response } = row
        const { result, provenance } = response
        const measure = scientificMeasure(response)
        const checks = evaluate(measure, plan.requirements)
        const sample = result.samples[0]!
        const works = checks.passed && scientificTouchdown(response) === 'both'
        return (
          <article key={site.data.site.id} className="grid gap-5 rounded-xl border border-line p-5">
            <header className="grid gap-1">
              <h3 className="text-lg font-medium">{site.data.site.name}</h3>
              <p>{works ? 'Meets touchdown and mission requirements' : 'Misses touchdown or mission requirements'}</p>
              <p className="text-sm text-ink-muted">At touchdown · {TOUCHDOWN_LABEL[scientificTouchdown(response)]}</p>
            </header>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {REQUIREMENTS.map((requirement) => {
                const pass = checks.checks.find((check) => check.key === requirement.key)!.pass
                const boundary =
                  requirement.key === 'maxNoSun'
                    ? measure.noSun.truncated
                    : requirement.key === 'maxNoEarth'
                      ? measure.noEarth.truncated
                      : false
                return (
                  <div key={requirement.key} className={`grid gap-1 rounded-lg border p-3 ${pass ? 'border-go/40' : 'border-miss/50'}`}>
                    <dt className="text-xs text-ink-muted">{requirement.label}</dt>
                    <dd className="readout text-xl">
                      {requirement.read(measure).toFixed(1)} {requirement.unit}
                    </dd>
                    <dd className="text-xs">
                      {pass ? 'Meets' : 'Misses'} {requirement.bound} {plan.requirements[requirement.key]} {requirement.unit}
                    </dd>
                    {boundary && <dd className="text-xs text-ink-muted">Touches evaluation boundary</dd>}
                  </div>
                )
              })}
            </dl>
            <Lanes
              window={measure.window}
              label={`${site.data.site.name} scientific visibility intervals`}
              lanes={[
                { key: 'sun', label: 'Sun', spans: measure.sun, fill: 'bg-sun', value: percent(measure.sunShare) },
                { key: 'earth', label: 'Earth', spans: measure.earth, fill: 'bg-comms', value: percent(measure.earthShare) },
              ]}
            />
            <p className="text-sm text-ink-muted">
              Mean visible solar-disk fraction {result.metrics.meanVisibleSolarDiskFraction.toFixed(3)}. Sunlight uses{' '}
              {result.solarVisibility.availabilityRule}. Earth visibility uses its center. Communication is geometric.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer">Tracks, source identities and scientific limitations</summary>
              <div className="mt-3 grid gap-3 break-words text-ink-muted">
                <p>
                  Observer {result.observer.siteId} · {result.observer.latitudeDeg}° latitude · {result.observer.longitudeDegEast}° east ·{' '}
                  {result.observer.observerHeightM} m above terrain · {result.observer.frame}.
                </p>
                <p>
                  UTC window [{result.period.startUtc}, {result.period.endUtc}). Duration {result.period.durationS} SPICE ET seconds.
                </p>
                <p>
                  At {sample.timestampUtc}, Sun azimuth {sample.sun.azimuthDeg.toFixed(3)}°, elevation {sample.sun.elevationDeg.toFixed(3)}
                  °, clearance {sample.sun.clearanceDeg.toFixed(3)}°. Earth azimuth {sample.earth.azimuthDeg.toFixed(3)}°, elevation{' '}
                  {sample.earth.elevationDeg.toFixed(3)}°, clearance {sample.earth.clearanceDeg.toFixed(3)}°.
                </p>
                <p>
                  {result.samples.length} track samples · {result.cadenceS} s cadence · {provenance.scientificProfile} profile. Refined
                  events use {result.sunlightIntervals.detection.numericalRootToleranceS} s numerical tolerance. Possible missed Sun events{' '}
                  {String(result.sunlightIntervals.detection.possibleMissedEvents)}. Possible missed Earth events{' '}
                  {String(result.directEarthIntervals.detection.possibleMissedEvents)}.
                </p>
                <p>
                  Engine {provenance.engineVersion} · algorithm {provenance.algorithmVersion} · execution {provenance.execution} ·
                  validation {provenance.validationStatus} · independently validated {String(provenance.independentlyValidated)}.
                </p>
                <p className="font-mono text-xs">{response.scenarioId}</p>
                <ul className="grid gap-1 font-mono text-xs">
                  {provenance.dems.map((dem) => (
                    <li key={dem.sha256}>
                      {dem.filename} · {dem.resolutionM.join(' × ')} m · SHA-256 {dem.sha256}
                    </li>
                  ))}
                  {Object.entries(provenance.kernels).map(([name, hash]) => (
                    <li key={name}>
                      {name} · SHA-256 {hash}
                    </li>
                  ))}
                </ul>
                <ul className="list-disc pl-5">
                  {provenance.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            </details>
          </article>
        )
      })}
    </section>
  )
}

export function ScientificDates({ plan, actions }: { plan: Plan; actions: PlanActions }) {
  const preview = useDayPreview(plan, actions)
  return (
    <section className="grid gap-3 rounded-xl border border-line">
      <Year {...preview.year} />
      <p className="px-5 pb-4 text-sm text-ink-muted">Select a date to evaluate that mission. Other dates remain unevaluated.</p>
    </section>
  )
}
