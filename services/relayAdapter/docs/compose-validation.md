# Compose and browser validation

All seven Compose services report healthy. The application runs at http://localhost:8080/planner/. INT-4 reports missionReady true. Readiness snapshots are in results/composeReadiness.json and results/int4Readiness.json.

## Browser journey

In desktop Microsoft Edge, the planner links to the mission evaluator, which evaluates CR1 on 2025-01-06 UTC, discovers Candidate 2 and completes the relay comparison. The synchronized timeline download is checked for exact segment boundaries and all ten scientific input hashes. The apparent-profile environmental evaluation succeeds while its incompatible relay comparison stays disabled with an explanation. A fresh page load reports zero browser console errors or warnings.

Screenshots are in output/playwright/mission-to-relay.png, direct-relay-timeline.png and unsupported-profile.png. The browser download is saved as output/playwright/timeline-provenance.json.

## Additional scientific comparisons

Nine one-day windows cover CR1, GR1 and SR1 at 2025-01-06, 2025-01-18 and 2025-01-28. Independent aggregation checks every returned boolean, simultaneous site-relay and relay-Earth composition, direct visibility parity against the mission-service track, fractions and blackout runs. There are zero direct or leg-composition mismatches over 6480 site-time samples. UI timeline segmentation matches the reported visibility intervals in all nine responses.

| Site | UTC date | Direct availability (%) | Assisted availability (%) | Direct blackout (h) | Assisted blackout (h) | Wall seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| CR1 | 2025-01-06 | 36.25000 | 100.00000 | 15.30000 | 0.00000 | 10.332 |
| CR1 | 2025-01-18 | 8.05556 | 100.00000 | 22.06667 | 0.00000 | 22.982 |
| CR1 | 2025-01-28 | 0.00000 | 100.00000 | 24.00000 | 0.00000 | 22.780 |
| GR1 | 2025-01-06 | 100.00000 | 100.00000 | 0.00000 | 0.00000 | 41.713 |
| GR1 | 2025-01-18 | 100.00000 | 100.00000 | 0.00000 | 0.00000 | 21.025 |
| GR1 | 2025-01-28 | 0.00000 | 100.00000 | 24.00000 | 0.00000 | 20.646 |
| SR1 | 2025-01-06 | 0.00000 | 100.00000 | 24.00000 | 0.00000 | 39.807 |
| SR1 | 2025-01-18 | 0.00000 | 100.00000 | 24.00000 | 0.00000 | 21.367 |
| SR1 | 2025-01-28 | 0.00000 | 100.00000 | 24.00000 | 0.00000 | 25.805 |

Request wall times range from 10.332 to 41.713 seconds, totaling 226.458 seconds. Cache state is not controlled across these scenarios. Full responses are saved under results/composeComparisons/.

## Deployment requirements

- Both scientific images need the libexpat1 runtime dependency for Rasterio. Direct scientific import probes check the containers.
- Nginx uses relative redirects so the published port 8080 is preserved in the application address.
- Scientific routes have bounded 90 s execution and matching transport deadlines, because cold scientific work exceeds the default proxy timeout.
- The response logging wrapper has an Unwrap method so ResponseController deadline changes reach the connection. A focused regression test checks this.
- The mission form grid and control sizing keep the date inputs from overlapping.

## Checks and scope

The Go host regression run has 19 top-level tests, with three optional host live-service tests skipped and zero failures. The full deployed services are exercised separately through the nine comparisons and the browser journey. Go vet, the frontend production build, TypeScript checks, JavaScript syntax checks and Compose configuration validation are clean. The new deadline regression specifically checks propagation through the logging wrapper.

This evidence covers desktop browser behavior and the bounded Candidate 2 geometric replay scenario. The environmental summary uses refined intervals, while relay metrics and the synchronized timeline use half-open 120 s bins. The example therefore shows 36.26% refined direct visibility and 36.25% sampled direct visibility, each under its own definition. RF-qualified operational communication, continuous coverage and arbitrary-date relay validity remain outside these results.
