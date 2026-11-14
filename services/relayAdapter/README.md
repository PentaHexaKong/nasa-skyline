# SKYLINE Relay Adapter

Independent, bounded replay service for the verified nominal two-relay Candidate 2 scenario. The service recomputes SPICE and terrain geometry over copied J2000 trajectory states. The saved orbit is two-body and is valid only for the declared 2025 window.

Install with `python -m pip install -e '.[test]'`. From this project root, start `python -m uvicorn skyline_relay_adapter.api:app --port 8015`. RELAY_PROJECT_ROOT overrides the project/data location and RELAY_ASSET_ROOT overrides the kernel/DEM directory. The default uses the packaged assets. The INT-4 checkout is not imported at runtime.

GET /health reports file presence. GET /v1/capabilities and GET /v1/candidates declare the replay limits. GET /v1/provenance returns the copied-source manifest. POST /v1/evaluate uses the RelayRequest schema. OpenAPI and versioned request/response schemas are in docs.

Run tests with LUNAR_DATA_ROOT set to this project's data/raw/spice. Run `python scripts/regression.py` for the full three-site, 28-day replay check.
