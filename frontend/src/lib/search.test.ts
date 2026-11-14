import { expect, test } from 'vitest'
import { planSearch } from '~/components/planner/plan'
import { Route as Planner } from '~/routes/analyze.index'
import { Route as Moon } from '~/routes/explore.index'
import { siteSearch } from './useSiteView'

const parse = (route: { options: { validateSearch?: unknown } }, input: object) =>
  (route.options.validateSearch as typeof siteSearch).parse(input)

test('the planner drops a bad value and keeps the good ones', () => {
  expect(parse(Planner, { step: 'nonsense', stay: 999, day: 'hello', sites: 5, minSun: 80 })).toEqual({ minSun: 80 })
})

test('the moon and site views drop a bad value and keep the good ones', () => {
  expect(parse(Moon, { view: 'nonsense', t: 720 })).toEqual({ t: 720 })
  expect(siteSearch.parse({ day: 'hello', t: 720 })).toEqual({ t: 720 })
})

test('add-on links keep valid mission inputs and drop the retired preview flag', () => {
  expect(planSearch.parse({ stay: 12, minSun: 80, preview: 1 })).toEqual({ stay: 12, minSun: 80 })
  expect(planSearch.parse({ stay: 999, minSun: 80, preview: 'nonsense' })).toEqual({ minSun: 80 })
})
