# Set up from scratch

This guide sets up a machine with the code, raw data verified against pinned hashes, and every generated file regenerated. Follow it top to bottom. Each step ends with a check.

What is generated and what is not:

- **Generated** (this guide recreates it): pipeline site results, terrain tiles, the Moon and space ephemerides, globe and space textures, engine feeds (power, mast, relay), the scientific JSON Schemas and generated TypeScript types, and the frontend's synced data.
- **Hand-written inputs** (copied as they are): all code, `ds/pipeline/sites.py` and `relay_orbits.json` (cited sources), `ds/pipeline/checksums.json` (hash pins), `services/missionScience/src/skyline_mission_science/siteCatalog.json`, `services/relayAdapter/data/states/candidate2States.csv` (pinned relay trajectory), `frontend/fixtures/` (invented, dev-only), and the docs.

## Time windows

| Product | Window | Why |
| --- | --- | --- |
| Pipeline site results, Moon ephemeris, space ephemeris | 365 days from **2026-11-14** (`--start 2026-11-14 --days 365`) | The app's analysis period. |
| Engine feeds (power, mast, relay) | **2025-01-06** and **2025-01-28**, one day each | Fixed by the pinned relay trajectory, which only covers 2025-01-01 to 2025-01-29. Moving it needs a new trajectory. |

## 1. Tools

| Tool | Version used | Notes |
| --- | --- | --- |
| Go | 1.24 (`backend/go.mod`) | Backend. |
| uv | 0.11+ | Runs `ds/` on Python 3.12 (`ds/.python-version`). |
| Python | 3.12 | The services use their own venvs (`requires-python >=3.11`). |
| Node | 24 | Frontend. |
| pnpm | 11.22.0 (`packageManager` in `frontend/package.json`) | |
| curl, wget | any recent | Raw data downloads. |
| Docker with Compose v2.20+ | optional | Only for `docker compose up`. |

## 2. Get the code

Copy or clone the repo. The layout is described in the [README](../README.md). Nothing below writes outside the repo.

## 3. Environments

```bash
cd ds && uv sync --all-groups && cd ..
for s in missionScience relayAdapter; do
  (cd services/$s && python3 -m venv .venv && .venv/bin/pip install -q -e '.[test]')
done
(cd services/relayAdapter && .venv/bin/pip install -q -e '.[test,feeds]')
cd frontend && pnpm install && cd ..
```

Run the ds tests with `uv run python -m pytest`, not `uv run pytest`: the venv's `pytest` launcher can point at a stale interpreter.

**Check:** `cd ds && uv run python -c "import rasterio, spiceypy"` prints nothing and exits 0.

## 4. Raw data

There are two copies of the raw inputs, both gitignored: `ds/data/` for the pipeline and `services/missionScience/data/raw/` for the engine services.

**Pipeline data** downloads itself on first use (step 5): the five NAIF kernels, `LDEM_80S_80MPP_ADJ.TIF` (189 MB), `LDEM_60S_240MPP_ADJ.TIF` (219 MB), and the two PGDA product 69 visibility maps. The 20 m and 30 m polar grids are never downloaded whole. Only the windows around each site are read over HTTP range requests and cached in `ds/data/windows/`. `ds/pipeline/fetch.py` checks every file against `ds/pipeline/checksums.json` and stops if a hash differs. A mismatch means the upstream file changed, which can change results: investigate before re-pinning.

**Engine data:** run the `wget` commands in [README.md, "Download the NASA data"](../README.md#download-the-nasa-data), then:

```bash
python3 scripts/prepareScienceAssets.py
```

**Check:** `prepareScienceAssets.py` reports all nine assets verified.

## 5. Pipeline outputs

From `ds/`. The site runs are independent, so run them in parallel.

```bash
cd ds
for s in connecting-ridge de-gerlache-rim shackleton-rim shackleton-ridge apollo11 \
         change4-lroc change6 chandrayaan3 slim luna25-target luna25-impact; do
  uv run python -m pipeline.run $s --start 2026-11-14 --days 365 &
done; wait
for s in connecting-ridge de-gerlache-rim shackleton-rim; do uv run python -m pipeline.island $s; done
uv run python -m pipeline.space ephemeris --start 2026-11-14 --days 365
uv run --group assets python -m pipeline.space textures
uv run --group assets python -m pipeline.globe
uv run --group assets python ../frontend/scripts/moon-previews.py
uv run python -m pipeline.relay_check
cd ..
```

What each writes:

| Command | Output |
| --- | --- |
| `pipeline.run <site>` | `frontend/data/<site>.json`, plus `frontend/data/moon/ephemeris.json` (rewritten only when the window, algorithm or kernels change) |
| `pipeline.island <site>` | `frontend/data/terrain/<site>{,.outer}.{bin,json}` |
| `pipeline.space ephemeris` | `frontend/data/moon/space.json` |
| `pipeline.space textures` | `frontend/public/space/*.jpg`, `textures.json`. The Sun image is SDO/HMI's latest, so it is never byte-identical between runs. |
| `pipeline.globe` | `frontend/public/moon/{color-4k,normal-2k,cap-normal-2k}.jpg`, `globe.json` |
| `moon-previews.py` | `frontend/public/moon/preview/*`, `previews.json` |
| `pipeline.relay_check` | `ds/validation/relay-orbits.md` |

To confirm the site choices behind the catalog, `uv run python -m pipeline.pick malapert-massif` and `... shackleton-ridge` print the PGDA product 69 maxima that `sites.py` quotes (0.819 and 0.884). They write nothing.

**Check:** `cd ds && uv run python -m pytest -q` passes.

## 6. Engine schemas

```bash
services/missionScience/.venv/bin/python services/missionScience/scripts/exportScientificSchemas.py --app-root .
services/missionScience/.venv/bin/python services/missionScience/scripts/exportRoverSchemas.py --app-root .
(cd services/missionScience && .venv/bin/python scripts/exportSchemas.py)
```

These write `contracts/*.schema.json` and `contracts/proposals/rover*.schema.json`, their copies in `frontend/src/lib/`, `frontend/src/lib/scientificContract.generated.ts`, `roverContract.proposed.ts`, and `services/missionScience/docs/{openapi.json,Evaluation*.schema.json,roverSchemas/}`.

## 7. Engine feeds

Feed files are content-addressed (`scenarios/<kind>-<sha256>.json`) and written once. Start from empty `frontend/data/feeds/{power,mast,relay}/` directories.

Power and mast run in-process:

```bash
cd services/missionScience
.venv/bin/python scripts/benchmarkMastPower.py
.venv/bin/python scripts/benchmarkMastPlacement.py --app-root ../..
cd ../..
```

Relay needs the backend and both services running. Use three terminals, or background them:

```bash
(cd services/missionScience && .venv/bin/python -m uvicorn skyline_mission_science.api:app --port 8014)
(cd services/relayAdapter && RELAY_ASSET_ROOT=../missionScience/data/raw .venv/bin/python -m uvicorn skyline_relay_adapter.api:app --port 8015)
(cd backend && MISSION_SCIENCE_URL=http://localhost:8014 RELAY_ADAPTER_URL=http://localhost:8015 go run .)
services/relayAdapter/.venv/bin/python services/relayAdapter/scripts/validateRelayFeed.py --app-root .
```

`validateRelayFeed.py` writes three sites × two epochs to `frontend/data/feeds/relay/`, plus `examples/relayFeed.computed.json` and its relay-adapter copy. It asserts the CR1 2025-01-06 shares (0.3625 direct, 1.0 assisted).

**Check:** the script exits 0, and `frontend/data/feeds/{power,mast}/CR1.json` and `relay/{CR1,GR1,SR1}.json` exist.

## 8. Frontend

```bash
cd frontend
pnpm contracts      # contracts/feeds/*.schema.json and the feed manifest schemas, from src/lib/feed-schemas.ts
pnpm build          # sync-data -> src/data/generated/, scientificClient, then a static build of 44 pages into dist/
pnpm check && pnpm test
cd ..
```

## 9. It matches

```bash
cd backend && go test -count=1 ./... && go vet ./... && cd ..
cd ds && uv run python -m pytest -q && cd ..
(cd services/missionScience && .venv/bin/python -m pytest -q)
(cd services/relayAdapter && .venv/bin/python -m pytest -q)
cd frontend && pnpm test && cd ..
python3 scripts/prepareScienceAssets.py
python3 scripts/verifyScienceDeployment.py
```

Then run the app with `cd frontend && pnpm preview`, or with `docker compose up --build` (frontend on http://localhost:8080).

The key results to expect are in [STATUS.md](STATUS.md#where-we-are). Every number there was taken from the outputs of this guide.

## The legacy scientific engine (optional, external)

`scientificengine/` adapts an external, pinned source checkout ("INT-4") that is not part of this repo. It is off by default: Compose only starts it with `docker compose --profile legacy up`, with `SKYLINE_SCIENCE_ROOT` and `SKYLINE_ASSET_ROOT` pointing at that checkout and its raw data. `services/missionScience/scripts/buildSiteCatalog.py` also needs that checkout. Without it, the committed `siteCatalog.json` is the input, and the steps above don't need it.
