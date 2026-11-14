import { expect, test } from 'vitest'
import rim from '../../data/shackleton-rim.json'
import type { Summary } from './data'
import { defaultDay } from './useSiteView'

const moon = (days: { date: string; direct_min: number; daylight_min: number }[]) =>
  ({ site: { body: 'moon' }, summary: {}, days }) as unknown as Summary

test('a hill-top site skips days whose Sun track is empty, because the Sun stays below the flat horizon', () => {
  const site = moon([
    { date: '2027-02-05', direct_min: 1376.7, daylight_min: 0 },
    { date: '2027-03-15', direct_min: 288.6, daylight_min: 88.5 },
  ])
  expect(defaultDay(site)).toBe('2027-03-15')
})

test('Shackleton Rim opens on a day that has a Sun track to draw', () => {
  const site = rim as unknown as Summary
  const day = defaultDay(site)
  expect(site.days.find((d) => d.date === day)?.daylight_min).toBeGreaterThan(0)
})
