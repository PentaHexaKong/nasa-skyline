# Geometry method

Status: **proposed**. This is the reference design for the DS pipeline. Change it here first, then in code.

## Pipeline overview

```
site (lat, lon °E, ME frame, observer height h)
   │
   ├─► 1. Terrain horizon (skyline) ── LOLA DEMs (20/80 m near, 240 m far)
   │        elevation_deg[az] for az in 0..360 step Δaz
   │
   ├─► 2. Ephemeris ── SPICE (DE440s + moon_pa + frames kernel)
   │        Sun and Earth az/el (topocentric) every Δt over [start, end)
   │
   ├─► 3. Visibility ── compare body elevation to skyline(az), with disk size
   │        sun_visible_fraction(t), earth_visible(t) by rule
   │
   ├─► 4. Events ── transitions, refined by bisection
   │
   └─► 5. Metrics + provenance ── JSON per (site, interval)
```

## 1. Terrain horizon

- **Frame and heights:** the LOLA PGDA polar products are polar-stereographic grids in the **Mean Earth/Polar Axis (ME)** frame, with heights relative to a 1737.4 km sphere. **Confirm both against each file's label** before use.
- **Observer:** surface height from the DEM at the site, plus the observer height `h` (default 2 m, exposed as an assumption).
- **Rays:** for each azimuth (default **1440**, i.e. 0.25°), march outward along the surface. At distance `d`, the terrain point's elevation angle is

  `elev = atan2( (z_t − z_o) − d²/(2R), d )`  (small-angle form)

  For better accuracy, use exact 3D vectors in body-fixed Cartesian coordinates: angle = asin( (P_t − P_o) · û_up / |P_t − P_o| ). Take the **maximum** over the ray.
- **Extent and resolution:** 20 m (windowed read) out to ~10–20 km, 80 m out to ~100 km, and 240 m out to **150–200 km**. Stitch a 60S mosaic for sites near 80°S, where rays leave the 80S mosaic (IM-1's 200 km rays reach ~74°S). `LDEM_75S_30MPP` can replace the 80 m file in the mid-field. For Chandrayaan-3 (~69°S) use `LDEM_60S_60MPP` throughout. See [data/sources.md](../data/sources.md).
- **Sampling along the ray:** step ≈ the DEM pixel size near the observer, growing with distance (e.g. a step proportional to d/200). Use bilinear interpolation.
- **Output:** `skyline[az] = max elevation (deg)`. Cache it per site. It is time-independent.

## 2. Ephemeris (SPICE)

Kernels: `naif0012.tls`, `moon_080317.tf`, `moon_pa_de421_1900-2050.bpc`, `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc` (see [data/sources.md](../data/sources.md)).

- Express the site in the **ME** frame defined by the frames kernel Use `MOON_ME_DE421` with moon_080317.tf and moon_pa_de421_1900-2050.bpc. LOLA product 90 identifies its grid in the DE421 realization. DE440-based ME coordinates require an explicit SPICE transformation. Check the kernel text for the exact name. Don't mix PA and ME: they differ by a sub-km surface offset.
- Compute **topocentric** apparent vectors from the surface point to the Sun and to Earth's center. Use `spkcpo` / `azlcpo` (constant-position observer), with light time and stellar aberration (`LT+S`). The Earth parallax from the surface is ~0.26°, so a Moon-centered vector is wrong at our margins.
- Local frame: up = the ellipsoid/sphere normal at the site; azimuth clockwise from local north; elevation above the local horizontal plane.
- At the exact pole, north is undefined. Define azimuth for |lat| > 89.99° as measured from the direction of the 0° meridian, and document it.
- Cross-check: JPL Horizons, with a topocentric observer on the Moon (`CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,alt'`) for 2–3 instants per site. They should agree to ≲0.01°.
  - **First confirm which Moon body-fixed frame Horizons uses for `coord@301`** (Horizons docs). If it is not ME, convert the site to that frame before querying. A ~300 m site offset tilts local vertical by ~0.01°, which is the whole budget.

## 3. Visibility

Let `c(t) = body_elev(t) − skyline(body_az(t))` be the clearance of the body's **center** above the skyline.

- **Sun:** angular radius r☉ = 0.2666° (computed per instant from the distance if desired). The visible fraction uses the circular-segment area (horizon treated as locally straight):
  `x = clamp(−c/r, −1, 1);  f = (acos(x) − x·√(1−x²)) / π`
  - "Sunlit (any)" = f > 0. "Fully lit" = f ≥ 0.999.
- **Earth:** angular radius r⊕ ≈ 0.90–1.00° (from the distance). The rules (see [metrics.md](metrics.md)):
  - `center` (default headline): c ≥ margin
  - `any_sliver`: c > −r⊕ (matches PGDA's Earth-visibility definition)
  - `full_disk`: c ≥ r⊕
- Interpolate the skyline linearly in azimuth. When steep terrain is narrower than the disk, the straight-horizon assumption undercounts the error. Note it in the warnings.

## 4. Events

Find sign changes of the relevant predicate on the sample grid, then **bisect** each transition to ≤60 s. Event semantics are in [metrics.md](metrics.md#events).

## 5. Precision targets

| Quantity | Target |
| --- | --- |
| Sun/Earth az–el vs Horizons | ≤ 0.01° |
| Skyline vs a reference or published horizon | ≤ 0.1° typical (DEM-limited) |
| Event times | ≤ 1 min after bisection (model-limited, not sampling-limited) |
| Convergence | Halving Δt or Δaz changes the summary metrics by < 1 percentage point |

The skyline target may not hold when the horizon is close. A height error of 0.4 m, typical for the 5 m maps, is 0.23° at 100 m and 0.02° at 1 km. Report an error range for near-field horizons (see [LOLA accuracy](../data/sources.md#lola-accuracy-checked-2026-11-14)).

## Validation

1. Ephemeris vs Horizons (above).
2. Long-run % sunlit and % Earth-visible vs the PGDA AVGVISIB maps at the same pixel. PGDA uses 18.6 years, its own horizon method and `any_sliver` for Earth. Run a matched definition, or report it as qualitative. Use the 85S map at ≥85°S, 75S below that, 65S for IM-1 and Chandrayaan-3. PGDA does not state an observer height; note our 2 m in the comparison.
3. Optional "proof beat": predicted shadow direction and coverage vs an LROC NAC image at its acquisition time. Start with the 9 NAC + `_MODEL` pairs in PGDA product 90: they are already on our DEM grid, and PGDA's own simulation is a second reference.
4. Skyline uncertainty: sample `LDEM_*_ERR` along the rays that set the horizon and report the resulting elevation spread.

Record the results in `docs/science/validation.md` (create it on the first run).

## INT-4 scientific interface

The versioned research API consolidates the preserved MD-2C physical modules through `src.science.ScientificEngine`. Its geometric SPICE profiles use aberration `NONE` and explicit `MOON_ME_DE421`, `MOON_ME_DE421` or J2000 frame identifiers. The existing apparent-body pipeline above retains its separate convention. [ADR 0006](../decisions/0006-versioned-scientific-engine.md) and [the service guide](../../scientificengine/README.md) document the scientific profile boundary and provenance.
