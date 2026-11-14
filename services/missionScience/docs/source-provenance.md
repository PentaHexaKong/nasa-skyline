# Source provenance

configs/sourceManifest.json records source paths, revisions and SHA-256 hashes for the external INT-4 engine modules this package adapts. The pinned scientific checkout revision is 827d9af. The consolidated interface lives in the INT-4 checkout (`SKYLINE_SCIENCE_ROOT`); read its manifest records against that checkout's own revision.

Adapted INT-4 modules:

- `spiceGeometry.py` keeps explicit frame names and scoped kernel loading.
- `lunarSites.py` keeps the De Rosa Table 2 coordinates and source URL.
- `terrainHorizon.py` keeps DEM registration, curvature, NoData rejection and horizon-sector behavior. Content hashes strengthen its size/time cache identity.

These modules were chosen to avoid reimplementing tested geometric primitives.

INT-4 `visibility.py`, `coverageMetrics.py` and `verifyCoverage.py` informed the metric definitions but are not used. The interval metrics here integrate bracketed visibility windows instead of using sampled-run weights. INT-4 `problemDefinition.py` is not used because the decision variables here are site/date/duration. INT-4 `engine.py` and its schemas informed the explicit profiles and unavailable states without importing or mutating its contract.

The DS `sun.py`, `moon.py`, `visibility.py`, `run.py` and `sites.py` were used as references. The ephemeris uses spkcpo and validates against the harmonized azlcpo direction. The analytic disk formula is independently expressed and compared to the DS circular-segment equation in tests. DS code uses a 696000 km solar-radius constant, while this package declares the 695700 km nominal value. Comparisons must harmonize that parameter.

The adapted Python sources carry no license header. Repository-wide redistribution permission and applicable license terms require owner confirmation before publication. Source URLs and files are recorded in the manifest.
