# Relay validation report

The adapter suite has 18 tests including 13 copied original geometry tests, API validation, missing assets, request-body bounds, response-state contracts, half-open blackout metrics and altered trajectory rejection. The mission science suite has 23 regressions, including the additive observerPositionM provenance field. Both Python suites emit one test-client deprecation warning.

The full 28-day terrain replay gives the documented Candidate 2 result at CR1, GR1 and SR1. Each site has 20160 available assisted samples, fraction 1 and zero sampled blackout. Execution times are 12.924 s, 12.789 s and 12.078 s respectively. These results match the terrain report's geometric Candidate 2 case and are not a new propagation or RF verification.

The Go live comparison requires observer-position provenance, and rejects a response without it. The same-scenario test runs through a real HTTP Go bridge and both real Python services, using CR1 from 2025-01-06 UTC for one day at 120 s cadence. Direct availability is 0.3625 with longest blackout 55080 s. Direct-or-relay availability is 1 with zero sampled blackout, an improvement of 0.6375. All 720 direct booleans match exactly between services. A cold-start run takes 22.524 s including cold service work.

Numerical and raw evidence are in results/regressionSummary.json, results/integratedComparison.json and results/comparisonSummary.json. Full 28-day per-site responses are also preserved. Go test JSON and pytest JUnit records contain authoritative counts.

Frontend build and TypeScript verification, Compose validation and Go results are recorded in the implementation status. Desktop browser rendering and complete Compose execution are validated for the bounded scenarios in [compose-validation.md](compose-validation.md).

The common-scenario comparison uses exactly matching direct availability arrays. Its refined environmental windows and sampled engineering metrics are labeled separately. Source and saved-trajectory hashes are checked against the original read-only files.
