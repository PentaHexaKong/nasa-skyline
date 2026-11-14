# ADR 0006 — Versioned scientific engine connection

## Status

Implemented.

## Decision

Use the preserved MD-2C scientific implementation through one versioned Python interface. Run the legacy SPICE, dynamics, terrain, RF and mission code in an isolated serialized process. The process owns its working directory and kernel pool. The Go bridge calls a bounded local HTTP adapter in `scientificengine/` through `POST /api/scientificengine`.

The interface pins scientific source hashes and records raw-file hashes, kernel filenames, runtime versions and profile semantics. Model A and Model B are unused. The existing static web pipeline and `/api/run` route retain their contracts. The geometric center profile and historical mission sample convention are identified separately from the web pipeline's apparent geometry and solar-disk metrics.

## Scope

This supports R1, R2 and R4, and C1, C2 and C9, through a reproducible research API. Analytical RF evaluation is part of the explicitly requested scientific consolidation. Operational RF validity, scheduling, delivered power and communications reliability retain their separate validation requirements. UI adoption requires an explicit mapping between curated app sites and the engine's published ROI and mission coordinates.

## Consequences

The adapter depends on the external INT-4 source checkout and local raw assets. Mission geometry is warmed before HTTP readiness. Concurrency is bounded to one admitted evaluation, with explicit busy and unavailable states. The HTTP extension is verified locally through the real Go-to-Python path. Docker Compose integration supplies read-only source and raw-data mounts, persistent cache volumes and mission-readiness-gated backend startup. The adapter binds the private container network on port 8003.

The INT-4 checkout lives outside this repository and is located by `SKYLINE_SCIENCE_ROOT`.
