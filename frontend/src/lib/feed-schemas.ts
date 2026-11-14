import { z } from 'zod'
import mastFeedSchema from './mastFeedV1.schema.json' with { type: 'json' }
import mastManifestSchema from './mastManifest.schema.json' with { type: 'json' }
import type { MastFeedV1 as MastFeedV1Data, MastManifest as MastManifestData } from './scientificContract.generated'

/**
 * The files the science pipeline delivers to the app, one schema per feed. These are the contract:
 * `pnpm contracts` writes them to contracts/feeds/ as JSON Schema for the Python side.
 * Conventions follow docs/science/metrics.md, except that gaps are in hours and shares are 0 to 1.
 */
const share = z.number().min(0).max(1)
const hours = z.number().nonnegative()
const utc = z.iso.datetime()
const siteId = z.string().min(1)

const envelope = {
  schema_version: z.literal(1),
  /** Anything not computed by the pipeline must say `fixture`, and the app labels it on screen. */
  origin: z.enum(['computed', 'fixture']),
  provenance: z.object({
    algorithm_version: z.string().min(1),
    sources: z.array(z.string().min(1)).min(1),
    assumptions: z.array(z.string().min(1)).min(1),
  }),
}

const period = z.object({ start_utc: utc, end_utc: utc })

/** What one observer height at one point gets over the period. */
const MastOutcome = z.object({
  mast_m: z.number().nonnegative(),
  sun_share: share,
  longest_no_sun_h: hours,
  longest_no_sun_truncated: z.boolean(),
  earth_center_share: share,
  longest_no_earth_h: hours,
  longest_no_earth_truncated: z.boolean(),
  /** `power_potential` averaged over the period. Unitless, not watts. */
  potential_vertical: share,
  potential_horizontal: share,
  potential_tracking: share.optional(),
})

const powerUtc = z.union([utc, z.string().regex(/^(?:\d{4}-06-30|\d{4}-12-31)T23:59:60(?:\.\d+)?Z$/)])

export const PowerManifest = z.object({
  schemaVersion: z.literal('skyline-power-manifest/1.0.0'),
  siteId,
  scenarioSelectionRequired: z.literal(true),
  scenarioPathTemplate: z.literal('scenarios/{scenarioId}.json'),
})

export const PowerFeed = z.object({
  ...envelope,
  site_id: siteId,
  period: z.object({ start_utc: powerUtc, end_utc: powerUtc }),
  outcomes: z.array(MastOutcome).min(1),
  scenario: z
    .object({
      scenarioId: z.string().regex(/^mast-power-[0-9a-f]{64}$/),
      siteId,
      startUtc: powerUtc,
      durationS: z.number().positive(),
      observerHeightsM: z.array(z.number().nonnegative()),
      profile: z.enum(['geometric', 'apparent']),
      verticalAzimuthDeg: z.number().min(0).lt(360),
      sourceScenarioIds: z.array(z.string()),
      request: z
        .object({ solarDefinition: z.enum(['center', 'anyDisk', 'fullDisk']) })
        .passthrough()
        .optional(),
      engineVersion: z.string().optional(),
      algorithmVersion: z.string().optional(),
      observer: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  panelGeometry: z
    .object({
      verticalAzimuthDeg: z.number().min(0).lt(360),
      incidenceModel: z.string(),
      trackingAssumption: z.string(),
    })
    .optional(),
})

export const LegacyMastFeed = z.object({
  ...envelope,
  site_id: siteId,
  period,
  /** The stated rule that produced the candidates, shown next to them. */
  rule: z.string().min(1),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        east_m: z.number(),
        north_m: z.number(),
        ground_m: z.number(),
        slope_deg: z.number().nonnegative().nullable(),
        outcomes: z.array(MastOutcome).min(1),
      }),
    )
    .min(1),
})

export const MastFeedV1 = (
  z.fromJSONSchema(mastFeedSchema as Parameters<typeof z.fromJSONSchema>[0]) as z.ZodType<MastFeedV1Data>
).superRefine((feed, context) => {
  for (const candidate of feed.candidates) {
    for (const outcome of candidate.outcomes) {
      if (
        (outcome.dataState === 'computed') !== (outcome.metrics !== null) ||
        (outcome.feasibilityStatus === 'feasible') !== (outcome.paretoRank !== null)
      ) {
        context.addIssue({ code: 'custom', message: 'Mast outcome state, metric availability or Pareto eligibility disagree' })
      }
    }
  }
})
export const MastManifest = z.fromJSONSchema(mastManifestSchema as Parameters<typeof z.fromJSONSchema>[0]) as z.ZodType<MastManifestData>
export const MastFeed = z.union([MastFeedV1, LegacyMastFeed.extend({ contractVersion: z.never().optional() })])
export type LegacyMastData = z.infer<typeof LegacyMastFeed>

const relayFeedShape = {
  ...envelope,
  site_id: siteId,
  period,
  /** In ladder order, starting with direct to Earth. */
  scenarios: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        orbit_status: z.enum(['none', 'published', 'indicative', 'illustrative']),
        source: z.string().min(1),
        as_of: z.iso.date(),
        contact_share: share,
        longest_gap_h: hours,
        longest_gap_truncated: z.boolean(),
        /** Contact spans as [start, end). */
        intervals: z.array(z.tuple([utc, utc])),
      }),
    )
    .min(1),
}

const relayInterval = z.object({
  startUtc: utc,
  endUtc: utc,
  startS: z.number().int().nonnegative(),
  endS: z.number().int().positive(),
  startClipped: z.boolean(),
  endClipped: z.boolean(),
})
const relayMetrics = z.object({
  fraction: share,
  availableDurationS: z.number().int().nonnegative(),
  longestBlackoutS: z.number().int().nonnegative(),
  longestBlackoutTouchesBoundary: z.boolean(),
  availableIntervals: z.array(relayInterval),
  blackoutIntervals: z.array(relayInterval),
})
const relayRequest = z.object({
  siteId: z.enum(['CR1', 'GR1', 'SR1']),
  startUtc: utc,
  durationS: z.number().int().min(120).max(86400),
})
const relayObserver = z.object({
  site: z.object({
    siteId: z.enum(['CR1', 'GR1', 'SR1']),
    name: z.string().min(1),
    latitudeDeg: z.number().min(-90).max(90),
    longitudeDeg: z.number().min(-180).max(180),
    sourceFrame: z.literal('MOON_ME_DE421'),
    sourceUrl: z.string().min(1),
  }),
  frame: z.literal('MOON_ME_DE421'),
  positionM: z.tuple([z.number(), z.number(), z.number()]),
  heightAboveTerrainM: z.literal(0),
  groundElevationM: z.number(),
  radialReferenceM: z.literal(1737400),
  longitudeConvention: z.literal('east-positive signed degrees'),
})
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
export const RelayManifest = z.object({
  schemaVersion: z.literal('skyline-relay-manifest/1.0.0'),
  siteId: z.enum(['CR1', 'GR1', 'SR1']),
  scenarioSelectionRequired: z.literal(true),
  scenarioPathTemplate: z.literal('scenarios/{scenarioId}.json'),
})

export const RelayFeedV1 = z
  .object({
    ...relayFeedShape,
    origin: z.literal('computed'),
    contractVersion: z.literal('skyline-relay-feed/1.0.0'),
    dataState: z.literal('computed'),
    scenarioId: z.string().regex(/^relay-feed-[0-9a-f]{64}$/),
    scenario: z.object({
      request: relayRequest,
      candidateId: z.literal('nominal-candidate-2'),
      profile: z.literal('geometric'),
      earthDefinition: z.literal('center'),
      horizonOffsetDeg: z.literal(0),
      terrainProfile: z.literal('lola-80-240-zero-mask'),
      observer: relayObserver,
      trajectory: z.object({
        candidateId: z.literal('nominal-candidate-2'),
        path: z.string().min(1),
        sha256,
        inputFrame: z.literal('J2000'),
        center: z.literal('MOON'),
        positionUnit: z.literal('km'),
        velocityUnit: z.literal('km/s'),
        epochUtc: z.literal('2025-01-01T00:00:00Z'),
        validStartUtc: z.literal('2025-01-01T00:00:00Z'),
        validEndUtc: z.literal('2025-01-29T00:00:00Z'),
        propagationModel: z.literal('saved two-body states, no new propagation'),
        satelliteCount: z.literal(2),
      }),
      sourceIdentity: z.object({
        algorithmVersion: z.literal('synchronized-relay-feed/1.0.0'),
        goImplementation: z.record(z.string(), sha256),
        request: relayRequest,
        candidateId: z.literal('nominal-candidate-2'),
        observer: relayObserver,
        terrainConfig: z.record(z.string(), z.number()),
        sources: z.record(z.string(), sha256),
        relayImplementation: z.record(z.string(), sha256),
        missionImplementation: z.object({
          sources: z.record(z.string(), sha256),
          dependencies: z.record(z.string(), z.string()),
          python: z.string().min(1),
        }),
        environmentCacheKey: sha256,
        sampleGrid: z.record(z.string(), z.unknown()),
        samples: z.object({
          directAvailable: z.array(z.boolean()).min(1),
          viaRelayAvailable: z.array(z.boolean()).min(1),
          assistedAvailable: z.array(z.boolean()).min(1),
          siteRelayAvailable: z.array(z.array(z.boolean()).min(1)).length(2),
          relayEarthAvailable: z.array(z.array(z.boolean()).min(1)).length(2),
        }),
      }),
    }),
    comparison: z.object({
      durationS: z.number().int().min(120).max(86400),
      grid: z.object({
        cadenceS: z.literal(120),
        sampleCount: z.number().int().min(1).max(720),
        timestampsUtc: z.array(utc).min(1).max(720),
        elapsedS: z.array(z.number().int().nonnegative()).min(1).max(720),
        endExclusive: z.literal(true),
        binDurationS: z.literal(120),
        timeScale: z.literal('SPICE ET seconds; UTC labels converted by SPICE'),
        endUtc: utc,
        replayEpochEt: z.number(),
        missionEpochEt: z.number(),
        epochDifferenceS: z.number().nonnegative().max(1e-6),
        epochToleranceS: z.literal(1e-6),
        nominalStartUtc: utc,
      }),
      samples: z.object({
        directAvailable: z.array(z.boolean()).min(1),
        viaRelayAvailable: z.array(z.boolean()).min(1),
        assistedAvailable: z.array(z.boolean()).min(1),
        siteRelayAvailable: z.array(z.array(z.boolean()).min(1)).length(2),
        relayEarthAvailable: z.array(z.array(z.boolean()).min(1)).length(2),
      }),
      direct: relayMetrics,
      assisted: relayMetrics,
      improvementFraction: share,
      intervalMethod: z.object({
        kind: z.literal('sample-derived'),
        convention: z.literal('half-open [start,end)'),
        representation: z.literal('left-endpoint 120-second bins'),
        transitionTimesRefined: z.literal(false),
        possibleMissedSubcadenceEvents: z.literal(true),
        physicalTransitionUncertaintyS: z.null(),
        boundaryContinuityKnown: z.literal(false),
      }),
      rfQualified: z.literal(false),
      rfAvailability: z.null(),
      continuousAvailabilityValidated: z.literal(false),
    }),
    validation: z.object({
      status: z.literal('computed-with-cross-service-consistency-checks'),
      independentlyValidated: z.literal(false),
      checks: z.array(z.string().min(1)).min(1),
    }),
  })
  .superRefine((feed, context) => {
    const { grid, samples, durationS, direct, assisted } = feed.comparison
    const request = feed.scenario.request
    const alignedArrays = [
      samples.directAvailable,
      samples.assistedAvailable,
      samples.viaRelayAvailable,
      ...samples.siteRelayAvailable,
      ...samples.relayEarthAvailable,
    ]
    const validShape =
      grid.sampleCount * 120 === durationS &&
      request.durationS === durationS &&
      feed.site_id === request.siteId &&
      feed.site_id === feed.scenario.observer.site.siteId &&
      grid.nominalStartUtc === request.startUtc &&
      grid.timestampsUtc.length === grid.sampleCount &&
      grid.elapsedS.length === grid.sampleCount &&
      alignedArrays.every((array) => array.length === grid.sampleCount) &&
      grid.elapsedS.every((value, index) => value === index * 120) &&
      feed.period.start_utc === grid.timestampsUtc[0] &&
      feed.period.end_utc === grid.endUtc
    if (!validShape) {
      context.addIssue({ code: 'custom', message: 'Relay scenario and common-grid shapes disagree' })
      return
    }
    for (let index = 0; index < grid.sampleCount; index++) {
      const via = samples.siteRelayAvailable.some((leg, satellite) => leg[index] && samples.relayEarthAvailable[satellite]?.[index])
      if (samples.viaRelayAvailable[index] !== via || samples.assistedAvailable[index] !== (samples.directAvailable[index] || via)) {
        context.addIssue({ code: 'custom', message: 'Relay communication hops disagree' })
        break
      }
    }
    for (const [index, metrics] of [direct, assisted].entries()) {
      const row = feed.scenarios[index]
      if (
        !row ||
        row.contact_share !== metrics.fraction ||
        row.longest_gap_h !== metrics.longestBlackoutS / 3600 ||
        row.longest_gap_truncated !== metrics.longestBlackoutTouchesBoundary ||
        JSON.stringify(row.intervals) !== JSON.stringify(metrics.availableIntervals.map((interval) => [interval.startUtc, interval.endUtc]))
      ) {
        context.addIssue({ code: 'custom', message: 'Relay presentation units or intervals disagree' })
      }
      const intervals = [...metrics.availableIntervals, ...metrics.blackoutIntervals].sort((left, right) => left.startS - right.startS)
      let cursor = 0
      for (const interval of intervals) {
        if (
          interval.startS !== cursor ||
          interval.endS <= interval.startS ||
          interval.endS > durationS ||
          interval.startClipped !== (interval.startS === 0) ||
          interval.endClipped !== (interval.endS === durationS) ||
          interval.startUtc !== grid.timestampsUtc[interval.startS / 120] ||
          interval.endUtc !== (interval.endS === durationS ? grid.endUtc : grid.timestampsUtc[interval.endS / 120])
        ) {
          context.addIssue({ code: 'custom', message: 'Relay interval partition or clipping disagrees' })
          break
        }
        cursor = interval.endS
      }
      if (cursor !== durationS) context.addIssue({ code: 'custom', message: 'Relay intervals do not cover the evaluation period' })
    }
  })

// A malformed versioned feed must retain its validation failure.
export const RelayFeed = z.union([RelayFeedV1, z.object({ ...relayFeedShape, contractVersion: z.never().optional() })])

export const RelayStudyFeed = z.object({
  ...envelope,
  period,
  search: z.object({
    method: z.string().min(1),
    candidates_tested: z.number().int().positive(),
    bounds: z.string().min(1),
  }),
  /** A cited requirement to preload. Null when the study has none. */
  target: z.object({ min_share: share, max_gap_h: hours, source: z.string().min(1) }).nullable(),
  site_ids: z.array(siteId).min(1),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        relay_count: z.number().int().positive(),
        family: z.string().min(1),
        by_site: z.record(siteId, z.object({ contact_share: share, longest_gap_h: hours })),
      }),
    )
    .min(1),
})

export const ValidationFeed = z.object({
  ...envelope,
  rows: z
    .array(
      z.object({
        site_id: siteId,
        ours: z.object({ sun_share: share, earth_any_share: share, period: z.string().min(1), observer_height_m: z.number() }),
        reference: z.object({ sun_share: share, earth_any_share: share, period: z.string().min(1), product: z.string().min(1) }),
        difference_notes: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
})

export type MastOutcome = z.infer<typeof MastOutcome>
export type PowerData = z.infer<typeof PowerFeed>
export type MastData = z.infer<typeof MastFeed>
export type RelayData = z.infer<typeof RelayFeed>
export type RelayStudyData = z.infer<typeof RelayStudyFeed>
export type StudyCandidate = RelayStudyData['candidates'][number]
export type ValidationData = z.infer<typeof ValidationFeed>

/** Feed name to schema. A per-site feed lives at `<name>/<site>.json`, a shared feed at `<name>.json`. */
export const FEED_SCHEMAS = {
  power: PowerFeed,
  mast: MastFeed,
  relay: RelayFeed,
  'relay-study': RelayStudyFeed,
  validation: ValidationFeed,
} as const
