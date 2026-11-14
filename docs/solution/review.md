# Requirements coverage review

Reviewed against [product/requirements.md](../product/requirements.md). Status: **recommendations proposed**; open decisions are tracked in [STATUS.md](../STATUS.md) (D1–D7).

## 1. Summary

**The foundation is valid and relevant.** The core idea is sound physics, aimed squarely at R1–R4: draw each site's terrain skyline and plot the Sun and Earth against it over time. The concept's honesty discipline (what each number does *not* prove, the claims list, validation against PGDA) is a real strength.

**Five things the requirements name explicitly need dedicated coverage.** A concept built around one angle, the south pole plus relays, leaves them weak or missing. Covering them is mostly scope and UI, not new science:

1. **Time to sunset / Earthset** (O4, C6) is barely mentioned, yet the requirements call it "critical operational information".
2. **Solar elevation angle** (O5, C4) should be "displayed prominently". A %-sunlit headline alone does not meet this.
3. **Curated sites beyond the pole** (O1): Apollo and other countries' sites are named examples. The concept's terrain (`LDEM_80S`) covers only ≥80°S.
4. **Custom coordinates** (O1) are listed as a stretch goal, and the static-only architecture can't serve them.
5. **The schedule-slip workflow** (B1, C12) is the main use case: "the date slipped, what now?" There is no explicit interaction for it.

Relay Mode is a good differentiator, but it is **not a stated requirement**. It must stay behind a working, validated baseline.

## 2. Coverage matrix

✅ covered well · 🟡 partial / needs a change · ❌ missing

| ID | Requirement | Coverage | Notes and fix |
| --- | --- | --- | --- |
| R1 | Compare sites and dates quickly | 🟡 | A comparison table exists, but the first cut has 3 points and 1 month. Add a date-shift control and "nearby alternative" (§3.5). |
| R2 | Sun and Earth vs horizon | ✅ | The skyline panorama is exactly this. |
| R3 | Power potential | 🟡 | % sunlit and the longest dark stretch are good. Add solar elevation and an explicit panel-orientation assumption (§3.4). |
| R4 | DTE windows | ✅ | % Earth-visible, longest gap, margin. Add window start/end lists. |
| R5 | Three audiences | 🟡 | "Explain mode" sits in the MVP, not the first cut. Make a minimal version first-cut (§3.7). |
| O1 | Curated sites + custom coordinates | ❌/🟡 | Only the pole. Custom coordinates are a stretch goal. See §3.2 and §3.3. |
| O2 | Side-by-side comparison | ✅ | "Compare first" layout option. |
| O3 | Dates; lunar days and seasons | 🟡 | One month in the first cut. Lunar "seasons" (the subsolar latitude swings ±1.54° over the ~346.6-day eclipse year) need ≥1 year at a coarse step. |
| O4 | Time to sunset / Earthset | ❌ | Add it as the headline card (§3.1). |
| O5 | Solar elevation, sunlight duration, Earth windows | 🟡 | Add elevation now/min/max and window lists. |
| O6 | Multiple visualizations | ✅ | Panorama + timelines + table. 3D is a stretch goal. |
| O7 | Temporal dynamics | ✅ | Animated cursor over the month; timeline lanes. |
| O8 | Skill levels | 🟡 | Same as R5. |
| C3 | No atmosphere | ✅ | Called out explicitly (refraction is dropped for the Moon). |
| C7 | Lunar vs terrestrial contrast | 🟡 | The pole explainer is good. A contrast site (Apollo 11) makes it obvious (§3.2). |
| C8 | Why small changes matter | 🟡 | The explainer covers distance. Add a "move 1 km" comparison or the PGDA illumination basemap (§3.6). |
| C10 | Libration | ✅ | SPICE `moon_pa` plus a topocentric Earth vector handles it. |
| C11 | Steep terrain, deep shadow | ✅ | 20 m near-field plus a PSR overlay. |
| C12 | Schedule slips | ❌ | No explicit flow (§3.5). |

## 3. Recommended changes (priority order)

### 3.1 Make "at landing time" the headline card (O4, O5, C4, C6)

For a chosen site and **landing time T**, show:
- Sun elevation **and clearance above the skyline** (degrees); Earth elevation and clearance.
- **Time until the next sunset** and the **next sunrise after it**. The same for **Earthset / Earthrise**.
- The remaining sunlit hours and Earth-visible hours in the next 14 days.

This is the planner's first question, and it is cheap once the samples and events exist. Event definitions are in [metrics.md](../science/metrics.md#events).

### 3.2 Add 2–3 contrast sites outside the pole (O1, C7)

- **Apollo 11** (near-equatorial, near side): Earth is *always* high in the sky and the Sun climbs high. The local horizon only matters near sunrise and sunset.
- **Chandrayaan-3** (~69°S): an intermediate case.
- Optional: **Chang'e-4/6** on the far side: Earth is *never* visible, which motivates relays in a single picture.

These sites don't need 20 m terrain. A global or 60°S LOLA product is enough (see [data/sources.md](../data/sources.md)). They cover the "Apollo, other countries" examples and make the pole's extremity obvious (C7). That is a strong educator moment.

### 3.3 Custom coordinates: offer a bounded version (O1)

A purely static site can't compute a horizon for an arbitrary point. Options, from cheapest:
- **a.** A precomputed grid of skylines over the polar region (e.g. every 1–2 km within the 9 Artemis regions). Clicking snaps to the nearest grid point, and the UI says so.
- **b.** An on-demand DS endpoint (the existing Go bridge) that computes the skyline from 80–240 m terrain, with a 1-month interval cap. This is the "hybrid" in ADR-0001.
- **c.** Out of scope: the UI says "curated sites only" honestly.

Recommendation: **a** first. Keep **b** for when the DS pipeline is stable.

### 3.4 Frame "power potential" honestly and usefully (R3, C4)

Solar elevation alone misleads at the pole. Polar landers use **vertical** arrays, so a Sun at +1° is good for power *if it is visible*. Show:
- the visible solar disk fraction (primary);
- solar elevation (as the requirements ask);
- an optional **panel-orientation toggle** (horizontal / vertical sun-tracking): cosine incidence × visible fraction, labelled "relative geometric power potential (0–1)", never watts.

This turns a requirement into an educational insight: "why the Apollo-era horizontal panel would starve at the pole".

### 3.5 Build the schedule-slip interaction (B1, C12)

This is the main use case, so make it a first-class control:
- **"Slip the landing"**: shift T by ±1 … ±30 days. The comparison shows the deltas (Δ time to sunset, Δ longest blackout in the next 14 days).
- **"Nearby alternatives"**: the other curated points in the same Artemis region, ranked by the selected metric.
- The **landing-window calendar** (wow "d"): a day-by-day grid of window quality for one site. It is the visual answer to "which dates work", and it reuses the same samples.

### 3.6 Show why small moves matter (C8)

Use the **PGDA average-illumination map** as the site-picker basemap, clearly labelled "18.6-year average, PGDA". Its sharp gradients near rims show the sensitivity instantly, at no compute cost. Optionally add a "±1 km" twin comparison at one rim.

### 3.7 Minimal explain mode in the first cut (R5, O8)

Three plain-language tooltips and one toggle are enough: "What is the skyline?", "Why does the Sun never rise high here?", "Why is Earth hidden half the month?". Reuse the concept's explainer graphics. The educator audience is one of three named audiences; don't leave it for the MVP.

### 3.8 Keep Relay Mode, but sequence it

The relay question is relevant (communications are R4), the landscape is moving now, and it differentiates the project. But it is not required and is the riskiest part: there is no clean orbit dataset, and the elements are illustrative. Gate it behind §3.1–3.5. Start with **one HEO relay**, shown as a **scenario ladder** (direct → +1 relay). Label all orbits illustrative.

## 4. Technical validity review

What's correct in the concept (verified in [reference-numbers.md](../science/reference-numbers.md)): axial tilt ~1.54°, synodic 29.53 d, draconic 27.21 d, Earth latitude libration ±6.7°, Sun 0.53°, Earth ~1.9° (1.80–2.01° over the orbit), curvature drop 2.88 km at 100 km, the +1.2° sight line, 1.28 s light time. The partial-disk formula in the prototype (circular-segment area) is correct for a locally straight horizon.

Pitfalls to design for (details in [method.md](../science/method.md)):

| # | Pitfall | Why it matters | Mitigation |
| --- | --- | --- | --- |
| T1 | **Frame mismatch**: SPICE PA vs LOLA ME | A sub-km surface offset is material at a crater rim | Use the ME frame from `moon_de440_250416.tf` for the site and DEM; check the DEM label |
| T2 | **Topocentric Earth** | Earth parallax from the surface is ~0.26°, comparable to the margins we report | Compute vectors from the surface point, not the Moon's center (SPICE `azlcpo` / `spkcpo`) |
| T3 | **Azimuth resolution** | 720 azimuths = 0.5° bins, about the Sun's diameter | Use ≥1440 azimuths (0.25°) near the Sun's path, or interpolate; run a convergence test |
| T4 | **Terrain extent beyond 80°S** | Sites near 80–85°S (Malapert, IM-1 ~80°S) see terrain north of the 80S mosaic | Stitch `LDEM_60S_240MPP` for the far field |
| T5 | **Earth visibility rule** | Center vs any sliver differs by ±0.95° of elevation, which is days of difference at the pole | Report both; headline one; label which |
| T6 | **Observer height** | It changes the near-field horizon | Fix 2 m (lander deck) and expose it as an assumption; consider 10 m for masts |
| T7 | **Interval-edge gaps** | The "longest gap" is truncated at the interval ends | Flag truncated gaps (already in the contract notes) |
| T8 | **Comparing with PGDA** | PGDA averages 18.6 years and counts any sliver of Earth | Validate on matched definitions, or call it a qualitative check |
| T9 | **Sampling events** | A 10-min step can miss short gaps | Bisect the transitions to ~1 min; run a convergence test (planned) |
| T10 | **DSN coverage** | DTE also needs a ground station that sees the Moon | Note it as an assumption. Optionally compute with Goldstone/Madrid/Canberra (wow "e") |

## 5. Recommended picks for the open questions

| Question | Pick | Why |
| --- | --- | --- |
| Main screen | **Compare first** (2–3 columns, each with a mini skyline + the at-T card + lanes) | R1 is "compare quickly", and the core value shows in 5 seconds |
| Skyline shape | **Unrolled panorama** | Reads gaps instantly; 3D is a stretch goal |
| Relay Mode | **Scenario ladder** | It shows what each addition buys, and it matches the "credit only the delta" rule |
| Time | **Stacked lanes** + a day-grid calendar view for slips | Lanes for one window; the calendar for "which dates" |
| First wow | **Real landing replay (IM-1/IM-2)**, then **prediction vs an LRO photo** | The replay reuses the pipeline. The photo is the strongest validation beat if a matching image exists |
| Relay first | **One HEO relay** | The simplest honest comparison |

## 6. Architecture fit

The concept says "static app, no backend". The repo is a Go → DS → ML Docker bridge. Both can coexist; see [ADR-0001](../decisions/0001-static-first-hybrid-architecture.md). In short: **the Python DS code is the pipeline either way**. Run it offline to emit static JSON for the curated sites (cheap to host and always reachable), and optionally expose it through the Go bridge for bounded custom requests. ML has no role in the requirements ([ADR-0003](../decisions/0003-ml-off-critical-path.md)).

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 20 m DEM is 2.5 GB | Slow I/O | Windowed reads (COG / range requests) or start at 80 m |
| Over-claiming | Credibility | The claims list; provenance on every number |
| Relay scope creep | The baseline is unfinished | ADR-0004 gate |
| Stale facts (missions slip) | Embarrassing errors | "As of" dates; re-check before quoting |
