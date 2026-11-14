import { beforeAll, expect, test } from 'vitest'
import { loadSummary, MOON_SITES, type Summary } from '~/lib/data'
import { siteResult } from '~/lib/mission'
import { planSearch, stepOf } from './plan'
import { addonsSearch, resolvePlan, reviewSearch } from './resolvePlan'

let all: Summary[]
beforeAll(async () => {
  all = await Promise.all(MOON_SITES.map((s) => loadSummary(s.id)))
})

test('review to scenario to review keeps every mission setting and baseline unchanged', () => {
  const search = planSearch.parse({
    profile: 'lunar-day',
    step: 'result',
    sites: 'shackleton-rim,connecting-ridge',
    focus: 'shackleton-rim',
    day: '2026-12-05',
    base: '2026-12-01',
    t: 389,
    stay: 12,
    minSun: 52,
    maxNoSun: 49,
    minEarth: 35,
    maxNoEarth: 82,
  })
  const initial = resolvePlan(all, search)
  const scenario = resolvePlan(all, reviewSearch(search, initial.focus))
  const returned = resolvePlan(all, planSearch.parse(reviewSearch(search, scenario.focus)))
  expect(returned).toEqual(initial)
  expect(scenario).toEqual(initial)
  expect(reviewSearch(search, initial.focus)).toEqual(search)
})

test('an unedited profile stays unedited after visiting a scenario', () => {
  const initial = resolvePlan(all, {})
  const returned = resolvePlan(all, reviewSearch({}, initial.focus))
  expect(returned.edited).toBe(false)
  expect(returned).toEqual(initial)
})

test('an unknown site, focus or out-of-range date falls back consistently', () => {
  const plan = resolvePlan(all, planSearch.parse({ sites: 'unknown', focus: 'unknown', day: '2099-01-01' }))
  expect(plan.date).toBe(plan.profile.day)
  expect(plan.sites.length).toBeGreaterThan(0)
  // Falls back to the first site that works, so follow-ups open on a result; to the first site when none works.
  const working = plan.sites.find((s) => siteResult(s).works)
  expect(plan.focus).toBe((working ?? plan.sites[0])?.data.site.id)
})

test('stays outside the computed coverage remain uncomputed on scenario pages', () => {
  const end = all[0]?.days.at(-1)?.date
  const plan = resolvePlan(all, planSearch.parse({ day: end, stay: 60 }))
  expect(plan.sites.every((s) => s.stay === null && s.checks === null)).toBe(true)
})

test('older review links open Result, where Review now lives', () => {
  expect(stepOf(planSearch.parse({ step: 'review' }).step)).toBe('result')
  expect(stepOf('dates')).toBe('dates')
  expect(stepOf(undefined)).toBeUndefined()
})

test('Add-ons is a step of its own and keeps a valid tool in the URL', () => {
  expect(planSearch.parse({ step: 'addons', piece: 'mast' })).toEqual({ step: 'addons', piece: 'mast' })
  expect(planSearch.parse({ step: 'addons', piece: 'telescope' })).toEqual({ step: 'addons' })
  expect(stepOf('addons')).toBe('addons')
})

test('opening an add-on keeps every mission setting and the baseline', () => {
  const search = planSearch.parse({
    profile: 'lunar-day',
    step: 'result',
    sites: 'shackleton-rim',
    day: '2026-12-05',
    stay: 12,
    minSun: 52,
  })
  const addons = addonsSearch(search, 'relay')
  expect(addons).toEqual({ ...search, step: 'addons', piece: 'relay' })
  expect(resolvePlan(all, planSearch.parse(addons))).toEqual(resolvePlan(all, search))
})

test('after a slip, each site says whether the original day worked, by the same rule as the new one', () => {
  const base = resolvePlan(all, { profile: 'lunar-day', day: '2026-12-01' })
  const slipped = resolvePlan(all, { profile: 'lunar-day', day: '2026-12-08', base: '2026-12-01' })
  expect(base.sites.every((s) => s.wasGo === null)).toBe(true)
  for (const [i, s] of slipped.sites.entries()) {
    expect(s.wasGo).toBe(siteResult(base.sites[i] as (typeof base.sites)[number]).works)
  }
})
