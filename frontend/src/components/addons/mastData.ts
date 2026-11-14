import { type LegacyMastData, MastFeedV1 } from '~/lib/feed-schemas'
import type { MastFeedV1 as MastFeedV1Data } from '~/lib/scientificContract.generated'
import computed from './mastData.computed.json'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** "Landing" at the reference point, otherwise distance and compass direction from it, e.g. "80 m S". */
export function spotLabel(eastM: number, northM: number) {
  const d = Math.hypot(eastM, northM)
  if (d < 0.5) return 'Landing'
  const bearing = (Math.atan2(eastM, northM) * 180) / Math.PI
  return `${Math.round(d)} m ${COMPASS[Math.round((bearing + 360) / 45) % 8]}`
}

/**
 * The mission science service's placement feed in the shape the mast views draw. Outcomes the service could not
 * compute are dropped, never filled in; every number kept is the service's own.
 */
export function toMastViews(feed: MastFeedV1Data): LegacyMastData {
  return {
    schema_version: 1,
    origin: 'computed',
    provenance: {
      algorithm_version: feed.scenarioId,
      sources: ['Skyline mission science service, mast placement evaluation'],
      assumptions: [feed.rule],
    },
    site_id: feed.site_id,
    period: { start_utc: feed.period.start_utc, end_utc: feed.period.end_utc },
    rule: feed.rule,
    candidates: feed.candidates.flatMap((c) => {
      const outcomes = c.outcomes.flatMap((o) =>
        o.metrics
          ? [
              {
                mast_m: o.observerHeightM,
                sun_share: o.metrics.sunlightAvailabilityFraction,
                longest_no_sun_h: o.metrics.longestDarkness.durationS / 3600,
                longest_no_sun_truncated: o.metrics.longestDarkness.touchesCoverageBoundary,
                earth_center_share: o.metrics.directEarthAvailabilityFraction,
                longest_no_earth_h: o.metrics.longestDirectEarthBlackout.durationS / 3600,
                longest_no_earth_truncated: o.metrics.longestDirectEarthBlackout.touchesCoverageBoundary,
                potential_vertical: o.panels?.vertical ?? 0,
                potential_horizontal: o.panels?.horizontal ?? 0,
                potential_tracking: o.panels?.tracking ?? undefined,
              },
            ]
          : [],
      )
      if (outcomes.length === 0 || c.groundElevationM == null) return []
      return [
        {
          id: spotLabel(c.eastM, c.northM),
          east_m: c.eastM,
          north_m: c.northM,
          ground_m: c.groundElevationM,
          slope_deg: c.estimatedSlopeDeg ?? null,
          outcomes,
        },
      ]
    }),
  }
}

/** The worked example: one computed run at Connecting Ridge, checked against the feed contract on load. */
export const MAST_EXAMPLE = toMastViews(MastFeedV1.parse(computed))
