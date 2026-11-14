# RelayFeed validation

Run against the existing Compose stack and independent relay adapter. Requirements R4, O2/O3/O7 and C2/C9/C10.

## Actual suite results

| Check | Result |
| --- | --- |
| Full relay-adapter Python suite | 20 passed, zero failures/skips, 5.27 s |
| Existing DS Python suite | 57 passed, one existing network test deselected, 51.08 s |
| Full frontend suite | 49 passed, zero failures/pending tests |
| Full Go suite with live scientific services | 76 passing cases comprising 34 top-level tests and 42 subtests, zero failures/skips, 55.975 s |
| Go static checks | `go vet ./...` passed in the Go 1.24 container |
| TypeScript | `pnpm --dir frontend exec tsc --noEmit` passed |
| Production frontend build | Compose frontend build passed |

The relay suite uses the independent adapter's seven-kernel directory. DS uses Rasterio's bundled PROJ database. Existing Starlette and Rasterio deprecation warnings remain in the test output.

All seven Compose services ran healthy, with HTTP 200 from the mission page.

## Supported real-data replay matrix

Each row evaluates 86400 ET seconds on the existing 120 s grid, with 720 left-endpoint samples. Shares are fractions in [0,1]. Blackouts are seconds under the stated sample-bin model.

| Site | Nominal requested UTC date | Direct share | Longest direct blackout s | Direct-or-relay share | Longest assisted blackout s | HTTP wall time s |
| --- | --- | --- | --- | --- | --- | --- |
| CR1 | 2025-01-06 | 0.3625 | 55080 | 1.0000 | 0 | 13.595 |
| GR1 | 2025-01-06 | 1.0000 | 0 | 1.0000 | 0 | 12.825 |
| SR1 | 2025-01-06 | 0.0000 | 86400 | 1.0000 | 0 | 50.836 |
| CR1 | 2025-01-28 | 0.0000 | 86400 | 1.0000 | 0 | 31.796 |
| GR1 | 2025-01-28 | 0.0000 | 86400 | 1.0000 | 0 | 31.423 |
| SR1 | 2025-01-28 | 0.0000 | 86400 | 1.0000 | 0 | 32.545 |

All six cases passed schema validation, exact elapsed-grid checks, absolute ET epoch agreement within 1e-6 s, simultaneous-hop consistency, metric recomputation and interval partition/clipping checks. The greatest epoch difference is 3.5762786865234375e-7 s. Reproduce with `python services/relayAdapter/scripts/validateRelayFeed.py` against the running stack.

The CR1 Jan 6 target matches the documented geometric result exactly: direct fraction 0.3625, assisted fraction 1.0, direct blackout 55080 s and remaining assisted blackout 0 s. The direct blackout touches the window start. These are sampled geometric results for the evaluated windows. All six assisted shares are 1.0 under the same sample-bin definition.

Measurements include host HTTP transfer through the frontend proxy, Go orchestration and both scientific services. Cache state is uncontrolled. Case timings are end-to-end service runtimes. The native scientific algorithms and saved orbit trajectory remain the existing implementation.

## Timing reconciliation and regression

The January 1-origin relay ET clock differs from a January 6 UTC-to-ET conversion by -0.00014483928680419922 s. Matching relative offsets alone conceals that difference, so the feed checks absolute ET.

The adapter emits actual ET/UTC timing metadata from its replay, alongside its state loading and communication geometry. Go starts mission science at the actual replay UTC label and verifies absolute ET agreement within 1 microsecond. At CR1 Jan 6 the difference is 1.1920928955078125e-7 s. The feed preserves nominal requested epoch alongside actual sample and endpoint UTC labels. Interval endpoints come from those SPICE-converted boundaries.

`examples/relayComparison.computed.json` captures the aligned raw Go comparison. The CR1 RelayFeed's direct and assisted arrays exactly match its exported relay arrays. The direct array also exactly matches the independent mission-science Earth clearance test at every common sample. The same check confirms that embedded Go source hashes match the local implementation.

## Failure and boundary checks

Deterministic Go cases reject changed frame/observer/assets/direct booleans through existing checks, and changed elapsed grid, absolute epoch, UTC labels, coordinate provenance, trajectory hash, candidate, observer height, hop shapes, via-relay booleans and aggregate summaries through the feed adapter. A disjoint-hop fixture verifies that site access through one satellite and Earth access through another cannot form a communication path.

Analytical boolean fixtures cover available and blackout runs, interior longest blackouts, ties selecting the first longest interval, all-visible/all-hidden cases, single-bin cases and coverage-boundary truncation. Frontend tests reject missing scientific metadata, RF-qualified flags, invalid common-grid arrays, inconsistent hop availability, hour/second conversion mismatches and incorrect clipping. Versioned failures cannot fall back to legacy feed parsing.

Live requests reject Apollo 11, a 2026 epoch, an unaligned start second, a 121 s duration and a window crossing the pinned replay end. The final supported bin, at 2025-01-28T23:58:00Z with 120 s duration, is accepted. No arbitrary site/date capability is inferred from the replay matrix.

## Feed publication and FE compatibility

The export CLI runs through the authoritative Go route. Repeated exports retain the original immutable payload bytes (measured CLI wall times 13.555 and 13.127 s). A live unsupported Apollo 11 CLI request fails with HTTP 422 and produces no feed file. Concurrent identical publication, conflicting content, unrelated site-file protection, missing science and RF-flag validation are covered by the Python suite.

Six immutable payloads cover three sites and two dates. `frontend/data/feeds/relay/<site-id>.json` contains explicit-selection manifests, with complete scenario payloads below `relay/scenarios`. The frontend loads the selected identity, checks its embedded site and scenario, validates the scientific contract and renders supplied intervals. Legacy fixture feeds keep their own contract and behaviour.

The CR1 example is `examples/relayFeed.computed.json`. It reports producer/source identities and computed validation status. It keeps `independentlyValidated=false`, `rfQualified=false`, `rfAvailability=null` and `continuousAvailabilityValidated=false`.

## Verification boundary

The measurements establish the tested software contracts, source identities, synchronized sampled geometry and boolean/metric consistency. Physical RF performance, continuous connectivity and subcadence outage completeness remain unvalidated. Event times are sample-bin boundaries, with explicit clipping and unknown physical transition uncertainty. The original orbital engine and frozen INT-4 received no edits in this task.
