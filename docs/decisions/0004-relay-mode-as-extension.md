# 0004: Relay Mode as a gated extension

Status: **proposed**, refined by [0005](0005-relay-coverage-and-rover-reach.md) (planned relay services instead of one illustrative relay; rover reach added)

## Context

Relay Mode is the project's differentiator and is relevant to R4 (communications), but the requirements don't ask for it. There is no clean orbit dataset, and the relay landscape is shifting (Lunar Pathfinder NET Dec 2026/2027; IM relays; ESA Moonlight 2028+).

## Decision

- **Gate:** start relay work only when the baseline (items D1–D5 and 1–4 in [scope.md](../solution/scope.md)) is done and validated.
- **First setup:** one high elliptical (Queqiao-2-like) relay with cited, versioned, **illustrative** elements.
- **Model:** live contact requires lander↔relay and relay↔Earth line-of-sight at the same instant, with terrain applied to the lander↔relay link through the same skyline. Store-and-forward is out of scope or labelled separately.
- **UI:** a scenario ladder that credits each setup only with its increment over the previous one.

## Consequences

The baseline is protected. If the relay doesn't make it, the product still meets the full set of requirements.
