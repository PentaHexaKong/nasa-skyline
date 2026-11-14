# Data sources

Links checked 2026-11-14.

Storage rule: raw files go in `data/raw/` (gitignored), fetched by a script with checksums. Only small derived JSON is committed.

## Terrain: NASA Goddard PGDA, LOLA ([product 90](https://pgda.gsfc.nasa.gov/products/90))

| File | Size | Use |
| --- | --- | --- |
| [LDEM_80S_80MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF) | 180 MB | South pole ≥80°S. Mid-field 10–100 km. **Start here.** |
| [LDEM_80S_20MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF) | 2.5 GB | Near field. Read windows over HTTP range requests; don't download it whole |
| [LDEM_60S_240MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF) | 209 MB | Far field to 200 km; sites near 80°S; Chandrayaan-3 (~69°S) |
| [LDEM_75S_30MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_75S_30MPP_ADJ.TIF) | 2.7 GB | 30 m to 75°S. Sharper mid-field for every Artemis site and IM-2. Windowed reads |
| [LDEM_60S_60MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_60MPP_ADJ.TIF) | 2.9 GB | 60 m to 60°S. **Chandrayaan-3 (~69°S)** and the far field for IM-1 (80.1°S), whose 200 km rays reach ~74°S. Windowed reads |
| `LDEM_*_ADJ_ERR.TIF` (same folder, one per DEM) | ≈ DEM size | Height uncertainty. Sample it at each site to put error bars on the skyline (nice to have) |
| [LDEM_80S_80MPP_ADJ_HILL.TIF](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ_HILL.TIF) | 84 MB | Hillshade basemap for the site picker |

Facts from the product 90 page (checked 2026-11-14): all TIFs are **Cloud-Optimized GeoTIFFs** in south polar stereographic X/Y metres, in the **MOON_ME frame of the DE421 ephemeris**. The server answers `Accept-Ranges: bytes`, so windowed reads work. The page does not state the reference sphere radius: read it from the file metadata.

**Non-polar contrast sites (Apollo 11, Chang'e-4, Blue Ghost M1) need a global DEM** (links checked 2026-11-14). Chandrayaan-3 (~69°S) does **not**: use `LDEM_60S_60MPP` above. Accuracy matters less at low latitudes because the Sun and Earth are high in the sky.
- [USGS: Moon LRO LOLA DEM 118m](https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m): global and simplest.
- [USGS: LOLA + SELENE Kaguya TC DEM Merge 60N60S 59m](https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m) (SLDEM2015): sharper, but covers 60°N–60°S only, so not Chandrayaan-3.

**Optional, higher resolution:** [PGDA product 78: High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78) (~5 m tiles for specific sites). Use it for near-field terrain at a few hero sites if their tiles cover our points.

Citation for product 90: Barker et al. 2023, "A New View of the Lunar South Pole from LOLA", *Planet. Sci. J.* 4, 183, [doi:10.3847/PSJ/acf3e1](https://doi.org/10.3847/PSJ/acf3e1). Data DOI: 10.60903/gsfcpgda-lola-spole. Background paper: [NTRS 20205009660](https://ntrs.nasa.gov/citations/20205009660).

### LOLA accuracy (checked 2026-11-14)

Read from the [Barker et al. 2021 PDF](https://ntrs.nasa.gov/citations/20205009660) and the [Barker et al. 2023 PDF](https://ntrs.nasa.gov/citations/20230014419).

| Quantity | Published value | Applies to |
| --- | --- | --- |
| Track position error | About 10–20 cm horizontal and 2–4 cm vertical | 5 m site maps (2021) |
| Track position error | 1 m horizontal and 0.15 m vertical, stated as conservative | Polar maps of product 90, including our 20 m grid (2023) |
| Frame alignment | A few metres, MOON_ME of DE421 against the principal-axis frame | Coordinates in the LOLA maps |
| Height error | About 0.30–0.50 m RMS | 5 m site maps |
| Slope error | About 1.5–2.5° RMS | 5 m site maps |
| Pixels with no LOLA spot | About 90%, filled by interpolation | 5 m site maps |
| Near horizon distance | About 100 m, sometimes tens of metres, up to about 1 km | Site 1 analysis (2021) |
| Far horizon distance | About 50–200 km | Site 1 analysis (2021) |
| Worst-case average sunlight (1st percentile of 100 terrain variants) | 67–71% at 1 m height, 83–89% at 5 m height | Site 1 regions of interest (2021) |

- The 2021 paper says terrain uncertainty has an "almost negligible" effect on illumination at 5 m above the surface. Our default observer height is 2 m, which is closer to the sensitive case.
- The 2021 paper found that terrain variants usually give less sunlight than the unperturbed map. Best-pixel picks from `pipeline.pick` therefore probably run optimistic. This conclusion is our inference.
- The 2021 uncertainty model does not include boulders.
- Our own arithmetic: a 0.4 m height error is 0.23° at 100 m and 0.02° at 1 km. The Sun's radius is 0.27°.
- We have not extracted a typical height error for the 20 m grid. Sample `LDEM_80S_20MPP_ADJ_ERR.TIF` for it.
- The pipeline does not use the `_ERR` layers yet, and `ds/validation/` has no check of Moon terrain against real images.

## Geometry: NASA JPL NAIF SPICE ([generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/))

| Kernel | Size | Use |
| --- | --- | --- |
| [naif0012.tls](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls) | 5 KB | Leap seconds (UTC ↔ TDB) |
| [de440s.bsp](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp) | 31 MB | Sun/Earth/Moon positions, 1849–2150 |
| [moon_pa_de440_200625.bpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc) | 12 MB | High-accuracy lunar orientation (PA frame) |
| [moon_de440_250416.tf](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf) | tiny | Frames: PA ↔ ME. Use `MOON_ME_DE440_ME421`: it is the DE440 ME frame aligned to DE421's, which is the frame LOLA product 90 uses |
| [pck00011.tpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc) | tiny | Radii and constants |

Python: `spiceypy`. Cross-check with the [JPL Horizons API](https://ssd.jpl.nasa.gov/horizons/). The example query below gives the Sun from 89.9°S for 2026-11-14 to 2026-11-15:
`https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='10'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='0,-89.9,0'&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER&QUANTITIES='4'&START_TIME='2026-11-14'&STOP_TIME='2026-11-15'&STEP_SIZE='1d'`

## Validation: PGDA illumination maps ([product 69](https://pgda.gsfc.nasa.gov/products/69))

| File | Size | Use |
| --- | --- | --- |
| [AVGVISIB_85S_060M_201608.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF) | 32 MB | Average sunlight. **An 18.6-yr average** |
| [AVGVISIB_85S_060M_201608_EARTH.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608_EARTH.TIF) | 24 MB | Average Earth visibility (**any sliver** rule) |
| [AVGVISIB_75S_120M_201608.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF), […_EARTH.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608_EARTH.TIF) | — | Same maps to 75°S at 120 m. **Needed for IM-2 (84.8°S) and Artemis points north of 85°S** |
| [AVGVISIB_65S_240M_201608.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_65S_240M_201608.TIF), […_EARTH.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_65S_240M_201608_EARTH.TIF) | — | Same maps to 65°S at 240 m. **Needed for IM-1 (80.1°S) and Chandrayaan-3 (~69°S)** |
| [LPSR_85S_060M_201608.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_85S_060M_201608.TIF) | 1 MB | Permanently shadowed regions overlay |

`LPSR_75S_120M` and `LPSR_65S_240M` exist too. Each file is also offered as IMG, JP2 and COG; the PGDA page has a few mislabelled LPSR links, so check the filename after download.

Product 69 facts (checked 2026-11-14): hourly steps over 18.6 years; polar stereographic, reference radius 1737.4 km. Earth counts as visible "if any part of its disc is not obscured". **The observer height is not stated**, so compare with our 2 m default as an approximate match, not an exact one.

Also usable as the site-picker basemap (label it "long-term average").

## Sites and imagery

| Source | Use |
| --- | --- |
| [USGS Artemis candidate region nav grids](https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids) | Region outlines. We still choose and document exact points |
| [NASA Artemis region update (28 Oct 2024)](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) | The 9 region names |
| [Moon Trek](https://trek.nasa.gov/moon/) | Visual reference |
| PGDA product 90 NAC pairs: `M*_20MPP_MODEL.TIF` (PGDA's simulated image) with `M*LE_20MPP.TIF` / `M*RE_20MPP.TIF` (the real LRO NAC frames, map-projected), 9 scenes in [the same folder](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/) | **Easiest "predicted shadows vs real photo" check**: same frame and grid as our DEMs |
| [LROC data portal](https://data.im-ldi.com/) | Real photos for the "prediction vs photo" beat (credit NASA/GSFC/ASU) |
| [LRO data products](https://science.nasa.gov/mission/lro/data-products/) | Index |

## Relay orbits

There is no clean dataset. Use published elements (e.g. Queqiao-2-like elliptical frozen orbits; [NASA/JPL polar relay study](https://ntrs.nasa.gov/citations/20100025716); [LCRNS](https://www.nasa.gov/goddard/esc/lcrns/); [ESA Moonlight](https://resilience.esa.int/moonlight)). Cite them, version them, and **label every orbit illustrative**.

## Reference pages

[CLPS overview](https://www.nasa.gov/reference/commercial-lunar-payload-services/) · [NASA SVS south-pole lighting](https://svs.gsfc.nasa.gov/5228) · [Tidal locking](https://science.nasa.gov/moon/tidal-locking/)

## Lunar pipeline inputs

What `ds/pipeline/` actually reads for the three Moon sites (`im2-mons-mouton`, `im1-malapert`, `apollo11`). Checked 2026-11-14.

**Kernels** (`ds/pipeline/fetch.py` `MOON_KERNELS`, sha256-pinned in `ds/pipeline/checksums.json`): `naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`. Reading the `.tf` confirmed the frame name `MOON_ME_DE440_ME421` (FRAME_31009; `MOON_ME` is a fixed alias of it). The pipeline uses it as the body-fixed frame for every lunar position.

**Terrain.** All LOLA grids are `+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400` (read from the file, not assumed), float32, heights in metres above the 1737.4 km sphere, NaN where there is no data.

| Range from the site | Grid | How it is read | Provenance recorded |
| --- | --- | --- | --- |
| 0 to 15 km | `LDEM_80S_20MPP_ADJ.TIF` (30 400 x 30 400 px, 2.7 GB, edge at 304 km from the pole) | HTTP range requests through GDAL `/vsicurl/`; only the window is read (about 16 MB per site), cached under `ds/data/windows/` (gitignored) | URL, size, `ETag` `W/"a0b2f283-189327867b8"`, `Last-Modified` 2023-07-07, pixel window |
| 0 to 15 km where the 20 m grid ends (IM-1 at 80.13°S is 300 km from the pole) | `LDEM_75S_30MPP_ADJ.TIF` (2.8 GB) | same, windowed | URL, size, `ETag` `W/"a71019e1-189325e5008"`, `Last-Modified` 2023-07-07 |
| 15 to 100 km | `LDEM_80S_80MPP_ADJ.TIF` (189 158 392 B) | downloaded, size checked against `Content-Length` | sha256 `82030dcb…beee5a` |
| 100 to 200 km | `LDEM_60S_240MPP_ADJ.TIF` (218 961 039 B) | downloaded, size checked against `Content-Length` | sha256 `3f966325…ec8b34` |
| Apollo 11, 0 to 200 km | `Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif` from [USGS Astrogeology](https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m), served at `https://planetarymaps.usgs.gov/mosaic/` (redirects to S3) | 8.5 GB, **not a COG** (one-row strips, no overviews, equirectangular `+proj=eqc +R=1737400`, int16 with scale 0.5 m, 46 080 x 92 160 px, 118.45 m), but byte ranges work, so a 200 km window (3 398 x 3 398 px, 23 MB) is read over HTTP. `planetarymaps.usgs.gov` redirects every range request (about 2 s each), so the pipeline reads the redirect target `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif` (same object, same ETag) and records both URLs. Our DEM reads -1926.7 m at the Apollo 11 point; LROC lists -1926 m | URL, size 8 494 203 833 B, `ETag` `"722bebaeb337b9afc8b24ae5bd817aa3-1013"`, `Last-Modified` 2022-11-08 |

A ray sample takes its height from the finest grid whose range covers it and that has data there, so the 20 m grid wins to 15 km, the 80 m grid to 100 km and the 240 m grid to 200 km. The Apollo 11 point uses the global map at every range because it is the only global product we use; the 59 m SLDEM2015 merge would be sharper but was not needed for an equatorial site.

**Apollo 11 point.** Taken from the [LROC Coordinates of Lunar Anthropogenic Features, 28 July 2016](https://www.lroc.asu.edu/data/support/downloads/2016_LROC_Coordinates_of_Human_Features.pdf) (fetched and read 2026-11-14): Apollo 11 LM, mean observed latitude 0.67416°N, longitude 23.47314°E, elevation -1926 m, uncertainty 0.3 m, in the mean Earth/polar axis (ME) system.

**JPL Horizons cross-check.** `pytest -m net` queries `https://ssd.jpl.nasa.gov/api/horizons.api` with `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<lon_E>,<lat>,0'`, `QUANTITIES='4'` (airless apparent azimuth and elevation) for the Sun (10) and Earth (399). It agrees with our `azlcpo` values within 0.01° at three instants.

## Globe assets (web app Moon globe)

Built by `ds/pipeline/globe.py` (`cd ds && uv run python -m pipeline.globe`) from the [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (page and file list checked 2026-11-14). Sources download to `ds/data/moon-kit/` (gitignored) and are sha256-pinned in `ds/pipeline/checksums.json`. Outputs go to `frontend/public/moon/`, with provenance in `globe.json`.

| Output | Source file | Notes |
| --- | --- | --- |
| `color-4k.jpg` (4096 × 2048) | [`lroc_color_16bit_srgb_4k.tif`](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif) | The 2025 colour map (LROC WAC Hapke mosaic; LOLA albedo fills the poles beyond 70°). Equirectangular, centred on 0° longitude. NASA: "optimized for aesthetics, not science" |
| `normal-2k.jpg` (2048 × 1024) | [`ldem_16.tif`](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif) | LOLA heights, 16 pixels per degree, float32 km relative to a 1737.4 km sphere. Baked to a tangent-space normal map with **vertical exaggeration ×6**, so it is for looks only and never for measurement |
| `cap-normal-2k.jpg` (2048 × 2048) | `LDEM_60S_240MPP_ADJ.TIF` (LOLA PGDA product 90, already used by the pipeline) | South polar cap (≥75°S) as true-scale object-space normals, orthographic view from below; the globe shader switches to it south of 75°S because the CGI Moon Kit maps are flat-filled at the pole. Lit live by the SPICE Sun. Built by `ds/pipeline/globe.py` (`build_cap`) |

Credit line: "NASA's Scientific Visualization Studio (CGI Moon Kit)". The globe is a visual aid. Sites, Sun and Earth geometry still come from our own pipeline.

## Hill sites: `malapert-massif`, `shackleton-ridge`

Both points come from `ds/pipeline/pick.py`: the pixel of highest average Sun visibility inside a stated disc (great-circle radius on the 1737.4 km sphere, pixel centres); a tie goes to the higher Earth visibility, then to the pixel nearest the centre. Slope is Horn 3x3 on the 20 m LOLA grid (40 m baseline).

**PGDA product 69 files read** (downloaded to `ds/data/`, sha256-pinned in `ds/pipeline/checksums.json`, fetched 2026-11-14). Both are 5058 x 5058 int16 grids, 60 m, `+proj=stere +lat_0=-90 +R=1737400`, value = raw x 4e-5, nodata -32768, product created 2016-09-15.

| File | Size | ETag | Last-Modified | sha256 |
| --- | --- | --- | --- | --- |
| [AVGVISIB_85S_060M_201608.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608.TIF) | 33 994 464 B | `W/"206b6e0-195b4134a70"` | 2025-03-20 | `ccf67d4f…b05806` |
| [AVGVISIB_85S_060M_201608_EARTH.TIF](https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_85S_060M_201608_EARTH.TIF) | 24 862 958 B | `W/"17b60ee-195b4133eb8"` | 2025-03-20 | `d71dc5ad…f3d2` |

**Malapert Massif region geometry (not the published polygon).** The USGS region grids ([Down Selected Artemis III Candidate Landing Site Navigational Grids](https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids), ScienceBase item 671a6fa8d34efed5620f89f8, DOI 10.5066/P1MEQ6UK, `Malapert_Massif.zip` 111.94 MB per the catalogue) are the published outline, but `sciencebase.gov`, `usgs.gov` and `astrogeology.usgs.gov` all answered scripted requests with HTTP 403 (checked 2026-11-14), so we did not read them. Stand-in: centre 86°S, 0°E from [LROC image 1294](https://lroc.im-ldi.com/images/1294), radius 7.5 km from NASA's "15 by 15 kilometers" ([NASA release](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/), dated 2022-08-19, updated 2024-01-08). A 7.5 km disc is smaller than a 15 km square, and an LPSC abstract ([Longo 2023](https://www.hou.usra.edu/meetings/lpsc2023/pdf/2399.pdf)) says 25 km, so the pick is the best pixel in a core of the region, not in the whole region. Replace it with the shapefile when it can be fetched.

**Shackleton connecting ridge definition.** [LROC image 1247](https://lroc.im-ldi.com/images/1247) (read 2026-11-14): the Shackleton - de Gerlache ridge meets the Shackleton rim at 89.684°S, 196.739°E; the ridgeline is about 14 km long. Cross-check, not an input: the Wikipedia [Peak of eternal light](https://en.wikipedia.org/wiki/Peak_of_eternal_light) table lists a Shackleton-ridge peak at 89.44°S, 141.8°W (218.2°E), 82% lit over 2020, near our pick (89.47°S, 222.56°E, 88% over 18.6 years).

## Space scene (web app Earth, Sun and star backdrop)

Built by `ds/pipeline/space.py` (fetched 2026-11-14). Ephemeris: `cd ds && uv run python -m pipeline.space ephemeris --start 2026-11-14 --days 365` writes `frontend/data/moon/space.json`. Textures: `uv run --group assets python -m pipeline.space textures` writes `frontend/public/space/` with per-file provenance in `textures.json`. Raw downloads sit in `ds/data/space/` (gitignored); the static ones are sha256-pinned in `ds/pipeline/checksums.json`.

**Data (computed by us).** `space.json` holds Moon-centred Earth and Sun vectors (geometric, no light-time or aberration, ECLIPJ2000, km), and the Moon (`MOON_ME_DE440_ME421`) and Earth (`IAU_EARTH`, pck00011, low precision) orientations as quaternions, every 2 h for 365 days, from the same kernels as the Moon pipeline (listed with sha256 in the file). Linear interpolation of the Earth position between samples is off by at most 21 km at interval midpoints (measured over the span). Scene axes are SPICE (x, z, -y).

**Imagery (display only, never measurement).** NASA imagery is public domain.

| Output | Source | Grading |
| --- | --- | --- |
| `earth-day-4k.jpg` | [GIBS WMS](https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi) layer `BlueMarble_ShadedRelief_Bathymetry`, 8192 x 4096 | Colour-graded for display: saturation x1.2, deep ocean pulled toward blue. Not true colour |
| `earth-night-4k.jpg` | GIBS `VIIRS_Black_Marble`, 4096 x 2048 | None |
| `earth-rough-2k.jpg` | GIBS `OSM_Land_Water_Map` | Derived mask: water 170, land 255 |
| `earth-clouds-4k.jpg` | [`cloud_combined_2048.jpg`](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg) | A 2002 MODIS multi-day composite, not a real day; thinned over ice |
| `stars-4k.jpg` | [NASA SVS 4851](http://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_8k.exr) `starmap_2020_8k.exr` | Tone-mapped HDR, faint background pulled to black |
| `sun-2k.jpg` | [SDO/HMI intensitygram](https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_HMII.jpg), a daily image fetched 2026-11-14 07:55 UTC | None. Disc centre (0.4997, 0.5005) and radius 0.4622 in UV units, measured |

Credit lines: "NASA Blue Marble Next Generation and Black Marble via NASA GIBS"; "NASA Earth Observatory Blue Marble cloud map (2002 MODIS composite)"; "NASA SVS Deep Star Maps 2020"; "NASA SDO/HMI". `eoimages.gsfc.nasa.gov` timed out from our network, so nothing depends on it.

## Relays, rovers and surface temperature

Status and dates are **as of 2026-11-14** and slip often; re-check before quoting. Orbit values below are what the sources publish; label every modelled orbit with its source and "indicative" or "illustrative".

### Relay orbits

| Relay | Status | Published orbit | Source |
| --- | --- | --- | --- |
| ESA/SSTL Lunar Pathfinder (1 sat, elliptical lunar frozen orbit) | Not launched; slipped end-2025 → 2026 → "due 2027"; on Blue Ghost Mission 2 | **Indicative:** a 5740 km, periselene alt. 673 km, aposelene alt. 7331 km, e 0.58, i 54.856°, RAAN 0°, ω 86.322° (period ~10.8 h computed from a, not stated). An older ESA slide (500/7500 km, e 0.61, i 57.8°) conflicts; use the guide | [SSTL Service Guide](https://www.sstl.co.uk/getmedia/edaaa697-405c-458d-8394-97f83130d54a/Lunar-Pathfinder-Service-Guide-V2-2.pdf), [SSTL services](https://sstl.co.uk/what-we-do/lunar-mission-services) |
| Intuitive Machines Lunar Data Network "Altus" (5 sats; NASA NSN contract, up to $4.82B) | Altus-1 on IM-3, March–April 2027; Altus-2 to -5 together on one Falcon 9 in 2028, full constellation ~mid-2028 ([Q3 2026 earnings call, 12 Nov 2026](https://www.benzinga.com/news/26/11/63191155/intuitive-machines-q3-2026-earnings-call-transcript)) | Elliptical frozen orbits, per-satellite initial states (2027-03-01) in Table 2: a ≈ 12,000 km, i ≈ 56–57.5°, e ≈ 0.67–0.70, ω ≈ 90°, three planes | [AAS 25-758 (NTRS)](https://ntrs.nasa.gov/api/citations/20250006883/downloads/AAS_25_758_LDN_design_v7.pdf), [NASA](https://www.nasa.gov/technology/space-comms/near-space-network/leveraging-lunar-relays) |
| ESA Moonlight (1 comms + 4 nav) | First nav sat Q4 2028; FOC 2031+ | Partial: comms period 10.8 h, a ≈ 5,700 km; nav period 24 h, a ≈ 10,000 km; no i, e, ω | [ESA/Telespazio, Feb 2026](https://ioag.org/Cislunar2026/Tuesday/02%20Lunar/1110%20Moonlight%20Programme%20Development%20Status_ESA%20TPZ_final.pdf) |
| NASA LCRNS / LunaNet | Procurement programme; IOC-C coverage of the south pole (−75° to −90°, ≤200 km alt.) | "Orbits are defined by the service provider" | [NASA LCRNS](https://www.nasa.gov/goddard/esc/lcrns), [NASA slides, Mar 2025](https://ntrs.nasa.gov/api/citations/20250002120/downloads/LunaNet%20%20and%20NASA%20LCRNS%20-MGAconf%205Mar2025.pdf) |
| Firefly Elytra | NET 2027 | Not published; supports Blue Ghost only | [Firefly](https://fireflyspace.com/missions/blue-ghost-mission-2/) |
| Queqiao-2 (China) | Flying since 2024-03-20 | Conflicting secondary sources only; not usable by NASA-funded landers (Wolf Amendment) | [Wikipedia](https://en.wikipedia.org/wiki/Queqiao-2) |

Checked 2026-11-14 against the PDFs; exact values with file hashes are in `ds/pipeline/relay_orbits.json`, checks in [ds/validation/relay-orbits.md](../../ds/validation/relay-orbits.md). Pathfinder's guide gives no epoch, mean anomaly or frame. AAS 25-758 Table 3 gives a full ICRF state per satellite at 2027-03-01 00:01:09.2 UTC, and is what we use: its Table 2 is in Earth-Moon axes with a constant 241.49° RAAN offset, and the two tables disagree on LDN-1's radius (3631.8 vs 3869.3 km). The paper's dates are older than the status column (it has LDN-1 launching mid-2026).

NASA's March 2025 LCRNS slide (10-year line-of-sight simulation, worst/best south-pole landing sites): direct-to-Earth only 17–43% yearly coverage, +1 relay 80–86%, +2 relays 100%. Definitions not yet matched to ours; see [ADR-0005](../decisions/0005-relay-coverage-and-rover-reach.md).

### Existing tools (public access as of 2026-11-14)

- SSTL [Lunar Pathfinder Mission Builder](https://sstl.co.uk/what-we-do/lunar-mission-services/lunar-pathfinder): public web form, one relay, access and outage times; no terrain or direct-to-Earth gaps mentioned.
- NASA LCRNS Government Analysis Tools: internal.
- NASA Glenn [Lunar Site Analysis Software](https://software.nasa.gov/software/LEW-20529-1): illumination and communication with terrain masks; U.S. release only, Windows.
- JPL Moon Trek line of sight ([NTRS](https://ntrs.nasa.gov/citations/20220010585)): terrain-aware links, no planned-relay library. NASA Ames Celestial Mapping System: 3D line of sight.
- VIPER planning (SHERPA, VERVE, traverse planning): internal; method public in [NASA's overview](https://www.nasa.gov/wp-content/uploads/2022/05/overview_of_mission_planning_for_the_viper_rover.pdf) and [Ennico-Smith et al. 2023](https://ntrs.nasa.gov/api/citations/20230004239/downloads/SSR2023-VIPER-Planning-Ennico.pdf).

### Rover route-planning methods

Time-dependent A* with illumination constraints ([Miao and Wei 2026](https://www.mdpi.com/2072-4292/18/2/310)); sun-synchronous routes with direct-to-Earth constraints ([Otten, CMU thesis](https://www.ri.cmu.edu/app/uploads/2018/01/thesis_otten.pdf)); spatiotemporal graphs with illumination and communication (ROBUST-STP3R, cited by Miao and Wei).

### Surface temperature

- LRO Diviner polar products, 240 m/px, 80–90°: original seasonal set (96 local-time × 2 seasons, [description](https://www.diviner.ucla.edu/single-post/2020/07/20/new-diviner-seasonal-polar-data-products), [Williams et al. 2019](https://ui.adsabs.harvard.edu/abs/2019JGRE..124.2505W)) and the newer south-polar set (24 × 6 Ls bins, on [PDS](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/) since Sept 2022, [description](https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds)). Global maps at ~15 km only.
- Ground truth: Chandrayaan-3 ChaSTE at 69.37°S peaked at 355 K on a ~6° Sun-facing slope vs ~330 K predicted from orbit; a flat spot ~1 m away peaked at ~332 K ([ISRO](https://www.isro.gov.in/India_Bags_Credit_First-Ever_In-Situ_Measurement.html)). Orbital maps can miss slope effects of 20 K or more.

### Rovers and ground truth

No rover is returning south-polar data. Yutu-2 likely immobile since ~Mar 2024 ([SpaceNews](https://spacenews.com/yutu-2-rover-likely-immobile-on-the-moon-after-historic-lunar-far-side-mission/)); IM-2's MAPP rover never deployed ([Wikipedia](https://en.wikipedia.org/wiki/IM-2)). Planned: Astrolab FLIP on Griffin-1 (late 2026 per NASA; some listings say January 2027), Blue Origin Blue Moon MK1 to the **Shackleton connecting ridge** (New Glenn grounded since the May 2026 explosion; return to flight slipped to January 2027, [TNW](https://thenextweb.com/news/blue-origin-new-glenn-return-to-flight-delayed-january)), VIPER on the second MK1 (2027, [NASA](https://www.nasa.gov/missions/moon-base/nasa-provides-progress-update-on-moon-base-rovers/)), Chang'e-7 (postponed from Aug 2026; no official new date, partners report 2027, [SpacePolicyOnline](https://spacepolicyonline.com/?p=90081), [Wikipedia](https://en.wikipedia.org/wiki/Chang'e_7)), LUPEX (~2028, unconfirmed), Artemis LTV (2028). Artemis III is now an Earth-orbit test (2027); the first crewed landing is Artemis IV ([NASA](https://www.nasa.gov/mission/artemis-iii/)). No public south-polar ground truth for illumination or Earth links was found.

## AI/ML and hazard data

Availability checked 2026-11-14. None of this is in the pipeline yet.

| Source | What it gives | Access | Fit |
| --- | --- | --- | --- |
| [PGDA product 104](https://pgda.gsfc.nasa.gov/products/104), [Zenodo 17954508](https://zenodo.org/records/17954508) (Bertone et al.) | 5 m shape-from-shading terrain for 13 regions, with slope and roughness at several baselines and a maximum-illumination orthomosaic (its resolution not confirmed) | Open, CC BY 4.0, 26.6 GB, about 2.2 GB per region | Contains `shackleton-ridge` and `malapert-massif` by bounding box; Haworth region does not contain our throwaway floor point |
| [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) (Barker) | LOLA-only 5 m terrain with uncertainty and 100 error clones per site, including Connecting Ridge | Open; licence not stated | Honest error bars for slope |
| [NASA-IBM Lunar Foundation Model](https://huggingface.co/nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model), [code](https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model), [paper](https://arxiv.org/abs/2609.13283) | Pretrained lunar backbone for fine-tuning at about 1 m and 100 m per pixel | Apache 2.0 | Starting point for a detector; no boulder task and no polar NAC evaluation found |
| [Lunar FM Bench / SomBench](https://registry.opendata.aws/som-bench/), [paper](https://arxiv.org/abs/2609.13277) | Tiles, plus [NAC crater labels](https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-NAC-Crater-Detection) | Open, CC BY 4.0, no AWS account | 408 labelled NAC tiles at six sites named in the card, none polar; the [fine-tuned NAC crater model](https://huggingface.co/nasa-ibm-ai4science/Crater-Detection-NASA-IBM-Lunar-Foundation-Model) reports mAP 0.154 |
| [Stoken et al., LPSC 2023](https://www.hou.usra.edu/meetings/lpsc2023/pdf/2663.pdf) (NASA JSC) | YOLOv5 boulder and shadow detection on 23 NAC frames near Connecting Ridge (0.7 to 1.2 m, incidence 87 to 90 deg), 11,008 tiles examined by experts; reported AP 0.497, AR 0.604 by COCO protocol | Abstract gives no data or weights link | The method fits; the labels must be requested or rebuilt |
| [Dagar et al., LPSC 2024](https://www.hou.usra.edu/meetings/lpsc2024/pdf/1898.pdf) | Hand-mapped boulders on one about 0.25 m Chandrayaan-2 OHRC image on the Shackleton - de Gerlache ridge; NAC-based mapping there missed boulders OHRC showed | Figures only; OHRC images via [PRADAN](https://pradan.issdc.gov.in), login required | Possible independent check, and a warning about NAC limits |
| [Aussel et al. 2025](https://zenodo.org/records/15521245) | About 94 million boulders over 4.5 m | Embargoed until 2027-04-01; 60S to 60N only | Not usable: too late and not polar |
| [PGDA product 106](https://pgda.gsfc.nasa.gov/products/106) (Repasky et al.) | Learned 320 m to 20 m terrain, RMS 5 to 6 m | Its Zenodo record 14170309 answers HTTP 410 (deleted) | Coarser than the 5 m terrain above |

