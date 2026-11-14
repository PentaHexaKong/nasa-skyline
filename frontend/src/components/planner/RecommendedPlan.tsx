import { Select } from '@cloudflare/kumo/components/select'
import { ArrowRightIcon, BroadcastIcon, CarIcon, SolarPanelIcon, XIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { Plan, PlanActions, PlanSearch } from '~/components/planner/plan'
import { verdictRows } from '~/components/planner/ResultStep'
import { addonsSearch } from '~/components/planner/resolvePlan'
import { Bubble, Mascot, type MascotPose } from '~/components/story'
import { type SitePlan, shortName, siteResult, verdict } from '~/lib/mission'
import { SCENARIO_PIECES, SCENARIOS, type ScenarioPiece, scenarioGuidance } from '~/lib/scenarios'
import { longDate, minuteLabel } from '~/lib/time'

const either = (xs: string[]) => new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(xs)
const ICON = { mast: SolarPanelIcon, relay: BroadcastIcon, rover: CarIcon } as const

/** One line per add-on for the site in focus, from the same whole-stay checks as the result. */
function addonLine(piece: ScenarioPiece, g: ReturnType<typeof scenarioGuidance>) {
  if (piece === 'mast')
    return g.sun.length
      ? { missed: g.sun, text: 'Panels on a mast can see over nearby ridges. Shown with a worked example from another site.' }
      : { missed: [], text: 'Sun limits are met. A worked example from another site shows what a mast changes.' }
  if (piece === 'relay')
    return g.earth.length
      ? { missed: g.earth, text: 'Relay satellites carry messages while Earth is hidden. Computed for your dates.' }
      : { missed: [], text: 'Earth limits are met. See how much contact one to four relays would add, computed for your dates.' }
  return { missed: [], text: 'How far a rover could drive while it has sunlight and contact, on this site’s terrain.' }
}

/** What the planner says about the site in focus, in plain words, with a fuller explanation behind "Tell me more". */
function guideSays(site: SitePlan, name: string): { pose: MascotPose; line: string; more: string } {
  const g = scenarioGuidance(site)
  if (!site.checks)
    return {
      pose: 'planner-confused',
      line: 'I can’t tell yet: this stay runs past the data we have.',
      more: 'We know where the Sun and Earth will be only up to a certain date. Pick an earlier landing or a shorter stay and every limit is checked again.',
    }
  if (g.sun.length && g.earth.length)
    return {
      pose: 'planner-thinking',
      line: `At ${name} the hills hide both the Sun and Earth too often. A mast and relays are the two fixes to look at.`,
      more: 'Near the Moon’s south pole the Sun and Earth both sit low in the sky, so ridges kilometres away can block them for days. A mast lifts the solar panels above some of those shadows, and relay satellites pass messages along while Earth is hidden. Another landing date may avoid both problems, so check the dates too.',
    }
  if (g.sun.length)
    return {
      pose: 'planner-thinking',
      line: `At ${name} the Sun drops behind the hills too long for the solar panels. A taller mast can see over them.`,
      more: 'Near the Moon’s south pole the Sun skims the horizon, so a ridge a few kilometres away can cast long shadows. Raising the panels on a mast lifts them out of some of those shadows. The mast tab shows the idea with a worked example from another site; it is not computed for your plan.',
    }
  if (g.earth.length)
    return {
      pose: 'planner-thinking',
      line: `At ${name} Earth sinks below the hills too often to radio home. Relay satellites can pass messages while it’s hidden.`,
      more: 'From the south pole, Earth sits low and rises and falls a little over each month, so hills block it for days at a time. A relay satellite in a high orbit can see both the lander and Earth and carry messages between them. The relay tab computes how much contact one to four relays add for your exact dates.',
    }
  if (site.touchdown !== 'both')
    return {
      pose: 'planner-pointing',
      line: `${name} is fine over the stay. It’s the moment of landing that misses the Sun or Earth, so try another landing time first.`,
      more: 'The lander needs sunlight and a line to Earth the moment it touches down, to charge and to report that it landed safely. Over the whole stay this site meets your limits, so a landing a few hours or days earlier or later may be all it takes.',
    }
  return {
    pose: 'planner-cheer',
    line: `${name} works: sunlight for the solar panels, and Earth in view to radio home.`,
    more: `Four things are checked over the whole stay: how much of the time sunlight reaches the panels, the longest stretch in the dark, how much of the time Earth is above the hills, and the longest stretch without it. ${name} clears every limit you set, and the Sun and Earth are in view at touchdown. The add-ons are extras: they can add margin, but this plan does not need them.`,
  }
}

/** The plan's answer first: where and when to land, then what each add-on would do for the site in focus. No scores, no ranking. */
export function RecommendedPlan({ plan, actions, search }: { plan: Plan; actions: PlanActions; search: PlanSearch }) {
  const site = plan.sites.find((s) => s.data.site.id === plan.focus) ?? plan.sites[0]
  if (!site) return null
  const v = verdict(verdictRows(plan), plan.slip)
  const working = plan.sites.filter((s) => siteResult(s).works).map((s) => shortName(s.data))
  const g = scenarioGuidance(site)
  const name = shortName(site.data)
  const says = guideSays(site, name)
  const order: ScenarioPiece[] = [...g.priority, ...SCENARIO_PIECES.filter((p) => !g.priority.includes(p))]

  return (
    <section aria-labelledby="plan-title" className="grid gap-8 border-y border-line py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-12">
      <div className="grid content-start gap-6">
        <div className="grid gap-2">
          <h2 id="plan-title" className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] leading-tight font-medium">
            Recommended plan
          </h2>
          {working.length > 0 ? (
            <p className="max-w-[60ch] text-lg leading-snug text-pretty">
              Land at {either(working)} on {longDate(plan.date)}, {minuteLabel(plan.minute)} UTC, for the {plan.stay}-day stay.{' '}
              <span className="text-ink-muted">
                {working.length === 1 ? 'It meets' : 'Each meets'} every limit, with the Sun and Earth in view at touchdown.
              </span>
            </p>
          ) : (
            <div className="grid gap-3">
              <p className="max-w-[60ch] text-lg leading-snug text-pretty">
                No site works for this landing yet. {v.next && <span className="text-ink-muted">{v.next}</span>}
              </p>
              <button
                type="button"
                onClick={() => actions.setStep('dates')}
                className="inline-flex w-max cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 py-2 hover:bg-surface-hover"
              >
                See every date <ArrowRightIcon aria-hidden />
              </button>
            </div>
          )}
        </div>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">
              Add-ons for {name} <span className="font-normal text-ink-muted">· {g.headline}</span>
            </h3>
            {plan.sites.length > 1 && (
              <div className="flex items-center gap-2">
                <span id="plan-site" className="text-sm text-ink-muted">
                  Site
                </span>
                <Select
                  aria-labelledby="plan-site"
                  className="w-48"
                  value={site.data.site.id}
                  items={Object.fromEntries(plan.sites.map((s) => [s.data.site.id, shortName(s.data)]))}
                  onValueChange={(next) => actions.go({ focus: String(next) })}
                />
              </div>
            )}
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {order.map((piece) => {
              const Icon = ICON[piece]
              const { missed, text } = addonLine(piece, g)
              const suggested = g.priority.includes(piece)
              return (
                <li key={piece}>
                  <Link
                    to="/analyze"
                    search={addonsSearch(search, piece, site.data.site.id)}
                    className="group grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3.5 hover:bg-surface-hover/50"
                  >
                    <span className="flex h-lh items-center">
                      <Icon aria-hidden className="size-5 text-ink-muted" />
                    </span>
                    <span className="grid gap-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{SCENARIOS[piece].name}</span>
                        <span className={`text-xs ${suggested ? 'font-medium text-ink' : 'text-ink-faint'}`}>
                          {suggested ? 'Suggested' : 'Optional'}
                        </span>
                      </span>
                      {missed.map((c) => (
                        <span key={c.key} className="text-sm">
                          <XIcon aria-label="Missed" weight="bold" className="mr-1 inline text-miss" />
                          {c.label}{' '}
                          <span className="tabular">
                            {c.value.toFixed(1)} {c.unit}
                          </span>
                          <span className="text-ink-muted">
                            , your limit {c.bound}{' '}
                            <span className="tabular">
                              {c.limit} {c.unit}
                            </span>
                          </span>
                        </span>
                      ))}
                      <span className="text-sm text-ink-muted text-pretty">{text}</span>
                    </span>
                    <span className="flex h-lh items-center gap-1 text-sm font-medium whitespace-nowrap group-hover:underline underline-offset-4">
                      Open <ArrowRightIcon aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      <div className="flex items-end gap-3 lg:self-start lg:pt-12">
        <Mascot pose={says.pose} className="size-24 shrink-0" />
        <Bubble className="mb-6" more={{ text: says.more }}>
          {says.line}
        </Bubble>
      </div>
    </section>
  )
}
