# Implementation status

Analytical, coordinate, disk, event and real-kernel tests pass. Copied scientific primitives were reconciled into the independent namespace. Geometric and apparent profiles use explicit site-topocentric geometry. Curated DE421 sites, terrain coverage checks, cache content identity and explicit unavailable states work. DS catalog enablement, disk-wide terrain integration and certified grazing-event detection remain unsupported.

The evaluator provides site/date evaluation, tracks, selected-definition visibility windows, any/full solar-disk windows, maximum outages and uninterrupted intervals, constraint violations, result provenance, a bounded compare operation and FastAPI endpoints. OpenAPI and request/result schemas are generated. Benchmarks/results.json records actual one-site timings. Five-site measurements are in benchmarks/fiveSites.json when the bounded runner completes. Year-long and 1000-configuration workloads exceed current limits. Whole-process peak memory and independent ephemeris-cache benchmarks remain pending.

The search provides exhaustive enumeration, feasibility filtering, nominal and worst-delay metrics, five-objective nondominance, nominal illumination baseline, nominal Pareto baseline and configurable delay scenarios. Sensitivity.json records cadence, profile, horizon-offset and unavailable alternate-resolution evaluations. ConstrainedSearch.json records a second small experiment with explicit requirements. Statistical generalization, a broader site/date study and calibrated uncertainty remain pending.

This is a functioning bounded prototype. The full acceptance criteria are not yet satisfied for all requested capabilities. See limitations.md and the machine-readable artifacts for exact supported scope.
