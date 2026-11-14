# Scientific validation report

Run `python -m pytest -q` in the mission-science environment to execute the test suite.

Tests check analytic disk limiting cases and symmetry, orthonormal local coordinate bases, longitude boundaries, smooth event roots, cadence convergence, always/never-visible cases, missing assets, API validation, nondominated sorting and unavailable scenario handling. Explicit synthetic fixtures are used only inside tests. Production evaluations require the copied real assets.

Real-data tests compare site-topocentric NONE vectors to Moon-centered vectors minus observer position under harmonized axes, compare LT+S spkcpo azimuth/elevation to azlcpo with the same site/frame, verify a nonzero geometric/apparent difference, compare the spherical lunar polar projection against analytical equations, and compare the new disk formula to the DS circular-segment formula with identical input angular radii. Numerical tolerances are in tests/scientific/testScience.py.

An explicit native terrain-site adapter converts the Pydantic site object for the dataclass-based terrain builder. The real 28-day evaluation benchmark completes successfully, with no unavailable or synthetic result substituted.

Cadence experiments on a one-day interval can return identical metrics when no transition occurs. That is an interval-specific result. The analytical cosine-root test exercises known transitions and convergence. The engine always reports possibleMissedEvents because sign-change sampling cannot prove absence of short events or tangencies.

Benchmark Python allocation peaks are not total process resident-memory peaks. Numerical root tolerance is distinct from physical accuracy. The source-manifest check compares the adapted INT-4 source bytes against their recorded hashes.
