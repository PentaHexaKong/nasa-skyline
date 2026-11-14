# Limitations

The implementation provides a bounded standalone evaluator, API and exhaustive delay-scenario search. Competition readiness remains conditional on the restrictions below.

Only CR1, GR1 and SR1 are enabled curated sites. The DS catalog is inspected but its frame realization and terrain mapping are not reconciled into the new registry. Arbitrary DE421 coordinates are accepted only if the full horizon search region fits the packaged DEMs. Explicit coverage checks reject unsupported terrain.

The solar disk assumes a uniform circle behind a locally straight skyline. Variation across the disk is not integrated. Event detection refines sign changes and reports the possibility of missed subcadence events, multiple crossings and tangencies. Grazing contacts are not certified. Sector horizon jumps are numerical skyline artifacts. Negative-elevation paths are excluded by the terrain model. No calibrated uncertainty interval is supplied.

The 20 m DEM was not copied because it is about 2.7 GB. Resolution sensitivity reports unavailable for that option. The actual 80 m and 240 m rasters are included in the independent project. Terrain horizons depend on a +20 km far-terrain envelope assumption.

Request limits are implementation choices for bounded synchronous execution. They cap interval count at 6000 and cadence at one hour. A 365-day fine-grid workload exceeds these limits. A 1000-configuration request exceeds the search bound. The service returns restrictions instead of launching those workloads. There is no asynchronous job system. Exact site-topocentric ephemeris entries now have a bounded intermediate cache with explicit scientific identity.

The deterministic two-date study is a small in-scenario test and has no held-out delay validation. The default demonstration uses permissive constraints. A separate constrained study supplies explicit illustrative requirements. Neither study establishes comparative scientific superiority or calibrated mission reliability.

Peak Python allocation measurements use tracemalloc and exclude some native allocations. Per-workload total resident-memory peaks remain unmeasured. Test reports contain one Starlette/httpx test-client deprecation warning. Runtime code and dependency locks are independent of the old projects, while Python itself is supplied by the host installation.

Read-only source access and copied input assets preserve the existing scientific integration. Deployment of a separate Go proxy and frontend adoption are outside this project and remain unperformed.
