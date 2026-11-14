# Scope and build plan

Status: **proposed**.

## Plan

See [ADR-0005](../decisions/0005-relay-coverage-and-rover-reach.md) for the extension and [references.md](references.md) for every research source. Build in this order; the cut line holds. Effort: **S** ≤ half a day, **M** about a day, **L** 2–4 days.

| # | Item | Status | What it delivers | Serves | Data / basis | Effort | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Terrain-aware Sun and Earth pipeline | Done | Skyline, Sun and Earth visibility, events, 365 days from 2026-11-14, provenance | R2–R4, O5 | LOLA (PGDA 90), SPICE | | |
| D2 | Moon sites | Done | IM-2, IM-1, Apollo 11, Malapert Massif, Shackleton connecting ridge | O1 (partial) | [sites.md](../data/sites.md) | | D1 |
| D3 | Visualize | Done | Panorama, day profile, year chart, readouts, provenance | R2, C4, O5 | D1 | | D1 |
| D4 | 3D site island and eye level | Done | Real terrain, Sun and Earth at true direction, fogged surround | O6 | D1 | | D1 |
| D5 | True-scale space scene (`/#space`) | Done | Moon, Earth, Sun, stars at true positions; presets; playback; fly-in | O6, O7, R5 | SPICE; NASA imagery ([sources.md](../data/sources.md#space-scene-web-app-earth-sun-and-star-backdrop)) | | D1 |
| 1 | Planner with Moon sites, plus date slip | **Now** | Side-by-side comparison of Moon sites; shift the date and see the deltas | R1, O2, B1 | D1 outputs | S | |
| 2 | Time to sunset and Earthset | **Now** | Countdown to the next terrain sunset and Earthset at the chosen moment | O4 | D1 intervals | S | |
| 3 | Month-long timeline and playback on site pages | **Now** | Scrub and play a whole lunar day (29.5 days) instead of one Earth day | O3, O7 | D1 | M | |
| 4 | Landing windows | **Now** | Dates with the Sun up and Earth in view for landing and the hours after | R1, O3, B1 | D1; NASA lighting context | S–M | |
| 5 | More curated sites | **Now** | Chandrayaan-3 and 2–3 more Artemis regions (documented pick rule) | O1 | `pipeline.pick`, PGDA 69 | S | D1 |
| 6 | Power support and mast presets | **Now** | `power_potential` per panel type; masts at 2, 10, 20 (VSAT-class) and 30 m (VSAT-XL); dark stretches in hours | R3 | [metrics.md](../science/metrics.md); NASA VSAT, Blue Origin Power Tower, Astrobotic VSAT-XL | M | D1 |
| 7 | Relay coverage | **Now** | Direct to Earth vs + Lunar Pathfinder vs + Intuitive Machines network: contact windows and remaining gaps; relays drawn in the space scene | R4; differentiator | SSTL service guide (indicative), AAS 25-758 | M–L | D1, D5 |
| 8 | Mast placement v1 | **Now** | Sunniest spots within a user-set cable radius (PGDA 69), checked by our pipeline at each mast height; shown on the island | R3; differentiator | PGDA 69, D1 | M | 6 |
| 9 | Validation panel | **Now** | Our numbers next to PGDA 69 per site, with the period and rule differences stated | Trust; claims policy | PGDA 69, D1 | S | |
| 10 | Rover reach at the Shackleton connecting ridge | **Now** | Area reachable in a lunar month while lit and in contact (direct, + Pathfinder, + IM network); user-set speed and maximum slope; optional corridor to a target | Differentiator | LOLA 20 m; near/far horizon split checked against D1 at the site | L | 7 |
| ✂ | *Cut line* | | | | | | |
| 11 | Seamless dive from space into a site | Stretch | No fade: the camera descends from the space scene to the island | R5, O6 | D4, D5 | M | |
| 12 | Rover reach at more sites | Stretch | Same as 10 for the other polar sites | | | M | 10 |
| N1 | More relays and a year-by-year timeline | Next | Moonlight (illustrative); which services exist on a date | R4 | ESA/Telespazio (partial) | M | 7 |
| N2 | Ground-station check | Next | When the DSN complexes (and the paused LEGS antennas) see the Moon | R4 | Station coordinates, SPICE | S–M | |
| N3 | Matched comparison with NASA's LCRNS coverage slide | Next | Our direct / +1 / +2 relay shares against 17–43% / 80–86% / 100% after matching definitions | Validation | NASA slides, Mar 2025 | M | 7, N2 |
| N4 | Surface temperature | Next | Diviner orbital temperature during dark stretches, with the slope caveat | Context | Diviner polar products | M | |
| N5 | Custom coordinates on demand | Next | Any point, computed by the live data service | O1 | DS service | L | |
| N6 | Ground-truth slot | Next | Measured vs predicted when VIPER or Blue Moon data exists; Chandrayaan-3 ChaSTE as the first example | Trust | ISRO ChaSTE | S | |
| N7 | Transparent site finder | Next | Filters plus a ranked list over the PGDA maps | O1 | PGDA 69 | M | 5 |
| N8 | Point-to-point rover route planner | Next | Beyond the corridor, toward operations | | Published A*-family methods | L | 10 |
| N9 | Predicted shadow vs an LRO photo | Next | Compare the predicted shadow with a PGDA product 90 image pair | Trust | PGDA 90 image pairs | M | D1 |
| N10 | CSV export | Next | Download the numbers shown for a site and period | O5 | D1 | S | D1 |

**Out of scope:** ML models (including an AI site recommender); relay or rover counts presented as requirements; drivable rover routes; delivered watts, battery or thermal survival; link budgets; user accounts; databases.

## Definition of done

- [ ] Every displayed number comes from a pipeline run with a provenance record.
- [ ] The validation case is documented in `docs/science/validation.md`, with the result and any explained difference.
- [ ] Changing the step 10 → 2 min moves no event by more than one step, and no summary metric by more than 1 percentage point.
- [ ] The UI shows the visibility rules and assumptions next to the results.
- [ ] The app works from a public static URL on desktop and mobile.
