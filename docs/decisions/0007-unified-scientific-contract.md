# ADR 0007 — Unified scientific data contract

Status: implemented.

The independent mission-science engine owns scientific calculations and Pydantic contract models. An additive versioned route adapts its results into canonical units and explicit availability states. JSON Schemas and frontend TypeScript declarations are generated from these models. Go forwards and validates the envelope. Frontend code validates the generated schema and performs presentation conversions.

Scenario feeds use the full request and scientific source identity. Atomic publication prevents silent replacement. Existing DS feeds, relay replay contracts and the pinned INT-4 engine retain their established interfaces. Unsupported coordinate mappings remain explicit. See `docs/scientific-contract-v1.md` and `docs/fe-be-scientific-handoff.md` for field semantics and verification evidence.
