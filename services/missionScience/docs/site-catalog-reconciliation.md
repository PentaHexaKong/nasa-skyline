# Site catalog reconciliation

Implements curated-location provenance and capability reporting for R1, R2, R4, O1 and C2/C8/C9.

## Registry and API

The authoritative reconciliation inventory is `src/skyline_mission_science/siteCatalog.json` in the independent mission-science engine. It contains 11 distinct locations. `scripts/buildSiteCatalog.py` regenerates it from the existing DS registry, all eight frontend exports, the three published ROI centers and the actual independent-engine rasters and kernels. DS coordinates and observer heights must exactly match each corresponding frontend export during generation. Source-artifact, DS-registry, DEM and kernel SHA-256 identities accompany the records. The original engine revision is pinned in `sourceEvidence`.

`GET /v1/site-catalog` returns `schemaVersion` equal to `site-catalog/1.0.0`. The existing Go bridge exposes it at `GET /api/mission-science/v1/site-catalog`. JSON Schema is published as `siteCatalog.schema.json`. The application also includes a real registry snapshot in `examples/siteCatalog.json`. Existing `/v1/sites` consumers continue receiving their three-item list with the existing field names. The existing capabilities and evaluation response contracts retain their versions.

Each record provides its canonical ID, display name, body, latitude convention, east longitude, declared frame, coordinate source/status/uncertainty, observer height, ground elevation/datum, DEM provenance, supported epoch interval, request limits, scientific profiles and relay compatibility. Null values represent unavailable evidence. DEM metadata for cached exports is retained verbatim, including remote ETags and windows where present. Earth tile exports omit measured resolution and complete footprint metadata. Those properties remain unresolved.

The aliases map is empty. All eight frontend IDs remain catalog entries with `scientificCanonicalId` equal to null. The existing planner retains its cached locations. The mission-science form lists all 11 entries and disables live evaluation for unsupported or unresolved entries. Evaluation by an unresolved string ID returns the established `unavailable` response with an explanatory error. Unknown names receive the same explicit failure. Canonical string resolution reads the catalog. Custom DE421 coordinate requests retain their existing API.

## Coordinate authority and observer definitions

The three supported ROI centers use the Table 2 coordinates below. Ground elevations are computed by bilinear interpolation of the actual 80 m raster. Additional observer height is zero metres. The full observer is the planetocentric unit vector multiplied by 1737400 m plus the interpolated radial elevation. The catalog records the resulting Cartesian position in metres and its two-raster identity. Physical coordinate uncertainty remains unspecified by this implementation. These published ROI centers have scientific provenance as study points. [De Rosa et al., Table 2, PDF page 55](https://arxiv.org/pdf/1208.5587#page=55)

The local PGDA 90 rasters use south-polar stereographic coordinates in metres in the DE421 mean-Earth frame. Their spherical radius is 1737400 m. Local CRS checks, radial datum and interpolation registration are required. [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90)

The DS lunar exports declare `MOON_ME_DE440_ME421`, and DS `run.py` also describes that frame as the product 90 grid frame. The publisher identifies the product 90 grids with DE421. This inconsistency remains unresolved for those cached products. A CRS projection string alone cannot establish ephemeris-frame identity. A future verified reconciliation must establish the source realization, construct the full observer in its own datum, and use the NAIF kernel chain through J2000 at each epoch to express it in the target realization. A timestamped vector transform preserves the identity of the input point. A nearby point with a different identifier requires its own observer definition.

Frontend lunar observers add 2 m to exported ground elevations, which are rounded to 0.1 m. Their reported Cartesian vectors carry the `reportedObserverPositionM` field and the declared export frame. Their scientific capability remains unresolved. Apollo 11 remains an equatorial entry with its global DEM provenance.

## Frontend mapping decisions

- `apollo11`. Equatorial Apollo LM location. The DS claim of 0.3 m uncertainty and its ME realization remain independently unverified. The live polar rasters exclude this location.
- `im1-malapert`. Rounded published coordinate. DS explicitly assumes ME, while its export declares DE440 ME. Source realization and local registration require verification.
- `im2-mons-mouton`. DS reports the final Athena resting place, distinct from its intended target. Source realization and terrain registration require verification.
- `longyearbyen`. Earth rehearsal location. Lunar evaluation and relay replay are unsupported.
- `malapert-massif`. Algorithm-selected PGDA 69 maximum within a proxy disc. This point has its own identity. Landing-region outline and frame realization require verification.
- `rjukan`. Earth rehearsal location. Lunar evaluation and relay replay are unsupported.
- `shackleton-ridge`. Algorithm-selected PGDA 69 maximum within a ridge search. CR1 has different latitude, longitude, additional observer height and frame declaration. Mapping remains unresolved.
- `viganella`. Earth rehearsal location. Lunar evaluation and relay replay are unsupported.

Required coordinate mappings stop at this unresolved state. Admitting any frontend ID to scientific evaluation requires authoritative frame and observer evidence, sufficient registered DEM coverage and a verified engine profile. Coordinate-source strings copied from DS are retained as reported claims. The uncertainty claim for Apollo 11 is isolated in `reportedCoordinateUncertaintyM` with an independently-unverified status.

## Equivalence tolerances

`equivalentObservers` requires identical body, explicit frame, vertical datum and non-null DEM identities. Latitude and wrapped longitude differences must each be at most 1e-9 degrees. Full Cartesian observer separation and additional observer-height difference must each be at most 1e-6 m. All components must be finite and both positions must have three components. Frame differences and missing observer or DEM evidence fail verification.

These limits were chosen to admit floating-point representations of an identical observer. At the lunar reference radius, 1e-9 degrees corresponds to approximately 30 micrometres along a great circle. The Cartesian limit imposes a tighter final identity check. Both limits are far below the precision of the published ROI coordinates and the terrain cells. Physical location uncertainty remains a separate catalog field. Longitude normalization handles equivalent values differing by 360 degrees.

Tests exercise equality, longitude wrapping, changed frames/datums/DEMs, missing positions, non-finite coordinates, changed observer height, and values exactly on and immediately beyond the numerical thresholds. The positive alias test uses a synthetic identical-observer alias solely as a test fixture.

## Independent projection and registration verification

The fixtures use Table 2 polar X/Y values in km, converted to metres. CR1 is (-10920, -11880), GR1 is (-36760, 14640) and SR1 is (-2720, -6240). A 5 m per-axis comparison limit follows the table's 0.01 km X/Y rounding. The independent analytic equations use rho = 2 R tan(pi/4 + latitude/2), X = rho sin(longitude), Y = rho cos(longitude). They agree with the projection engine within 1e-6 m for the three centers. [De Rosa et al., Table 2](https://arxiv.org/pdf/1208.5587#page=55)

A separate fixture checks the actual 80 m affine raster transform, derives latitude/longitude analytically at the mean of four interior pixel centers, reads those four raw raster values independently and compares their scaled average against the engine interpolation within 1e-6 m. This catches a half-pixel offset and validates registration to the delivered raster. External absolute terrain geolocation and vertical error remain governed by the source product and its error data.

Apollo 11 is rejected by the polar DEM interpolation coverage check. Missing local rasters produce an unavailable evaluation. Capability declarations describe the versioned asset inventory. Runtime evaluations recheck assets, coverage and time validity, and carry their actual hashes in provenance.

## Reproduction

From the independent mission-science repository, use its Python environment to run `python scripts/buildSiteCatalog.py`, followed by `python -m pytest -q -p no:cacheprovider`. Run `go test -count=1 ./...` and `go vet ./...` from the application's `backend` directory. Catalog schemas derive from `CatalogResponse.model_json_schema()`.

The original orbital engine and frozen INT-4 are preserved. The independent relay adapter retains its verified trajectory and coordinate registry. No aliases are introduced in either existing engine.

## Frozen INT-4 scope inventory

The `externalRegistries` field retains all three configured mission scopes, their waypoint coordinates and ground-elevation declarations, the configured antenna-height set, scientific profiles and source-file hashes. This inventory is read directly from frozen configuration. Its scenario identifiers retain their existing API meaning. They cannot resolve through the independent point-site catalog.

`S1_CR1_CONNECTING_RIDGE` places its mast at latitude -89.462 and signed east longitude -137.1, with configured ground elevation 1949.4 m. Its rover follows five waypoints and uses a 1.8 m antenna. The named ROI reference is CR1. Its mast and moving rover have their own positions. `S2_SR1_SHACKLETON_RIM` and `S3_GR1_DE_GERLACHE_RIM` start at the quoted ROI latitude/longitude, with rounded ground elevations and changing traverses. Equivalence of their full observers to the independent zero-height, interpolated-DEM point observers remains unverified. The catalog creates no scope aliases.

## Verification results

- Independent mission-science Python suite: 35 tests, including 12 catalog tests (direct three-coordinate assertions and the frozen-source generation guard).
- DS Python suite: 57 tests, with one network test deselected by configuration. On Windows, set `PROJ_DATA` and `PROJ_LIB` to the scientific environment's Rasterio `proj_data` directory, which avoids an incompatible PostgreSQL system PROJ database.
- Independent relay-adapter Python suite: 18 tests, zero skipped, with `LUNAR_DATA_ROOT` set to its real seven-kernel directory.
- The full Go suite: 23 top-level tests and 20 subtests, zero failed and zero skipped, with the live mission-science, relay comparison and frozen scientific-engine integrations enabled. It runs in the `golang:1.24-alpine` image in the Compose network with the entire application repository mounted read-only, which preserves access to the contract fixtures. Host `go vet ./...` is clean.
- All seven Compose services report healthy. The deployed catalog exactly matches the packaged JSON, with 11 point entries, three frozen scope inventories and an empty alias map. The legacy site endpoint returns CR1, GR1 and SR1.
- The browser form lists 11 location options, with the eight unsupported or unresolved entries disabled and CR1 selected. A one-hour geometric CR1 evaluation from 2025-01-01T00:00:00Z completes and carries its requested site in scientific provenance.

The test suites emit dependency deprecation warnings. One DS network test is deselected. Authoritative source realization and registered terrain for the unmatched frontend sites remain unresolved.
