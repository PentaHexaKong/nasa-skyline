# RelayFeed validation

Checked with the independent relay adapter and the export CLI. Requirements R4, O2/O3/O7 and C2/C9/C10.

## Current suite results

| Check | Result |
| --- | --- |
| Relay-adapter Python suite | 14 passed, 6 skipped (live-service tests skip without running services) |
| DS Python suite | 55 passed, 1 deselected |
| Frontend Vitest suite | 100 passed |
| Go suite (`go test ./...`) | passes |

Run live Go tests with the services running: start the stack with `docker compose up --build`, then run the Go suite with the scientific service URLs set.

## Supported real-data replay matrix

Each row evaluates 86400 ET seconds on the existing 120 s grid, with 720 left-endpoint samples. Shares are fractions in [0,1]. Blackouts are seconds under the stated sample-bin model.

| Site | Nominal requested UTC date | Direct share | Longest direct blackout s | Direct-or-relay share | Longest assisted blackout s | Export wall time s |
| --- | --- | --- | --- | --- | --- | --- |
| CR1 | 2025-01-06 | 0.3625 | 55080 | 1.0000 | 0 | 1.588 |
| GR1 | 2025-01-06 | 1.0000 | 0 | 1.0000 | 0 | 1.351 |
| SR1 | 2025-01-06 | 0.0000 | 86400 | 1.0000 | 0 | 1.658 |
| CR1 | 2025-01-28 | 0.0000 | 86400 | 1.0000 | 0 | 1.012 |
| GR1 | 2025-01-28 | 0.0000 | 86400 | 1.0000 | 0 | 1.226 |
| SR1 | 2025-01-28 | 0.0000 | 86400 | 1.0000 | 0 | 1.018 |

All six cases passed schema validation, exact elapsed-grid checks, absolute ET epoch agreement within 1e-6 s, simultaneous-hop consistency, metric recomputation and interval partition/clipping checks. The greatest epoch difference is 3.5762786865234375e-7 s. Reproduce with `python services/relayAdapter/scripts/validateRelayFeed.py` against the running stack. Export wall times are per-scenario times through the Python export CLI, not HTTP times.

The CR1 Jan 6 target matches the documented geometric result exactly: direct fraction 0.3625, assisted fraction 1.0, direct blackout 55080 s and remaining assisted blackout 0 s. The direct blackout touches the window start. These are sampled geometric results for the evaluated windows. All six assisted shares are 1.0 under the same sample-bin definition.

Export wall times are Python export CLI runtimes for each scenario. Cache state is uncontrolled. The native scientific algorithms and saved orbit trajectory remain the existing implementation.

## Timing reconciliation and regression

The January 1-origin relay ET clock differs from a January 6 UTC-to-ET conversion by -0.00014483928680419922 s. Matching relative offsets alone conceals that difference, so the feed checks absolute ET.

The adapter emits actual ET/UTC timing metadata from its replay, alongside its state loading and communication geometry. Go starts mission science at the actual replay UTC label and verifies absolute ET agreement within 1 microsecond. At CR1 Jan 6 the difference is 1.1920928955078125e-7 s. The feed preserves nominal requested epoch alongside actual sample and endpoint UTC labels. Interval endpoints come from those SPICE-converted boundaries.

`examples/relayComparison.computed.json` captures the aligned raw Go comparison. The CR1 RelayFeed's direct and assisted arrays exactly match its exported relay arrays. The direct array also exactly matches the independent mission-science Earth clearance test at every common sample. The same check confirms that embedded Go source hashes match the local implementation.

## Failure and boundary checks

Deterministic Go cases reject changed frame/observer/assets/direct booleans through existing checks, and changed elapsed grid, absolute epoch, UTC labels, coordinate provenance, trajectory hash, candidate, observer height, hop shapes, via-relay booleans and aggregate summaries through the feed adapter. A disjoint-hop fixture verifies that site access through one satellite and Earth access through another cannot form a communication path.

Analytical boolean fixtures cover available and blackout runs, interior longest blackouts, ties selecting the first longest interval, all-visible/all-hidden cases, single-bin cases and coverage-boundary truncation. Frontend tests reject missing scientific metadata, RF-qualified flags, invalid common-grid arrays, inconsistent hop availability, hour/second conversion mismatches and incorrect clipping. Versioned failures cannot fall back to legacy feed parsing.

Live requests reject Apollo 11, a 2026 epoch, an unaligned start second, a 121 s duration and a window crossing the pinned replay end. The final supported bin, at 2025-01-28T23:58:00Z with 120 s duration, is accepted. No arbitrary site/date capability is inferred from the replay matrix.

## Feed publication and FE compatibility

The export CLI runs through the authoritative Go route. Repeated exports retain the original immutable payload bytes. A live unsupported Apollo 11 CLI request fails with HTTP 422 and produces no feed file. Concurrent identical publication, conflicting content, unrelated site-file protection, missing science and RF-flag validation are covered by the Python suite.

Six immutable payloads cover three sites and two dates. `frontend/data/feeds/relay/<site-id>.json` contains explicit-selection manifests, with complete scenario payloads below `relay/scenarios`. The frontend loads the selected identity, checks its embedded site and scenario, validates the scientific contract and renders supplied intervals. Legacy fixture feeds keep their own contract and behaviour.

The CR1 example is `examples/relayFeed.computed.json`. It reports producer/source identities and computed validation status. It keeps `independentlyValidated=false`, `rfQualified=false`, `rfAvailability=null` and `continuousAvailabilityValidated=false`.

## Verification boundary

The measurements establish the tested software contracts, source identities, synchronized sampled geometry and boolean/metric consistency. Physical RF performance, continuous connectivity and subcadence outage completeness remain unvalidated. Event times are sample-bin boundaries, with explicit clipping and unknown physical transition uncertainty. The orbital propagator and the pinned INT-4 engine are not modified by the adapter.
