# DS handoff vs. the frontend (prototype branch)

Compares every field and rule requested in
`docs/architecture/ds-ml-backend-handoff.units.json` (revision `units-and-symbols-v1`) with what
the web app actually reads and shows today.

**What the frontend reads.** The app does not consume the handoff payload. It reads the pipeline's precomputed files
(ADR-0001): `<site>.summary.json`, `<site>.tracks.json`, `terrain/<site>.bin`, `moon/ephemeris.json`,
`moon/space.json` (algorithm 0.4.0), validated by zod in `frontend/src/lib/data.ts` and `frontend/src/lib/space.ts`.
Extension results come through the feed contracts in `frontend/src/lib/feed-schemas.ts`. So most rows compare
"handoff name" against "pipeline file name". Fields the zod schemas do not declare are dropped on load and never
reach a page.

**Pages.**
- **Explore** = `/` (the merged public and educator page: chapters 01–05, the true-scale scene `#space`, the lesson list
  `#lessons`), plus the pages it opens: `/explore/<site>` (3D terrain) and `/understand/<lesson>`.
- **Analyze** = `/analyze` (planner: Set up, Result, Dates, Review), `/analyze/<site>` (site report),
  `/analyze/scenario/{mast,relay,rover}`.

**Status values** (one per row, no other meanings):

| Status | Meaning |
| --- | --- |
| **Delivered** | The pipeline file has it under the same meaning, and a page uses it. Name or unit may differ; see the "Delivered as" column. |
| **Delivered, unused** | The pipeline file has it, but the app drops it or never shows it. |
| **Derived in app** | Not in any file; the app computes it from delivered fields. The method is named. |
| **Contract only** | The app has a feed schema for it, but DS has not delivered the file. Dev shows invented fixtures (labelled); production shows "Coming next". |
| **Missing** | Neither delivered nor shown. |
| **Not applicable** | Out of the frontend's scope by design. |

## 1. `site`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `id` | `site.id` | Delivered | Chapter links, globe dots, `/explore/<site>` URL | Site picker, URLs, brief |
| `latitude_deg` | `site.lat_deg` | Delivered | Globe dot position; latitude in chapter 05 | Setup picker, Result, Review evidence |
| `longitude_deg_east` | `site.lon_deg_east`, °E in [0, 360) | Delivered | Globe dot position | Setup, Review evidence |
| `observer_height_m` | `site.observer_height_m` (2 m) | Delivered | Eye height in `/explore/<site>` | Review evidence, mast scenario baseline |
| `body_fixed_frame` | `site.frame` and `provenance.frame` (`MOON_ME_DE440_ME421`) | Delivered | Not shown | Review evidence, site report |
| SITE-01 traceable source | `site.source` (free text) | Delivered | Not shown | Review evidence |
| SITE-02 explicit frame | as `body_fixed_frame` | Delivered | Not shown | Review evidence, site report |
| SITE-03 height reference | `provenance.known_limits` text ("2.0 m above the DEM surface"); `site.ground_height_m` | Delivered (as text, no field) | 3D ground height | Site report limits |
| SITE-04 site covered by terrain | `provenance.known_limits` text (terrain by range) | Delivered (as text) | Not shown | Site report limits |

## 2. `time`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `start_utc` | `params.start`, a **date** (`2026-11-14`), meaning 00:00Z | Delivered (date, not timestamp) | Chapter 05 text ("365 days from 14 Nov 2026") | Window start of every stay |
| `end_utc` | none; `params.days` (365) | Derived in app: `start + days` (`dataEnd` in `lib/time.ts`) | Chapter 05 window | "Not computed" past the year |
| `step_seconds` | `params.step_min` = 1, `track_step_min` = 10, `earth_step_min` = 10, `earth_track_step_min` = 60 — **minutes**, four steps | Delivered (minutes; split per product) | Not shown | Site report shows the track step |
| TIME-01 UTC with `Z` | interval strings end in `Z` | Delivered | — | — |
| TIME-02 start < end | implied by `days` > 0 (zod: positive int) | Delivered | — | — |
| TIME-03 `[start, end)` | `conventions.time` | Delivered | Not shown | Site report conventions |
| TIME-04 bounded samples | fixed 365 days | Delivered | — | — |

## 3. `conventions` (CONV-01 … CONV-08)

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| CONV-01 degrees | `conventions.angles` | Delivered | Not shown | Site report |
| CONV-02 `azimuth_deg`, clockwise from north | `conventions.azimuth` | Delivered | Ridge panorama axis (E, SE, S…) | Panoramas, site report |
| CONV-02 `pole_direction_definition` | none | **Missing** | — | — |
| CONV-03 `sun_elevation_deg`, `earth_elevation_deg` | `tracks[date].el_deg`, `tracks[date].earth.el_deg` | Delivered | Ridge chapter ("Sun 5.8° · ridge 6.0°"), 3D site | Result, site report |
| CONV-04 `height_reference` (datum) | text in `known_limits`; no datum field | **Missing** as a field | — | — |
| CONV-05 `sun_visibility_rule` | `conventions.direct_sun` ("any part of the solar disk above the terrain skyline") | Delivered | Not shown | Site report |
| CONV-05 `sun_visible_disk_fraction` | `tracks[date].direct_fraction` | Delivered | Ridge chapter, 3D site | Day profile, panoramas |
| CONV-06 `earth_visibility_rule` (enum `center`/`any_sliver`/`full_disk`) | `earth.rule` free text; `conventions.earth_visible` | Delivered (text, not enum) | Not shown | Site report |
| CONV-06 `direct_earth_visible` per sample | none per sample; `earth_intervals` (centre rule, 1 s edges) instead | Delivered (as intervals) | Chapters 04–05, 3D site | Result lanes, Dates, Review |
| CONV-07 `earth_elevation_margin_deg` | `earth.margin_deg` = 0 | **Delivered, unused** (`EarthSchema` drops it; the 0° margin appears only inside `conventions.earth_visible` text on the site report) | — | — |
| CONV-08 `step_seconds` | see §2 | Delivered (minutes) | — | — |
| CONV-08 `sample_weight_seconds` | none | **Missing** (not needed while shares come from 1 s intervals) | — | — |

## 4. `skyline`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `azimuth_deg` per point | implicit: index × `skyline.az_step_deg` | Delivered (implicit) | Ridge panorama, 3D site | Result and report panoramas |
| `elevation_deg` per point | `skyline.elevation_deg` (1440 values) | Delivered | Ridge panorama, 3D site skyline | Result and report panoramas, clearance |
| SKY-01 full circle | 1440 × 0.25° | Delivered | — | — |
| SKY-02 resolution and range | `skyline.az_step_deg` (0.25), `params.skyline_max_km` (200) | Delivered | Not shown | Site report, Method |
| SKY-03 traceable terrain | `provenance.dem[]`, `dem_product`, `known_limits` | Delivered | Not shown | Site report, Review |
| SKY-04 no illustrative curve | real LOLA skyline everywhere | Delivered | All skylines are real | All skylines are real |

## 5. `samples`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `time_utc` | `tracks` keyed by **date**, `t_min` = minutes after 00:00 UTC | Delivered (different shape) | — | — |
| `sun_azimuth_deg` | `tracks[date].az_deg` (10 min) | Delivered | Ridge panorama, 3D site | Panoramas, day profile |
| `sun_elevation_deg` | `tracks[date].el_deg` | Delivered | Ridge chapter | Day profile, Result |
| `sun_visible_disk_fraction` | `tracks[date].direct_fraction` | Delivered | Ridge chapter, 3D site | Day profile |
| `earth_azimuth_deg` | `tracks[date].earth.az_deg` (60 min) | Delivered | 3D site Earth marker | Panorama Earth arc |
| `earth_elevation_deg` | `tracks[date].earth.el_deg` | Delivered | 3D site | Panorama Earth arc |
| `direct_earth_visible` | not per sample; `earth_intervals` | Delivered (as intervals) | Chapters 04–05 | Result, Dates |
| SAMPLE-01 time order | arrays ordered by `t_min` | Delivered | — | — |
| SAMPLE-02 fraction 0–1 | zod `min(0).max(1)` | Delivered | — | — |
| SAMPLE-03 Earth rule recorded | `earth.rule` | Delivered | — | Site report |
| SAMPLE-04 `null` with reason | Sun tracks skip samples below −1°; days without a stored track exist | Delivered (by omission, explained in UI) | — | "No stored Sun path" note on the report |

## 6. `summary`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `mean_visible_solar_disk_fraction` | none | **Missing** | — | — |
| `sunlit_time_fraction` | none as a field; `days[].direct_min` and `intervals` | Derived in app: Σ`direct_min` / minutes (Explore); interval length / window (Analyze) | Chapter 03 bars, chapter 05 "Sun in direct view" | Result, Review |
| `longest_dark_interval_seconds` | `summary.longest_dark_stretch_days`, `longest_no_direct_stretch_days` (**whole UTC days**) | Delivered (days, not seconds) **and** Derived in app (hours from `intervals`, `longestGap`) | Chapter 05 "Longest wait" (derived, hours → days) | Result and Review (derived); site report (delivered days) |
| `direct_earth_visible_fraction` | `earth.visible_share` (also `summary.earth_visible_share`) | Delivered | Chapter 04 finding, chapter 05 bars, globe notes | Result and Review use per-stay shares derived from `earth_intervals` |
| `longest_direct_gap_seconds` | `summary.longest_no_earth_hours` (hours) | **Delivered, unused** (dropped by zod); the app derives it from `earth_intervals` | Chapter 04 ("13 days"), chapter 05 | Result, Review (derived) |
| SUMMARY-01 fractions 0–1 | yes | Delivered | Shown as % | Shown as % |
| SUMMARY-02 durations in seconds | days or hours, never seconds | **Different unit** | — | — |
| SUMMARY-03 mean disk ≠ sunlit time | no mean-disk value exists | **Missing** (only time share is shown) | — | — |
| SUMMARY-04 truncated gaps explained | `summary.*_truncated` delivered; app recomputes | Delivered and Derived in app | "+" after the wait in chapter 05 | "+" (`OpenEnd`) in Result and Review |

## 7. `events` (`sunset`, `earthset`)

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `sunset` event | none | Derived in app: next end of a Sun interval (`NextChange`) | Not shown (plain state only) | "Terrain sunset in …" on Result and the site report |
| `earthset` event | none | Derived in app: next end of an Earth interval (`NextEarth`) | Not shown | "Earthset in …" on Result and the site report |
| `status` enum | none | Derived in app: `predicted` → the countdown; `not_within_interval` → "No … within the computed year"; `not_computed`/`unavailable` → not distinguished | — | Result, site report |
| `time_utc`, `seconds_from_start` | none | Derived in app (from the current moment, not from `start_utc`) | — | — |
| EVENT-04 search precision | not a field; interval edges are refined to 1 s | **Missing** as a field | — | — |

## 8. `provenance`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| PROV-01 `algorithm_version` | `provenance.algorithm_version` (0.4.0) | Delivered | Not shown (Method page) | Site report, brief, Review |
| PROV-02 `filename` | `kernels[].file`; DEMs by `url` (remote, windowed) | Delivered | Not shown | Brief, Review, Method |
| PROV-03 `version_or_sha256` | `kernels[].sha256`; DEMs carry `etag` and `last_modified`, **no SHA-256** | Delivered (DEM: ETag only) | Not shown | Brief, Method |
| PROV-04 `source_url` | `dem[].url` | Delivered | Not shown | Method |
| PROV-05 `input_parameters` | `params` | Delivered | Not shown | Site report |
| PROV-05 `azimuth_step_deg` | `skyline.az_step_deg`, `params.az_step_deg` | Delivered | Not shown | Site report |
| PROV-05 `max_range_km` | `params.skyline_max_km` | Delivered | Not shown | Site report |
| PROV-05 `dem_resolution_m` | only in `known_limits` text and DEM names (20/80/240 m) | **Missing** as a field | — | — |
| PROV-06 frame and time | `provenance.frame`, `params.start` | Delivered | — | Site report |

## 9. `data_state_and_warnings`

| Handoff field / rule | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `schema_version` | site files: none (`kind` only). Feeds: `schema_version: 1` | **Missing** in site files; Contract only in feeds | — | — |
| `analysis_id` | none | **Missing** | — | — |
| `data_state` (`fixture`/`computed`/`unavailable`) | site files: `synthetic` boolean (**dropped by zod**). Feeds: `origin` `computed`/`fixture`; no `unavailable` value — a missing file means unavailable | Delivered, unused (site files); Contract only (feeds) | — | "Not computed yet" (dev) / "Coming next" (production) |
| `warnings` | `provenance.known_limits` (site files); `provenance.assumptions` (feeds) | Delivered | Not shown on `/` (claims line in the footer) | Site report "Method and limits", Review |
| STATE-01 fixture never shown as real | feeds: fixtures dev-only and labelled | Delivered | — | Dev labels |
| STATE-03 missing ≠ zero | "not computed" past the year; "Not computed yet" for feeds | Delivered | — | Result, Review |
| STATE-04 no power / radio claims | footer claims line; "unitless, not watts" in power contract | Delivered | Footer, chapter 04 text | Footer, panels |

## 10. `proposed_contract_additions` (not in schema v1)

| Handoff field | Delivered as | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| `sun_clearance_deg` | none | Derived in app: track elevation − skyline at that azimuth (`horizonAt`) | Ridge chapter ("Sun 5.8° · ridge 6.0°") | Site report HUD, Result |
| `earth_clearance_deg` | none | Derived in app (`lib/target.ts`, `clearance_deg`) | 3D site Earth arc | Panorama Earth arc |
| `sunrise` | none | Derived in app ("Direct sun returns in …") | — | Result, site report |
| `earthrise` | none | Derived in app ("Earthrise in …") | — | Result, site report |
| `windows.sun` | `intervals` | Delivered | Chapters 01, 05 (lanes, shares) | Result lanes, Dates, Review |
| `windows.earth` | `earth_intervals` (centre); `earth_intervals_any` also delivered | Delivered (`_any` unused) | Chapters 04, 05 | Result lanes, Dates, Review |
| `longest_dark_truncated` | `summary.longest_dark_truncated`, `longest_no_direct_truncated` | Delivered, unused (app recomputes) | — | — |
| `longest_gap_truncated` | `summary.longest_no_earth_truncated` | Delivered, unused (app recomputes) | — | — |
| `sun_elevation_min_deg`, `sun_elevation_max_deg` | none | **Missing** | — | — |

## 11. `relay_extension`

No relay file is delivered (`frontend/data/feeds/` does not exist). Explore has no relay chapter. Analyze reaches it
from Review → `/analyze/scenario/relay`.

| Handoff field / rule | App contract (`RelayFeed`) | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| RELAY_CONFIG-01 `scenario_id` | `scenarios[].id` | Contract only | — | Relay scenario page |
| RELAY_CONFIG-02 `configuration_id` | none | **Missing** in contract | — | — |
| RELAY_CONFIG-03 `orbit_model`, `source_url`, `version_or_sha256` | `scenarios[].source`, `as_of`, `orbit_status`; envelope `provenance.sources` | Contract only, partial (no orbit parameters, no checksum) | — | — |
| RELAY_CONFIG-04 epoch and frame | none | **Missing** in contract | — | — |
| RELAY_CONFIG-05 `node_positions` | none | **Missing** in contract (no surface relays planned) | — | — |
| RELAY_CONFIG-06 link rules (`input_parameters`) | envelope `provenance.assumptions` | Contract only | — | — |
| RELAY_RESULT-01 `relay_path_visible` per sample | `scenarios[].intervals` (spans, `[start, end)`) | Contract only, different shape | — | Relay lanes |
| RELAY_RESULT-02 `relay_assisted_visible_fraction` | `scenarios[].contact_share` | Contract only | — | Relay ladder |
| RELAY_RESULT-03 `longest_remaining_gap_seconds` | `scenarios[].longest_gap_h` (**hours**) + `longest_gap_truncated` | Contract only, different unit | — | Relay ladder |
| RELAY_RESULT-04 `warnings`, `configuration_id` | `provenance.assumptions`; no configuration id | Contract only, partial | — | — |
| RELAY_RULE-01 all hops at the same time | not a field (method) | Not applicable to the app | — | — |
| RELAY_RULE-02 store-and-forward labelled separately | not modelled | **Missing** | — | — |
| RELAY_RULE-03 illustrative orbits labelled | `orbit_status` includes `illustrative`, `indicative` | Contract only | — | — |
| RELAY_RULE-04 no link-budget claim | claims line, panel copy | Delivered | Footer | Panels |
| (app extra) relay-count study (D9) | `RelayStudyFeed` | Contract only, not in the handoff | — | Review |

## 12. `ml_optional`

| Handoff item | Status | Explore | Analyze |
| --- | --- | --- | --- |
| ML_AGREE-01 … 07, ML_DELIVERY-01 … 06 (`prediction_schema`, `feature_schema`, `model_version`, `validation_report`, `coverage`, …) | Not applicable (ADR-0003: ML off the critical path); nothing in the app | — | — |

## 13. `backend_integration`

| Handoff item | Status in the app |
| --- | --- |
| `POST /analyze` (DS), `POST /predict` (ML), `run_ml: false` | Not used by any page. Pages are static and read precomputed files (ADR-0001). Only `/integration.html` calls the backend. |
| `POST /api/scientificengine` (branch `scientificEngine`) | Not used by any page. Its site ids (CR1, GR1, SR1) need a mapping to app site ids before UI use. |
| 1 MiB response limit, 20 s deadline | Not applicable to static files. For scale: one site's `summary.json` is about 50 KB, its `tracks.json` 0.5–0.9 MB. |
| "Align pipeline output with frontend format" | Open: this document is the list of differences. |

## 14. `validation_handoff`

| Handoff item | App contract (`ValidationFeed`) | Status | Explore | Analyze |
| --- | --- | --- | --- | --- |
| VALIDATION-01 one case with a cited reference | `rows[].reference.product` | Contract only | — | Review validation panel |
| VALIDATION-02 comparison and differences | `rows[].ours`, `rows[].reference`, `difference_notes` | Contract only | — | Review validation panel |
| VALIDATION-02 `validation_tolerances` | none | **Missing** in contract | — | — |
| VALIDATION-03 refinement check (`step_seconds`, `azimuth_step_deg`) | none | **Missing** in contract (results exist only in `ds/validation/`) | — | — |
| VALIDATION-04 open limits | `provenance.known_limits` | Delivered | — | Site report |

## 15. Data the app uses that the handoff does not list

| Pipeline field | Used for | Page |
| --- | --- | --- |
| `days[].daylight_min`, `days[].direct_min` | Year chart, hilltop and flat-horizon shares | Explore chapter 03; Analyze site report |
| `days[].earth_min`, `earth_any_min` | Nothing (dropped or unused) | — |
| `site.ground_height_m`, `site.name`, `site.reference` | 3D ground, labels, picker descriptions | Both |
| `terrain/<site>.bin` + `.json` (257×257 Int16, inner and outer tiles) | 3D terrain | `/explore/<site>` |
| `moon/ephemeris.json` (hourly sub-solar and sub-Earth points) | Moon lighting and the Earth loop on `/`; first-visit moment | Explore |
| `moon/space.json` (Earth/Sun positions, Moon/Earth orientation) | True-scale scene | Explore `#space` |
| `earth.any_share` | Review evidence | Analyze |
| `PowerFeed`, `MastFeed` | Mast and power scenarios (contract only) | Analyze `/analyze/scenario/mast` |

## Gaps to agree with DS, by priority

1. **Units and shapes the handoff states but the files do not follow:** seconds (files use minutes, hours, whole days),
   `end_utc` (files give `days`), per-sample timestamps (files give date + minute), Earth visibility per sample (files
   give intervals). Either update the handoff to the file shapes or change the files; the app already reads the files.
2. **Missing fields:** `pole_direction_definition` (matters at 89.47°S), `height_reference` datum, `dem_resolution_m`,
   `mean_visible_solar_disk_fraction`, `sun_elevation_min/max_deg`, event search precision, `schema_version` and
   `analysis_id` in site files, DEM SHA-256.
3. **Delivered but dropped by the app:** `earth.margin_deg`, `synthetic`, `summary.longest_no_earth_hours` and the
   `*_truncated` flags, `earth_intervals_any`. The app recomputes gaps and truncation from intervals, so values agree
   by construction; showing `margin_deg` beside the Earth rule is a one-line change in `EarthSchema` if wanted.
4. **Relay contract vs. handoff:** add `configuration_id`, orbit epoch and frame, and decide hours vs. seconds before
   DS writes `feeds/relay/<site>.json`.
5. **Validation contract:** add `validation_tolerances` and the refinement check if the panel should show them.
