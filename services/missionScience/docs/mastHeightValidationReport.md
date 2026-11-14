# Mast-height and panel-geometry validation

Executed against the independent mission-science implementation and the existing application.

## Actual suite results

| Check | Result |
| --- | --- |
| Mission-science Python suite | 61 passed, zero failures or skips, 59.685 s |
| Relay regression suite | 18 passed, zero failures or skips, 20.165 s |
| Frontend suite | 46 passed, zero failures or pending tests |
| Go suite with live integrations | 57 passing cases comprising 30 top-level tests and 27 subtests, zero failures or skips, 182.879 s |
| TypeScript | `pnpm --dir frontend exec tsc --noEmit` passed |
| Go static checks | `go vet ./...` passed |

The new scientific tests cover exact zero-height regression, observer radius and height-specific cache identities, multiple real heights, raw-skyline monotonicity, analytical spherical flat-terrain dip, independent panel-normal dot products, numerical panel quadrature, apparent-profile heights, typed route errors, missing DEM data, unsupported radial heights and immutable scenario publication.

The real-data response was requested through the Go proxy and validated against the generated mast response schema. Its PowerFeed and lookup manifest passed their JSON Schemas. The deployed Python package hashes match the local source package. Running the actual feed-export CLI twice retained identical immutable feed content. The frontend regression loads both Windows and deployed Linux source-version scenarios explicitly.

Frontend scenario-file selection enumerates the discovered entries into a Map, and the full suite covers it. Legacy feed loading is covered by the existing fixture tests.

All seven Compose services report healthy and the mission page returns HTTP 200.

## Measured scientific comparisons

The benchmark uses 2025-01-06T00:00:00Z, 86400 ET seconds, geometric profile, any-disk sunlight, center Earth visibility, 0/2/10/30 m heights and an east-facing vertical panel. All three published ROI sites CR1, GR1 and SR1 were evaluated using real kernels and registered LOLA rasters.

| Site | Cold terrain/result evaluation s | Memoized repeat s |
| --- | --- | --- |
| CR1 | 74.329 | 8.598 |
| GR1 | 67.376 | 7.137 |
| SR1 | 66.177 | 8.620 |

Cold runs used empty temporary terrain/result caches. OS file caching was uncontrolled. Measurements exclude HTTP transfer and file export. Regenerate full requests, identities, metrics and convergence samples with `python scripts/benchmarkMastPower.py` in the mission-science environment.

All height comparisons passed the raw-horizon nonincrease check at 1e-9 degree numerical tolerance. At CR1 the ground any-disk availability was 1.0 while mean visible solar fraction was about 0.505122. At 2 m the mean fraction was 1.0. Center-based Earth availability changed from approximately 0.362571 at ground to 0.752560 at 2 m. Changes between elevated heights retain their signed values and include sub-second differences over the day.

CR1 at 10 m was evaluated at 3600, 1800 and 900 s track cadence. Earth availability was approximately 0.752559629, 0.752559764 and 0.752559831. Horizontal mean exposure was 0.0200948695, 0.0200948406 and 0.0200948333. Refining terrain sectors from 0.25 to 0.125 degree and near-field steps from 40 to 20 m changed aligned raw horizons by at most 0.092204 degree in this case, with unchanged Earth availability. These are scenario-specific convergence observations.

## Scope and limitations

The original orbital engine and frozen mission definitions are unmodified. The implementation extends the independent environment evaluator, adds an additive versioned mast/power route, and provides compatible typed frontend data and scenario-keyed feeds. Mast placement optimization remains outside this work.

Mast height is radial metres above interpolated local terrain. Every height rebuilds its skyline and recomputes SPICE observer tracks, intervals and blackout metrics. The existing effective zero-degree horizon floor remains part of the scientific profile.

Panel exposure uses solar-center incidence multiplied by the finite-disk visible fraction. Incidence is not integrated over the visible part of the disk. Tracking is idealized and unconstrained. Scores are dimensionless. Electrical, structural and deployment models are unavailable.

Metre-scale physical accuracy is unverified with an 80 m DEM. The real scenarios are computed results with analytical and regression checks. Their provenance retains `independentlyValidated: false`. The 1e-9 degree monotonicity tolerance describes numerical consistency, and the event tolerance is 1 s.

The new route uses a chosen bounded 600 s Go evaluation budget and 610 s frontend/export timeout to accommodate measured cold batches. The request has a 16-selected-height limit and a 6000 aggregate interval budget. Continuous geometric height support is governed by the configured 20000 m absolute radial envelope and actual DEM coverage.

The site-only PowerFeed path contains a manifest requiring explicit scenario selection. Immutable scenario payloads preserve site, epoch, duration, heights, profile, orientation and source versions. Missing selection produces an explicit selection-required state. Existing unrelated site files are protected against overwrite.
