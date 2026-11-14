# Site capability matrix

Latitude and longitude below are degrees. Lunar latitude is planetocentric and longitude is east-positive in [0,360). Earth coordinates are reported geodetic WGS84. Heights are metres. The registry retains full source strings, hashes, raster windows and radial observer vectors.

| Canonical identifier | Display name | Body | Latitude | Longitude E | Frame | Ground elevation | Catalog reference height | Live mission science | Relay |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CR1 | Connecting Ridge | moon | -89.4679 | 222.589 | MOON_ME_DE421 | 1942.854987 | 0.0 | supported subject to asset and time checks | supported |
| GR1 | de Gerlache Rim | moon | -88.6952 | 291.7154 | MOON_ME_DE421 | 1779.195574 | 0.0 | supported subject to asset and time checks | supported |
| SR1 | Shackleton Rim | moon | -89.7755 | 203.552 | MOON_ME_DE421 | 1733.724627 | 0.0 | supported subject to asset and time checks | supported |
| apollo11 | Apollo 11, Tranquility Base | moon | 0.67416 | 23.47314 | MOON_ME_DE440_ME421 | -1926.700000 | 2.0 | unverified coordinate realization | unsupported |
| im1-malapert | IM-1 Odysseus, near Malapert A | moon | -80.13 | 1.44 | MOON_ME_DE440_ME421 | 2592.000000 | 2.0 | unverified coordinate realization | unsupported |
| im2-mons-mouton | IM-2 Athena, Mons Mouton | moon | -84.7906 | 29.1957 | MOON_ME_DE440_ME421 | 5321.900000 | 2.0 | unverified coordinate realization | unsupported |
| longyearbyen | Longyearbyen, Svalbard | earth | 78.22 | 15.65 | ITRF93 / WGS84 as declared by DS pipeline | 25.800000 | 2.0 | unsupported by lunar engine | unsupported |
| malapert-massif | Malapert Massif | moon | -86.0011 | 2.055 | MOON_ME_DE440_ME421 | 5156.800000 | 2.0 | unverified coordinate realization | unsupported |
| rjukan | Rjukan, Norway | earth | 59.88 | 8.59 | ITRF93 / WGS84 as declared by DS pipeline | 301.100000 | 2.0 | unsupported by lunar engine | unsupported |
| shackleton-ridge | Shackleton connecting ridge | moon | -89.4749 | 222.5569 | MOON_ME_DE440_ME421 | 1947.500000 | 2.0 | unverified coordinate realization | unsupported |
| viganella | Viganella, Italy | earth | 46.05 | 8.19 | ITRF93 / WGS84 as declared by DS pipeline | 618.900000 | 2.0 | unsupported by lunar engine | unsupported |

ROI elevations retain six decimals here for numerical reproducibility. Their physical uncertainty remains unspecified. DS ground elevations are taken from exports rounded to 0.1 m. Lunar elevations refer to a 1737400 m sphere, with independent registration unresolved for the DS entries. Earth vertical realization remains unresolved.

## Supported independent-engine profile

CR1, GR1 and SR1 support geometric `NONE` and apparent `LT+S` topocentric evaluations, with Earth-center visibility and center/any-disk/full-disk solar rules. Additional observer height is nonnegative metres above interpolated local terrain, within the configured 20000 m absolute radial-height envelope. Each height receives a recalculated skyline and observer-specific SPICE tracks. See `mast-height-science.md` for support and uncertainty. The default horizon uses the 80 m local raster through 50 km and the 240 m extended raster through 400 km, subject to complete coverage and valid cells. A 20 m local request requires a separately provisioned and validated raster.

The continuous kernel intersection starts at 1899-12-31T23:59:18.816Z and ends at 2050-12-31T23:58:50.816Z. ET limits are -3155716800.0 and 1609416000.0. The entire evaluation interval must fit. Pre-1972 UTC labels follow the loaded SPICE leap-second convention. Kernel filenames and hashes are stored in `sourceEvidence.kernels`.

Durations are 60 to 31536000 seconds by the request schema, additionally bounded to 6000 sample intervals. Cadence is 30 to 3600 seconds and cannot exceed duration. The combined maximum is 21600000 seconds at the largest cadence. The runtime validates geometry and terrain availability for each request.

Relay compatibility covers the existing nominal Candidate 2 replay on the 120 s grid from 2025-01-01T00:00:00Z through 2025-01-29T00:00:00Z exclusive. It requires the same terrain observer, geometric profile, zero additional height and zero elevation mask. Standalone duration is at most 28 days. The integrated direct-versus-relay comparison admits at most 86400 seconds. RF qualification is unavailable.

## DEM inventory and cached product limits

| Locations | Recorded DEM identity and resolution | Coverage and validity |
| --- | --- | --- |
| CR1, GR1, SR1 | `LDEM_80S_80MPP_ADJ.TIF`, 80 m and `LDEM_60S_240MPP_ADJ.TIF`, 240 m. Both SHA-256 identities are pinned. | Polar X/Y bounds +/-304000 m and +/-931200 m respectively. Interpolation requires all four surrounding cells and the complete horizon search footprint. |
| shackleton-ridge, malapert-massif, im2-mons-mouton | PGDA 90 20 m near field to 15 km, 80 m to 100 km and 240 m to 200 km. Remote windows/ETags and local hashes retained. | Cached windows only. Live registration remains unresolved. |
| im1-malapert | Same polar tiers, with an additional 75S 30 m grid in the near field. | Cached window supplements the 80S grid edge. Live registration remains unresolved. |
| apollo11 | USGS LOLA global Mar2014 equirectangular raster, exported pixel size 118.4505876 m. URL, ETag, window and scale retained. | Cached 200 km search window. No coverage in the independent local polar rasters. |
| viganella, rjukan, longyearbyen | Copernicus tiles with individual filenames and SHA-256 identities. Per-tile measured resolution and full footprint metadata are absent in the exports. | Cached 40 km search region. Earth vertical datum and live lunar compatibility remain unresolved or unsupported. |

The three app sites' pipeline products cover [2026-11-14, 2027-11-14) at 2 m additional height. They report LT+S and no lunar refraction in the declared DE440 ME frame. Their frame relationship to the publisher's DE421 terrain remains unresolved. No additional live date, height or profile capability is granted by these cached windows.

## Coordinate sources and uncertainty

CR1, GR1 and SR1 quote De Rosa et al. Table 2. Their coordinate uncertainty is unspecified. The frontend inventory preserves each DS source claim verbatim in `dsDefinition` and `coordinateSource`. IM-2 cites final-resting-place LROC images, IM-1 cites NASA/LRO rounded coordinates, Apollo 11 cites a reported LROC anthropogenic-feature table, and the two terrain-selected hill points cite the existing PGDA 69 search definitions. The Apollo 11 0.3 m uncertainty claim remains independently unverified. Earth entries use approximate town/village centers from the project brief or existing registry. No frontend alias to CR1, GR1 or SR1 is admitted.

The machine-readable registry and `site-catalog-reconciliation.md` provide per-entry provenance and unresolved mapping decisions.

## INT-4 mission scopes

These scenario definitions are preserved separately in `externalRegistries`. Ground heights are configuration declarations and coordinate uncertainty is unspecified. All surface coordinates use declared DE421 and the 1737400 m radial sphere. Each source supplies five rover waypoints over 14400 s. Full profiles and source hashes are included in the registry.

| Scope | Mast latitude | Mast signed longitude E | Declared ground elevation m | Epoch and scenario offsets |
| --- | --- | --- | --- | --- |
| S1_CR1_CONNECTING_RIDGE | -89.462 | -137.1 | 1949.4 | 2025-01-01 UTC plus 478800 s |
| S2_SR1_SHACKLETON_RIM | -89.7755 | -156.448 | 1733.72 | 2025-01-01 UTC plus 478800 s |
| S3_GR1_DE_GERLACHE_RIM | -88.6952 | -68.2846 | 1779.2 | 2025-01-01 UTC plus 463200 s |

The configured mast heights are 0, 5, 10, 15, 20, 30, 45 and 60 m, with baseline mast height 15 m and rover antenna height 1.8 m. These are pinned INT-4 mission-engine capabilities. Independent point-site evaluation supports height-specific environment geometry within its radial envelope. Independent nominal relay replay retains its 0 m observer-height constraint. Frozen C2/C4 mission constellations and the independent nominal Candidate 2 replay retain their separate definitions. Source DEM is the configured LOLA 80 m raster. Full observer equivalence and independent relay replay mapping remain unverified for all traverses.
