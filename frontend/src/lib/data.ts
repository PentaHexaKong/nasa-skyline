import { z } from 'zod'
import referenceCatalogueJson from '../data/generated/catalogue/sites.json'
import sitesJson from '../data/generated/sites.json'

const isoDate = z.iso.date()

/**
 * The two terrain maps the live engine reads, by their nominal spacing in metres (`localResolutionM`). Polar: LOLA's
 * 80 m south-polar map. Global: LOLA's LDEM_16, 16 pixels a degree on the 1737.4 km sphere, about 1895 m at the
 * equator, coarse and exploratory. The engine and its schemas use the same two numbers.
 */
export const POLAR_TERRAIN_M = 80
export const GLOBAL_TERRAIN_M = 1895.21
export type TerrainResolutionM = typeof POLAR_TERRAIN_M | typeof GLOBAL_TERRAIN_M

export const DaySchema = z.object({
  date: isoDate,
  daylight_min: z.number().nonnegative(),
  direct_min: z.number().nonnegative(),
  /** Moon sites: minutes with any part of Earth's disc above the skyline. */
  earth_min: z.number().nonnegative().optional(),
})

/** Earth seen from a Moon site, sampled hourly over the whole day. */
export const EarthTrackSchema = z.object({
  t_min: z.array(z.number()),
  az_deg: z.array(z.number()),
  el_deg: z.array(z.number()),
  fraction: z.array(z.number().min(0).max(1)),
})

export const TrackSchema = z.object({
  t_min: z.array(z.number()),
  az_deg: z.array(z.number()),
  el_deg: z.array(z.number()),
  direct_fraction: z.array(z.number().min(0).max(1)),
  earth: EarthTrackSchema.optional(),
})

/** Moon sites: line of sight to Earth, the direct-to-Earth comms target. */
export const EarthSchema = z.object({
  model: z.string(),
  rule: z.string(),
  /** Headline share: Earth's centre above the skyline (the method's default rule). */
  visible_share: z.number().min(0).max(1),
  center_share: z.number().min(0).max(1),
  /** Optimistic share: any part of Earth's disc above the skyline. */
  any_share: z.number().min(0).max(1).optional(),
})

export const SummarySchema = z.object({
  kind: z.literal('lunar'),
  site: z.object({
    body: z.literal('moon').default('moon'),
    frame: z.string().optional(),
    id: z.string(),
    name: z.string(),
    lat_deg: z.number(),
    lon_deg_east: z.number(),
    observer_height_m: z.number(),
    ground_height_m: z.number(),
    source: z.string(),
    reference: z.string(),
  }),
  conventions: z.record(z.string(), z.string()),
  params: z.object({
    start: isoDate,
    days: z.number().int().positive(),
    step_min: z.number().positive(),
    track_step_min: z.number().positive(),
    az_step_deg: z.number().positive(),
    skyline_max_km: z.number().positive(),
  }),
  provenance: z.object({
    algorithm_version: z.string(),
    dem_product: z.string(),
    frame: z.string(),
    // Windowed remote DEMs carry a URL and ETag instead of a checksum.
    dem: z.array(
      z
        .looseObject({ file: z.string().optional(), url: z.string().optional() })
        .refine((d) => d.file || d.url, 'a DEM entry needs a file or a URL'),
    ),
    kernels: z.array(z.object({ file: z.string(), sha256: z.string() })),
    known_limits: z.array(z.string()),
  }),
  skyline: z.object({ az_step_deg: z.number().positive(), elevation_deg: z.array(z.number()) }),
  summary: z.object({
    direct_share_of_daylight: z.number().nullable(),
    dark_days: z.number().int(),
    longest_dark_stretch_days: z.number().int(),
    longest_dark_first_day: isoDate.nullable(),
    longest_dark_last_day: isoDate.nullable(),
    // Added in algorithm 0.3.0: counts polar-night days too.
    longest_no_direct_stretch_days: z.number().int().optional(),
    longest_no_direct_first_day: isoDate.nullable().optional(),
    longest_no_direct_last_day: isoDate.nullable().optional(),
  }),
  earth: EarthSchema.optional(),
  earth_intervals: z.array(z.tuple([z.string(), z.string()])).optional(),
  intervals: z.array(z.tuple([z.string(), z.string()])),
  days: z.array(DaySchema).nonempty(),
})

export type Summary = z.infer<typeof SummarySchema>

export function requiresScientificRefresh(summary: Summary) {
  return summary.provenance.algorithm_version !== '0.5.0'
}

/**
 * A site's reference note as readers see it. The pipeline's notes carry to-dos for the team ("find a primary source
 * before citing"); those stay in the data and are left off the page, while the claim keeps its "Unverified" mark.
 */
export const readerReference = (text: string) =>
  text
    .replace(/\s*Unverified: find a primary source before citing\./i, ' Unverified.')
    .replace(/\s*Find a primary source before citing\./i, '')
    .trim()
export type Day = z.infer<typeof DaySchema>
export type Track = z.infer<typeof TrackSchema>
export type EarthTrack = z.infer<typeof EarthTrackSchema>

/**
 * Something comms need line of sight to: Earth, seen from the site.
 * `arc` is Earth's path over the day; `lane` is visibility through the day.
 */
export type SkyTarget = {
  kind: 'earth'
  label: string
  margin_deg: number
  arc: { az_deg: number; el_deg: number; clearance_deg: number }[]
  reference: { name: string; az_deg: number; el_deg: number; clearance_deg: number; visible: boolean }
  /** Minutes of this UTC day with line of sight, from the 1 s intervals. */
  lane?: [number, number][]
}

export const SITES = z
  .array(z.object({ id: z.string(), name: z.string(), body: z.literal('moon').default('moon') }))
  .min(1)
  .parse(sitesJson)
export const REFERENCE_SITES = referenceCatalogueJson
export type SiteId = string
export const MOON_SITES = SITES.filter((s) => s.body === 'moon')

/** Metadata for live scientific pages, with results obtained from the versioned API. */
export type ReferenceSite = {
  site: { id: string; name: string; observer_height_m: number; terrainResolutionM?: TerrainResolutionM }
  params: { start: string }
  catalogue?: (typeof REFERENCE_SITES)[number]
}

const referenceSiteSchema = z.object({
  site: z.object({
    id: z.string(),
    name: z.string(),
    observer_height_m: z.number().nonnegative(),
    terrainResolutionM: z.union([z.literal(POLAR_TERRAIN_M), z.literal(GLOBAL_TERRAIN_M)]).optional(),
  }),
  params: z.object({ start: isoDate }),
})

export async function loadReferenceSite(id: SiteId): Promise<ReferenceSite> {
  const entry = REFERENCE_SITES.find((site) => site.id === id)
  if (!entry) throw new Error(`No reference catalogue entry for site "${id}"`)
  return {
    ...referenceSiteSchema.parse({
      site: { id: entry.id, name: entry.name, observer_height_m: entry.observerHeightM, terrainResolutionM: entry.terrainResolutionM },
      params: { start: entry.referenceStartUtc },
    }),
    catalogue: entry,
  }
}

const summaries = import.meta.glob<{ default: unknown }>('../data/generated/*.summary.json')
const tracks = import.meta.glob<{ default: unknown }>('../data/generated/*.tracks.json')

function loader<T>(table: typeof summaries, id: string, kind: string, schema: z.ZodType<T>) {
  const load = table[`../data/generated/${id}.${kind}.json`]
  if (!load) throw new Error(`No ${kind} data for site "${id}"`)
  return load().then((m) => schema.parse(m.default))
}

export const loadSummary = (id: SiteId) => loader(summaries, id, 'summary', SummarySchema)
export const loadTracks = (id: SiteId) => loader(tracks, id, 'tracks', z.record(isoDate, TrackSchema))

export const TerrainSchema = z.object({
  site_id: z.string(),
  file: z.string(),
  n: z.number().int().positive(),
  radius_km: z.number().positive(),
  cell_m: z.number().positive(),
  ground_height_m: z.number(),
  observer_height_m: z.number(),
  min_m: z.number(),
  max_m: z.number(),
  skyline_inside_share: z.number().min(0).max(1),
  tier: z.enum(['inner', 'outer']).default('inner'),
  body: z.literal('moon').default('moon'),
})
export type TerrainMeta = z.infer<typeof TerrainSchema>
export type Terrain = { meta: TerrainMeta; heights: Int16Array }

const terrainMeta = import.meta.glob<{ default: unknown }>('../data/generated/terrain/*.json')
const terrainBin = import.meta.glob<string>('../data/generated/terrain/*.bin', { query: '?url', import: 'default' })

export const hasTerrain = (id: SiteId, tier: 'inner' | 'outer' = 'inner') =>
  `../data/generated/terrain/${tier === 'outer' ? `${id}.outer` : id}.json` in terrainMeta

/** Sites computed a short walk apart, to show how much a small move changes (C8). Each names the other. */
export const NEIGHBOURS: Record<string, SiteId> = {
  'connecting-ridge': 'shackleton-ridge',
  'shackleton-ridge': 'connecting-ridge',
}

const MOON_RADIUS_M = 1_737_400

/** Great-circle distance over the Moon's reference sphere, in metres. */
export function surfaceMetres(a: { lat_deg: number; lon_deg_east: number }, b: { lat_deg: number; lon_deg_east: number }) {
  const r = Math.PI / 180
  const h =
    Math.sin(((b.lat_deg - a.lat_deg) * r) / 2) ** 2 +
    Math.cos(a.lat_deg * r) * Math.cos(b.lat_deg * r) * Math.sin(((b.lon_deg_east - a.lon_deg_east) * r) / 2) ** 2
  return 2 * MOON_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Sites with a 3D terrain tile: the ones Explore, Understand and the lab can stand on. The others are for planning only. */
export const MAP_SITES = MOON_SITES.filter((s) => hasTerrain(s.id))

/** Heights in metres, rows north to south. ponytail: Int16Array reads platform byte order; every browser target is little-endian. */
export async function loadTerrain(id: SiteId, tier: 'inner' | 'outer' = 'inner'): Promise<Terrain> {
  const file = tier === 'outer' ? `${id}.outer` : id
  const meta = terrainMeta[`../data/generated/terrain/${file}.json`]
  const bin = terrainBin[`../data/generated/terrain/${file}.bin`]
  if (!meta || !bin) throw new Error(`No ${tier} terrain for site "${id}"`)
  const [m, url] = await Promise.all([meta().then((x) => TerrainSchema.parse(x.default)), bin()])
  const heights = new Int16Array(await (await fetch(url)).arrayBuffer())
  if (heights.length !== m.n * m.n) throw new Error(`Terrain for "${id}" has ${heights.length} cells, expected ${m.n ** 2}`)
  return { meta: m, heights }
}

/** Hourly sub-solar and sub-Earth points on the Moon (ME frame) for the computed window; lights the globe. */
export const MoonEphemerisSchema = z.object({
  start: z.string(),
  step_h: z.number().positive(),
  frame: z.string(),
  subsolar_lat_deg: z.array(z.number()),
  subsolar_lon_deg_east: z.array(z.number()),
  subearth_lat_deg: z.array(z.number()),
  subearth_lon_deg_east: z.array(z.number()),
})
export type MoonEphemeris = z.infer<typeof MoonEphemerisSchema>
const moonEphemeris = import.meta.glob<{ default: unknown }>('../data/generated/moon/ephemeris.json')

let ephemeris: Promise<MoonEphemeris> | null = null
/** Parsed once: every page that shows the Moon gets the same object. */
export function loadMoonEphemeris() {
  ephemeris ??= (async () => {
    const load = moonEphemeris['../data/generated/moon/ephemeris.json']
    if (!load) throw new Error('No Moon ephemeris; run the lunar pipeline')
    return MoonEphemerisSchema.parse((await load()).default)
  })()
  // A failed load is not kept, so the next page can try again.
  ephemeris.catch(() => {
    ephemeris = null
  })
  return ephemeris
}
