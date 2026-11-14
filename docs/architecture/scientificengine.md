# Scientific engine integration

The Go backend exposes `POST /api/scientificengine` through the Python adapter in `scientificengine/`. The scientific code lives in the external INT-4 checkout (`SKYLINE_SCIENCE_ROOT`) and is accessed through `src.science.ScientificEngine`.

The source version is `skyline-scientific-engine/1.0.0`. The request version is `skyline-science-request/1.0.0`. The contracts are `contracts/scientificengine-request.schema.json` and `contracts/scientificengine-result.schema.json`.

See [the service guide](../../scientificengine/README.md) for operations, profiles, units, limits, startup, dependencies and verification. [ADR 0006](../decisions/0006-versioned-scientific-engine.md) records the consolidation decision. The existing Go DS/ML flow and static frontend retain their interfaces.
