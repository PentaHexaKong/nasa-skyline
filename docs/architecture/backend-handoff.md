# Backend handoff

This file distinguishes the current integration from the proposed scientific contract. The product requirements in [product/requirements.md](../product/requirements.md) ground the core objective. No lunar dataset, orbital model, or physical algorithm has been implemented here.

## Current capabilities and limits

- Go accepts one JSON envelope with an object-valued `input` and optional boolean `run_ml`. Unknown envelope fields are rejected. Domain fields inside `input` are passed through; they are not scientifically validated by Go.
- DS receives `POST /analyze` with `{"input": ...}`. If ML is requested, ML receives `POST /predict` with `{"input": ..., "ds_result": ...}`.
- Omitting `run_ml` runs DS then ML. `run_ml: false` calls DS only and returns `ml: {"status":"skipped"}`. This allows a deterministic geometry baseline without an ML call. Compose starts all four services and `/healthz` requires DS and ML to be healthy.
- Success `status: ok` means HTTP orchestration completed. Scientific meaning is in the service output. `stub_only` is a placeholder even inside a successful response.
- Go preserves downstream JSON values and does not infer sunlight, relay paths, blackout durations, coordinates, units, or data provenance.
- Input and each downstream response are limited to 1 MiB. Uploading GeoTIFFs or SPICE kernels through this route is unsupported. Keep data processing with DS; for larger results, design a separate bounded artifact delivery API before use.
- Processing is synchronous with a shared deadline (default 20 seconds). No task queue, job persistence, result cache, comparison endpoint, or artifact endpoint exists.
- The frontend renders pipeline results from `frontend/data/` and makes no calls to this bridge. A concept demo with synthetic data is served at /demo/, and the API integration screen at /integration.html.

## Proposed contract (not enforced by Go)

Agree this contract with DS and frontend before replacing the stubs. It is a proposal, not a description of implemented scientific behavior. Example values below are synthetic integration inputs; the coordinate is not a selected or validated landing site.

```json
{
  "input": {
    "schema_version": "clps-analysis-v1",
    "site": {
      "id": "synthetic-demo-site",
      "latitude_deg": -89.0,
      "longitude_deg_east": 0.0,
      "observer_height_m": 2.0,
      "body_fixed_frame": "TEAM_MUST_SPECIFY_FRAME"
    },
    "time": {
      "start_utc": "2026-11-14T00:00:00Z",
      "end_utc": "2026-11-15T00:00:00Z",
      "step_seconds": 600
    },
    "earth_elevation_margin_deg": 0.0,
    "relay_scenario_id": "direct_only"
  },
  "run_ml": false
}
```

DS must validate coordinates, frame compatibility, observer height reference, allowed date range, time scale conversions, sampling limits, scenario identifiers, and available dataset coverage. Backend currently validates the JSON envelope only. Do not accept arbitrary caller-supplied file paths or download URLs as dataset identifiers.

Proposed scenario identifiers: `direct_only`, `one_relay`, `two_relays`, `mother_children`, `rim_node_relay`. A name alone does not define an orbit: each non-direct scenario needs an explicit versioned configuration with epoch, frame, orbit parameters or ephemeris, surface node positions where applicable, and assumptions. Unsupported scenarios must be reported as unavailable by the future science implementation.

The proposed DS result should provide:

| Field group | Required agreement |
| --- | --- |
| Status | Explicit fixture, unavailable, or computed classification; computation does not itself establish accuracy |
| Site and time | Echo normalized point, frame, observer height reference, interval, sample duration, and time definitions |
| Skyline | Azimuth convention and elevation values in degrees; frame and horizon method |
| Samples | Sun/Earth azimuth and elevation; visible solar disk fraction; direct Earth visibility; relay reachability |
| Summary | Separately defined sunlight metric, longest dark interval, direct-contact fraction, longest direct gap, relay-assisted contact fraction, longest remaining gap |
| Provenance | Exact dataset/kernel filenames, checksums or immutable version IDs, algorithm version, processing settings, source references |
| Assumptions | Solar disk rule, Earth visibility rule, elevation margin, terrain resolution/extent, orbit model, sampling and interpolation method |
| Warnings | Missing coverage, unvalidated output, illustrative orbits, interval boundary truncation, and timestep limitations |

Metric definitions must be explicit. A time average of visible solar disk fraction differs from the fraction of time with any sunlight. Similarly, direct Earth visibility differs from a working communication link. Longest dark/gap intervals depend on the threshold, sampling, and whether the event extends beyond the selected interval. Frontend must display these definitions and limitations with the result.

For a future relay result, all links along a surface-to-Earth path must be usable at the same evaluated instant under the chosen model. Store-and-forward needs a separate model and label. Go forwards the result; DS owns the graph/reachability calculation. Light, power survival, radio link budget, ground-station availability, and geometric visibility must not be conflated.

ML is an optional extension. A future ML layer can consume a validated DS result; the project must define its prediction target, model version, validation, uncertainty, and applicability. Baseline geometry can be delivered through DS with `run_ml: false`.

## Responsibility and build order

1. Backend owner: maintain request validation, service orchestration, deadlines, logs, Docker wiring, and error contracts. These are implemented in this sandbox.
2. DS owner: agree the scientific schema, build the geometry/data pipeline or offline preprocessing, publish results with provenance, and reproduce one validation case. This remains outstanding.
3. ML owner: replace the ML stub only after a specific optional target and evaluation are agreed. This remains outstanding.
4. Frontend owner: adapt the controls, charts and comparison to the agreed DS schema, real result states, and validated data. That integration is outstanding.
5. Everyone: begin with a small scope (three defined points, limited time range, direct baseline); then add one relay and a second relay after a reproducible baseline. No operational performance claim follows from this sandbox.

The concept also describes a static app over precomputed JSON. That architecture and this Go bridge are two delivery choices: the Go service can coordinate DS/ML for dynamic requests, while precomputed delivery needs an explicit artifact/catalogue design if that route is chosen. Adding JWT or a database does not resolve the missing scientific contract.

## Operational checks

- `GET /livez` on backend port 8080 indicates the Go handler is running, independently of DS/ML.
- `GET /healthz` on backend port 8080 checks DS then ML within a shared three-second deadline. Compose uses it for startup readiness.
- Only frontend port 8080 is published to the host. Health routes are internal, not browser routes in the current Nginx configuration.
- `POST /api/run`: 400 invalid envelope/JSON; 413 body over 1 MiB; 415 unsupported content type; 502 failed or invalid downstream response; 504 downstream deadline exceeded.
- HTTP error responses keep the request ID in `X-Request-ID`. Success also includes it in `request_id`. IDs are generated by Go and forwarded to DS/ML.
- Go does not follow downstream redirects. A redirect is treated as a service failure.
- Default request timeout is 20s. Keep it at or below 20s with the current Nginx 30s proxy timeout. Longer computations need coordinated proxy/server limits or an asynchronous job design.
- Docker stop grace is 30s. Keep `SHUTDOWN_TIMEOUT` below it; increase both together if required. Default shutdown waits up to 10s for active requests; longer active requests can be terminated when that deadline expires.
- Tests use local mock HTTP services. They prove integration behavior, not scientific validity or Docker availability.
