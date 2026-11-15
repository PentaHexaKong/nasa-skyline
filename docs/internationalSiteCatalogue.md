# International lunar site catalogue and exploratory evaluation

## Scope and admission

The versioned `/v1/site-catalog` retains the existing entries and adds eight source-specific locations for five international missions. The frontend `/sites` page uses metadata exported from this authoritative registry. Source-specific alternatives have distinct identifiers. No aliases connect them to CR1, GR1 or SR1.

Daily and annual reference pages request live SPICE and terrain evaluations. Apollo 11 and Shackleton Hilltop also admit exploratory environmental evaluation. The existing five-site mission planner retains its selection dataset. International observers are accessible through the catalogue and reference pages. Relay, rover and mast-placement compatibility require their own scientific qualification.

| Frontend ID | Canonical ID | Latitude degrees | East longitude degrees | Published elevation meters | Admission |
| --- | --- | --- | --- | --- | --- |
| change4 | CE4 | -45.4446 | 177.5991 | -5935 | Specific ME realization unresolved |
| change4-lroc | CE4_LROC2019 | -45.457 | 177.589 | Unavailable | Exploratory LROC estimate |
| change6 | CE6 | -41.6385 | 206.0148 | -5256 | Exploratory |
| chandrayaan3 | CY3 | -69.3741 | 32.32 | 532 | Exploratory |
| slim | SLIM | -13.3160 | 25.2510 | -912 | Exploratory LROC 2024 estimate |
| slim-pgda101 | SLIM_PGDA101 | -13.31549 | 25.24889 | Unavailable | Specific realization unresolved |
| luna25-target | LUNA25_TARGET | -69.545 | 43.544 | Unavailable | Exploratory target location |
| luna25-impact | LUNA25_IMPACT | -57.865 | 61.360 | -360 | Exploratory probable impact location |

## Coordinate evidence and uncertainty

Liu et al. report the Chang'e-4 CE2TMap2015-registered point in an ME coordinate system and give a radial elevation relative to the 1737.4 km sphere. The retrieved publication leaves the particular ME realization unspecified. This tuple remains unresolved for live terrain registration. The distinct LROC estimate has its own identifier and reported approximately 20 m coordinate accuracy. [Liu et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6760200/), [CAS](https://english.cas.cn/newsroom/news/201909/t20190929_219570.shtml), [LROC Chang'e-4](https://lroc.im-ldi.com/images/1087)

Chang'e-6 is reported at -5256 m with approximately 30 m horizontal accuracy. That uncertainty describes location. The source leaves a numerical vertical uncertainty unspecified. Chandrayaan-3 retains the LROC 532 m elevation and LROC coordinate tuple. PGDA's distinct retroreflector estimate is retained in the canonical source record. [LROC Chang'e-6](https://lroc.im-ldi.com/images/1374), [LROC Chandrayaan-3](https://lroc.im-ldi.com/images/1314), [NASA PGDA 101](https://pgda.gsfc.nasa.gov/products/101)

The LROC 2024 SLIM estimate is explicitly labelled ME in JAXA's December briefing. PGDA 101 lists the user-supplied coordinate tuple as a surface location. Its exact realization and its relation to JAXA's original target remain unresolved. The approximately 55 m east landing offset is retained as narrative evidence without deriving another latitude/longitude tuple. [LROC SLIM](https://lroc.im-ldi.com/images/1358), [JAXA December briefing](https://www.isas.jaxa.jp/en/topics/files/SLIM-press-briefing-20241226.pdf), [JAXA January release](https://global.jaxa.jp/press/2024/01/20240125-1_e.html), [NASA PGDA 101](https://pgda.gsfc.nasa.gov/products/101)

Luna-25's target and probable impact point remain separate. LROC reports impact-location accuracy better than 40 m without decomposing horizontal and vertical components. The target elevation remains unavailable. [LROC Luna-25](https://lroc.im-ldi.com/images/1311)

LROC/LOLA exploratory admission uses the documented LRO cartographic convention of DE421 ME and a 1737400 m reference sphere. Each catalogue entry records this publisher-convention inference and its evidence. Individual landing-point registration remains independently unvalidated. The original DE421-to-DE440 SPICE transformations remain explicit wherever those frames interact. [Lunar Coordinate Data Products report, sections on coordinate frames](https://www.lpi.usra.edu/mapsit/standup-committees/LCDP-SAT-REPORT-20211110.pdf)

## Global terrain profile

`localResolutionM=1895.21` selects the official LDEM_16 V3.1 global LOLA image and its PDS label. Nominal equatorial spacing is about 1895.21 m at 16 pixels per degree. East-west ground spacing varies with latitude. This coarse profile supplements the existing polar 80 m/240 m pathway. Both image and label identities appear in DEM provenance and cache keys. Persistent horizon cache identities also include the terrain-reader source hashes. [PDS image label](https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_16.LBL)

The reader checks DE421 ME, pixel-center registration, dimensions, endian order, units, radial reference, scaling and product identity before reading heights. Bilinear interpolation wraps longitude. Unsupported polar interpolation footprints and invalid digital numbers produce explicit unavailable responses.

Observer elevation for computations is DEM ground elevation plus requested height above terrain. Published elevations remain separate source metadata. Their source datum and uncertainty remain visible in the catalogue. Published heights never silently replace a DEM sample.

The existing spherical-curvature horizon builder evaluates near-field bilinear rays and a pixel-center azimuth-sector envelope through a 400 km terrain search. It bounds more distant positive-elevation terrain using the existing declared height envelope. The sector envelope includes adjacent bins. Existing visibility thresholds include the engine's zero-degree reference floor. The coarse product leaves ridges, local hazards and subpixel terrain unresolved. Apparent results retain LT+S correction conventions. Disk visibility, event refinement and possible-missed-event caveats remain in the scientific response.

## Validation boundary

Tests independently check binary pixel-center registration and interpolation, seam wrapping, invalid labels, invalid pixels, an analytical constant-radius sphere, height-specific cache identity and label-content invalidation. Real-data one-hour evaluations cover all seven newly admitted global observers and exercise far-side Earth obscuration. Existing scientific, frontend and Go suites provide regression checks.

These checks verify software behavior under declared inputs. They leave independent site-specific horizon validation and high-resolution terrain registration incomplete. Geometric direct-Earth visibility requires separate RF engineering qualification. Mast placement, rover movement and relay assistance retain their existing admission limits.

## Reproducible metadata

Run `python services/missionScience/scripts/exportSiteCatalogue.py` after registry updates and `npm run sync-data` within `frontend`. The exported metadata contains observer identity, source URLs, frame evidence, resolution, capability and qualification. It carries no fabricated annual coverage values.
