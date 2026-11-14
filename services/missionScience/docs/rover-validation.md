# Rover prototype validation and benchmark report

The prototype implements a bounded, sampled model. Real-data results retain computed status and independentlyValidated false. Analytical fixtures validate graph and numerical conventions. Operational routing safety remains unvalidated.

## Real-data demonstration

CR1, 2025-01-06T18:00:00Z, 1,800 elapsed ET seconds, 3 by 3 cells at 80 m projected spacing, zero observer height, assumed speed 0.2 m/s, maximum slope 20 degrees and required sunlight plus direct Earth visibility while moving and stopping.

The actual LOLA/SPICE evaluation reaches four of nine cells. The 120 s grid produces the following earliest arrivals in seconds. Null indicates no modeled arrival.

```json
[[960, null, null], [480, 0, null], [960, null, null]]
```

At 60 s cadence the same four cells are reached, with arrivals `[[840, null, null], [420, 0, null], [840, null, null]]`. Coarse sampling and per-edge snapping materially affect arrival times. The zero-height center uses the existing canonical scientific observer and its actual recalculated terrain skyline.

The real-data Windows export and Linux Go-orchestrated response have exactly equal direct sections, including time-indexed booleans, earliest arrivals and transition counts. Their UTC grids, seven kernel hashes and two DEM hashes also match exactly. Deployment-specific scenario identities can differ because provenance includes actual asset paths and runtime implementation identities.

A stationary CR1 request at 2025-01-06T00:00:00Z for 240 s on the 120 s common grid returns direct initial admission false and assisted initial admission true. The one compatible cell is admitted through the validated simultaneous-hop replay. This demonstrates stationary admission and waiting under the specified sunlight rule. Mobile relay requests return unsupported with null assisted arrays and a separately computed direct graph.

## Measured performance

| Case | Wall seconds | Scope |
| --- | ---: | --- |
| Windows real local grid | 49.593 | Dedicated persistent benchmark cache, OS/cache state uncontrolled |
| Windows immediate repeated grid | 25.255 | Same request, exact deterministic scenario identity and result |
| Windows 60 s refinement | 44.510 | 31 time levels, same 21 observer evaluations |
| Linux first completed grid | 294.148 | Some horizon caches populated by a prior request |
| Linux warm Go/nginx grid | 153.858 | Full HTTP response and schema validation |
| Linux stationary relay comparison | 22.584 | Authoritative Go common-grid replay |
| Linux terrain-only unsupported-mobile comparison | 9.631 | No Sun/Earth scientific evaluations requested |
| Synthetic graph, 100 iterations | 0.607 total | All-visible constraints on actual DEM grid, 1,089 nodes per iteration |

Windows runtime is Python 3.13.14 on Windows 11. Its measured cumulative process peak RSS grows from about 152.4 MiB after the first grid to 172.0 MiB after temporal refinement. RSS includes interpreter and native caches. The synthetic graph checks 3,704 transition attempts per iteration. Those timings cover graph enumeration and carry no full-science throughput interpretation. The Windows deterministic repeat checks all graph arrays and scenario identity. No strict cold-cache benchmark is claimed for the current source version.

A Docker snapshot during concurrent regression/integration work observed rover RSS about 571 MiB and approximately 388 percent CPU utilization. This snapshot is a resource observation, without a sampled peak-memory guarantee. Default and maximum scientific wall budget are 300 s, checked cooperatively between observer calls. A cold request can require a subsequent cache-assisted evaluation after an explicit budget result. The request gate permits one rover evaluation at a time.

During the warm Linux evaluation, the existing proxied scientific capabilities endpoint returned HTTP 200 in 0.020 s and the frontend returned HTTP 200 in 0.006 s. The optional service has no dependency edge in existing readiness. Health checks and the real evaluation establish local service integration. Broader load and operational deployment remain outside this validation.

## Tests

| Suite | Actual result |
| --- | --- |
| Mission-science Python | 85 passed in 84.96 s, including 12 rover cases |
| Relay adapter with supplied NAIF kernels | 20 passed |
| Existing DS offline suite | 57 passed, 1 network test deselected |
| Frontend Vitest | 55 passed across 13 files |
| Frontend TypeScript | tsc --noEmit passed |
| Go full suite with existing live scientific services | 82 checks passed, optional rover live test skipped in that run |
| Dedicated optional rover live Go test | 1 passed in 10.77 s |
| Go vet | Passed |

The dedicated optional rover live Go test runs separately after the request gate becomes free. Its JSONL report records the actual result. The full Go counts include named subtests. Python reports the existing Starlette httpx deprecation warning. DS reports existing Rasterio matrix-operator deprecation warnings. DS needs PROJ_DATA and PROJ_LIB set to the installed Rasterio proj_data directory to avoid a host PostgreSQL PROJ database conflict.

Analytical tests cover known flat-grid arrival matrices, obstacle exclusion, excessive plane slopes, missing DEM, source/midpoint/destination conditions, intermediate outages, separate stopping rules, disabled waiting, extremely slow speeds, strictly increasing time, request/node/transition budgets, deterministic repeats and fixed-domain spatial/temporal sensitivity. Synthetic fixtures carry explicit labels. Relay tests reject unsupported moving observers, heights, cadence and epochs, and detect hop, observer, clock, asset and direct-boolean inconsistencies.

The common-envelope check treats the proposal-only contractStatus metadata as an unknown field, so a rover-specific envelope adapter validates this review status and delegates the remaining strict common-envelope checks. Regression tests verify byte-preserving computed responses and null unavailable results. A live response through nginx, Go and Python verifies this path.

## Reproduction

Run `python -m pytest -q` in the mission-science environment. Run `python scripts/benchmarkRover.py` to produce real examples and the benchmark. Run `python scripts/exportRoverSchemas.py` after changing contract models. Run `python scripts/validateRoverIntegration.py` with the optional Compose service enabled to produce the live examples.

Frontend schema tests use authoritative real examples. No RoverFeed consumer or application UI is claimed.
