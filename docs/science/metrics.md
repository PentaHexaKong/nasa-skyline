# Metric and event definitions (source of truth)

Every UI label and every contract field must map to one row here. If you need a new metric, add it here first.

## Conventions

| Item | Convention |
| --- | --- |
| Angles | degrees |
| Azimuth | clockwise from local north, [0, 360). At the pole: see method.md §2 |
| Elevation | above the local horizontal plane (not above the skyline) |
| Clearance | body center elevation − skyline elevation at the body's azimuth |
| Time | UTC, ISO-8601 with `Z`; durations in seconds |
| Interval | `[start, end)`; samples at start + k·step; the final partial step is weighted by its true duration |
| Coordinates | latitude [−90, 90], longitude °E [0, 360), ME frame, observer height above the DEM surface (m) |

## Per-instant quantities (samples)

| Name | Definition |
| --- | --- |
| `sun_elevation_deg` | Topocentric Sun center elevation |
| `sun_clearance_deg` | Sun center elevation − skyline(az) |
| `sun_visible_disk_fraction` | Visible area fraction of the solar disk, 0–1 (method.md §3) |
| `earth_elevation_deg` | Topocentric Earth center elevation |
| `earth_clearance_deg` | Earth center elevation − skyline(az) |
| `direct_earth_visible` | Boolean under the selected Earth rule and margin |
| `power_potential` *(optional)* | `sun_visible_disk_fraction × max(0, cos θ_inc)` for the selected panel model: `horizontal` → θ = 90° − elev; `vertical_tracking` → θ = elev. Unitless, 0–1. **Not watts.** |

## Summary metrics (over the interval)

| Name | Definition | Note |
| --- | --- | --- |
| `mean_visible_solar_disk_fraction` | Time-weighted mean of the visible fraction | Energy-like |
| `sunlit_time_fraction` | Fraction of time with visible fraction > 0 | "Any sunlight" |
| `longest_dark_interval_seconds` | Longest contiguous span with fraction = 0 | Flag it if truncated by the interval edges |
| `direct_earth_visible_fraction` | Fraction of time `direct_earth_visible` | The rule must be shown |
| `longest_direct_gap_seconds` | Longest contiguous not-visible span | Flag it if truncated |
| `sun_elevation_min/max_deg` | Over the interval | Requirement O5 |
| `relay_assisted_visible_fraction` | Fraction of time with direct OR a full relay path | Live contact only |
| `longest_remaining_gap_seconds` | Longest span with neither | |

## Events

Relative to the **landing time T** (= the interval start unless set separately):

| Event | Definition |
| --- | --- |
| `sunset` | First time ≥ T at which the Sun goes from visible fraction > 0 to = 0. If the Sun is hidden at T, `sunset` is the first set after the next rise. In that case also report `sunrise`. |
| `sunrise` | First time ≥ T going from 0 to > 0 |
| `earthset` / `earthrise` | The same, using `direct_earth_visible` |
| Status values | `predicted` (time given), `not_within_interval` (none before end; it does **not** mean "never"), `not_computed`, `unavailable` (data or model can't support it) |
| Countdown | `event_time − cursor_time`, recomputed in the UI as the cursor moves |

## Earth visibility rules

| Rule | Visible when | Use |
| --- | --- | --- |
| `center` + margin (default) | clearance ≥ margin | Headline; the margin is user-adjustable (0–5°) |
| `any_sliver` | clearance > −r⊕ | Matches PGDA; most optimistic |
| `full_disk` | clearance ≥ r⊕ | Most conservative |

The UI must always show which rule is active. Comparisons between scenarios are valid only under identical rules, intervals and steps.

## Fields emitted by the pipeline for Moon sites

`frontend/data/<id>.json` (`kind: "lunar"`). The pipeline emits minutes, hours or days, not the seconds convention above; each row says which. Earth uses the `center` rule with margin 0 unless the `earth` block says otherwise, and the `any_sliver` rule is reported next to it as `*_any`. A longest-gap or longest-stretch field is flagged `*_truncated: true` when the gap touches the first or last instant (or day) of the window, so its true length is longer than shown.

| Field | Definition | Unit as emitted |
| --- | --- | --- |
| `days[].earth_min` | Minutes in the UTC day with Earth's centre above the skyline plus margin (`center` rule) | minutes, 0.1 resolution (not seconds) |
| `days[].earth_any_min` | The same under the `any_sliver` rule | minutes |
| `days[].earth_track` | Hourly Earth az, elevation and visible disc fraction over the whole day, regardless of the Sun | `t_min` minutes since 00:00 UTC; degrees; fraction 0–1 |
| `earth_intervals` | `[start, end)` spans with the `center` rule true, edges bisected to 1 s | ISO UTC |
| `earth_intervals_any` | The same under the `any_sliver` rule | ISO UTC |
| `earth.visible_share`, `earth.center_share`, `summary.earth_visible_share` | Fraction of the window with the `center` rule true (the same number, three names) | fraction 0–1 |
| `earth.any_share`, `summary.earth_any_share` | Fraction of the window with the `any_sliver` rule true | fraction 0–1 |
| `earth.margin_deg` | Margin of the `center` rule | degrees |
| `summary.longest_no_earth_hours` (+ `_first`, `_last`, `_truncated`) | Longest contiguous span with the `center` rule false. `_first` and `_last` bound it as `[first, last)`, `null` when there is none | hours (not seconds); ISO UTC; bool |
| `summary.longest_no_earth_any_hours` (+ `_first`, `_last`, `_truncated`) | The same under the `any_sliver` rule | hours; ISO UTC; bool |
| `summary.longest_dark_stretch_days`, `longest_no_direct_stretch_days` (+ `_first_day`, `_last_day`) | Longest run of whole UTC days with no direct Sun after any daylight (dark) or with no direct Sun at all (no direct). Day-resolved, so shorter than the seconds-based `longest_dark_interval_seconds` | days |
| `summary.longest_dark_truncated`, `longest_no_direct_truncated` | The run touches the first or last day of the window | bool |
| `summary.night_days` | UTC days with no part of the Sun above the flat horizon for the whole day (the lunar analogue of polar night) | days |
| `summary.all_day_sun_days` | UTC days with some part of the Sun above the flat horizon for the whole day (the lunar analogue of midnight sun) | days |

The names avoid `polar_night` and `midnight_sun`: a lunar day is about 29.5 Earth days, so those Earth-polar names mislead.

## What these metrics are not

Delivered power, battery state, thermal survival, link margin, data rate, DSN availability. Say so in the UI next to the numbers.

## INT-4 research API profiles

The scientific API identifies each result's profile explicitly. `surface` uses geometric body centers with aberration `NONE` over uniform half-open bins and reports `sampledCenterVisibleFraction`. Its solar-disk fraction is `null` with `not_computed` status. `mission` retains the audited MD-2C 481-point endpoint-inclusive four-hour grid, sampled operational connectivity and count-times-30-second blackout. Minimum connected-route RF margin is conditioned on connected selected routes. Its feasibility combines the 99% nominal sampled availability gate, physical placement and the profile's safety checks.

`propagate.feasible` is a trajectory safety label using the native impact, perilune and altitude checks. It establishes the trajectory predicate defined by that profile. Network feasibility belongs to the separate mission evaluation. `rf` reports an analytical model using its illustrative presets. These definitions extend the research API while the web metrics above retain their existing meanings.

Every computed result records its profile, source hashes, kernel and DEM hashes, frames, units and assumptions. [The service guide](../../scientificengine/README.md) describes the operations and validation boundaries.

## Rover prototype metrics

Reachability is existential over the bounded sampled time-expanded graph. Earliest arrival is the minimum reachable elapsed SPICE ET second, rounded upward by per-edge travel-time discretization. Unreached or unknown arrivals are null. Reachable time-level fraction counts reachable nodes divided by all requested levels including the endpoint. Waiting-opportunity bins identify feasible stopping transitions on half-open sample bins and exclude the endpoint. They do not quantify continuous occupancy. See ../rover-reachability-methodology.md and ../rover-reachability-limitations.md.
