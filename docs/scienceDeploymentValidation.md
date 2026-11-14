# Scientific deployment validation

Validation of the independent scientific services packaged inside this repository.

## Verified packaging

- All 50 runtime Python/catalog files and the pinned Candidate 2 trajectory match their source SHA-256 identities.
- All nine supplied NAIF/LOLA runtime assets match the versioned manifest. The DEM and kernel directory is ignored by Git. The pinned trajectory is available for version control.
- Compose resolves mission-science and rover-science builds to services/missionScience and relay-adapter to services/relayAdapter. Each uses the repository-local verified asset directory through a read-only mount.
- Asset-provisioning fixtures verify valid copy/repeat behavior, existing mismatch rejection, incorrect source rejection with temporary cleanup and root-escape rejection.
- All three images build from repository-local sources. Docker contexts exclude generated Python bytecode and caches.

## Current test results

| Suite | Result |
| --- | --- |
| Mission-science Python | 85 passed |
| Relay-adapter Python | 14 passed, 6 skipped (live-service tests skip without running services) |
| Go (`go test ./...`) | passes |
| Frontend Vitest | 100 passed |

Run live Go tests with the services running: build and start the stack with `docker compose up --build`, then run `cd backend && go test -count=1 ./...` with the scientific service URLs set. The Python suites report the existing Starlette httpx deprecation warning.

## Reproduction

The scientific asset manifest is services/scienceAssets.manifest.json.

Run scripts/verifyScienceDeployment.py to recheck packaged source identities and scripts/prepareScienceAssets.py to recheck the provisioned datasets. Follow scienceDeploymentHandoff.md for clean-machine asset setup, optional rover activation, test environments and merge scope.

The full application requires the external INT-4 checkout through SKYLINE_SCIENCE_ROOT and SKYLINE_ASSET_ROOT. The deployment handoff gives the required configuration. Rover contract review, sampled-model limitations and mobile relay restrictions continue to apply.

## Deployed-image checks

To check the images, run `docker compose up --build`, confirm every Compose service reports healthy, then run the live Go smoke tests for mission-science, the unified scientific contract, relay comparison and optional rover evaluation. 
