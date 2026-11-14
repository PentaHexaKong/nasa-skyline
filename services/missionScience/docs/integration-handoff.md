# Integration handoff

Start the new service with the package installed and uvicorn skyline_mission_science.api:app on an explicitly chosen host/port. Zeddin can add a separately versioned Go proxy to the new endpoint. Forward scientific errors and dataState unchanged. Configure the URL separately from the frozen INT-4 service. API admission is serialized and busy responses should be displayed or retried with bounded user-visible handling.

Billy can send configs/exampleRequest.json to /v1/evaluate. Plot timesS against bodies.SUN and bodies.EARTH azimuthDeg/elevationDeg. The horizon has periodic equal-width azimuth sectors starting at north. Use the returned visibility definition and provenance when labeling intervals and fractions. Show unavailable results, missed-event flags and geometric Earth-center semantics. Compare evaluates a common physical definition across supplied requests.

Use /openapi.json and the generated schemas for typed clients. Read /v1/capabilities before submitting long durations or batches. /health is presence-only readiness. An actual evaluation checks hashes, DEM coverage, kernel coverage and source-frame compatibility. The service owns its source and data copies. Its cache root must be writable. Configure one Uvicorn worker for predictable admission limits and process-global SPICE behavior.
