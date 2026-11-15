# International site catalogue validation

Executed locally on 15 November 2026 in `D:/Hackathons/nasa-skyline`.

## Automated results

| Check | Actual result |
| --- | --- |
| Full mission-science Python suite | 118 passed in 211.69 s after persistent terrain-cache invalidation |
| Deployment verifier regression tests | 3 passed in 0.20 s |
| Frontend Vitest suite | 220 passed, 3 skipped, 36 test files |
| TypeScript type check | Passed |
| Production frontend build | Passed |
| Go suite with live mission-science URL | 89 passed including subtests, 4 optional tests skipped, 25.366 s |
| Go vet | Passed |
| Scientific source provenance | 59 source/trajectory hashes verified |
| Pinned scientific assets | 11 files verified, including global image and label |

The Python run emitted the existing Starlette/httpx deprecation warning. The skipped Go checks require the relay, rover or original-engine services, which were outside this catalogue verification run. The skipped frontend tests remain existing optional cases.

## Scientific coverage

Independent binary fixtures check PDS pixel-center registration, bilinear interpolation, longitude wrapping and seam interpolation. Invalid frame, scale, registration, units and terrain digital numbers are rejected. An analytical flat sphere checks the raised-observer tangent horizon. Changing height or detached-label content produces a different horizon cache identity.

Real SPICE and global LOLA evaluations cover Apollo 11, CE4_LROC2019, CE6, CY3, SLIM, LUNA25_TARGET and LUNA25_IMPACT for one hour beginning 20 November 2026. Earth availability is zero for the two evaluated far-side estimates and one for Apollo 11 in that window. Live Go-to-Python contract tests also exercise all seven global observers at the existing 1 January 2025 regression epoch. These are scoped regression observations.

Tests preserve distinct coordinate estimates, target/impact identities, published elevations and horizontal uncertainty. Unresolved CE4 and SLIM_PGDA101 coordinates remain unsupported. Missing global terrain returns unavailable with a missing-data flag. Rover and mast workflows retain their independent admission limits.

## Browser smoke checks

A production preview, Go backend and Python mission-science API were exercised through Microsoft Edge with Playwright. The `/sites` page rendered all eight international source-specific entries and the existing five lunar observers. Following Chang'e-6's evaluation link produced a real daily skyline, Sun/Earth tracks, instant readouts and computed annual-window cells. Selecting the Liu Chang'e-4 tuple produced an explicit unsupported state with no scientific metrics. Selecting Apollo 11 produced a live skyline and visible Earth-center readout. Browser console reported zero errors and zero warnings during these checks.

The annual runs were stopped after bounded windows completed. Full-year evaluation for every new observer remains unperformed. New-site horizons remain independently unvalidated against higher-resolution terrain or external horizon measurements. The global grid's approximately 1.9 km nominal equatorial spacing leaves local ridges and hazards unresolved.

## Reproduction

Run the Python suite from `services/missionScience` with `python -m pytest -q`. Run deployment tests with `python -m pytest scripts/testScienceDeployment.py -q`. Use `npm test`, `npx tsc --noEmit` and `npm run build` from `frontend`. Set `MISSION_SCIENCE_TEST_URL` to the running Python service before `go test ./... -json` in `backend`. Provision and verify assets as described in the root README.
