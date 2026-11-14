# Capabilities and verification

## Event detection and scientific reconciliation

The detector samples four probes per requested cadence and searches for minima and maxima inside each coarse interval. It brackets narrow windows around detected extrema and records grazing contacts. Analytical tests independently check three off-grid quadratic tangencies and three narrow windows against closed-form roots. The Python suite (`python -m pytest -q`) passes (85 passed), with one Starlette/httpx deprecation warning.

Completeness is conditional on the declared regularity assumption of at most one minimum and maximum per coarse interval. Arbitrary oscillations, subresolution events and skyline discontinuities are uncertified. possibleMissedEvents is retained. The fixed 1e-9 contact-value tolerance is numerical and does not represent calibrated physical uncertainty.

The real Earth crossing comparison between 600 s and 30 s requested cadences agrees within 0.00002735 s in that window. Both searches use the same SPICE physics. Independent closed-form grazing tests provide a separate mathematical reference. Numerical agreement is distinct from physical timing accuracy.

frameReconciliation.json records 28 epochs comparing DE421 and DE440 ME transformations through J2000, with asserted closure below 1e-10 km. It also records geometric/apparent Sun differences in arcseconds. Source longitude normalization is explicit. DS catalog frame mapping is unavailable, and the live page uses the verified three-site registry.

## Caches, profiling and scale

Intermediate terrain cache identity includes resolved coordinates, complete DEM hashes, horizon configuration and implementation/dependency identity. Exact ephemeris entries include kernel hashes, observer Cartesian position, correction, body, exact epoch, output frame and implementation/dependency identity. Complete-result identities also include resolved registry fields. Both intermediate caches have finite entry limits.

cacheParity.json confirms identical results after clearing intermediate ephemeris entries, site-coordinate invalidation and profile invalidation. The evaluator profile is saved in benchmarks/evaluatorProfile.txt and evaluatorProfile.pstats.

The predeclared 100-scenario workload completes with every case computed successfully. Cases are four-hour windows at hourly cadence, cycling three sites and advancing start times by four hours. This is not a 28-day-per-case benchmark. Ephemeris counters are 45949 hits and 40166 misses. Horizon counters are 97 hits and three misses. Results are in benchmarks/hundredScenarios.json. A 500-case workload is not covered.

## Predeclared robustness experiment

experiments/broadPlan.json is written before execution and its SHA-256 is checked after execution. Selection uses three sites and four dates, yielding 12 candidates. Each lasts one day and uses the same explicit requirements. Selection delays are 0, 7, 14 and 30 days. Held-out delays are 3, 10, 21 and 45 days and are evaluated at a finer 1800 s cadence. Tie rules and empty-selection handling are declared in the plan.

Both nominal strategies have zero feasible cases among their four held-out evaluations. Worst Earth blackout is 86400 s and worst solar-fraction deficit is 0.5. The robust feasible set is empty and has no held-out performance estimate. The experiment demonstrates no superiority. It is a bounded single-month study, not a general seasonal validation.

Full selection, held-out responses and summaries are saved in broadSelection.json, broadHeldOut.json and broadSummary.json.

## Application integration

The application has an additive Go /api/mission-science/ proxy configured with MISSION_SCIENCE_URL, a public mission-science.html page, its missionScience.js client and a link from the planner. The independent service is wired into Compose with copied assets mounted read-only and its own writable cache volume.

Verification: the Go regression suite and `go vet`; a real httptest HTTP bridge that calls the running Python API and obtains a computed scientific result; JavaScript syntax validation; the production frontend build followed by the TypeScript check (the build generates the site data and route types the check needs, and its output includes the evaluator page and script); and Compose configuration validation. Container deployment and browser visual behavior require separate verification.

Local startup uses python -m uvicorn skyline_mission_science.api:app --port 8014. Configure MISSION_SCIENCE_URL=http://127.0.0.1:8014 for a locally started Go backend. Compose supplies the service URL automatically. The public page is /mission-science.html and exposes the verified CR1, GR1 and SR1 registry.
