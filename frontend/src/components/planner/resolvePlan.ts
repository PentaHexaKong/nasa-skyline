import { elevationRange } from '~/components/Panorama'
import type { Plan, PlanSearch } from '~/components/planner/plan'
import type { Summary } from '~/lib/data'
import { DAY_MS, planSite, siteSpans } from '~/lib/mission'
import { profileById } from '~/lib/profiles'

const PROFILE_KEYS = ['sites', 'day', 'base', 't', 'stay', 'minSun', 'maxNoSun', 'minEarth', 'maxNoEarth'] as const

function scaleFor(sites: Summary[]) {
  const polar = (s: Summary) => Math.abs(s.site.lat_deg) >= 75
  const range = (group: Summary[]): [number, number] => {
    if (group.length === 0) return [-2, 8]
    const els = group.flatMap((s) => [...s.skyline.elevation_deg, 90 - Math.abs(s.site.lat_deg) + 7, 90 - Math.abs(s.site.lat_deg) - 8])
    return group.every(polar) ? [Math.min(-2, Math.floor(Math.min(...els))), Math.ceil(Math.max(...els)) + 1] : elevationRange(els)
  }
  const polarRange = range(sites.filter(polar))
  const otherRange = range(sites.filter((s) => !polar(s)))
  return (s: Summary): [number, number] => (polar(s) ? polarRange : otherRange)
}

/** One resolver for Review and its scenarios, including the same defaults and invalid-link fallbacks. */
export function resolvePlan(all: Summary[], p: PlanSearch): Plan {
  const profile = profileById(p.profile)
  const known = p.sites?.split(',').filter((id) => all.some((s) => s.site.id === id)) ?? []
  const chosen = all.filter((s) => (known.length > 0 ? known : profile.sites).includes(s.site.id))
  const dates = (all[0]?.days ?? []).map((d) => d.date)
  const found = p.day ? dates.indexOf(p.day) : -1
  const index = found >= 0 ? found : Math.max(0, dates.indexOf(profile.day))
  const date = dates[index] ?? profile.day
  const baseFound = p.base ? dates.indexOf(p.base) : -1
  const baseIndex = baseFound >= 0 && baseFound !== index ? baseFound : null
  const minute = p.t ?? profile.t
  const stay = p.stay ?? profile.stay
  const requirements = {
    minSun: p.minSun ?? profile.requirements.minSun,
    maxNoSun: p.maxNoSun ?? profile.requirements.maxNoSun,
    minEarth: p.minEarth ?? profile.requirements.minEarth,
    maxNoEarth: p.maxNoEarth ?? profile.requirements.maxNoEarth,
  }
  const start = Date.parse(`${date}T00:00:00Z`) + minute * 60_000
  const stayMs = stay * DAY_MS
  const scale = scaleFor(chosen)
  const mission = { dates, index, minute, stayMs, requirements, baseIndex }
  return {
    profile,
    edited: PROFILE_KEYS.some((k) => p[k] != null),
    all,
    sites: chosen.map((data) => planSite(data, siteSpans(data), scale(data), mission)),
    dates,
    index,
    date,
    minute,
    stay,
    requirements,
    window: { start, end: start + stayMs },
    base: baseIndex == null ? null : (dates[baseIndex] ?? null),
    slip: baseIndex == null ? 0 : index - baseIndex,
    focus: chosen.some((s) => s.site.id === p.focus) ? p.focus : chosen[0]?.site.id,
  }
}

/** Keep the validated URL settings intact on round trips, including whether the profile was edited. */
export const reviewSearch = (search: PlanSearch, focus?: string): PlanSearch => ({
  ...search,
  step: 'review',
  focus: focus ?? search.focus,
})
