# 0003: ML service off the critical path

Status: **proposed**

## Context

The requirements don't call for ML. Sun/Earth visibility is deterministic geometry. Compose currently requires a healthy ML stub for the backend to start, and `/healthz` checks ML.

## Decision

- All baseline requests send `run_ml: false`.
- Put `ml` behind a Compose profile (`profiles: ["ml"]`), and make the backend's `/healthz` ML check conditional on `ML_URL` being set. This is a small Go change.
- Reconsider ML only with a defined target, data, evaluation and a clear benefit over geometry. Candidate ideas, none of them committed: a fast surrogate for horizon masks at arbitrary points (custom coordinates); the NASA–IBM lunar foundation model as a science-interest overlay.

## Consequences

Fewer moving parts. Effort goes to the DS pipeline, the validation and the frontend instead.
