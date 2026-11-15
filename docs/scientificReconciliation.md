# Scientific reconciliation

The November 15, 2026 fixes address the six scientific and integration findings at commit f789146.

## Rover execution

The primary rover panel consumes the existing Python rover API. Its evaluated domain is a 3 by 3 grid, 80 m cells, two hours from the exact requested UTC landing, geometric directions, a ground-level observer and direct Earth visibility. Movement and stopping require sunlight and communication. The service checks source, midpoint and destination visibility at every traversed time level.

The browser research module remains available to existing callers and tests. It rejects nonempty landing-site relay windows. Its movement calculation checks every hourly bin crossed by a modeled edge. The production planner uses the Python result. Moving-relay availability requires observer-specific compatibility and communication hops.

## Static pipeline

Pipeline 0.5.0 uses MOON_ME_DE421 for the terrain and observer. The seven-kernel inventory includes the DE421 orientation/frame pair. Translational states continue to use DE440. The nominal solar radius is 695700 km.

Intervals reuse skyline_mission_science.visibility.eventIntervals through the local uv dependency. Signed Sun-limb, daylight-limb, Earth-center and Earth-limb margins retain narrow-window information. Initial samples supplement four probes per search interval. Bounded minimum/maximum searches and Brent refinement locate detected events to a one-second numerical tolerance. Solar coarse event search uses at least a 3600-second interval and retains the requested finer initial samples. Earth search uses 3600 seconds and retains its 600-second initial samples. Searches are partitioned into daily chunks and adjoining visible intervals are merged across chunk boundaries. Completeness is conditional on at most one minimum and maximum per search interval. Multiple extrema and skyline discontinuities retain a possible-missed-event qualification.

The five delivered 0.4.0 feeds retain their historical values and source identities. The planner displays a regeneration notice for these feeds. Regenerate from original DEMs and kernels before interpreting them as corrected-profile results. Runtime tests and analytical fixtures do not replace that annual data regeneration.

## Site capabilities

Connecting Ridge, de Gerlache Rim and Shackleton Rim map explicitly to CR1, GR1 and SR1. Apollo 11 and the separate hill-top pick remain visible through their static data. Their live scientific capabilities are unverified and produce no live request. Canonical scientific observer definitions retain their original provenance.

## Source identities

Manifest version 2 hashes Python, JSON and TOML source as UTF-8 bytes with LF line endings. All other assets, including the pinned trajectory CSV, use exact bytes. Verification compares the complete current source inventory with the manifest, catching added or removed runtime files as well as content changes.

## Reproduction

```bash
cd ds
uv sync --all-groups
uv run python -m pytest -q
uv run python -m pipeline.run connecting-ridge --start 2026-11-14 --days 365
# Repeat for de-gerlache-rim, shackleton-rim, shackleton-ridge and apollo11.
cd ..
python scripts/verifyScienceDeployment.py
python -m pytest scripts/testScienceDeployment.py -q
cd services/missionScience && python -m pytest -q
cd ../../frontend && pnpm test && pnpm build && pnpm exec tsc --noEmit
```

## Executed validation on November 15, 2026

| Check | Actual result |
| --- | --- |
| DS suite, locked Python 3.12 environment, real kernels | 62 passed, one network test deselected, 172.50 s |
| Mission-science and rover suite, real assets | 85 passed, 212.40 s |
| Relay adapter, real kernels and terrain | 32 passed, 20.15 s |
| Frontend Vitest | 166 passed across 33 files, 27.51 s |
| Frontend production build | Passed, 35 prerendered pages |
| TypeScript | Passed after route generation |
| Go with live mission, relay and rover services | 46 passed, one optional legacy INT-4 test skipped, 58.21 s |
| Go vet | Passed |
| Source manifest | All 57 source and trajectory identities verified |
| Manifest portability and inventory regressions | Three passed |
| Runtime assets | All nine pinned assets verified |

The event regressions independently recover a hidden 25–35 second visibility interval, preserve grazing and clipping behavior, merge daily boundaries and check the explicit DE421 observer against an independent SPICE frame conversion. Browser regressions reject site-level mobile relay windows and prevent an edge from arriving inside a closed modeled hourly bin.

Local Python services were started temporarily for the Go integration suite. Docker Compose runtime was not exercised because the Docker daemon was unavailable. Mission and relay suites used the existing Python 3.13 scientific environment. The DS suite used its newly installed uv-locked environment. Existing Rasterio/affine pending-deprecation and Starlette test-client deprecation warnings remain.

The annual static feeds have not been recomputed in this change. They remain explicitly identified as requiring regeneration. Mobile-relay support requires further observer-specific validation.

