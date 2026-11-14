import { expect, test } from 'vitest'
import { loadSummary, MOON_SITES } from './data'
import { DAY_MS, landingDay, siteSpans } from './mission'
import { PROFILES } from './profiles'

const ids = new Set(MOON_SITES.map((s) => s.id))

test.each(PROFILES)('profile "$id" names only computed Moon sites', (p) => {
  for (const id of p.sites) expect(ids.has(id), id).toBe(true)
})

// A template that opens on "nothing works" teaches nothing, so each one must open with at least one site that works.
test.each(PROFILES)('profile "$id" opens with at least one site that works', async (p) => {
  const start = Date.parse(`${p.day}T00:00:00Z`) + p.t * 60_000
  const statuses = await Promise.all(
    p.sites.map(async (id) => landingDay(siteSpans(await loadSummary(id)), start, p.stay * DAY_MS, p.requirements)),
  )
  expect(statuses).toContain('go')
})
