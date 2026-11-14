# Mast-height science

Implemented in the independent mission-science engine for R1–R4, O2/O3/O5 and C2/C8/C9. The original orbital engine and frozen mission definitions receive no source edits.

## Height and position

Mast height is metres above the local interpolated terrain surface, along the spherical local radial up direction. The observer radius is 1737400 m plus the ground elevation sampled from the local DEM plus mast height. Horizontal coordinates, frame and coordinate source stay attached to the requested site. This uses a vertical radial mast and a horizontal reference plane perpendicular to local radial up.

Every height invokes the existing LOLA horizon builder with its own `HorizonConfig.observerHeightM`. The builder recalculates terrain-to-observer vectors, near-field bilinear rays, pixel-center annuli, sector maxima, neighbouring-sector envelope and far-terrain bound. The effective visibility horizon retains the existing zero-degree elevation floor and the request's common offset. No height-dependent angular offset is introduced.

SPICE `spkcpo` evaluates Sun and Earth from that height-specific Cartesian observer. Its ephemeris cache key contains the full observer position, profile, body, ET, frame, kernel identity and implementation identity. Intervals, event estimates and blackout metrics are recomputed from those tracks and the corresponding skyline.

The public scientific evaluation route accepts supported nonnegative heights. The legacy evaluation request retains its existing ground-level default and shape. The mast/power route compares each selected height with an automatically included 0 m baseline. Results return raw and effective skylines, full timestamped tracks, refined intervals, longest selected-rule darkness, center-based Earth blackout, panel scores and differences from ground.

## Support and provenance

The existing terrain model requires absolute radial ground/observer height within its configured global envelope. The default envelope is 20000 m relative to the reference sphere. For a valid local ground elevation g, the nonnegative mast-height upper bound is 20000 - g metres. This is a numerical geometry envelope. Structural, deployment and instrument validation remain outside this evaluator.

The site catalog adds `observerHeightSupport` with the continuous range, datum and engineering-certification flag. Its legacy `supportedObserverHeightsM` compatibility list retains the ground example. The new range descriptor and actual evaluation checks define the expanded support. Elevated environment geometry does not grant elevated-observer support to the independent nominal relay replay.

Terrain disk-cache identity includes geometric algorithm version, site coordinates/frame/source, reference radius, the entire horizon configuration including height, and raster source identities/content hashes. In-memory horizon identity additionally includes implementation/dependency identity. Full result identity includes height/configuration, request, resolved observer, kernel/DEM hashes, engine package version and implementation/dependency versions. Algorithm provenance is now 0.4.0. Panel orientation is included in mast/power scenario identity while environmental caches are safely shared across orientations.

## Versioned API

`POST /v1/mast-power-evaluations` is exposed through Go at `/api/mission-science/v1/mast-power-evaluations`. Request and response versions are `skyline-mast-power-request/1.0.0` and `skyline-mast-power-response/1.0.0`. Generated schemas are `contracts/mastPowerRequest.schema.json` and `contracts/mastPowerResponse.schema.json`. Frontend types and the typed client are generated/validated from the same models.

The request uses the existing site, UTC epoch, duration, cadence, profile, solar rule, horizon offset, DEM resolution and event settings. It adds `mastHeightsM` and a required `verticalAzimuthDeg`, normalized eastward clockwise from north into [0,360). The request-level `observerHeightM` is fixed at 0 to describe the comparison baseline. Selected heights are normalized to unique ascending values, with 0 included in the evaluation.

At most 16 selected heights are admitted. The aggregate height-count times duration/cadence is bounded to 6000 intervals, including the baseline, to stay within the existing bounded response transport. Individual height support remains governed by actual DEM coverage and the radial envelope. Failed, unavailable or unsupported evaluations return explicit states with null result. A batch succeeds after every requested height and baseline succeeds against consistent scientific sources.

The new mast route has a bounded 600 s Go evaluation budget, 605 s write deadline, 610 s Nginx read budget and 610 s feed-export client timeout. This accommodates measured cold terrain reconstruction across height batches. Existing routes retain their budgets. Scientific request admission remains serialized around the shared SPICE pool.

## Comparison and monotonicity

Height-specific raw skylines should be nonincreasing for the same site, terrain samples, basis and resolution. Every terrain-to-observer vertical component decreases as radial observer height increases. The maximum over the same sampled terrain therefore preserves this ordering. The comparison reports maximum positive raw-horizon change and a 1e-9 degree numerical check. That tolerance describes floating-point consistency.

Visibility and exposure changes retain their signed values. The effective zero-degree floor can remove further horizon benefit, finite-target parallax changes the target elevation, and numerical event refinement can move transition estimates. No unconditional monotonicity claim is imposed on availability or panel scores. Different terrain discretizations require a separate convergence comparison.

The 2025-01-06 benchmark evaluated 0, 2, 10 and 30 m at CR1, GR1 and SR1. All raised raw skylines passed the numerical monotonicity check. At CR1, ground-level any-disk availability was 1.0 while its mean visible-disk fraction was about 0.505122. At 2 m both were 1.0. This distinguishes sunlight availability from finite-disk exposure. The measured center-based Earth share rose from about 0.362571 at ground level to 0.752560 at 2 m. Subsequent 2-to-30 m Earth-share changes were below one second of window duration and remain subject to parallax and the 1 s event-refinement setting.

These metre-scale changes depend on bilinear interpolation of the 80 m DEM, including the near-field rays. Physical accuracy at metre scale and terrain-height uncertainty are unverified. The computed profiles provide conditional model comparisons.

## PowerFeed delivery

PowerFeeds retain schema version 1, canonical fractional shares and the established hour-valued longest-gap fields at this compatibility boundary. `mast_m` accepts 0, and `potential_tracking` is optional for older consumers. New scenario and panel-geometry metadata preserve the full request, site/observer, epoch, duration, heights, profile, vertical orientation, engine/algorithm versions and source scenario identities. Canonical mast API durations remain seconds.

The previous site-only feed shape cannot safely select among different mission windows. Delivery uses an immutable lookup manifest at `data/feeds/power/<site-id>.json` and immutable PowerFeed payloads at `data/feeds/power/scenarios/<mast-power-scenario-id>.json`. The manifest requires explicit selection and supplies a scenario path template. Existing legacy PowerFeed files retain their ordinary loading behaviour. A manifest without a selected scenario returns a visible selection-required state. No date, profile or height set is selected implicitly.

Use `python scripts/exportPowerFeed.py --request <request.json> --output-root data/feeds` from the independent engine environment. The default source is the actual Go mast/power route. `--api-url` and `--output-root` support another deployment and direct frontend delivery. Use `<repo root>/frontend/data/feeds` as the output root for the existing frontend synchronizer. Both manifest and payload publication use atomic exclusive writes. Conflicts with existing unrelated site files fail without replacing them.

`loadFeed('power', siteId, scenarioId)` and `useFeed` accept an optional third scenario argument. The PowerPanel accepts that identity and displays vertical orientation and ideal-tracking assumptions. Site reconciliation remains mandatory. CR1 is kept separate from the unresolved Shackleton frontend point.

## Reproduction and evidence

`python -m pytest -q -p no:cacheprovider` runs regression, analytical and real-data checks. `python scripts/benchmarkMastPower.py` rebuilds terrain in an empty temporary cache for three sites, repeats the cases with result memoization, compares three temporal cadences and a terrain-refinement pair, writes examples and publishes the CR1 PowerFeed scenario.

See `docs/mastHeightValidationReport.md` for test/integration results. Regenerate the measured values with `python scripts/benchmarkMastPower.py` in the mission-science environment. The benchmark's cold label refers to terrain/result caches. Operating-system file caching is uncontrolled. Measurements exclude HTTP transfer and JSON file export.
