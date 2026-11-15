import { Badge } from '@cloudflare/kumo/components/badge'
import { Button } from '@cloudflare/kumo/components/button'
import { Tabs } from '@cloudflare/kumo/components/tabs'
import { WarningCircleIcon } from '@phosphor-icons/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { Plan } from '~/components/planner/plan'
import { type RelayLadder as Ladder, RELAY_MAX_S, type RelayStep, suggestedRelays, useRelayLadder } from '~/lib/relayLive'
import { shortDate } from '~/lib/time'
import { ComputingMark, SkeletonRows } from './Computing'
import { RelayDial, RelayFill, RelayGaps } from './RelayViews'
import { COUNT, duration, pct } from './relayTrack'
import { useArrival } from './useArrival'

const Relay3D = lazy(() => import('./Relay3D'))

/** Seconds since `running` turned on, ticking once a second, so a long computation visibly moves. */
function useElapsed(running: boolean) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) return
    setS(0)
    const t = window.setInterval(() => setS((x) => x + 1), 1000)
    return () => window.clearInterval(t)
  }, [running])
  return s
}

function headline(steps: RelayStep[], n: number) {
  const base = steps[0]
  const best = steps[n]
  if (!base || !best) return 'Relay coverage for your stay'
  if (n === 0)
    return base.share > 0.995
      ? 'Earth stays in view for the whole stay, so a relay adds nothing here'
      : 'A relay on this orbit adds no contact for this stay'
  return `${COUNT[n]} ${n === 1 ? 'lifts' : 'lift'} contact with Earth from ${pct(base.share)} to ${pct(best.share)} of the stay`
}

function Rows({ ladder, minEarth }: { ladder: Ladder; minEarth: number }) {
  const n = suggestedRelays(ladder.steps)
  const direct = ladder.steps[0]?.share ?? 0
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Contact with Earth for each number of relays, with what each added relay buys</caption>
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="pb-2 font-normal">
              Relays
            </th>
            <th scope="col" className="w-full pb-2 pl-3 font-normal max-sm:hidden sm:pl-4">
              Contact over the stay
            </th>
            <th scope="col" className="pb-2 pl-3 sm:pl-4 text-right font-normal">
              Contact
            </th>
            <th scope="col" className="pb-2 pl-3 sm:pl-4 text-right font-normal whitespace-nowrap">
              Added
            </th>
            <th scope="col" className="pb-2 pl-3 sm:pl-4 text-right font-normal">
              Longest silence
            </th>
          </tr>
        </thead>
        <tbody>
          {ladder.steps.map((step) => {
            const pick = step.relays === n
            return (
              <tr key={step.relays} className={`border-t border-line ${pick ? 'bg-white/[0.04]' : ''}`}>
                <th scope="row" className="py-2.5 pr-2 text-left font-normal whitespace-nowrap">
                  <span className={pick ? 'font-medium' : ''}>{step.relays === 0 ? 'Direct only' : `+${step.relays}`}</span>
                  {pick && <span className="text-xs text-ink-muted max-sm:block sm:ml-2">Suggested</span>}
                </th>
                <td className="py-2.5 pl-3 sm:pl-4 max-sm:hidden">
                  <div className="relative h-2 rounded-full bg-surface ring-1 ring-line ring-inset" aria-hidden>
                    {/* Direct contact in Earth cyan; what the relays add on top in relay pink, dashed, so the two never read as one. */}
                    <div className="absolute inset-y-0 left-0 rounded-l-full bg-comms" style={{ width: `${direct * 100}%` }} />
                    {step.share > direct && (
                      <div
                        className="lane-relay absolute inset-y-0"
                        style={{ left: `${direct * 100}%`, width: `${(step.share - direct) * 100}%` }}
                      />
                    )}
                    <div className="absolute -inset-y-1 border-l-2 border-ink" style={{ left: `${minEarth}%` }} />
                  </div>
                </td>
                <td className="tabular py-2.5 pl-3 sm:pl-4 text-right whitespace-nowrap">{pct(step.share)}</td>
                <td className="tabular py-2.5 pl-3 sm:pl-4 text-right whitespace-nowrap text-ink-muted">
                  {step.relays === 0 ? '' : step.gain < 0.0005 ? 'Nothing' : `+${(step.gain * 100).toFixed(1)} pts`}
                </td>
                <td className="tabular py-2.5 pl-3 sm:pl-4 text-right whitespace-nowrap">{duration(step.longestSilenceS)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted" aria-label="Key">
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-5 rounded-full bg-comms" />
          Direct to Earth
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="lane-relay h-2 w-5" />
          Added by relays
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="h-3 border-l-2 border-ink" />
          Your limit, at least {minEarth} %
        </li>
      </ul>
    </>
  )
}

type View = '3d' | 'ladder' | 'dial' | 'gaps'
const VIEWS: { value: View; label: string }[] = [
  { value: '3d', label: 'In 3D' },
  { value: 'ladder', label: 'Ladder' },
  { value: 'dial', label: 'Dial' },
  { value: 'gaps', label: 'Gap ledger' },
]

/** The comparison drawn four ways; 3D only when the service sent the relays' positions. */
function Views({ ladder, plan }: { ladder: Ladder; plan: Plan }) {
  const site = (plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0])?.data.site
  const in3d = !!ladder.track.relayKm?.length && !!site
  const offered = in3d ? VIEWS : VIEWS.filter((v) => v.value !== '3d')
  const [view, setView] = useState<View>(in3d ? '3d' : 'ladder')

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs variant="segmented" size="sm" tabs={offered} value={view} onValueChange={(v) => setView(v as View)} />
        {!in3d && <p className="text-sm text-ink-muted">The 3D view needs relay positions, and this comparison did not return them.</p>}
      </div>
      {view === '3d' && site ? (
        <Suspense fallback={<div className="aspect-[4/3] w-full outline -outline-offset-1 outline-line lg:max-w-[44rem]" />}>
          <Relay3D ladder={ladder} site={site} />
        </Suspense>
      ) : view === 'dial' ? (
        <RelayDial ladder={ladder} />
      ) : view === 'gaps' ? (
        <RelayGaps ladder={ladder} limitH={plan.requirements.maxNoEarth} />
      ) : (
        <RelayFill ladder={ladder} />
      )}
    </div>
  )
}

/** Relay coverage for the plan's own stay, computed live: direct contact, then one to four relays on the Candidate 2 orbit. */
export function RelayLadder({ plan }: { plan: Plan }) {
  const siteId = plan.focus ?? ''
  const stayS = Math.round((plan.window.end - plan.window.start) / 1000)
  const [attempt, setAttempt] = useState(0)
  const load = useRelayLadder(siteId, plan.window.start, stayS, attempt)
  const elapsed = useElapsed(load.status === 'loading')
  const arrival = useArrival(load.status === 'loading')

  if (load.status === 'unavailable')
    return (
      <section aria-labelledby="relay-result" className="flex gap-3 rounded-xl border border-line-strong px-4 py-3.5">
        <span className="flex h-lh items-center">
          <WarningCircleIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </span>
        <div className="grid justify-items-start gap-1">
          <h2 id="relay-result" className="font-medium">
            Relay coverage is unavailable right now
          </h2>
          {load.retryable ? (
            <>
              <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
                The relay service didn’t answer. Try again in a moment, or pick a shorter stay in Set up.
              </p>
              <p className="readout text-2xs text-ink-faint">{load.message}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </Button>
            </>
          ) : (
            <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">{load.message}</p>
          )}
        </div>
      </section>
    )

  const ladder = load.status === 'ready' ? load.ladder : null
  const verified = ladder?.tier === 'verified-replay'
  const n = ladder ? suggestedRelays(ladder.steps) : 0
  const days = Math.min(stayS, RELAY_MAX_S) / 86400

  return (
    <section aria-labelledby="relay-result" aria-busy={!ladder} className="grid gap-5 rounded-xl border border-line px-5 py-4 lg:py-5">
      <div className="flex items-start gap-5">
        {!ladder && <ComputingMark kind="relay" className="mt-1 max-sm:hidden" />}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {!ladder ? (
                <>
                  Computing · <span className="tabular">{elapsed}</span> s
                </>
              ) : verified ? (
                'Verified replay'
              ) : (
                'Computed · not validated'
              )}
            </Badge>
          </div>
          <h2 id="relay-result" className="max-w-[48ch] text-xl leading-snug font-medium text-balance">
            {ladder ? headline(ladder.steps, n) : 'Working out what relays add to your stay…'}
          </h2>
          <p className="max-w-[72ch] text-sm text-ink-muted text-pretty">
            {!ladder
              ? `The relay service follows each relay over ${days < 1 ? 'your stay' : `${Math.round(days)} days`}, then checks every moment against the site's skyline. Long stays take up to a minute.`
              : n > 0 && ladder.steps[n + 1]
                ? `After ${n === 1 ? 'the first relay' : `${COUNT[n]?.toLowerCase()}`}, each one more adds under half a point of contact.`
                : `Your stay from ${shortDate(plan.date)}${ladder.truncated ? `, first ${Math.round(days)} days of ${plan.stay}` : ''}, checked every ${ladder.cadenceS / 60} min.`}
          </p>
        </div>
      </div>

      {!ladder && <SkeletonRows rows={5} />}

      {ladder && (
        <div className={`grid gap-5 ${arrival}`}>
          <Views ladder={ladder} plan={plan} />
          <div className="grid gap-3 border-t border-line pt-4">
            <h3 className="text-sm font-medium">Contact for each number of relays</h3>
            <Rows ladder={ladder} minEarth={plan.requirements.minEarth} />
          </div>
          <div className="grid max-w-[72ch] gap-2 border-t border-line pt-4 text-sm text-ink-muted text-pretty">
            <p>
              <span className="max-sm:hidden">
                The tick on each bar is your limit, Earth in view at least {plan.requirements.minEarth} % of the stay.{' '}
              </span>
              Contact means a straight line of sight, site to relay to Earth, sampled every {ladder.cadenceS / 60} min
              {ladder.truncated ? `, over the first ${Math.round(days)} days of your ${plan.stay}-day stay` : ''}. It is not a radio link,
              capacity or guaranteed contact.
            </p>
            <p>
              {verified
                ? 'These relays fly the saved Candidate 2 orbit for January 2025, replayed from its verified file.'
                : 'These relays fly the verified Candidate 2 orbit, run forward to your dates with the Moon’s gravity alone. Earth’s pull on the orbit is left out, so accuracy away from January 2025 is not validated. Relays three and four are extra spacecraft on the same orbit.'}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
