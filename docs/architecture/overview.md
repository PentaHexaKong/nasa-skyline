# Architecture

## Current state

```
Browser ─► frontend (Nginx :8080) ─► backend (Go :8080 internal) ─► ds (:8001 /analyze)  [stub]
                                                              └──► ml (:8002 /predict)  [stub, skippable via run_ml:false]
```

| Component | State | Notes |
| --- | --- | --- |
| `backend/main.go` | Working, tested with mocks | Envelope validation, a 1 MiB limit, 20 s shared deadline, request IDs, JSON logs, graceful shutdown. Domain fields are passed through without validation |
| `ds/server.py` | Stub | Echoes input with `stub_only` |
| `ml/server.py` | Stub | Echoes input. There is no defined target |
| `frontend/` | TanStack Start app, pre-rendered | Renders the pipeline results in `frontend/data/`. `public/integration.html`: textarea → `/api/run` → raw JSON. `public/demo/`: the dummy-data concept demo |
| `contracts/*.schema.json` | Proposed | Request and DS result shapes; see [contracts.md](contracts.md) |
| `examples/*.fixture.json` | Synthetic | For FE work on empty and unavailable states |

Details on limits and error codes: [backend-handoff.md](backend-handoff.md).

## Target (proposed, [ADR-0001](../decisions/0001-static-first-hybrid-architecture.md))

```
                 OFFLINE (batch run)                                  ONLINE (visitors)
 ┌──────────────────────────────────────────────┐        ┌──────────────────────────────────┐
 │ ds/pipeline (Python: spiceypy, rasterio,     │  JSON  │ Static web app (GitHub Pages)    │
 │  numpy)                                      │ ─────► │  web/public/data/*.json          │
 │  sites.json + kernels + DEMs → per-site      │        │  compare · skyline · lanes ·     │
 │  results (clps-result-v1/v2) + provenance    │        │  at-T card · slip · explain      │
 └──────────────────────────────────────────────┘        └───────────────┬──────────────────┘
                                                                         │ optional
                                                         ┌───────────────▼──────────────────┐
                                                         │ Go bridge → DS /analyze           │
                                                         │ custom coords, bounded interval   │
                                                         └──────────────────────────────────┘
```

Principles:
1. **One science codebase.** The same `ds` Python functions power both the offline batch and `/analyze`.
2. **The static path is the default path.** It must work with no server running.
3. **One data contract.** Both static files and live responses validate against `contracts/clps-ds-result.schema.json` (v2 after the proposed changes).
4. **Size budget.** One site × 30 days × 10 min ≈ 4,300 samples ≈ 0.3–0.5 MB JSON. Fine statically, and under the bridge's 1 MiB limit. A year at a 2 h step is similar. Split the files per site × period; don't send years at 10 min.

## Proposed layout

```
ds/
  pipeline/            # pure functions: horizon.py, ephem.py, visibility.py, events.py, metrics.py
  cli.py               # batch: sites.json → web/public/data/
  server.py            # /analyze wraps the same pipeline (replaces the stub)
  tests/               # unit tests with reference-number bounds; convergence tests
data/                  # gitignored raw kernels and DEMs + fetch.sh with sha256
frontend/              # TanStack Start app (static pre-render); see frontend/README.md
  scripts/sync-data.mjs  # splits pipeline JSON into summary + lazy tracks
```

The backend test page lives on at `frontend/public/integration.html` (`/integration.html`).
