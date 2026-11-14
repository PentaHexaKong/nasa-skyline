# Mast placement validation

Run against the independent mission-science engine and existing application. The placement evaluator uses the height-aware terrain, SPICE, visibility, interval, blackout and panel routines.

## Current test results

| Check | Result |
| --- | --- |
| Mission-science Python suite | 85 passed |
| Frontend Vitest suite | 100 passed |
| Relay-adapter Python suite | 14 passed, 6 skipped (live-service tests skip without running services) |
| DS Python suite | 55 passed, 1 deselected |
| Go suite (`go test ./...`) | passes |

Run live Go tests with the services running: start the stack with `docker compose up --build`, then run `cd backend && go test -count=1 ./...` with the scientific service URLs set. DS uses Rasterio's bundled PROJ database. The relay suite uses the independent seven-kernel directory.

Analytical tests cover equatorial offsets, inverse round trips at all three canonical sites, exact zero offset, nested grid enumeration and spherical flat/planar DEM slope fixtures. Real-data tests compare sampled elevations and observer radii, preserve exact zero-offset scientific results, and distinguish ten location/height observer positions and cache identities.

Independent synthetic objective fixtures isolate all six objective directions, verify every axis affects dominance, preserve trade-offs and reject infeasible alternatives before ranking. Tests cover inclusive hard-constraint boundaries, missing candidate terrain, missing required slope support, unsupported canonical sites, missing DEMs, evaluation-count admission and deterministic cooperative wall-time exhaustion. The latter uses an explicitly synthetic clock. Contract mutation tests reject changed ranks, coordinates and mixed kernel identities.

API tests verify computed, unsupported, invalid, busy and oversized-request states. Schema/round-trip/publication tests preserve null data for unresolved outcomes and immutable feed bytes across generation-time changes. FE tests retain legacy fixtures, reject missing/inconsistent scientific fields, forward the typed request and load every delivered placement scenario through explicit selection.

## Reproducible real-data experiment

The CR1 experiment starts at 2025-01-06T00:00:00Z for 86400 ET seconds at 3600 s track cadence, geometric profile and any-disk sunlight. It uses the real 80 m local and 240 m extended LOLA rasters, 80 m search radius, heights 0/2 m, 80 m reference-sphere cable limit and a 90 degree vertical-panel normal. Requirements are sunlight fraction at least 0.8, direct-Earth fraction at least 0.5, darkness at most 3600 s and direct-Earth blackout at most 30000 s. Slope remains a reported screening estimate in this experiment.

The coarse grid has five points and ten location/height combinations. The spatial refinement uses 40 m spacing with thirteen points and twenty-six combinations. Both grids completed within their declared 300 s cooperative budgets.

| Case | Locations | Planned evaluations | Feasible combinations | Nondominated combinations | Wall time s | Cumulative process peak RSS MiB |
| --- | --- | --- | --- | --- | --- | --- |
| coldCoarseGrid | 5 | 10 | 5 | 3 | 41.836 | 572.91 |
| memoizedCoarseGrid | 5 | 10 | 5 | 3 | 5.899 | 572.91 |
| refinedSpatialGrid | 13 | 26 | 14 | 6 | 72.686 | 572.91 |

The first case uses empty temporary terrain/result caches. OS file caching is uncontrolled. Later cases share the evaluator and caches. Memory is process peak RSS including Python, native libraries and scientific caches, cumulative since process start, so all three cases report the same value. Runtime is macOS arm64, Python 3.12. The caches hold 26 native-result entries, 26 horizon entries and 61999 ephemeris entries. This measures the stated workload and environment.

Repeated coarse evaluation preserved its scenario identity. All ten shared scientific location/height scenario identities were identical in the refined grid. The finer grid contains every coarse location. Its additional positions use interpolation of the same 80 m terrain, and all thirteen are flagged as finer than the DEM. The maximum nondominated Earth availability remained approximately 0.753741425; refinement expanded the available cost/height trade-offs.

The benchmark output records full requests, objective ranges, per-point source identities, scientific versions/hashes, cache sizes, runtime platform and memory semantics. Reproduce with `python scripts/benchmarkMastPlacement.py --app-root <repo root>` in the engine environment.

## Actual nondominated trade-offs

The coarse real-data feed contains these three rank-zero alternatives. All have computed any-disk sunlight availability 1.0 and longest darkness 0 s under the selected model.

| East offset m | North offset m | Height m | Direct-Earth fraction | Longest direct-Earth blackout s |
| --- | --- | --- | --- | --- |
| 0 | 0 | 2 | 0.752560398 | 21378.782 |
| 0 | -80 | 2 | 0.753741425 | 21276.741 |
| 80 | 0 | 0 | 0.753699281 | 21280.382 |

The center option uses zero horizontal cable offset and a 2 m mast. The south option gains about 102 s of modeled Earth visibility at an 80 m surface offset. The east option uses ground level at an 80 m offset, with a slightly longer blackout than the south option. These are conditional geometric comparisons. Exact ranking retains small numerical differences, while physical significance remains limited by terrain and event uncertainty.

A standalone independent pass over the actual Go-generated feed recomputed mission feasibility and six-objective dominance without importing placement selection or aggregation code. Its feasible and nondominated sets matched the returned result. The check also verified the source hashes.

## Go/FE and immutable-feed integration

The Go route returns the complete ten-evaluation CR1 case through the integrated stack. The actual response passed authoritative Pydantic validation. The request, full API response and compact MastFeed are retained under `examples/` in both repositories.

The real `exportMastFeed.py` CLI runs through Go and preserves existing payload bytes. A live unsupported Apollo 11 request produces no feed. A second one-hour zero-offset scenario passes and preserves unrequested panel exposure as null. Immutable payloads retain complete scenario identities, and site-only lookup files require explicit scenario selection.

The frontend proxy gives the placement route a 610 s read budget, because the default 100 s proxy timeout is too short for it. Go retains its 600 s mast-evaluation budget.

The synchronizer emits explicit lazy imports in `src/data/generated/feedIndex.ts`. Changes to the delivered file list update a normal module dependency, so a new scenario loads without editing the loader. The complete FE suite covers this. New feeds display server-provided feasibility and ranks. Legacy feeds keep their own display path.

## Scope and uncertainty

Mast height is metres above actual interpolated local terrain. Every point/height recomputes its observer and skyline through the height-aware scientific path. Cable constraints use reference-sphere surface offset, with vertical mast run, routing, terrain-following distance and slack omitted. Slope is a coarse radial-height screening estimate with a 320 m footprint at 80 m resolution. Physical terrain-normal accuracy and microtopography remain uncalibrated.

Wall-time checks are cooperative between complete scientific evaluations, and an in-flight evaluation may overrun the declared limit. Count, grid and aggregate-sample bounds are enforced before evaluation. Partial results preserve unresolved states and conditional fronts.

The optimizer's domain is the declared generated grid and selected heights. Construction safety, global optimality, physical event completeness and RF-qualified communication remain unvalidated. Panel scores retain the center-incidence-times-visible-disk approximation and ideal unconstrained tracking. Results carry computed status and `independentlyValidated=false`.

The pinned INT-4 engine is not modified. Existing live integrations and regression suites are run with the commands above.
