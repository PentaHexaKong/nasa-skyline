# Scientific contract v1

Implemented for R1–R4, O3–O5 and O7. The independent mission-science engine remains the authority for scientific calculations.

## Routes and versions

`POST /v1/scientific-evaluations` is exposed through Go at `POST /api/mission-science/v1/scientific-evaluations`. Its request version is `skyline-scientific-request/1.0.0` and response version is `skyline-scientific-response/1.0.0`. The schemas are `contracts/scientificRequest.schema.json` and `contracts/scientificResponse.schema.json` in the application repository. The source models are `scientificModels.py` in the independent engine.

The endpoint is additive. Existing evaluation, comparison, optimization, site-catalog and relay routes retain their request and response schemas. Algorithm provenance reports 0.3.0, which preserves coverage endpoints and does not merge intervals across an intervening outage.

## Request

The request includes `site`, `startUtc`, `durationS`, `cadenceS`, `profile`, `solarDefinition`, `earthDefinition`, `observerHeightM`, `horizonOffsetDeg`, `localResolutionM` and `eventToleranceS`. Defaults and field bounds are in the request schema. UTC input requires an explicit zero offset. The server additionally enforces duration/cadence <= 6000 intervals and cadence <= duration.

A site can be a verified catalog identifier or explicit caller-supplied DE421 coordinates with their source URL. Custom `latitudeDeg` is planetocentric and `longitudeDeg` is east-positive, accepting the [-360,360] input range. The response normalizes `longitudeDegEast` to [0,360). Source coordinates supplied by a caller retain computed-only validation status. The three registered ROI centers are supported subject to actual asset, terrain and epoch coverage. Unresolved frontend string identifiers return `unsupported`. Since algorithm 0.4.0, nonnegative additional observer heights are evaluated by rebuilding the terrain skyline and observer position, subject to the actual radial envelope. See `mast-height-science.md`. Geometric uses `NONE`; apparent uses site-topocentric `LT+S` at the observation epoch.

## States and missing data

Every response explicitly carries `dataState`, `schemaVersion`, `units` and `error`. A computed response requires a complete `result`, provenance, normalized request and scenario ID. Other states require null result and provenance plus a reason. JSON Schema uses a discriminated union. Response defaults are removed from the exported schema so consumers cannot manufacture missing values while parsing.

| State | Meaning |
| --- | --- |
| computed | The engine evaluated the stated scenario and the result passed structural and cross-field invariants. |
| unsupported | The requested catalog site or additional observer height lacks a supported scientific mapping/profile. |
| not_computed | A component or producer has no computation to report. The response model supports this state and RF connectivity is explicitly marked not computed. |
| unavailable | Required scientific assets, terrain extent, ephemeris coverage or service capacity are unavailable. |
| failed | Request validation, execution or computed-contract invariants failed. |

Missing or unsupported data has no percentages, blackout metrics, track arrays or substitute horizon. Coverage flags can be null when the failure prevents a determination. A complete computed search reports `completeSearchRegion=true`, `missingData=false` and `boundaryChecked=true`. An explicit missing DEM reports missing data. An ephemeris failure does not imply missing terrain.

## Canonical units and time

Angles are degrees, distances and elevations are metres, durations are seconds and shares are fractions in [0,1]. Timestamps are UTC ISO 8601 strings. UTC sample, event and period labels come from SPICE conversion of epoch ET plus elapsed seconds. This preserves leap seconds. A fixture covers 2016-12-31T23:59:59Z, 23:59:60Z and 2017-01-01T00:00:00Z as consecutive ET seconds.

`result.period` is half-open [start,end). `durationS` is elapsed SPICE ET seconds. `samples` includes the requested start and a final endpoint-context sample for interpolation and plotting. The final sample has `endpointContext=true`. Availability metrics use refined interval lengths over the entire period. They do not count endpoint samples as extra exposure.

## Terrain skyline

`result.skyline` contains aligned `azimuthDeg`, `terrainElevationDeg` and `visibilityHorizonElevationDeg` arrays. Azimuth starts at local north, increases clockwise and places east at 90 degrees. Each azimuth value labels the left edge of a periodic sector in [0,360). The effective visibility horizon is the engine's sector envelope plus the requested offset, with a zero-degree elevation floor.

The result identifies the pixel-center sector-envelope/bilinear near-field model, spherical radial curvature, configured near/local/outer search distances, azimuth spacing, near-field step, observer height and global radial-height envelope. It includes the far-terrain upper-elevation bound and minimum applicable target range. These settings are taken from the actual horizon computation.

`provenance.dems` records actual raster filenames, publisher URL, SHA-256, measured X/Y resolution, polar bounds, frame and projection. `result.observer` records latitude, east longitude, source, uncertainty status, full Cartesian position, additional height, interpolated ground elevation, DE421 frame and radial datum. The declared reference sphere is 1737400 m.

## Tracks and visibility definitions

Every sample includes actual UTC, elapsed seconds, scientific profile and Sun/Earth directions with azimuth, elevation, effective horizon elevation and clearance. Clearance equals elevation minus the effective horizon. The request and provenance identify cadence, correction and observer/ephemeris sources.

Solar samples also include angular radius, visible-disk fraction, `fully_visible`, `partially_visible` or `obscured` state, and the selected sunlight predicate. Classification uses exact model fractions of 1, strictly between 0 and 1, or 0 respectively. `solarVisibility` reports its threshold and operator.

| Solar rule | Availability predicate |
| --- | --- |
| anyDisk | Visible solar-disk fraction > 0. |
| center | Sun-center clearance >= 0. The disk fraction is still reported separately. |
| fullDisk | Visible solar-disk fraction >= 1. |

The disk model is a uniform circular disk against a locally straight horizon at the center azimuth. It omits limb darkening and terrain variation across the disk. Terrain and physical event uncertainties are uncalibrated.

Earth samples explicitly report center visibility at nonnegative clearance, with a 0 degree safety margin beyond the already-applied visibility horizon. The unified contract exposes center-based Earth visibility. It omits an Earth partial-disk product. `rfConnectivity=not_computed` records that this geometry has no RF qualification.

## Intervals and events

`sunlightIntervals` and `directEarthIntervals` each contain ordered, nonoverlapping available and unavailable half-open intervals. Together they partition the complete evaluation period. Every interval has UTC and elapsed-second endpoints plus `startClipped` and `endClipped`. A clipped endpoint marks censoring at the data window, with conditions outside that window unobserved.

The adapter obtains rise/set events from interior transitions of the authoritative refined intervals. Window endpoints never become sunrise, sunset, Earthrise or Earthset events. Interior grazing estimates remain explicitly typed as grazing. Events are ordered and include numerical tolerance, refinement method and null physical uncertainty.

Detection reports probe step, search cadence, numerical root tolerance, completeness assumption and `possibleMissedEvents`. The detector searches extrema under a one-minimum/one-maximum coarse-interval assumption. The sector horizon is discontinuous. Arbitrary short or oscillatory events remain uncertified. Numerical tolerance provides a solver setting. Physical timing uncertainty remains unknown.

## Metrics and provenance

Metrics include sunlight duration and availability, direct-Earth duration and availability, mean visible solar-disk fraction, longest selected-rule darkness and longest direct-Earth blackout. Durations and fractions reconcile against the exported refined intervals. Longest intervals include their actual endpoints and coverage-boundary flag. Equal-duration ties select the earliest interval. A genuinely computed no-outage result has duration 0 and null longest-interval endpoints.

Mean visible solar-disk fraction is the trapezoidal integral of the returned sample fractions divided by elapsed duration. It is a cadence-dependent sampling approximation. Availability durations use the requested solar rule and refined interval lengths. The metrics record denominator and integration semantics.

Provenance includes engine/package version, algorithm version, source and dependency hashes, SPICE kernel identities/hashes, DEM identities/hashes, scientific profile, correction, cache identity, sampling/refinement settings, assumptions and limitations. Creation time describes this response. Computation time is retained across cache hits. `validationStatus=computed` and `independentlyValidated=false` distinguish evaluation from independent validation of that particular scenario. Implementation tests alone do not grant independent validation status to every scenario.

## Scenario feeds

`scenarioId` hashes the normalized request and the engine's source identity. The source identity includes resolved coordinates, kernel/DEM contents, algorithm implementation and dependency versions. Site, epoch, duration, height, profile and source versions therefore participate in feed identity.

`exportScientificFeed.py` fetches this API, validates the typed response and writes `<scenarioId>.json`. Publication is atomic and exclusive. Retries accept identical scientific content while ignoring response creation/execution metadata. Conflicting content for the same identity fails. Unsupported and missing results cannot be published as computed feeds. A site-only filename is never generated.
