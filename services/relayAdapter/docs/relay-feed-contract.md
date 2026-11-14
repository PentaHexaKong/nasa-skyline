# RelayFeed contract

Version `skyline-relay-feed/1.0.0`, implemented for R4, O2/O3/O7 and C2/C9/C10.

## Authoritative delivery

`POST /api/relay-engineering/v1/relay-feed` accepts the existing comparison request with `siteId`, `startUtc` and integer `durationS`. It calls the existing relay replay and mission-science services. The original `/api/relay-engineering/compare` route keeps its response fields and shares the same validation. The orbital propagator and frozen INT-4 are unmodified.

The supported candidates remain the pinned nominal Candidate 2, two saved two-body J2000 spacecraft trajectories. Sites are CR1, GR1 and SR1 at the verified zero-additional-height terrain observers. Requested windows use aligned 120 s offsets within [2025-01-01T00:00:00Z, 2025-01-29T00:00:00Z), with duration from 120 to 86400 s. The candidate and profile are fixed. Apparent geometry, elevated observers, arbitrary points, other trajectories and dates require separate verification.

The request example is `examples/relayFeedRequest.json`. The real response is `examples/relayFeed.computed.json`. The authoritative schema comes from the frontend Zod definition `RelayFeedV1` and is exported to `contracts/relayFeedV1.schema.json`. The ordinary feed schema at `contracts/feeds/relay.schema.json` accepts this version and existing legacy feeds. A malformed versioned feed fails validation without falling back to the legacy parser.

## Identity and units

`contractVersion` identifies the scientific RelayFeed contract. The existing `schema_version=1`, `site_id`, `period`, `scenarios` and presentation provenance remain available to established consumers. `origin` and `dataState` are computed for successful responses. Unsupported or unavailable service evaluations return an HTTP error with an explicit error code and produce no feed file.

`scenario.request` preserves the complete nominal request. Additional scenario fields declare candidate, geometric profile, Earth-center rule, zero elevation mask and terrain profile. `scenario.observer` includes the published coordinate source, signed east-positive latitude/longitude convention, explicit DE421 frame, Cartesian position in metres, height above terrain, ground elevation and reference radius. `scenario.sourceIdentity` retains the request, observer, terrain configuration, two DEM and seven kernel hashes, trajectory hash, both Python implementations/dependencies, Go orchestration source hashes, environment cache identity, actual grid and availability arrays.

`scenarioId` is `relay-feed-` plus SHA-256 over Go's canonical JSON identity serialization. Changes to site, epoch, duration, observer, scientific sources, code or synchronized availability create another identity. The trajectory identity is pinned to the existing verified CSV hash `0f328f101228015d55ad301c512ffec27091beb02adb3649d3276669b1f54bce`. The existing adapter verifies that hash before geometry evaluation.

Canonical comparison durations use seconds, positions use metres and shares use fractions in [0,1]. The trajectory's saved input units are explicitly km and km/s in Moon-centered J2000. The established ladder fields `longest_gap_h` are presentation conversions from canonical seconds. Display percentages are converted at the UI boundary.

## Clock reconciliation

The saved replay advances SPICE ET from its January 1 origin. An independently converted requested UTC epoch can differ slightly because ET-to-UTC conversion includes periodic terms. The original Jan 6 comparison differed by -0.00014483928680419922 s between replay and mission-science epochs.

The adapter exposes `epochEt`, actual `sampleUtc` and actual `endUtc` by SPICE conversion. Its trajectory and visibility calculations remain the existing replay. Go starts mission science at the actual first replay UTC label. It verifies identical elapsed arrays and an absolute ET epoch difference at most 1e-6 s. Six-decimal UTC labels introduce sub-microsecond representation error. CR1 Jan 6 agrees to 1.1920928955078125e-7 s after alignment. Every body's evaluation uses the existing geometric `NONE` profile.

`comparison.grid` includes nominal requested start, actual SPICE-converted UTC labels, elapsed ET seconds, both ET epochs, observed epoch difference and the 1 microsecond representation tolerance. `period` uses actual first-sample and endpoint labels. The end is excluded from availability samples. The 120 s bins are ET intervals. A nominal UTC-day duration and the actual UTC endpoint can differ at sub-millisecond scale.

The old exact-grid statement is narrowed to exact elapsed-grid and direct-boolean equality, with explicit absolute ET tolerance. The UTC-label sanity check allows 0.001 s deviation from nominal fixed-duration UTC labels across the supported one-day window to accommodate SPICE conversion. Physical event uncertainty remains uncalibrated.

## Communication path and metrics

At each sample and each satellite, relay availability requires simultaneous `siteRelayAvailable[satellite][sample]` AND `relayEarthAvailable[satellite][sample]`. `viaRelayAvailable` is the OR over complete paths through the same satellite. `assistedAvailable` is direct OR viaRelay. Store-and-forward, cross-satellite stitching and combining hops from different timestamps are outside this contract.

Go reuses the existing frame, geometric profile, observer-position, asset-hash, elapsed-grid and direct-visibility checks. It also validates request/site/epoch/profile provenance, terrain configuration, coordinate source and coordinate agreement within 1e-9 degree with longitude wrapping. The Cartesian observer check remains 1e-6 m. These are numerical identity tolerances. They do not represent physical coordinate uncertainty.

For equal 120 s bins, availability fraction equals true sample count divided by total sample count. Duration equals count times 120 s. Longest blackout is the longest consecutive false-bin run. Go independently reconstructs these metrics and rejects a mismatch against the existing adapter summaries. Both direct and assisted summaries include available and blackout intervals, duration, fraction, longest blackout and its coverage-boundary indicator. Ties select the first longest blackout. A zero-blackout result has boundary indicator false.

## Intervals and uncertainty

Intervals are ordered, nonoverlapping half-open [start,end) runs over synchronized sample booleans. Start/end offsets are ET seconds. UTC endpoints are taken from actual SPICE-generated sample boundaries, including the actual evaluation endpoint. Each interval includes `startClipped` and `endClipped` when it touches the corresponding data boundary. These flags denote unknown continuation beyond the requested window.

`intervalMethod.kind=sample-derived`, `transitionTimesRefined=false`, `possibleMissedSubcadenceEvents=true`, `physicalTransitionUncertaintyS=null` and `boundaryContinuityKnown=false` distinguish bin edges from refined physical events. A 100% sampled result can contain missed subcadence outages. Data boundaries create clipped intervals, with no fabricated physical rise/set events.

`rfQualified=false`, `rfAvailability=null` and `continuousAvailabilityValidated=false` are mandatory. The model uses terrain visibility for surface hops and spherical lunar occultation for relay-to-Earth. Operational ground stations, antenna pointing, link budget, frequency, capacity, scheduling and RF qualification remain unavailable. `validation.independentlyValidated=false` is preserved alongside the actual cross-service consistency checks.

## Immutable FE feeds

Run `scripts/exportRelayFeed.py` from the independent relay adapter with `--request`, `--contract-root <repo root>/contracts` and `--output-root <repo root>/frontend/data/feeds`. Install the adapter's `feeds` optional dependency for JSON Schema validation. The default URL is the authoritative Go RelayFeed route.

The compatibility path `data/feeds/relay/<site-id>.json` holds a `skyline-relay-manifest/1.0.0` lookup requiring explicit scenario selection. Payloads live at `data/feeds/relay/scenarios/<scenarioId>.json`. The manifest schema is `contracts/relayManifest.schema.json`. Date/site/height/profile substitution is never implicit. Existing legacy site files remain supported and protected against overwrite.

Publication validates JSON Schema and uses atomic exclusive links. Identical re-export preserves original bytes. A differing payload for an existing identity or unrelated site file fails with a collision. Generation-only creation dates are ignored for idempotency comparison. The immutable payload is published before its lookup convention.

`loadFeed('relay', siteId, scenarioId)` and `RelayCoverage` accept an optional scenario identity. A manifest without selection renders a selection-required state. The consumer checks embedded site and scenario identity, parses the versioned contract, and displays sample-derived geometric status. Its timeline renders authoritative intervals and its readouts convert units. Legacy fixture loading retains its existing behaviour. No frontend orbital calculation is introduced.
