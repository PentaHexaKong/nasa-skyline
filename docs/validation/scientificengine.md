# Scientific engine integration verification

The `scientificengine/` directory connects the Go backend to the versioned native scientific interface through `POST /api/scientificengine`.

## What the checks cover

- The scientific engine's full Python suite and the Python HTTP transport suite (`scientificengine/tests/testScientificService.py`).
- The existing DS offline suite, with its one network Horizons test deselected.
- The Go suite and `go vet ./...`, including a live test that exercises a real Go HTTP server, the real Python HTTP service and native mission evaluation.
- One request and two real computed response examples validated against the JSON Schemas. The examples include full scientific provenance and profile assumptions.

## Rerun

Run the scientific and HTTP-transport suites in the scientific Python environment, `python -m pytest -q` in the DS environment, and `go test -count=1 ./... && go vet ./...` in `backend/`. For the container deployment checks, see [scientificengine-compose.md](scientificengine-compose.md).

Read [the service guide](../../scientificengine/README.md) for startup and profile meanings. The geometric center profile, historical mission sampling and existing apparent web metrics carry explicit conventions. Solar-disk fraction is `not_computed` in the geometric center profile. Continuous-time service, operational RF reliability, container deployment and frontend adoption of this new contract require their own verification.
