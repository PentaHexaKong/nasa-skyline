# Dynamic daily and annual scientific references

## Scope and API ownership

The site report at `/analyze/<site-id>` evaluates its selected UTC day, exact selected instant and calendar year through the existing Go gateway and Python mission-science engine. The linked `/explore/<site-id>` view uses the same day and instant clients for its Sun/Earth directions, visibility status and horizon.

The frontend performs interval aggregation and presentation. SPICE ephemerides, coordinate transforms, observer positioning, terrain horizons, solar-disk fractions and event refinement are owned by the existing Python engine.

Both live reference route loaders read metadata-only catalogue entries, with annual-summary and stored-track loaders excluded from their scientific displays. Site catalogue metadata supplies names, identifiers, the initial date and requested observer height. Computed scientific fields in the reference displays come from validated API responses. The three verified mappings are Connecting Ridge to CR1, De Gerlache Rim to GR1 and Shackleton Rim to SR1. Apollo 11 and the separately defined hill-top observer display unsupported live states with their capability explanations.

## Versioned UTC-window request

`POST /api/mission-science/v1/reference-evaluations` forwards to `/v1/reference-evaluations`.

The request schema is `skyline-reference-request/1.0.0`. Its authoritative JSON Schema is `contracts/referenceRequest.schema.json`, with an identical frontend copy. Supported request windows contain one through fourteen UTC days, bounded at midnight. The existing sampling limit of 6000 intervals applies. The request includes the canonical site, start/end UTC, observer height, scientific profile, visibility definitions, horizon offset, DEM resolution, sampling cadence and event tolerance.

Responses use the existing `skyline-scientific-response/1.0.0` contract. Added metadata under `provenance.sampling.referenceWindow` follows `skyline-reference-window/1.0.0`, exported as `contracts/referenceWindow.schema.json`. It records requested UTC bounds, their actual SPICE ET values and every day's start/end offsets in elapsed ET seconds.

The service converts UTC bounds with the official loaded leap-second kernel while holding the science lock, constructs the existing ScientificRequest with the resulting ET duration and invokes the existing evaluator. It checks that the result's leap-second kernel identity matches the conversion identity. Existing routes and schemas retain their contracts.

## Daily reference

A UTC day uses ten-minute track samples and the engine's event refinement. Its metrics and half-open visibility intervals cover the exact requested UTC day. A separate sixty-second evaluation starts at the exact selected UTC minute, supplying the displayed instantaneous directions, horizon clearances, solar-disk fraction and Earth-center visibility. Its first sample represents the selected instant.

Displayed curves connect API samples for visualization. The white horizon line uses the engine's evaluated visibility horizon, including its zero-degree minimum. The response exposes the raw terrain skyline and evaluated horizon separately. The 3D terrain mesh is a static visualization, while its scientific sky positions, horizon and visibility readouts use live responses.

Sunlight follows any-visible-solar-disk availability. Earth visibility uses the center. Refined events are reported only when supplied by the evaluator inside the requested day. Boundary clipping stays in the underlying interval records. Event tolerance describes numerical root localization and accompanies the engine's possible-missed-event and physical-uncertainty qualifications.

## Bounded annual evaluation

The selected calendar year is divided into at most 27 windows, each containing at most fourteen UTC days. Annual searches use hourly cadence, geometric directions, an 80 m local DEM, zero horizon offset and one-second numerical event tolerance. Each window retains its complete scientific response and scenario identity.

The page shows completed windows and evaluated days. Unfinished days have explicit uncomputed cells. Annual percentages and longest blackouts appear after complete coverage. The stop control ends scheduling after the active bounded request. Re-evaluation obtains fresh responses and uses the engine's identity-aware caches.

Daily annual-chart values are intersections of the returned refined visibility intervals with the server's exact ET day boundaries. Annual shares sum authoritative visible durations and divide by the ET duration between the year's UTC bounds. Longest blackouts join adjacent unavailable intervals across window boundaries. A longest interval's truncation flag refers to the outer annual boundary.

Every window must match observer position and height, terrain identity and skyline, kernels, implementation identity, algorithm, profile and sampling settings. Gaps, overlaps or differing source identities prevent annual publication. A source change between the selected day and annual windows suppresses the annual display until a consistent re-evaluation. UTC calendar boundaries are converted by SPICE, including leap-second and ET/UTC differences.

The engine checks actual kernel and DEM coverage for requested calendar years. A valid UTC calendar date establishes the requested window. Covered and uncovered epochs are distinguished by the scientific response, and invalid or uncovered scenarios retain explicit states.

## Scheduling and stale-result protection

The reference request queue serializes evaluations and gives pending day/instant requests priority over the next annual window. A running window finishes before the next request starts. Changes in site, date, time or re-evaluation attempt suppress obsolete rows during rendering and prevent superseded responses from publishing. Cancelled queued requests are dropped before evaluation.

Complete response JSON Schema validation precedes use. The client verifies echoed scientific settings, observer height and canonical identity, exact period, UTC boundaries, ET day continuity, terrain coverage and source identity. Loading, unsupported, not_computed, unavailable and failed states retain missing scientific values.

## Validation

The complete Python mission-science and rover suites passed 99 tests in 69.34 seconds. Fourteen tests cover reference admission, UTC handling, leap days, nonuniform ET days, missing data, busy state, real CR1/GR1/SR1 evaluations and schema consistency. The test environment emits the existing Starlette/httpx TestClient deprecation warning.

The Go suite passed 89 tests including subtests, with real mission-science integration enabled and four optional relay, rover and legacy orbital live tests skipped. New tests cover reference forwarding and the versioned unavailable envelope.

The final frontend suite passed all 220 tests in 43.30 seconds with real Go-to-Python planner tests enabled. Frontend tests exercise bounded calendar windows, leap years, interval-duration partitioning, cross-window blackout merging, incomplete coverage, kernel/observer/horizon/cadence mismatches, priority scheduling, cancelled queued work, request identity and rendered pending/unsupported states.

A real fourteen-day CR1 evaluation through Go and Python completed in 14.815 seconds. A complete 2026 CR1 browser evaluation covered all 365 UTC days in 27 real windows. Independent aggregation of the captured API responses reproduced the displayed annual sunlight and Earth fractions and both longest-blackout durations. That development-session run took 335.602 seconds with partially warm scientific caches. The production build generated 34 prerendered pages and passed TypeScript compilation. Complete production-browser checks follow below.

## Scientific limitations

Computed outputs retain the engine's validation status and independent-validation flag. Event searches retain possible-missed-event indicators, discretized horizon assumptions and unknown physical timing uncertainty. Ten-minute daily and hourly annual searches have distinct sampling settings, recorded in provenance.

Earth visibility is geometric. Electrical power, RF budgets and operational safety require additional physical models. The raw terrain mesh and scientific horizon have their respective source identities. Educational overview scenes and narrative examples retain their own source-labelled data products.

### Full-year numerical result

For CR1 at 2 m above terrain, calendar year 2026, geometric directions, an 80 m local DEM, hourly annual sampling and one-second numerical root tolerance, the annual sunlight fraction was 0.4878942461214224 and the direct-Earth fraction was 0.4372535697839095. The longest darkness was 12399758.02699399 seconds and the longest direct-Earth blackout was 1352478.6069021225 seconds. The evaluation denominator was 31535999.99999249 SPICE ET seconds. These values describe this scenario and its stated event-search limitations.

### Production browser verification

The production report completed the same 365-day CR1 evaluation in 330.79 seconds. Independent aggregation of all 27 captured responses reproduced its displayed fractions and longest blackouts. A delayed exact-instant response could not overwrite a newer selected time. The linked 3D view displayed API-backed Sun/Earth readouts, and Apollo 11 displayed unsupported annual capability with missing metrics.

The historical UTC leap-second day 2015-06-30 was also evaluated through the real Go/Python route. Its duration was 86400.99997204542 ET seconds and the source included the sample 2015-06-30T23:59:60.000028Z. Regression tests verify finite renderer coordinates and preservation of original leap-second UTC interval labels.
