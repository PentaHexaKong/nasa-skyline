# STATUS

_Last updated: 2026-11-15_

**Lunar Landing Site Navigation** compares lunar landing sites and dates by showing where the Sun and Earth sit relative to the local terrain horizon: sunlight and power potential, and direct-to-Earth visibility windows. A working baseline runs end to end for three south-polar sites. Relay Mode, mast placement and rover reach exist as scientific services and frontend screens, with partial integration (see Known limits).

## Scientific reconciliation — 2026-11-15

The planner lists five sites and automatically evaluates the selected stay through the versioned scientific API. Where the engine answers, its numbers replace the precomputed ones for that stay in the verdict, site cards, table, add-ons and downloaded brief; each site is labelled live or precomputed. Where it cannot (engine offline, or Apollo 11 and the separate hill-top pick, which have no verified live capability), the site keeps its precomputed file and says why. Year-wide views (Dates, next good day, slips) stay on the precomputed files. Site-report pages keep their precomputed report and add a live recomputation of the selected UTC day beside it. The 3D site view uses the precomputed files. See [dynamic references](dynamicReferences.md).

The rover screen shows the browser model's whole-tile reach (direct contact only) beside the bounded Python service's nine 80 m cells over two hours. Mobile relay requires position-specific hop compatibility. The retained browser research model rejects site-wide relay windows and checks every hourly bin crossed by an edge.

Pipeline 0.5.0 uses the explicit MOON_ME_DE421 realization, seven pinned kernels and the IAU nominal solar radius of 695700 km. Its interval calculation reuses the mission engine's extrema-aware event detector with signed margins. Existing 0.4.0 static files retain their original numerical values and provenance. The dynamic planner obtains its scientific baseline from the mission-science API. Annual reference files require regeneration for corrected-profile comparisons.

Source-manifest version 2 normalizes source-text line endings to LF and checks the complete runtime inventory. Trajectory CSV and dataset identities retain exact byte hashes. See [scientific reconciliation](scientificReconciliation.md) for validation and reproduction.

## Where we are

### Sites

| Site | ID | Latitude | Longitude | Note |
| --- | --- | --- | --- | --- |
| Connecting Ridge (CR1) | `connecting-ridge` | 89.4679 S | 222.589 E | Region-of-Interest centre, not a landing point |
| De Gerlache Rim (GR1) | `de-gerlache-rim` | 88.6952 S | 291.7154 E | Region-of-Interest centre |
| Shackleton Rim (SR1) | `shackleton-rim` | 89.7755 S | 203.552 E | Region-of-Interest centre |

- The three observers below have verified live capabilities. Apollo 11 and the separate hill-top pick are also visible through their static feeds. Coordinates are the region centres from De Rosa et al. 2012, Table 2 (doi:10.1016/j.pss.2012.08.002, arXiv 1208.5587), in the ME/PA (DE421) frame, checked against the arXiv PDF.
- Other site definitions (Apollo 11, IM-1, IM-2, Malapert Massif, the Shackleton connecting-ridge hill-top pick) stay in `ds/pipeline/sites.py`. Rerunning the pipeline for them recreates their files, so they can be added back.
- CR1 is the paper's region centre, not the sunniest point nearby. The hill-top pick about 200 m away is the PGDA 69 Sun maximum; `cd ds && uv run python -m pipeline.run shackleton-ridge` computes it for a side-by-side comparison.
- Ground heights from the pipeline agree with the independent engine to about 1 m (1942.6 / 1778.7 / 1734.8 m against 1942.9 / 1779.2 / 1733.7 m).

### Pipeline (`ds/pipeline/`, algorithm 0.4.0)

- Computes skyline, SPICE Sun and Earth tracks, partial Sun disk, 1 s event edges and convergence from LOLA terrain and SPICE for the Moon only, over 365 days from 2026-11-14 at a 1 min step with a 2 m observer height.
- Writes `frontend/data/<site>.json` plus `pipeline.island` terrain. Also `pipeline.pick` (rerunnable hill-top pick: highest PGDA 69 average Sun visibility inside a stated region), `pipeline.relay_check` and `space.py`.
- `space.py` `ephemeris` writes `frontend/data/moon/space.json` (Moon-centred Earth and Sun positions and orientations, ECLIPJ2000, 2 h step over the 365-day window, max Earth interpolation error 21 km, kernels pinned). `textures` bakes `frontend/public/space/` (5.5 MB), provenance in `textures.json` (NASA Blue Marble NG and Black Marble via GIBS, Blue Marble cloud map, SVS Deep Star Maps 2020, SDO/HMI). Clouds are not a real day; the page caption says so.
- New pipeline evaluations use `MOON_ME_DE421` for both observer and terrain geometry. There is no Earth terrain, refraction or GEO comms model.
- `ds/server.py` (the DS service the Go backend calls) is still a **stub** that echoes input with `status: stub_only`.

### Web app (`frontend/`)

TanStack Start, pre-rendered static (35 pages), Kumo on Tailwind v4, SVG charts, dark theme only, Barlow and DM Mono (see [design.md](design.md), [frontend/README.md](../frontend/README.md)). pnpm only; `frontend/pnpm-lock.yaml` is the lockfile.

| Route | What it is |
| --- | --- |
| `/` (Explore) | One scrolling page with a fixed 3D Moon that turns to each chapter: 01 *How long is a day at the south pole?*, 02 *Can a mountain hide the Sun?*, 03 *Is higher ground always sunnier?* (Shackleton Rim is about 210 m lower than the ridge but sunlit 79% against 46%), 04 Earth contact, 05 sites compared, 06 true-scale space scene, then the lesson list. Every number is computed at runtime from pipeline output. |
| `/understand/$lessonId` | Guess-first lessons (`/understand` and `/explore` redirect to `/#lessons` and `/#space`). |
| `/analyze` | Four-step planner (Set up, Result, Dates, Add-ons). The selected stay is evaluated live by the mission-science engine and falls back to the precomputed files, labelled, when the engine can't answer. Result has the verdict, site cards, an At touchdown column and a Live engine panel with provenance. Downloaded briefs include complete scientific responses where live. Mission profiles use labelled example thresholds. |
| `/analyze/$siteId` | Full per-site report ("Explore in 3D" button, "Method and limits" folded). |
| `/analyze/scenario/{mast,relay,rover}` | Follow-ups from Review: missed Sun limits invite a mast investigation, missed Earth limits a relay comparison, rover reach is optional. They keep every planner setting, show the computed baseline, and reject fixture or mismatched-site/period feeds. |
| `/method` | Pipeline, sites, limits and credits. |
| `/prototypes/{mast,relay,rover}` | Dev-only, three directions each, fixture numbers on real terrain; delete when the real screens cover them. |

- Feed-backed Analyze panels (power and masts, relay coverage, validation) read zod contracts in `frontend/src/lib/feed-schemas.ts`, exported to `contracts/feeds/` (handoff: [frontend-feeds.md](architecture/frontend-feeds.md)). Production builds hide a panel whose feed file is missing and show "Coming next: ..."; dev shows every panel with its file path (`showFeed` in `src/lib/feeds.ts`). Feed visibility is per site. Example files in `frontend/fixtures/feeds/` are invented and dev-only.
- Brand: black and white carry the interface; amber is the Sun, cyan is Earth, red is the current moment and alerts. The logo is a Montserrat wordmark with a curved, looping Y; the favicon is the curve alone ([design.md](design.md#identity)).

### Services

| Service | State |
| --- | --- |
| `backend/` (Go) | `POST /api/run` bridge to DS `/analyze`, optional ML `/predict`, plus `/api/scientificengine` routes to the scientific engine. Tested with mocks and, when services run, live. |
| `ds/server.py` | Stub (see above). |
| `ml/` | Stub, off the critical path ([ADR-0003](decisions/0003-ml-off-critical-path.md)). |
| `scientificengine/` | INT-4 adapter over the external pinned source checkout; explicit SPICE, terrain, RF, propagation and mission profiles. See [service guide](../scientificengine/README.md), [ADR-0006](decisions/0006-versioned-scientific-engine.md). |
| `services/missionScience/`, `services/relayAdapter/` | Mission-science, rover and relay-adapter sources, tests, generators and the pinned trajectory, built by Compose from local contexts with hash-verified shared assets. See [scienceDeploymentHandoff.md](scienceDeploymentHandoff.md), [scienceDeploymentValidation.md](scienceDeploymentValidation.md). |

Compose runs the scientific engine with read-only source and raw-asset mounts, persistent horizon caches, non-root execution and mission-readiness-gated backend startup. The rover service starts with the stack and the gateway reaches it at `http://rover-science:8016` by default. If it is down, the rover route answers with a typed unavailable error.

### Scientific capabilities (engine side)

| Capability | What exists | Reference |
| --- | --- | --- |
| Site catalog | Versioned 11-location catalog, strict observer-equivalence checks, source/DEM/kernel provenance, unsupported-site labels | [reconciliation](site-catalog-reconciliation.md), [capabilities](site-capability-matrix.md) |
| Scientific contract v1 | Canonical units, explicit availability states, UTC/ET tracks, clipped intervals, event provenance; generated-schema client; scenario-addressed feed export | [contract](scientific-contract-v1.md), [handoff](fe-be-scientific-handoff.md), [report](scientificContractReport.md) |
| Mast and power | Height-specific terrain/SPICE evaluation, geometric panel exposure (horizontal, vertical, ideal tracking), versioned API, scenario-keyed PowerFeeds. Three sites at 0/2/10/30 m: cold 17-19 s, memoized repeats about 2.4 s (macOS arm64) | [validation report](mastHeightValidationReport.md), [panel assumptions](panel-geometry-assumptions.md) |
| RelayFeed v1 | Go-orchestrated, immutable scenario manifests, simultaneous-hop validation, SPICE clock alignment within 1 microsecond. CR1 Jan 6 gives 0.3625 direct and 1.0 sampled assisted availability. Six scenario exports take 1.0-1.7 s each | [contract](relay-feed-contract.md), [validation](relay-feed-validation.md) |
| Mast placement | Bounded exhaustive search, DEM elevation/slope footprints, hard feasibility, six-objective Pareto ranks, MastFeed contract. CR1 coarse/fine grids take 41.8/72.7 s with three/six nondominated alternatives; peak RSS 572.9 MiB (macOS arm64) | [methodology](mast-placement-methodology.md), [validation](mast-placement-validation.md) |
| Rover reach (prototype) | Independent `skyline_rover_science` package, optional Compose profile; DEM cells feed the observer engine and a bounded time-expanded graph. CR1 reaches 4 of 9 cells on both 120 s and 60 s grids. Stationary relay admission demonstrated; mobile relay unsupported. Schema 0.1.0 proposed | [validation](rover-validation.md), [limitations](rover-reachability-limitations.md), [methodology](rover-reachability-methodology.md), [handoff](rover-fe-be-handoff.md) |

Relay orbit data: exact values from the primary PDFs are in `ds/pipeline/relay_orbits.json`; `python -m pipeline.relay_check` writes [ds/validation/relay-orbits.md](../ds/validation/relay-orbits.md). Propagating Intuitive Machines Table 3 states with Moon J2, Earth and Sun reproduces the paper's 60-day results; plain two-body does not. Relay coverage is valid for shares and gap lengths, not clock times. The paper's tables disagree on LDN-1 by about 237 km in radius, and Table 2's RAAN has a constant 241.49 deg offset; Table 3 is used. Pathfinder has no published epoch or frame, so the check sweeps 144 starting orbits: totals move about 1-2 points, longest gap 2.7-3.2 h. At the three app sites over one lunar month from 2027-03-01: direct 45-50%, plus Pathfinder about 86-87%, plus all five satellites 100%.

## What works and how to verify

```bash
docker compose up --build                  # frontend on http://localhost:8080
cd backend && go test -count=1 ./... && go vet ./...
cd ds && uv run pytest                     # pipeline tests
cd frontend && pnpm install && pnpm test   # Vitest
cd frontend && pnpm exec tsc --noEmit      # TypeScript
cd frontend && pnpm build                  # sync-data, scientific client, vite build (35 pages)
cd ds && uv run python -m pipeline.run <site-id>   # writes frontend/data/<site-id>.json
python3 scripts/prepareScienceAssets.py    # verify the nine pinned science assets
python3 scripts/verifyScienceDeployment.py # verify the packaged source identities
```

Checks on November 15, 2026: 166 Vitest tests, TypeScript clean, 62 pipeline tests with real Moon kernels, and a production build of 35 pages. Services: 85 mission-science tests, 32 relay-adapter tests and 46 Go tests with live mission/relay/rover services. The optional legacy INT-4 Go test is skipped. `go vet` is clean. Biome reports formatting errors in files from the scientific-engine merge; run it on changed files only.

## Data and asset requirements

- Nine pinned deployment assets (NAIF kernels and LOLA terrain) go in `services/missionScience/data/raw/` (git-ignored). Root `README.md` has wget commands with resumable downloads; `prepareScienceAssets.py` checks every size and SHA-256 and reports 9 of 9 verified when complete. The pipeline's own raw data lives in `ds/data/` (git-ignored).
- The legacy `scientificengine` service also needs the pinned INT-4 checkout, located by `SKYLINE_SCIENCE_ROOT`. It is external to this repo.
- Never commit GeoTIFFs or SPICE kernels; commit only small derived JSON with provenance ([CONTRIBUTING.md](../CONTRIBUTING.md)).
- Terrain and illumination sources (PGDA products 69 and 90, `LDEM_75S_30MPP`, `LDEM_60S_60MPP`, `_ERR` layers) are listed in [data/sources.md](data/sources.md); SLDEM2015 stops at 60 S, so Chandrayaan-3 has no valid DEM.
- PGDA product 104 gives 5 m terrain, slope and roughness over Connecting Ridge and Malapert Massif, enough for rover reach without ML. No open polar boulder labels exist.

## Known limits and open issues

- **Terrain accuracy.** LOLA is good enough to compare sites and dates, not to claim an exact horizon at one point; the 0.1 deg skyline target is doubtful for horizons about 100 m away. Metre-scale physical terrain accuracy remains unverified. See [LOLA accuracy](data/sources.md#lola-accuracy-checked-2026-11-14). Terrain error ranges are not yet on the sites.
- **Claims.** Results are geometric opportunities under stated assumptions, not delivered power, a working radio link or guaranteed contact ([claims](science/claims.md)). Continuous and RF availability are unvalidated; construction suitability of placed masts is unverified; rover hazards at subcell scale, battery and thermal survival, traction and operational communications are unmodeled.
- **Catalog capabilities.** Connecting Ridge maps to CR1, de Gerlache Rim to GR1 and Shackleton Rim to SR1. Apollo 11 and the distinct hill-top pick have unverified live capability and are rejected before live requests.
- **Docker.** `docker compose up --build` brings all seven services up healthy on macOS, and live relay comparisons run through the frontend proxy. The `legacy` INT-4 profile needs the external engine checkout and is not part of that check.
- **Relay feed gap.** `pipeline.relay_check` computes direct, plus Pathfinder and plus Intuitive Machines contact per site over one lunar month but writes only Markdown. It needs a writer to `frontend/data/feeds/relay/<site>.json` (scenarios in ladder order, intervals from sampled flags, share, longest gap and truncation, provenance) and one Pathfinder starting orbit chosen and labelled indicative.
- **Relay numbers vs NASA's LCRNS slide.** Our direct-to-Earth shares are higher than its 17-43%; match its definitions (elevation mask, ground stations, Earth rule) before quoting them side by side. Do not quote the relay results beside it until then.
- **Rover.** The production UI consumes the proposed version 0.1.0 Python response. Its current evaluated domain is nine cells over two hours with direct Earth communication. Mobile relay remains unsupported.
- **Placeholders.** Profile thresholds are examples, not sourced requirements. The prototype relay scene uses two-body orbits with a flat horizon, so it is illustrative; its models are stand-ins from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources).

## Next actions

1. Regenerate the five static site feeds with pipeline 0.5.0 and review terrain/event sensitivity under the corrected scientific profile.
2. Write the relay feed writer for `pipeline.relay_check`, then deliver the feed files in [frontend-feeds.md](architecture/frontend-feeds.md) for power, masts, relays and validation. Agree schemas with the frontend first.
3. Review rover schema 0.1.0 and extend grid size, duration or mobile relay only after more scientific validation.
4. Add terrain error ranges from `LDEM_*_ERR` or the PGDA product 78 terrain variants, and rerun at 2 m and 5 m.
5. Validate the predicted-shadow against LROC photo comparison from the PGDA product 90 image pairs.
6. Historical replays (IM-1 Feb 2024, IM-2 Mar 2025) as lessons and profiles: needs pipeline runs for those dates and cited touchdown times.
7. Confirm which Moon body-fixed frame JPL Horizons uses for `coord@301` sites ([method.md](science/method.md#2-ephemeris-spice)); verify the site coordinates in [data/sites.md](data/sites.md) against primary sources.
8. Re-check [data/sources.md](data/sources.md) against current dataset pages; confirm [design.md](design.md) describes the two modes (Explore and Analyze).
9. Idea only: map south-pole pixels in PGDA 69 that no other pixel beats on both Sun and Earth visibility, check the top ones with the pipeline, and never label one "the best site".

Build order for the extension: planner with Moon sites, sunset and Earthset, month timeline, landing windows, power and masts, relay coverage, mast placement, validation panel, rover reach on the Connecting Ridge ([scope.md](solution/scope.md)).

## Open decisions

| # | Decision | Recommendation | Where |
| --- | --- | --- | --- |
| D1 | Delivery architecture: static precomputed, or Go/DS services | Static-first, with the optional on-demand DS endpoint for custom coordinates | [ADR-0001](decisions/0001-static-first-hybrid-architecture.md) |
| D2 | Geographic scope: south pole only, or pole plus contrast sites | Pole focus, plus contrast sites; the app currently ships three polar sites | [ADR-0002](decisions/0002-pole-focus-with-contrast-sites.md) |
| D3 | ML service role | Off the critical path; disable with a compose profile | [ADR-0003](decisions/0003-ml-off-critical-path.md) |
| D4 | Relay Mode timing | After the baseline is validated; one HEO relay first | [ADR-0004](decisions/0004-relay-mode-as-extension.md) |
| D5 | Visibility rules (Sun partial disk, Earth center or any sliver) | Sun: visible disk area. Earth: report both, headline the center-plus-margin rule | [metrics.md](science/metrics.md) |
| D6 | Main-screen layout | "Compare first", plus a skyline per column (see review section 5) | [solution/review.md](solution/review.md) |
| D7 | Short product name (the project is Lunar Landing Site Navigation) | Open: Skyline / Horizon / Pole Position / Lumen | [design.md](design.md#identity) |
| D8 | Shape of the extension | Planned-relay coverage, then rover reach, then power support, on the same engine; no AI recommender, no required counts | [ADR-0005](decisions/0005-relay-coverage-and-rover-reach.md) |
| D9 | Relay-count study and claim: simulate coverage, use Pareto to pick a configuration, claim the result with its math | A what-if study after the relay feed: grid search over stable orbit families, claiming only "smallest of the configurations tested that meets a cited target". Needs a cited target, a stability rerun, a sensitivity check and a benchmark. Accepting a count claim means updating the claims policy and superseding that part of ADR-0005 | [ADR-0005](decisions/0005-relay-coverage-and-rover-reach.md), [claims](science/claims.md) |

Decided: this repo is the project (pipeline in `ds/pipeline/`, results in `frontend/data/`, app in `frontend/`); the app and pipeline are Moon-only; the app shows the three engine-supported sites.
