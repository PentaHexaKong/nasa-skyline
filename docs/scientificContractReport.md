# Scientific contract verification report

Verified against the independent-engine source.

## Results

| Check | Result |
| --- | --- |
| Mission-science Python suite | 85 passed |
| DS Python suite | 55 passed, 1 deselected |
| Relay-adapter Python suite | 14 passed, 6 skipped (live-service tests skip without running services) |
| Frontend Vitest suite | 100 passed |
| Go suite (`go test ./...`) | passes |

Run live Go tests with the services running: start the stack with `docker compose up --build`, then run `cd backend && go test -count=1 ./...` with the scientific service URLs set.

## Contract and scientific checks

The suite validates real computed results against JSON Schema and Pydantic cross-field invariants. It tests fractions, disk classification, center-based Earth visibility, units, ordered and nonoverlapping intervals, full-period partitioning, clipped coverage boundaries, missing states, unsupported sites/heights, missing DEMs and failed/not-computed states. It covers the SPICE UTC leap-second labels at the 2016/2017 boundary.

Regressions preserve the requested endpoint near a refined transition and prevent merging across a short intervening outage. Flat and constant-visibility windows create no rise/set events at the data boundaries. The detector continues to report possible missed events and unknown physical timing uncertainty.

Frontend tests compare the generated backend/frontend schemas, parse the real API example, reject missing or invalid availability fields, verify unit conversions and preserve null metrics across all noncomputed states. The response schema carries no default annotations that could fill missing scientific data during frontend parsing.

Go tests preserve the real scientific payload, reject malformed/versionless/unitless envelopes, verify explicit transport-error states and exercise the new endpoint through a real Go bridge into Python. They include a computed CR1 case and an unsupported Apollo 11 case. Existing live relay comparison and INT-4 engine integration tests run when the scientific service URLs are set.

## Real API and feed export

The example is fetched through the live Go endpoint using `scripts/exportScientificFeed.py`. It contains 25 samples for CR1 on 2025-01-06 over 86400 s at 3600 s cadence, engine 0.1.0, algorithm 0.3.0, seven kernel hashes and two DEM identities. It contains one refined Earth transition and no fabricated solar events. JSON Schema and scientific invariants pass, and deployed Python source hashes exactly match the local files.

Repeated CLI runs for the same scenario preserve the original file bytes. A different epoch or duration produces a separate file. An unsupported Apollo 11 request produces no computed feed. Concurrent publication and conflicting-content handling are covered by Python regression tests. The real API example is retained at `examples/scientificResponse.computed.json`.

The browser form uses this contract, displays server-supplied availability/duration/blackout metrics and exposes scenario and observer provenance. It keeps computed-only validation status. The UI contains presentation conversions and schema validation.

## Reproduction

Export a live feed with `python scripts/exportScientificFeed.py` (mission-science environment) against the running stack. Run the Python suites in `services/missionScience` and `services/relayAdapter`, `go test -count=1 ./...` in `backend`, and the frontend Vitest suite.

## Verification boundary

These checks establish contract compatibility and the stated numerical invariants for the tested scenarios. Results retain `validationStatus=computed` and `independentlyValidated=false`. Solar mean-disk fraction uses sampled trapezoidal quadrature. Event completeness, physical timing uncertainty and RF connectivity remain unverified or not computed. Additional observer heights remain unsupported by the current engine. The Go bridge retains its existing 90 s synchronous service budget and one-request scientific admission. Broad date/site performance and external absolute terrain/ephemeris validation are separate studies.
