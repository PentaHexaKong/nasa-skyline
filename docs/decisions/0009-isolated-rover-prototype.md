# 0009 — Isolated bounded rover prototype

Status: proposed for contract review.

## Decision

Implement the scientific prototype as a separate package and optional process beside the validated mission-science engine. Reuse existing terrain and observer evaluation APIs. Keep independent request gating and cache storage, with no rover dependency in core readiness.

Bound the local graph to nine cells and 120 intervals. Use four-neighbor edges, sampled endpoint and midpoint conditions, and upward travel-time snapping. Publish explicit discretization limitations with sensitivity results. Restrict relay comparison to independently compatible stationary canonical observers. Mobile relay evaluation remains unsupported.

Propose schema version 0.1.0 and generated frontend types for review. Existing frontend requirements provide no RoverFeed contract. Follow-up UI integration requires review of grid, time-level fractions and unavailable-state presentation.

## Consequences

Existing services remain usable when the optional rover service is disabled, busy or unavailable. The prototype can demonstrate bounded direct-only reachability and stationary replay differences. It does not implement the broader month-long corridor, shared far horizon or arbitrary mobile relay direction described in proposed ADR-0005. Those require separate validation and budget evidence. The pinned INT-4 engine is not modified.
