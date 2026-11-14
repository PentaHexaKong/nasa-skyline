# Scientific engine Docker Compose verification

## Deployment

`compose.yaml` starts the non-root scientific service and configures the Go bridge with its private network URL. Backend startup waits for mission readiness. The source checkout and raw assets use read-only bind mounts. Two named volumes hold the interface and mission horizon caches. The native service's default loopback behavior remains available outside Docker.

The Linux image uses Python 3.13 with the existing pinned scientific packages and PyArrow 26.0.1 from the validated native environment. Rasterio also requires the installed `libexpat1` runtime library. The Dockerfile imports its principal scientific packages during build. The backend Dockerfile copies all Go source files, including the scientific route.

No scientific implementation or original experiment output was edited. The container consumes the pinned INT-4 source checkout directly.

## Checks

To run the checks:

| Check | Command |
|---|---|
| Compose config | `docker compose config --quiet` |
| Image builds and startup | `docker compose up --build -d backend` |
| Go suite | `cd backend && go test -count=1 ./...` |
| Go static checks | `cd backend && go vet ./...` |
| Container checks | `python scientificengine/tests/verifyCompose.py` |

The seven container checks cover non-root execution and mount configuration, mission readiness, scientific source integrity, SPICE ephemeris with seven kernel hashes, a 1,440-bin CR1 LOLA horizon with two DEM hashes, native mission parity, and the real Go-to-Python mission route.

The mission parity case is C4, zero-height mast, S1_CR1_CONNECTING_RIDGE. Design identity and feasibility match `examples/scientificengine-result.computed.json`. Each objective has absolute tolerance `1e-9` and C2/C4 trajectory minimum altitudes have absolute tolerance `1e-6 km`, both with zero relative tolerance. The direct scientific response and containerized Go response have identical result objects.

Mission warm-up, source hashing and terrain preparation run before the service accepts requests.

## Reproduce

Run from the repository root.

```bash
docker compose config --quiet
docker compose up --build -d backend
python scientificengine/tests/verifyCompose.py
```

For the complete application, run `docker compose up --build -d`. Host mount overrides and cache lifecycle are documented in `scientificengine/README.md`.

## Verification scope

The scientific service, its backend dependencies and the real scientific HTTP route are meant to be exercised in Linux containers. Frontend image build and browser behavior were outside this verification. Sampled science and analytical RF metrics retain their documented interpretation.
