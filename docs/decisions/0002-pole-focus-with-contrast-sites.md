# 0002: South-pole focus plus contrast sites

Status: **proposed**

## Context

The requirements emphasize the south pole (B3, C11), but the curated-site objective (O1) names Apollo sites and other countries' programs. They also ask to make the lunar vs terrestrial differences apparent (C7). The original concept's terrain (`LDEM_80S_*`) covers only ≥80°S.

## Decision

Depth goes to the pole: Artemis regions, IM-1, IM-2, 20/80/240 m terrain. Add **2–3 contrast sites** (Apollo 11, Chandrayaan-3, optionally Chang'e-4 on the far side) using coarser terrain (60°S 240 m; a global 118 m LOLA DEM).

## Consequences

- O1 and C7 are covered, and the "pole is extreme" story becomes visual (Sun high vs Sun skimming; Earth always up vs never up).
- One extra DEM to fetch, and the pipeline must handle non-polar projections.
- Contrast sites use stated, lower terrain accuracy, which is acceptable because their horizon matters less.
