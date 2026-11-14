# SKYLINE scientific engine connection

The INT-4 Python interface owns SPICE geometry, native DOP853 propagation, LOLA terrain, analytical RF and MD-2C mission evaluation. This directory supplies the HTTP adapter used by the Go backend. The scientific implementation lives in the external INT-4 checkout, located by `SKYLINE_SCIENCE_ROOT`, and has a pinned physical-source manifest.

## Start locally

Run the scientific service from this directory.

```powershell
./run.ps1
```

The launcher uses the Python interpreter named by `SCIENTIFIC_ENGINE_PYTHON`, which must have the INT-4 scientific environment installed. The service warms the verified four-hour mission world before listening on `127.0.0.1:8003`. The startup replay prepares C2/C4 geometry and performs one reference evaluation.

Start the Go backend from `backend/`.

```powershell
$env:SCIENTIFIC_ENGINE_URL = 'http://127.0.0.1:8003'
go run .
```

The new endpoint is `POST /api/scientificengine`. Its only envelope field is `input`. The Go bridge forwards request IDs, scientific status codes and result bodies. Scientific evaluation uses a single admitted worker and a 1 MiB request/response bound. The existing `/api/run` DS/ML route retains its contract. The Go `/healthz` checks DS and ML. Scientific readiness is available at the scientific service's `/healthz` and through the `describe` operation.

```json
{
  "input": {
    "schemaVersion": "skyline-science-request/1.0.0",
    "operation": "mission",
    "parameters": {
      "scope": "S1_CR1_CONNECTING_RIDGE",
      "orbit": "C4",
      "mastHeightM": 0
    }
  }
}
```

## Versions and scientific meaning

The engine version is `skyline-scientific-engine/1.0.0`. The request version is `skyline-science-request/1.0.0`. Every computed result carries the physical source hashes, hashes and kernel filenames for consumed resources, runtime versions, selected profile and assumptions.

| Operation | Profile | Meaning |
|---|---|---|
| `describe` | `engine-v1` | Versions, capabilities and source-integrity status |
| `ephemeris` | `spice-geometric-v1` | Moon-centered Earth/Sun vectors and explicit frame rotations, aberration `NONE` |
| `terrain` | `lola-horizon-v1` | Cached 0.25-degree ROI horizon using 80 m local and 240 m extended LOLA, 1737.4 km radial datum |
| `surface` | `lola-geometric-center-v1` | Topocentric body-center Sun/Earth visibility over the terrain horizon, uniform half-open bins |
| `rf` | `lunar-rf-analytical-v1` | Existing illustrative RF presets and analytical link budgets |
| `propagate` | `third-body-dop853-v1` | Native Earth/Sun DOP853 and trajectory-wide safety events, fixed 2025 epoch and explicit 7,200-second padding |
| `mission` | `md2c-v1` | Corrected three-objective four-hour infrastructure evaluation at 30-second endpoint-inclusive sampling |

The `surface` operation reports body-center visibility. `visibleSolarDiskFraction` is `null` with `solarDiskStatus` set to `not_computed`. Existing web-pipeline apparent `LT+S`, solar-disk and event outputs retain their own lineage. The new geometric profile is identified explicitly in every result. The ROI identifiers CR1, GR1 and SR1 refer to the engine's published coordinates. Public site metadata supplies longitudeDegEast in [0,360) and retains the signed published sourceLongitudeDeg. Historical mission placement.longitudeDeg keeps its original signed east-longitude convention. The S1 mission mast and rover traverse have their own committed coordinates. App site identifiers require an explicit mapping before UI adoption.

Propagation accepts one committed `candidateId` or an 11-value optimizer `decisionVector`. The original decoder rounds the satellite-count gene and uses only the active phases. The response records the encoded gene and actual count. Omitted cadence and duration select 600 seconds and 28 days. Exporting state arrays is bounded to 2,048 satellite samples. Summary safety evaluation supports the full horizon. Mission evaluation retains its separate 481-sample four-hour convention and count-based blackout metric.

RF budgets are analytical assumptions. Sampled visibility, continuous availability, hardware RF validity, station scheduling and operational communications reliability have separate validation requirements. ML and optimization are outside this HTTP interface. Model A remains unapproved for pruning.

## Configuration

| Environment variable | Default |
|---|---|
| `SKYLINE_SCIENCE_ROOT` | none; set it to the INT-4 checkout |
| `SKYLINE_ASSET_ROOT` | `../../Nasa/data/raw` (relative to this repo's parent workspace) |
| `SKYLINE_CACHE_ROOT` | `scientificengine/data/cache` |
| `SCIENTIFIC_ENGINE_PYTHON` | Python interpreter with the INT-4 scientific environment |
| `SCIENTIFIC_ENGINE_URL` | Set on the Go backend to the service URL |

The source checkout and raw assets remain required dependencies. The manifest pins the physical implementation. Source modifications during a worker's lifetime invalidate evaluations. Keep raw assets immutable while a service instance is running and restart after any asset update. A worker timeout terminates that worker and returns an explicit unavailable result. Mission readiness becomes false after a worker failure or timeout, and restarting with the default warm-up restores the prepared mission context.

The source checkout's raw-data junctions must resolve to the same asset root for the `mission` profile. Missing kernels, missing DEMs, NoData and unsupported terrain remain explicit unavailable results. Physical slope and siting rejections remain computed infeasible designs.

The native HTTP listener defaults to loopback. Docker Compose starts the scientific service on the private Compose network and connects the Go backend automatically. The container listener uses `0.0.0.0:8003` internally. Only the frontend publishes a host port.

## Docker Compose

From the repository root, run the complete stack.

```powershell
docker compose up --build -d
```

The scientific image uses Python 3.13 and the pinned packages in `requirements.txt`. Set `SKYLINE_SCIENCE_ROOT` (the INT-4 checkout) and `SKYLINE_ASSET_ROOT` (the raw data) in the shell or Compose `.env` to give their host paths. Both directories must exist. Compose mounts them read-only, with the asset directory nested at `/science/data/raw` so the mission evaluator resolves the same dataset mapping on Linux.

Two named volumes retain the interface horizon cache and the mission horizon cache. The service runs as UID/GID 10001. Raw data and scientific source files remain on their read-only mounts. Cache deletion is explicit through `docker compose down --volumes`.

Mission warm-up finishes before the listener starts. The health check requires `missionReady`, allows a five-minute startup period and gates backend startup. Initial startup includes source and asset hashing, DOP853 propagation and terrain evaluation. Inspect progress with `docker compose logs -f scientificengine`.

For the scientific API and Go bridge without the frontend, run `docker compose up --build -d backend`. Compose starts its service dependencies. The frontend routes `/api/scientificengine` to the Go bridge when the full stack is running.

Run the container smoke verification after the backend is healthy.

```powershell
python scientificengine/tests/verifyCompose.py
```

This checks read-only source/asset mounts, persistent writable caches, readiness, native SPICE, LOLA terrain, mission evaluation, and the real containerized Go-to-Python route. It also compares mission objectives against the committed INT-4 reference response with numerical tolerances. The existing scientific algorithms and source manifest are used unchanged.

## Verification

```powershell
$env:SCIENTIFIC_ENGINE_TEST_URL = 'http://127.0.0.1:8003'
cd ../backend
go test -count=1 ./...
go vet ./...
```

The live Go test starts a real HTTP bridge and calls the real Python service for `describe` and a warmed mission evaluation. Other proxy tests use synthetic services. The Python transport tests use explicitly synthetic engine responses.

```powershell
& $env:SCIENTIFIC_ENGINE_PYTHON -m pytest -c scientificengine/pytest.ini scientificengine/tests
```

Run that command from the repository root with `SCIENTIFIC_ENGINE_PYTHON` set. The unified scientific parity suite is `tests/science/testScientificEngine.py` in the INT-4 checkout. Run INT-4 entry points with `python -m` using the interpreter in `SCIENTIFIC_ENGINE_PYTHON`.
