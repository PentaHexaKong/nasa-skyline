# Mast placement methodology

Implemented for R1/R3/R4, O2/O3/O5 and C2/C8/C9. The evaluator lives in the independent mission-science engine and reuses its height-aware scientific path.

## Request and support

`POST /v1/mast-placement-evaluations` accepts `skyline-mast-placement-request/1.0.0`. Go exposes `/api/mission-science/v1/mast-placement-evaluations`. The response version is `skyline-mast-placement-response/1.0.0`. The request retains the scientific epoch, duration, cadence, profile, sunlight rule, center Earth rule, horizon offset, local DEM selection, event tolerance and mission `constraints`.

Additional inputs are canonical `site`, `searchRadiusM`, `gridResolutionM`, `mastHeightsM`, `maximumCableLengthM`, optional `maximumSlopeDeg`, optional `verticalAzimuthDeg` and `evaluationBudget`. The budget contains required `maxEvaluations` and optional `maxWallTimeS` with a 120 s default. A supplied vertical panel azimuth requests horizontal, vertical and ideal tracking exposure. An omitted azimuth leaves `panels=null`.

Support follows the validated canonical CR1, GR1 and SR1 catalog points, actual registered LOLA coverage and SPICE kernel epochs. An alias or unmatched frontend location receives an unsupported state. Each candidate uses DE421 mean-Earth coordinates, matching the terrain realization. The parent coordinate and its published provenance are preserved in `provenance.referenceSite`.

Input limits are 5000 m search radius, 49 generated locations, eight selected distinct heights, 64 scientific evaluations including the mandatory ground baseline, and 2000 aggregate sample intervals. The user may declare a smaller evaluation-count budget. Requests exceeding that count are rejected before scientific evaluation. Spatial enumeration also rejects an oversized lattice before allocating an unbounded grid. Scientific height support remains conditional on the configured radial-height envelope and actual DEM coverage.

The wall-time limit is 0.01–300 s. Admission is checked between complete scientific evaluations. An in-flight evaluation can overrun that limit. Remaining outcomes carry `not_computed`, `not_evaluated` feasibility and reason `wall_time_budget`. The result preserves computed outcomes and reports incomplete coverage. Go retains the existing mast route's 600 s budget, with 605 s write and 610 s Nginx/export budgets. This is a synchronous bounded enumerator with cooperative wall-time checks.

## Candidate coordinates

The lattice is centered at east/north offset (0,0), with both axes at integer multiples of `gridResolutionM`. Retain points whose Euclidean offset norm is at most `searchRadiusM`. Sort by distance, then north and east. This includes the zero offset exactly and produces deterministic enumeration.

Offsets are tangent vectors in the original site's local east/north basis. Let u be the reference site's unit radial vector, t the unit tangent direction, d the offset norm and R=1737400 m. The candidate direction is cos(d/R)u + sin(d/R)t. Latitude and signed east longitude are recovered from that unit vector. This is the spherical exponential map in the explicit DE421 frame. Radial projection to actual terrain follows DEM sampling. The inverse logarithmic map is supplied for round-trip validation.

Zero offset returns the exact canonical coordinates and identifier, preserving the ground-level cache and baseline identity. Every other point receives a deterministic identifier from reference coordinates/source, offsets, radius and mapping version. Its coordinate source explicitly identifies a generated SKYLINE offset from the quoted reference. Generated positions carry unverified physical coordinate and construction uncertainty.

## Terrain, slope and observer height

Every point samples actual local DEM radial elevation with the existing pixel-center bilinear interpolator. All four contributing cells must be valid. Missing center coverage yields unavailable terrain, null elevation and unranked unavailable outcomes. Ground elevation remains relative to the existing 1737400 m sphere.

Slope is estimated from radial-height differences at east/west/north/south geodesic probes. Each half-baseline is twice the larger projected pixel resolution, giving 160 m steps and a 320 m footprint for the 80 m raster. The slope is atan of the norm of the central-difference height gradient. Horizontal probe distances use the declared reference sphere. The deliberately coarse footprint supports a DEM-scale estimate, with uncalibrated physical terrain-normal accuracy. Grid spacing below the raster resolution is flagged `gridFinerThanDem`; interpolated subpixel points retain unresolved-microtopography flags.

If slope probes lack terrain, the known center elevation is preserved and slope becomes null with its coverage reason. A requested slope threshold then has unavailable feasibility. A computed DEM-scale slope exceeding the threshold creates a known infeasible case. Slope estimates describe the specified interpolation footprint and remain uncalibrated for rocks, bearing strength, small-scale roughness and construction.

For every evaluated height, the engine computes radius R + local ground elevation + mast height, rebuilds the entire skyline and evaluates observer-specific Sun and Earth tracks. Height is radial metres above local terrain. The evaluator preserves the solar-disk model, visibility floor, geometric/apparent profile, event detection, clipping indicators, durations, blackout metrics and physical uncertainty limitations.

The cable model is the great-circle surface offset on the reference sphere. Its length is exactly the tangent-offset norm under the exponential map. Vertical mast run, terrain-following route, routing obstacles and slack are omitted. The maximum cable constraint therefore governs this explicit geometric assumption.

## Feasibility and Pareto selection

Known cable and slope violations reject visibility evaluation for that outcome. The mandatory zero-offset ground baseline remains available for comparison. Unknown terrain or required slope support remains unavailable. After successful scientific evaluation, enforce minimum sunlight fraction, minimum direct-Earth fraction, maximum darkness duration and maximum direct-Earth blackout from the request's mission constraints. Equality at every threshold is feasible.

Pareto filtering applies to computed feasible location/height combinations. It maximizes direct-Earth and sunlight availability and minimizes longest direct-Earth blackout, longest darkness, cable distance and mast height. The implementation reuses the existing exact nondominated comparison, then peels successive fronts into ranks starting at zero. Infeasible, unknown and unevaluated outcomes have null rank. Duplicate objective vectors retain all nondominated identities.

The returned `paretoSet` identifies rank-zero location/height pairs. Numeric trade-off summaries report ranges over those pairs for all six objectives. Dominance uses exact computed values and the declared objective directions. Physical significance of small differences remains limited by terrain and numerical-event uncertainty. The result describes the generated grid and selected heights. `globalOptimalityClaimed=false` and `constructionSafetyValidated=false` are mandatory.

`optimization.complete` is true when every requested outcome has computed science or a known hard-constraint rejection. Unknown coverage or a wall-time cutoff makes it false. The rank scope always names computed feasible generated combinations, so a partial front remains conditional on unresolved locations/heights.

## Cache and scientific identity

The evaluator reuses the engine's bounded result, terrain and ephemeris caches. Terrain identity contains coordinates, frame/source, DEM content hashes, geometry version and the complete height-specific horizon configuration. Ephemeris identity contains full Cartesian observer position, epoch, frame/profile, kernel identity and implementation. Changing location or height creates its appropriate scientific cache identity. Repeated occurrences of an identical point/height/scenario across grids share scientific computation safely.

Each computed outcome retains its full scientific response, including skyline, tracks, intervals, observer, DEM/kernel hashes, implementation versions and source scenario identity. Inputs are checked against the common baseline, and the sampled DEM hash is checked before and after enumeration. Mixed scientific inputs cause an unavailable response. Placement identity includes normalized request, canonical baseline identity, candidate geometry, result states, ranks, source scenario identities and placement methodology. Performance timings and creation dates are excluded from that identity.

## MastFeed and FE compatibility

`MastFeedV1` has contract version `skyline-mast-feed/1.0.0`. Its schemas and TypeScript declarations derive from the authoritative Pydantic models. It preserves the compatibility envelope with `schema_version=1`, `origin`, `site_id`, period and provenance. Candidate rows contain actual coordinates, offsets, sampled terrain, slope support/quality, requested heights, explicit metric availability, feasibility, violations and server-computed Pareto ranks. Visibility durations remain seconds, angles degrees, positions metres and shares fractions.

`python scripts/exportMastFeed.py --request examples/mastPlacementRequest.json --output-root <repo root>/frontend/data/feeds` fetches the actual Go API, validates the typed response and publishes the feed. The site path `data/feeds/mast/<site-id>.json` holds a `skyline-mast-manifest/1.0.0` explicit-selection lookup. Immutable payloads live at `data/feeds/mast/scenarios/<mast-placement-id>.json`. Conflicting files fail publication. Identical export retains original bytes, ignoring only generation date and measured wall time for idempotency.

The frontend consumes `loadFeed('mast', siteId, scenarioId)` and the optional scenario parameter on `MastPanel`. Legacy feeds retain their existing display. Versioned feeds display authoritative feasibility and ranks, preserve missing metrics as unavailable and convert seconds/fractions at presentation boundaries. Scientific evaluation and Pareto ranking remain in the independent engine.

See `mast-placement-validation.md` for analytical tests, real-data demonstrations, spatial sensitivity and measured runtime/memory evidence.
