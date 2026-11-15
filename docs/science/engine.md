# How the scientific engine calculates

This page describes what the live scientific engine computes, step by step, and where each step lives in the code. The engine is the Python package in `services/missionScience/src/skyline_mission_science/`. Code paths below are relative to that package, and test paths are relative to `services/missionScience/` unless they name another folder. It answers every live request the app makes: a live check on a site, a day or a week on the reference page, mast power and placement, and the inputs to rover reach.

The offline pipeline in `ds/` precomputes the yearly results the app ships with. It follows the older design in [method.md](method.md) and differs from the engine in a few places. The [last section](#where-the-engine-differs-from-methodmd) lists them.

Every result is a geometric opportunity: the Sun or Earth stands above the terrain. The engine computes no watts, no radio link budget, and no guaranteed contact. [claims.md](claims.md) sets the wording policy.

## The calculation in one picture

```
request: site, start, duration, cadence, observer height, terrain resolution
   │
   ├─► 1. Place the observer ──── site latitude and longitude + DEM ground height + observer height
   │
   ├─► 2. Build the skyline ───── highest terrain elevation in each 0.25° azimuth sector, out to 400 km
   │
   ├─► 3. Track the Sun and Earth ── SPICE topocentric vectors → azimuth and elevation
   │
   ├─► 4. Compare ──────────────── clearance = body elevation − skyline in that sector
   │
   ├─► 5. Find events ──────────── rises, sets and grazes, solved to 1 s
   │
   └─► 6. Summarise ───────────── availability, longest gaps, provenance
```

## 1. Place the observer

The engine works on a sphere of radius $R = 1\,737\,400$ m, the reference sphere the LOLA terrain maps use (`terrainHorizon.py:17`).

The observer's position in the Moon's body-fixed frame is

$$
\mathbf{P}_o = (R + h_\text{ground} + h_\text{obs})\,\hat{\mathbf{u}}(\varphi, \lambda),
\qquad
\hat{\mathbf{u}} = (\cos\varphi\cos\lambda,\ \cos\varphi\sin\lambda,\ \sin\varphi)
$$

where $\varphi$ and $\lambda$ are the site's planetocentric latitude and longitude, $h_\text{ground}$ is the terrain height sampled bilinearly from the DEM at the site, and $h_\text{obs}$ is the observer height above the ground (`terrainHorizon.py:238-246`). The reference page uses $h_\text{obs} = 2$ m.

Azimuth and elevation are measured in the local east, north and up basis at the site (`terrainHorizon.py:49-54`):

$$
\hat{\mathbf{e}} = (-\sin\lambda,\ \cos\lambda,\ 0),\quad
\hat{\mathbf{n}} = (-\sin\varphi\cos\lambda,\ -\sin\varphi\sin\lambda,\ \cos\varphi),\quad
\hat{\mathbf{up}} = \hat{\mathbf{u}}
$$

The site's coordinates must be in the `MOON_ME_DE421` frame, the frame LOLA uses. The engine refuses any other frame (`terrainHorizon.py:239-240`). This is why two catalogue entries, Chang'e-4 (Liu 2019) and SLIM (PGDA surface coordinate), show "Position unresolved": their published coordinates cannot yet be tied to that frame.

## 2. Build the skyline

The skyline is the highest elevation angle of terrain in each azimuth sector. It does not depend on time, so the engine builds it once per site and caches it.

**Sectors.** The horizon has 1 440 sectors of 0.25° each (`HorizonConfig`, `terrainHorizon.py:139-147`).

**Terrain points.** For a terrain point $\mathbf{P}_t = (R + h_t)\,\hat{\mathbf{u}}_t$, the direction from the observer is $\mathbf{d} = \mathbf{P}_t - \mathbf{P}_o$, and its elevation and azimuth are

$$
\text{el} = \operatorname{atan2}\!\left(\mathbf{d}\cdot\hat{\mathbf{up}},\ \sqrt{(\mathbf{d}\cdot\hat{\mathbf{e}})^2 + (\mathbf{d}\cdot\hat{\mathbf{n}})^2}\right),
\qquad
\text{az} = \operatorname{atan2}(\mathbf{d}\cdot\hat{\mathbf{e}},\ \mathbf{d}\cdot\hat{\mathbf{n}})
$$

Both points sit on the sphere in 3D, so the Moon's curvature is exact. There is no small-angle $d^2/2R$ correction.

**Three passes fill the sectors** (`buildHorizon`, `terrainHorizon.py:238-281`):

1. **Near-field rays.** One ray per sector, from 1 m out to 50 km in 40 m steps, along the great circle. Terrain heights along each ray are interpolated bilinearly. Each sector takes the maximum elevation along its ray.
2. **Pixel envelope.** Every DEM pixel centre between 1 km and 400 km raises the sector it falls in to that pixel's elevation, if higher. Pixels from 1 to 50 km come from the local map. Pixels from 50 to 400 km come from the wider map.
3. **Neighbour envelope.** Each sector takes the maximum of itself and its two neighbours, so a narrow peak is never lost between sectors.

Before it starts, the engine proves that 400 km is far enough: terrain 20 km high at 400 km would still sit below the observer's horizontal plane (`terrainHorizon.py:247-251`). If not, it refuses the site.

**Which terrain maps.** The request's `localResolutionM` picks the maps (`engine.py:52-57`):

| `localResolutionM` | Local map (1 to 50 km) | Wide map (50 to 400 km) | Used for |
| --- | --- | --- | --- |
| 80 | `LDEM_80S_80MPP_ADJ.TIF` | `LDEM_60S_240MPP_ADJ.TIF` | The south-pole sites |
| 1895.21 | `LDEM_16.IMG` | `LDEM_16.IMG` | Every other site: the global map, 16 pixels per degree |

The global map reader checks the PDS label field by field before it reads any heights, including the frame (`MEAN EARTH/POLAR AXIS OF DE421`), the scale and offset, and the file size (`globalLola.py:24-35`). It refuses sites within reach of the poles, because the cylindrical map distorts there (`globalLola.py:77-78`).

On the global map, ridges smaller than about 1.9 km do not exist. The engine marks these results `exploratory` and adds that limit to every response (`engine.py:135-136`).

## 3. Track the Sun and Earth

The engine loads seven NASA JPL NAIF kernels and checks each one by SHA-256 (`spiceGeometry.py:12-16`):

| Kernel | Gives |
| --- | --- |
| `naif0012.tls` | Leap seconds, for UTC to TDB |
| `de440s.bsp` | Positions of the Sun, Earth and Moon |
| `pck00011.tpc` | Body radii and constants |
| `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf` | The Moon's orientation, and the `MOON_ME_DE421` frame |
| `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf` | The DE440 orientation and frames |

For each sample time, the engine asks SPICE for the vector from the fixed surface point to the body (`engine.py:80`):

```
spkcpo(body, et, 'MOON_ME_DE421', 'OBSERVER', correction, P_o / 1000, 'MOON', 'MOON_ME_DE421')
```

The observer is a constant position on the Moon. The aberration correction is `NONE` for the `geometric` profile, which the app uses, and `LT+S` (light time and stellar aberration) for the `apparent` profile. The engine projects the vector onto the local basis to get azimuth and elevation, with the same formulas as for terrain.

The apparent angular radius of each body is computed at each moment from its distance $r$:

$$
\rho = \arcsin\!\left(\frac{R_\text{body}}{r}\right),\qquad R_\odot = 695\,700\ \text{km},\quad R_\oplus = 6\,371\ \text{km}
$$

## 4. Compare each body with the skyline

The engine looks up the skyline in the sector the body's azimuth falls in, and applies the request's `horizonOffsetDeg` margin (`engine.py:88-90`):

$$
\text{skyline} = \max\!\big(0,\ H[\text{sector}(\text{az})] + \text{offset}\big),
\qquad
c = \text{el} - \text{skyline}
$$

$c$ is the clearance of the body's centre above the skyline. The skyline never counts below 0°: terrain that falls away below the horizontal plane does not help.

**The Sun's visible disk.** The engine treats the Sun as a uniform disk cut by a straight horizon through its centre. With $x = \operatorname{clip}(c/\rho_\odot, -1, 1)$, the visible fraction is the circular-segment area (`visibility.py:4-6`):

$$
f = \frac{\arccos(-x) + x\sqrt{1 - x^2}}{\pi}
$$

$f$ is 0 when the disk is fully hidden, 0.5 when the horizon cuts it through the centre, and 1 when it is fully clear.

**When the Sun counts as up.** The request's `solarDefinition` decides (`engine.py:97-100`):

| `solarDefinition` | The Sun is up when | Meaning |
| --- | --- | --- |
| `anyDisk` (the app's default) | $c + \rho_\odot \ge 0$ | Any sliver of the disk is above the skyline |
| `center` | $c \ge 0$ | The centre is above the skyline |
| `fullDisk` | $c - \rho_\odot \ge 0$ | The whole disk is above the skyline |

**When Earth counts as up.** Earth is in view when its centre clears the skyline, $c_\oplus \ge 0$. This is the only Earth rule the engine supports.

## 5. Find rises, sets and grazes

Sampling alone would miss short events, so the engine solves for each transition (`eventIntervals`, `visibility.py:8-64`). The function it solves is the margin from the table above: $c$ plus or minus the disk radius.

1. Evaluate the margin every quarter of the request's cadence.
2. Within each cadence step, find the margin's minimum and maximum with a bounded scalar search. A minimum or maximum that touches zero without crossing it is a **grazing** event: the Sun skims the skyline.
3. Wherever the margin changes sign between neighbouring samples, solve for the crossing with Brent's method, to `eventToleranceS` (1 s by default).
4. Split the window at every crossing. Each piece is "available" if the margin at its midpoint is at least 0, and an outage otherwise.

A rise is the start of an available piece and a set is its end. Pieces that touch the start or end of the window are marked clipped, because the real rise or set lies outside it.

The search assumes at most one minimum and one maximum per cadence step. If the margin wiggles faster than that, an event can still be missed, so every response sets `possibleMissedEvents: true`.

## 6. Summarise

All intervals are half-open, $[\text{start}, \text{end})$, and durations are in seconds of elapsed time. The headline metrics are (`scientificContract.py:191-205, 272-290`):

| Metric | Computation |
| --- | --- |
| `sunlightDurationS` | Total length of the Sun's available intervals |
| `sunlightAvailabilityFraction` | `sunlightDurationS / durationS` |
| `directEarthDurationS` | Total length of Earth's available intervals |
| `directEarthAvailabilityFraction` | `directEarthDurationS / durationS` |
| `meanVisibleSolarDiskFraction` | Time average of $f$, by the trapezoid rule over the samples |
| `longestDarkness` | Longest Sun outage, flagged if it touches the window's edge |
| `longestDirectEarthBlackout` | Longest Earth outage, flagged the same way |

[metrics.md](metrics.md) defines these quantities in the product's own words.

**Constraints.** When a request sets limits, the engine reports how far each one is missed (`engine.py:115-122`). The window is feasible only when all four are zero:

```
solarDeficit       = max(0, minimumSolar − sunlight fraction)
earthDeficit       = max(0, minimumEarth − Earth fraction)
solarOutageExcessS = max(0, longest Sun outage − maximumSolarOutageS)
earthOutageExcessS = max(0, longest Earth outage − maximumEarthOutageS)
```

## Add-ons built on the same calculation

The add-ons run only at the three south-pole study sites (Connecting Ridge, de Gerlache Rim and Shackleton Rim) on the 80 m terrain. They refuse every other site (`mastPower.py:21-22`, `mastPlacement.py:100-101`, `skyline_rover_science/roverEvaluation.py:231-232`).

### Mast power

A mast is modelled as a raised observer. For each mast height, the engine reruns the whole calculation with $h_\text{obs}$ set to that height, so a taller mast sees over more of the terrain (`mastPower.py`).

It then estimates how squarely sunlight hits a panel. With the Sun's direction $\hat{\mathbf{s}} = (\cos\text{el}\sin\text{az},\ \cos\text{el}\cos\text{az},\ \sin\text{el})$ in the local basis and a panel normal $\hat{\mathbf{n}}_p$ (`panelGeometry.py`):

$$
\text{exposure}(t) = \operatorname{clip}(\hat{\mathbf{s}}\cdot\hat{\mathbf{n}}_p,\ 0,\ 1)\cdot f(t)
$$

for a horizontal panel ($\hat{\mathbf{n}}_p$ straight up), a vertical panel facing a chosen azimuth, and an ideal tracking panel (incidence 1). The result is a dimensionless time average. It has no panel area, efficiency or temperature, so it ranks options rather than predicting watts.

### Mast placement

The engine lays a square grid of up to 49 candidate spots around the site, within a search radius of up to 5 km. It moves along the sphere to place each spot (`mastPlacementTerrain.py:10-50`). For each spot it estimates the slope from the DEM by central differences:

$$
\text{slope} = \arctan\sqrt{\left(\frac{\partial h}{\partial x}\right)^2 + \left(\frac{\partial h}{\partial y}\right)^2}
$$

Spots that break the cable-length or slope limit are dropped before any visibility run. Each remaining spot and mast height gets a full calculation. The engine then ranks the results into Pareto fronts over six objectives: more Earth time, more sunlight, a shorter Earth blackout, a shorter darkness, a shorter cable, and a lower mast (`mastPlacementSelection.py`).

### Rover reach

The rover service (`skyline_rover_science/`) lays a 1 × 1 or 3 × 3 grid of cells, 80 to 320 m across, on the 80 m south-pole map. The rover moves between neighbouring cells only, not diagonally. A cell is passable when its slope is within the limit. A move is passable when the grade along both halves of the move, through a midpoint sample, is within the limit too (`roverTerrain.py:106-173`).

The service computes the Sun and Earth for each cell and each move's midpoint, up to 21 points, with the same engine. It then builds a time-expanded graph. A move takes $\lceil \text{distance} / (\text{speed}\cdot\Delta t) \rceil$ time steps, and it is allowed only while sunlight and communication hold at both ends and the midpoint for every step it crosses (`roverGraph.py`). A cell is reachable if some path through this graph arrives there in the window. The result gives each cell's earliest arrival time.

### Relay contact

The relay adapter (`services/relayAdapter/`) replays a pinned trajectory for a relay satellite constellation, "Candidate 2", from `data/states/candidate2States.csv`. The trajectory covers 2025-01-01 to 2025-01-29 in 120 s steps. For more satellites or other dates it propagates the fitted orbit with a two-body model, which is labelled unvalidated (`services/relayAdapter/src/skyline_relay_adapter/engine.py:102-150`).

At each 120 s step:

```
direct    = Earth centre clears the site's skyline
siteLeg   = the relay clears the site's skyline
earthLeg  = the straight line from the relay to Earth's centre misses the Moon
viaRelay  = siteLeg and earthLeg, for at least one relay, at the same time
assisted  = direct or viaRelay
```

The "assisted share" is the fraction of steps where `assisted` holds. The gain a relay brings is `assisted share − direct share`. Neither includes a radio link budget or ground-station availability (`rfQualified: false`).

## Provenance and caching

Every response records what produced it: the SHA-256 of each kernel and terrain map, the engine and algorithm versions, the hash of every source file, the library versions, the frame, the aberration correction, and the sampling (`engine.py:63-64, 123-131`).

The hash of all of that, together with the request, is the result's identity. The `scenarioId` in a response derives from it (`scientificContract.py:207-212`). The same request on the same inputs always gets the same `scenarioId`, and any changed byte in a kernel, map, catalogue entry or source file gets a new one.

The engine caches at three levels:

- **Whole responses.** The 32 most recent, keyed by identity. A cached response says `"execution": "cached"`.
- **Skylines.** Saved to disk per site and terrain, and kept in memory.
- **SPICE vectors.** Kept in memory, per body and time.

Every response also lists its limitations: possible missed events within a cadence step, the sector skyline, the 0° floor, Earth centre only, and the numerical tolerance. Exploratory sites add the coarse-terrain limits. Every response states `independentlyValidated: false`.

## How the engine is checked

The tests check the engine's parts against exact answers and independent code paths:

| Check | Test |
| --- | --- |
| SPICE vectors from `spkcpo` match `spkpos` minus the observer within 1e-8 km. Azimuth and elevation match SPICE's own `azlcpo` within 1e-8°. | `tests/scientific/testScience.py:12-27` |
| On a perfectly smooth sphere, the skyline from a 2 m observer matches the exact dip $-\arccos\big(R/(R+2)\big)$ within 1e-4° | `tests/scientific/testGlobalLola.py:124-137` |
| The disk fraction gives exactly 0, 0.5 and 1 at the limits, and $f(x) + f(-x) = 1$ | `tests/unit/testCore.py:8-11` |
| The event solver finds the roots of $\cos t$ at $\pi/2$ and $3\pi/2$ within 1e-8 s | `tests/unit/testCore.py:13-24` |
| Grazing events are found within 1e-4 s | `tests/scientific/testGrazing.py:5-16` |
| Rover arrival times on a flat 3 × 3 grid match the hand-computed answer | `tests/rover/testRover.py:121-135` |
| The relay propagator reproduces the saved Candidate 2 states | `services/relayAdapter/tests/testOrbit.py:7` |

Two checks against outside references belong to the offline pipeline in `ds/`, not to the live engine:

- Its Sun and Earth directions agree with NASA JPL Horizons within 0.01° at three moments (`ds/tests/test_moon.py:154-168`). The test needs network access and is skipped by default.
- Its terrain height at Apollo 11 reads −1 926.7 m. LROC publishes −1 926 m ([data/sources.md](../data/sources.md)).

No live result has been validated site by site against an independent horizon. [internationalSiteValidation.md](../internationalSiteValidation.md) records what has been checked for the international sites.

## Where the engine differs from method.md

[method.md](method.md) is the original design, written for the offline pipeline. The live engine differs in these places:

| Topic | method.md | The live engine |
| --- | --- | --- |
| Skyline between sectors | Interpolated linearly in azimuth | The sector's value, after the neighbour envelope |
| Terrain search | Rays only, with steps that grow with distance, to 150 to 200 km | Rays to 50 km in 40 m steps, then every pixel to 400 km |
| Sun radius | A constant 0.2666° | Computed from the Sun's distance at each moment |
| Fully lit | $f \ge 0.999$ | The disk's top edge clears the skyline: $c \ge \rho_\odot$ |
| Earth rules | Centre, any sliver, or full disk | Centre only |
| Event times | Bisection to 60 s or better | Brent's method to 1 s, plus an extremum search for grazing events |
| Aberration | `LT+S` | `NONE` for the `geometric` profile the app uses |
