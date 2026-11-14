import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { deliveredFeeds } from '../data/generated/feedIndex'
import { FEED_SCHEMAS, MastManifest, PowerManifest, RelayManifest } from './feed-schemas'

export type FeedName = keyof typeof FEED_SCHEMAS
export type FeedData<N extends FeedName> = z.infer<(typeof FEED_SCHEMAS)[N]>

export type Feed<T> =
  | { state: 'loading' }
  /** No file delivered yet: an expected state, shown as "not computed". */
  | { state: 'not_computed'; path: string; reason?: string }
  /** A file exists but breaks the contract: never shown as a result. */
  | { state: 'invalid'; path: string; issues: string[] }
  | { state: 'ready'; data: T }

type Glob = Record<string, () => Promise<{ default: unknown }>>

const scenarioManifests = { power: PowerManifest, relay: RelayManifest, mast: MastManifest }
const scenarioPatterns = { power: /^mast-power-[0-9a-f]{64}$/, relay: /^relay-feed-[0-9a-f]{64}$/, mast: /^mast-placement-[0-9a-f]{64}$/ }

const delivered = new Map(Object.entries(deliveredFeeds))
// Dev only, so synthetic numbers cannot reach a production build.
const fixtures: Glob = import.meta.env.DEV ? import.meta.glob<{ default: unknown }>('../../fixtures/feeds/**/*.json') : {}

function fixturesOn() {
  if (!import.meta.env.DEV) return false
  try {
    if (new URLSearchParams(location.search).has('fixtures')) sessionStorage.setItem('fixtures', '1')
    return sessionStorage.getItem('fixtures') === '1'
  } catch {
    return false
  }
}

export async function loadFeed<N extends FeedName>(name: N, siteId?: string, scenarioId?: string): Promise<Feed<FeedData<N>>> {
  const path = `${siteId ? `${name}/${siteId}` : name}.json`
  const load = delivered.get(path) ?? (fixturesOn() ? fixtures[`../../fixtures/feeds/${path}`] : undefined)
  if (!load) return { state: 'not_computed', path }
  let value = (await load()).default
  if (
    (name === 'power' || name === 'relay' || name === 'mast') &&
    value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    value.schemaVersion === `skyline-${name}-manifest/1.0.0`
  ) {
    const scenarioName = name as keyof typeof scenarioManifests
    const manifest = scenarioManifests[scenarioName].safeParse(value)
    if (!manifest.success || manifest.data.siteId !== siteId)
      return { state: 'invalid', path, issues: [`Invalid ${name} scenario manifest`] }
    if (!scenarioId) return { state: 'not_computed', path, reason: `Select a complete ${name} scenario identity` }
    if (!scenarioPatterns[scenarioName].test(scenarioId)) return { state: 'invalid', path, issues: [`Invalid ${name} scenario identity`] }
    const scenarioPath = `${name}/scenarios/${scenarioId}.json`
    const scenarioLoad = delivered.get(scenarioPath)
    if (!scenarioLoad) return { state: 'not_computed', path: scenarioPath }
    value = (await scenarioLoad()).default
  }
  if ((name === 'power' || name === 'relay' || name === 'mast') && scenarioId) {
    if (!value || typeof value !== 'object') return { state: 'invalid', path, issues: [`Invalid ${name} scenario payload`] }
    const identity = value as { site_id?: string; scenarioId?: string; scenario?: { scenarioId?: string } }
    if (identity.site_id !== siteId || (name === 'power' ? identity.scenario?.scenarioId : identity.scenarioId) !== scenarioId)
      return { state: 'invalid', path, issues: [`${name} scenario identity mismatch`] }
  }
  const parsed = FEED_SCHEMAS[name].safeParse(value)
  if (!parsed.success) return { state: 'invalid', path, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
  return { state: 'ready', data: parsed.data as FeedData<N> }
}

export function useFeed<N extends FeedName>(name: N, siteId?: string, scenarioId?: string) {
  const [feed, setFeed] = useState<Feed<FeedData<N>>>({ state: 'loading' })
  useEffect(() => {
    let live = true
    setFeed({ state: 'loading' })
    loadFeed(name, siteId, scenarioId).then((f) => {
      if (live) setFeed(f)
    })
    return () => {
      live = false
    }
  }, [name, siteId, scenarioId])
  return feed
}

/**
 * True once the pipeline has delivered this feed. For a per-site feed, pass the sites on screen: it is delivered only if
 * one of them has its own file, so a feed computed for other points (the science engine's CR1, GR1 and SR1 study points)
 * never stands in for an app site. Without sites, any file of the feed counts. Fixtures do not count.
 */
export function feedDelivered(name: FeedName, siteIds?: string[]) {
  if (siteIds) return siteIds.some((id) => delivered.has(`${name}/${id}.json`))
  return delivered.has(`${name}.json`) || [...delivered.keys()].some((k) => k.startsWith(`${name}/`))
}

/**
 * Dev shows every panel, delivered or not, so the science side can see what each one waits for.
 * Production shows a panel only once its feed exists for the sites on screen: an empty slot reads as unfinished work.
 */
export const showFeed = (name: FeedName, siteIds?: string[]) => import.meta.env.DEV || feedDelivered(name, siteIds)
