# Data contracts

Files: `contracts/clps-request.schema.json`, `contracts/clps-ds-result.schema.json` (JSON Schema 2020-12). Status: **proposed v1**. The Go bridge does not enforce them. The DS service must validate domain fields.

## v1 summary

- **Request** `input`: `schema_version`, `site{id, latitude_deg, longitude_deg_east, observer_height_m, body_fixed_frame}`, `time{start_utc, end_utc, step_seconds}`, `earth_elevation_margin_deg`, `relay_scenario_id`. Envelope: `run_ml` (send `false`).
- **Result:** `data_state` (fixture | computed | unavailable), echo of the site and time, `conventions`, `skyline[]`, `samples[]`, `summary{…}`, `events{sunset, earthset}`, `relay`, `provenance`, `warnings[]`.
- Semantics: `null` = not computed (≠ 0). Event status: predicted / not_within_interval / not_computed / unavailable. See [metrics.md](../science/metrics.md).

## Proposed v2 changes (from the [requirements-coverage review](../solution/review.md))

These map directly to requirement gaps O1, O4 and O5. Agree them with DS and FE before implementing.

| Change | Why |
| --- | --- |
| `input.landing_time_utc` (optional; defaults to `start_utc`) | Countdowns relative to the landing time (O4) |
| `input.earth_visibility_rule`: `center` / `any_sliver` / `full_disk` | Rule made explicit and comparable (T5) |
| `input.panel_model`: `none` / `horizontal` / `vertical_tracking` | Power-potential proxy (R3) |
| samples: `sun_clearance_deg`, `earth_clearance_deg`, optional `power_potential` | "Relative to the horizon" made explicit (R2) |
| events: add `sunrise`, `earthrise` (same object shape) | "Next window" after a set (O4) |
| summary: `sun_elevation_min_deg`, `sun_elevation_max_deg`, `longest_dark_truncated`, `longest_gap_truncated` | O5, T7 |
| summary: `windows.sun[]`, `windows.earth[]` as `{start_utc, end_utc}` lists | Earth visibility windows (O5), lanes |
| site: `name`, `category`, `source` | The curated list (O1) |
| `body_fixed_frame` fixed to `MOON_ME` | Prevents the PA/ME mismatch (T1) |
| `provenance.skyline`: `{azimuth_step_deg, max_range_km, dems[]}`; `provenance.time_step_refinement_s` | Reproducibility |
| relay result: per-scenario `{scenario_id, configuration_id, visible_fraction, longest_remaining_gap_seconds}` list | Scenario ladder |

Bump `schema_version` to `clps-analysis-v2` / `clps-result-v2`. Keep a v2 fixture in `examples/`.

## INT-4 scientific API

The implemented scientific extension uses its own versioned request and result schemas, `contracts/scientificengine-request.schema.json` and `contracts/scientificengine-result.schema.json`. A computed mission example is captured from the real service in `examples/scientificengine-result.computed.json`. The existing CLPS v1 proposals retain their meanings. See [the scientific service guide](../../scientificengine/README.md).

## Site catalog 1.0.0

`GET /api/mission-science/v1/site-catalog` forwards the independent-engine `GET /v1/site-catalog`. The response carries `schemaVersion` equal to `site-catalog/1.0.0`, canonical `sites`, explicit `aliases`, `tolerances` and `sourceEvidence`. The schema is `contracts/siteCatalog.schema.json` and the real inventory snapshot is `examples/siteCatalog.json`. `/v1/sites` retains its existing list contract. Unresolved frontend locations remain catalog entries with unavailable scientific capabilities. See [site reconciliation](../site-catalog-reconciliation.md).

## Unified scientific contract v1

`POST /api/mission-science/v1/scientific-evaluations` forwards the additive typed API. Schemas are `contracts/scientificRequest.schema.json` and `contracts/scientificResponse.schema.json`, with a real API example in `examples/scientificResponse.computed.json`. Frontend schemas and TypeScript declarations derive from the authoritative Pydantic models. See [the contract](../scientific-contract-v1.md) and [handoff](../fe-be-scientific-handoff.md).

## Mast/power contract v1

`POST /api/mission-science/v1/mast-power-evaluations` returns physical height-specific environment evaluations and panel geometry. Schemas are `contracts/mastPowerRequest.schema.json` and `contracts/mastPowerResponse.schema.json`. The existing PowerFeed accepts a zero-height baseline and optional tracking/scenario metadata. Immutable site manifests require explicit scenario selection. See [mast science](../mast-height-science.md) and [panel assumptions](../panel-geometry-assumptions.md).

## RelayFeed v1

`POST /api/relay-engineering/v1/relay-feed` returns the versioned scientific RelayFeed from synchronized Go orchestration. `contracts/relayFeedV1.schema.json` and `contracts/relayManifest.schema.json` describe the computed payload and immutable site lookup. Legacy feeds and the comparison route retain their fields. See [RelayFeed contract](../relay-feed-contract.md).

## Mast placement v1

`POST /api/mission-science/v1/mast-placement-evaluations` forwards the bounded exhaustive placement evaluator. Authoritative schemas are `mastPlacementRequest.schema.json`, `mastPlacementResponse.schema.json`, `mastFeedV1.schema.json` and `mastManifest.schema.json`. Generated MastFeeds retain explicit scenario selection and server-side feasibility/Pareto semantics. See [methodology](../mast-placement-methodology.md).

## Proposed rover contract

An optional isolated rover service provides schema version 0.1.0 for review. Request/response schemas are under contracts/proposals and generated frontend declarations use roverContract.proposed.ts. The Go route is /api/rover-science/v1/reachability-evaluations. See ../rover-fe-be-handoff.md for state, indexing, scenario identity and units. No existing RoverFeed contract is assumed.
