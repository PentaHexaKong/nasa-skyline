import type { Requirements } from './mission'

/**
 * Starting points for the planner: which sites, when, how long, and what the stay must give.
 * The thresholds are examples a user is expected to change, not requirements from any mission or source.
 * Each opens on a day when at least one of its sites works (see profiles.test.ts), so a template never starts at a dead end.
 */
export type Profile = {
  id: string
  name: string
  /** One line: what the profile asks. */
  pitch: string
  sites: string[]
  day: string
  /** Minute of the landing day, UTC. */
  t: number
  stay: number
  requirements: Requirements
}

export const PROFILES = [
  {
    id: 'week-lander',
    name: 'Week-long lander',
    pitch: 'A short solar-powered stay at the south pole.',
    sites: ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'],
    day: '2026-11-20',
    t: 12 * 60,
    stay: 7,
    requirements: { minSun: 70, maxNoSun: 72, minEarth: 40, maxNoEarth: 96 },
  },
  {
    id: 'lunar-day',
    name: 'Through one lunar day',
    pitch: 'Stay 14 days and see how long the dark and silent gaps get.',
    sites: ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'],
    day: '2026-11-17',
    t: 12 * 60,
    stay: 14,
    requirements: { minSun: 60, maxNoSun: 120, minEarth: 40, maxNoEarth: 120 },
  },
  {
    id: 'talk-to-earth',
    name: 'Talk to Earth often',
    pitch: 'Contact with Earth matters more than sunlight.',
    sites: ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'],
    day: '2026-11-20',
    t: 12 * 60,
    stay: 7,
    requirements: { minSun: 40, maxNoSun: 168, minEarth: 70, maxNoEarth: 24 },
  },
  {
    id: 'month-on-ridge',
    name: 'A month on high ground',
    pitch: 'A long stay on the polar ridge and rims, where the Sun lingers.',
    sites: ['connecting-ridge', 'de-gerlache-rim', 'shackleton-rim'],
    day: '2026-12-14',
    t: 12 * 60,
    stay: 29,
    requirements: { minSun: 80, maxNoSun: 100, minEarth: 40, maxNoEarth: 336 },
  },
  {
    id: 'pole-vs-equator',
    name: 'Pole versus equator',
    pitch: 'The same stay at Apollo 11 and at the south pole: Earth never sets at one, the Sun barely sets at the other.',
    sites: ['apollo11', 'connecting-ridge', 'shackleton-rim'],
    // Apollo 11 sunrise is 14 Dec 14:35 UTC and sunset 29 Dec 10:14 UTC, so this stay sits inside one lunar day there.
    day: '2026-12-15',
    t: 12 * 60,
    stay: 13,
    requirements: { minSun: 80, maxNoSun: 48, minEarth: 80, maxNoEarth: 48 },
  },
] as const satisfies readonly Profile[]

export type ProfileId = (typeof PROFILES)[number]['id']
export const PROFILE_IDS = PROFILES.map((p) => p.id) as [ProfileId, ...ProfileId[]]
export const DEFAULT_PROFILE = PROFILES[0]

export const profileById = (id: string | undefined): Profile => PROFILES.find((p) => p.id === id) ?? DEFAULT_PROFILE
