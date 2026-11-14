# Bounded mast placement

Status: implemented. This refines the mast-placement portion of the proposed ADR 0005.

The implemented path enumerates a reproducible local lattice with a spherical exponential map in the validated DE421 terrain frame. It uses the full height-aware skyline and observer evaluation at each generated point. Cable length uses the reference-sphere surface offset, and slope uses a declared coarse DEM footprint.

Known hard constraints are applied before exact six-objective Pareto filtering. The first release bounds locations, evaluations and aggregate samples and uses cooperative wall-time admission. Incomplete results retain unresolved states and conditional fronts. Immutable scenario-addressed feeds preserve the selected grid, heights, epoch, scientific profile and source identities.

The FE consumes server ranks for versioned feeds. Existing legacy data contracts remain accepted. Source, uncertainty and safety limitations are specified in [the methodology](../mast-placement-methodology.md).
