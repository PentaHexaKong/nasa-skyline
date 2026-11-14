# Source provenance

configs/sourceManifest.json records original paths, revisions and SHA-256 hashes. The scientific checkout revision is 827d9af. The consolidated interface is in a separate INT-4 worktree. Manifest records for that source should be interpreted against its own worktree revision when checked separately.

Copied and adapted spiceGeometry.py preserves explicit frame names and scoped kernel loading. Copied lunarSites.py preserves the De Rosa Table 2 coordinates and source URL. Copied terrainHorizon.py preserves DEM registration, curvature, NoData rejection and horizon-sector behavior. Content hashes strengthen the inherited size/time cache identity. These modules were selected to avoid reimplementing tested geometric primitives.

The original visibility.py, coverageMetrics.py and verifyCoverage.py were reference-only sources. The new interval metrics integrate bracketed visibility windows instead of inheriting sampled-run weights. The old orbital problemDefinition.py is reference only because the decision variables here are site/date/duration. INT-4 engine.py and its schemas informed explicit profiles and unavailable states without importing or mutating its contract.

The DS sun.py, moon.py, visibility.py, run.py and sites.py were inspected. The new ephemeris uses spkcpo and validates against the harmonized azlcpo direction. The analytic disk formula is independently expressed and compared to the inherited circular-segment equation in tests. The inherited DS code uses a 696000 km solar-radius constant, while this package declares the 695700 km nominal value. Comparisons must harmonize that parameter.

Copied Python sources contained no license header. Repository-wide redistribution permission and applicable license terms require owner confirmation before publication. Original source files and source URLs remain recorded in the manifest.
