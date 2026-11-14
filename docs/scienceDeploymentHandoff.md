# Scientific deployment handoff

## Repository layout

Mission-science and rover sources, tests, schemas, examples and export scripts are packaged under services/missionScience. The relay adapter and its tests are packaged under services/relayAdapter. The verified Candidate 2 trajectory is included at services/relayAdapter/data/states/candidate2States.csv with its pinned SHA-256 identity.

Compose builds mission-science and rover-science from ./services/missionScience and relay-adapter from ./services/relayAdapter. The three services share the verified kernel and DEM asset directory through read-only mounts. Go routes, application schemas, frontend declarations and scientific handoff documents are in this repository. The rover Compose profile remains optional.

The source-identity snapshot records 50 runtime source/catalog/trajectory files with their SHA-256 identities. scripts/verifyScienceDeployment.py checks the packaged sources against that snapshot. Subsequent deliberate scientific edits require corresponding provenance review and an updated source-identity snapshot.

## Assets

services/scienceAssets.manifest.json pins the supplied seven NAIF kernels and two LOLA DEMs by content hash and byte size. Runtime assets reside in the ignored services/missionScience/data/raw directory, with spice and lola subfolders. The manifest and provisioner are versioned source artifacts. Each deployment must provision the matching large datasets.

From the application repository, copy and verify an existing scientific asset directory.

```powershell
python scripts/prepareScienceAssets.py --source-root '<path to verified data/raw>'
python scripts/verifyScienceDeployment.py
```

Running prepareScienceAssets.py without a source verifies already provisioned files. Existing mismatched files cause an explicit error. New files are copied to temporary files, checked against the pinned hashes and atomically installed. Source directories can be the independent mission-science assets or an equivalent verified archive. Dataset and kernel acquisition references are documented in docs/data/sources.md and the service provenance records.

Set SKYLINE_MISSION_ASSET_ROOT to use a different host asset directory. This variable controls the three packaged science-service mounts. Asset bytes, cache volumes, virtual environments and generated Python caches belong outside Git review. The 5.2 MB pinned relay trajectory is a versioned scientific input included in the package.

## INT-4 engine prerequisite

The full application stack also uses the scientificengine adapter (the `legacy` Compose profile). Its external, pinned INT-4 source checkout and asset directory are selected through SKYLINE_SCIENCE_ROOT and SKYLINE_ASSET_ROOT. Provide that INT-4 checkout and compatible assets when starting the entire application.

The independent mission-science, relay and rover source builds resolve within this repository. The INT-4 checkout and the legacy adapter configuration are explicit deployment prerequisites.

## Start the application

From the application root, set the legacy INT-4 source and legacy asset variables. The provisioned independent service assets use the local default automatically.

```powershell
$env:SKYLINE_SCIENCE_ROOT = '<path to INT-4 checkout>'
$env:SKYLINE_ASSET_ROOT = '<path to data/raw>'
$env:ROVER_SCIENCE_URL = 'http://rover-science:8016'
docker compose --profile rover config --quiet
docker compose --profile rover up -d --build
```

The application serves on http://localhost:8080. For the baseline stack, omit the rover profile and clear ROVER_SCIENCE_URL. The optional rover route reports its explicit availability state when the service is disabled.

## Test and regenerate

Create a Python environment from each service root with `python -m pip install -e '.[test]'`. Mission-science tests use its local data/raw folder. Relay tests use LUNAR_DATA_ROOT pointing to the shared spice folder and RELAY_ASSET_ROOT pointing to its parent raw folder. Set RELAY_PROJECT_ROOT to the relayAdapter service root when running outside that directory. Run `python -m pytest -q` from each service root.

Generator defaults derive the application root from their packaged location. Runtime services import packaged modules.

```powershell
python services/missionScience/scripts/exportScientificSchemas.py
python services/missionScience/scripts/exportRoverSchemas.py
```

The Go and frontend regression commands remain `go test -count=1 ./...`, `go vet ./...`, `pnpm test` and `pnpm exec tsc --noEmit` from their respective roots. Live Go tests use the service URLs documented in the test files. The verification report is docs/scienceDeploymentValidation.md.

## Review scope

Review services/, scripts/prepareScienceAssets.py, scripts/verifyScienceDeployment.py, the deployment manifests, Compose local build/mount paths and the root ignore rules.

The proposed rover contract retains its team-review status and sampled-model limitations. See docs/rover-fe-be-handoff.md and docs/rover-reachability-limitations.md for supported scope. Mobile relay reachability remains unsupported.
