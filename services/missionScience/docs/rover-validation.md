# Rover prototype validation and benchmark report

The prototype implements a bounded, sampled model. Real-data results retain computed status and independentlyValidated false. Analytical fixtures validate graph and numerical conventions. Operational routing safety remains unvalidated.

## Real-data demonstration

CR1, 2025-01-06T18:00:00Z, 1,800 elapsed ET seconds, 3 by 3 cells at 80 m projected spacing, zero observer height, assumed speed 0.2 m/s, maximum slope 20 degrees and required sunlight plus direct Earth visibility while moving and stopping.

The actual LOLA/SPICE evaluation reaches four of nine cells. The 120 s grid produces the following earliest arrivals in seconds. Null indicates no modeled arrival.

```json
[[960, null, null], [480, 0, null], [960, null, null]]
```

At 60 s cadence the same four cells are reached, with arrivals `[[840, null, null], [420, 0, null], [840, null, null]]`. Coarse sampling and per-edge snapping materially affect arrival times. The zero-height center uses the existing canonical scientific observer and its actual recalculated terrain skyline.

A stationary CR1 request at 2025-01-06T00:00:00Z for 240 s on the 120 s common grid returns direct initial admission false and assisted initial admission true. The one compatible cell is admitted through the validated simultaneous-hop replay. This demonstrates stationary admission and waiting under the specified sunlight rule. Mobile relay requests return unsupported with null assisted arrays and a separately computed direct graph.

## Resource budget

No current benchmark timings or memory measurements are recorded for the rover prototype. Default and maximum scientific wall budget are 300 s, checked cooperatively between observer calls. A cold request can require a subsequent cache-assisted evaluation after an explicit budget result. The request gate permits one rover evaluation at a time. The optional service has no dependency edge in existing readiness. Broader load and operational deployment remain outside this validation.

## Tests

| Suite | Result |
| --- | --- |
| Mission-science Python | 85 passed, including the rover cases |
| Relay-adapter Python | 14 passed, 6 skipped (live-service tests skip without running services) |
| DS Python | 55 passed, 1 deselected |
| Frontend Vitest | 100 passed |
| Go (`go test ./...`) | passes |

Run live Go tests, including the optional rover live test, with the services running: start the stack with `docker compose up --build`, then run `cd backend && go test -count=1 ./...` with the scientific service URLs set.

The dedicated optional rover live Go test runs separately after the request gate becomes free. Its JSONL report records the result when it is run. Python reports the existing Starlette httpx deprecation warning. DS reports existing Rasterio matrix-operator deprecation warnings. DS needs PROJ_DATA and PROJ_LIB set to the installed Rasterio proj_data directory to avoid a host PostgreSQL PROJ database conflict.

Analytical tests cover known flat-grid arrival matrices, obstacle exclusion, excessive plane slopes, missing DEM, source/midpoint/destination conditions, intermediate outages, separate stopping rules, disabled waiting, extremely slow speeds, strictly increasing time, request/node/transition budgets, deterministic repeats and fixed-domain spatial/temporal sensitivity. Synthetic fixtures carry explicit labels. Relay tests reject unsupported moving observers, heights, cadence and epochs, and detect hop, observer, clock, asset and direct-boolean inconsistencies.

The common-envelope check treats the proposal-only contractStatus metadata as an unknown field, so a rover-specific envelope adapter validates this review status and delegates the remaining strict common-envelope checks. Regression tests verify byte-preserving computed responses and null unavailable results. A live response through nginx, Go and Python verifies this path.

## Reproduction

Run `python -m pytest -q` in the mission-science environment. Run `python scripts/benchmarkRover.py` to produce real examples and the benchmark. Run `python scripts/exportRoverSchemas.py` after changing contract models. Run `python scripts/validateRoverIntegration.py` with the optional Compose service enabled to produce the live examples.

Frontend schema tests use authoritative real examples. No RoverFeed consumer or application UI is claimed.
