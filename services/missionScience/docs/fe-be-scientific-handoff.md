# FE/BE scientific handoff

Implemented. Scientific fields are computed by the independent Python engine. The Go bridge validates the versioned envelope and canonical units, preserves the payload, and produces typed unavailable/failed envelopes for transport errors.

## Files and ownership

| Artifact | Location |
| --- | --- |
| Authoritative models and invariant validation | mission-science `src/skyline_mission_science/scientificModels.py` |
| Adapter over existing engine | mission-science `src/skyline_mission_science/scientificContract.py` |
| Shared request/response schemas | application `contracts/scientificRequest.schema.json`, `scientificResponse.schema.json` |
| Generated frontend schemas and types | application `frontend/src/lib/scientific*.schema.json`, `scientificContract.generated.ts` |
| Typed frontend parser/API client/feed loader | application `frontend/src/lib/scientificContract.ts` |
| Go proxy and envelope validation | application `backend/missionScience.go`, `scientificContract.go` |
| Schema/type generation | mission-science `scripts/exportScientificSchemas.py` |
| API-derived immutable feed export | mission-science `scripts/exportScientificFeed.py` |
| Real request/response example | application `examples/scientificRequest.json`, `scientificResponse.computed.json` |

Run schema generation from the independent engine environment with `python scripts/exportScientificSchemas.py --app-root <repo root>`. This writes backend and frontend schema copies and TypeScript declarations from the same Pydantic models. Frontend tests compare the copies and parse the real response example. Generated files belong to the scientific contract and can be regenerated after a deliberate versioned change.

## Consuming live data

Use `evaluateScientificScenario(request)` from the frontend library. It validates input against the request schema, posts to `/api/mission-science/v1/scientific-evaluations` and parses the response against the generated schema. Narrow on `dataState` before reading `result`. All noncomputed states carry null result and an explanatory error. `scientificPresentationMetrics` returns null for these states.

The existing mission-science form imports the bundled typed client, reads this endpoint and displays the authoritative durations and availability metrics. It converts seconds to hours and fractions to percentages at rendering. It preserves the requested site/profile and exposes scenario, observer and scientific provenance. Its existing relay comparison still uses the established relay route and validity checks. The frontend performs no new ephemeris, horizon, disk, event or coverage aggregation.

The typed API module supplies the contract for the React UI owners. The existing cached DS planner feeds retain their established schemas and units. The unmatched frontend sites continue to require the coordinate reconciliation documented in `site-catalog-reconciliation.md`. A supported ROI result cannot be substituted for a similarly named DS location.

## Optional precomputed delivery

From the independent engine environment, run the following command against the live Go bridge.

```powershell
python scripts/exportScientificFeed.py --request <repo root>/examples/scientificRequest.json --output-dir <repo root>/frontend/public/scientificFeeds
```

The script prints the immutable scenario-addressed filename. The default API URL is the live Go route. An explicit `--api-url` supports another deployment. Rebuild the static frontend when generated feeds are added to its public directory. `loadScientificFeed(scenarioId)` validates the full response and requires the file's scenario identity to match the requested identity. A site ID cannot be used as a feed filename.

The example response is a real computed API output. Its provenance records the precise request and source identities. It carries computed-only validation status. Synthetic cases used by unit tests are identified as fixtures in test code and are not delivered as mission products.

## UI rules

- Use the returned skyline and samples. Azimuth labels identify periodic sector starts. Effective visibility horizon and raw terrain elevation are distinct exported arrays.
- Preserve the selected solar predicate. A partially visible solar disk can have its center below the horizon. Sun-center availability and disk fraction are distinct fields.
- Display direct Earth results as center-based geometric/apparent visibility under the stated profile. RF connectivity is explicitly not computed.
- Use exported interval and event arrays. Window clipping flags identify incomplete knowledge beyond the window. A window endpoint carries no rise/set event unless a separate observation establishes it.
- Read the longest-outage boundary flag before interpreting a blackout as a complete physical interval.
- Preserve UTC strings, including a possible leap-second label. Use exported elapsed seconds for plotting positions and durations. The duration denominator is ET elapsed seconds.
- Convert canonical units only at presentation. Missing results keep their explicit state and reason.
- Preserve `validationStatus`, `independentlyValidated`, source identities and limitations in provenance views and exported products.

## Compatibility

No existing route or feed schema has a breaking change. New contract versions and the new route are additive. The scientific mission page has the minimal field adapter needed to consume them. The legacy response keeps its schema and carries computation time in provenance. Algorithm 0.3.0 preserves endpoints and does not merge intervals across outages.

The relay adapter retains its separate trajectory-replay contract. The new direct-environment contract supplies the same zero-height terrain observer and profile definitions needed by existing compatibility checks. Supported relay comparisons retain the established 120-second grid, January 2025 window and geometric profile constraints.

The frontend build and dev startup run `scripts/buildScientificClient.mjs` to bundle the same typed client and generated schema into the existing static mission page. The generated public client bundle is excluded from source control. Regenerate it with that script when editing contract code during an existing dev session.

## Mast and panel extension

The additive `/v1/mast-power-evaluations` contract and scenario-selected PowerFeeds are documented in `mast-height-science.md` and `panel-geometry-assumptions.md`. The typed client exports `evaluateMastPowerScenario`. The site manifest requires a full scenario identity for height-specific PowerFeed loading.
