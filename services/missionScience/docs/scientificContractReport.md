# Scientific contract verification report

Verified against the final independent-engine source and running Compose stack.

## Results

| Check | Actual result |
| --- | --- |
| Full independent mission-science Python suite | 53 passed, zero failures/skips |
| Existing DS Python suite | 57 passed, one existing network test deselected |
| Independent relay-adapter Python suite with real seven-kernel directory | 18 passed, zero failures/skips |
| Full frontend Vitest suite | 44 passed, zero failures/skips |
| Go suite with all live service URLs enabled | 28 top-level tests and 27 subtests passed, zero failures/skips |
| Go vet | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Compose readiness | All seven services healthy |
| Browser | The mission form completes a one-hour geometric CR1 evaluation through the bundled schema-validated client |

The DS test run used Rasterio's bundled PROJ database through `PROJ_DATA` and `PROJ_LIB` to avoid the incompatible host PostgreSQL database. Existing Starlette and Rasterio deprecation warnings remain in the test output.

## Contract and scientific checks

The suite validates real computed results against JSON Schema and Pydantic cross-field invariants. It tests fractions, disk classification, center-based Earth visibility, units, ordered and nonoverlapping intervals, full-period partitioning, clipped coverage boundaries, missing states, unsupported sites/heights, missing DEMs and failed/not-computed states. It covers the SPICE UTC leap-second labels at the 2016/2017 boundary.

Regressions preserve the requested endpoint near a refined transition and prevent merging across a short intervening outage. Flat and constant-visibility windows create no rise/set events at the data boundaries. The detector continues to report possible missed events and unknown physical timing uncertainty.

Frontend tests compare the generated backend/frontend schemas, parse the real API example, reject missing or invalid availability fields, verify unit conversions and preserve null metrics across all noncomputed states. The response schema carries no default annotations that could fill missing scientific data during frontend parsing.

Go tests preserve the real scientific payload, reject malformed/versionless/unitless envelopes, verify explicit transport-error states and exercise the new endpoint through a real Go bridge into Python. They include a computed CR1 case and an unsupported Apollo 11 case. Existing live relay comparison and frozen-engine integration tests also passed.

## Real API and feed export

The example is fetched through the live Go endpoint using `scripts/exportScientificFeed.py`. It contains 25 samples for CR1 on 2025-01-06 over 86400 s at 3600 s cadence, engine 0.1.0, algorithm 0.3.0, seven kernel hashes and two DEM identities. It contains one refined Earth transition and no fabricated solar events. JSON Schema and scientific invariants pass, and deployed Python source hashes exactly match the local files.

Repeated CLI runs for the same scenario preserve the original file bytes. A different epoch or duration produces a separate file. An unsupported Apollo 11 request produces no computed feed. Concurrent publication and conflicting-content handling are covered by Python regression tests. The real API example is retained at `examples/scientificResponse.computed.json`.

The browser form uses this contract, displays server-supplied availability/duration/blackout metrics and exposes scenario and observer provenance. It keeps computed-only validation status. The UI contains presentation conversions and schema validation.

## Reproduction

Export a live feed with `python scripts/exportScientificFeed.py` (mission-science environment) against the running stack. Run the Python suites in `services/missionScience` and `services/relayAdapter`, `go test -count=1 ./...` in `backend`, and the frontend Vitest suite.

## Verification boundary

These checks establish contract compatibility and the stated numerical invariants for the tested scenarios. Results retain `validationStatus=computed` and `independentlyValidated=false`. Solar mean-disk fraction uses sampled trapezoidal quadrature. Event completeness, physical timing uncertainty and RF connectivity remain unverified or not computed. Additional observer heights remain unsupported by the current engine. The Go bridge retains its existing 90 s synchronous service budget and one-request scientific admission. Broad date/site performance and external absolute terrain/ephemeris validation are separate studies.
