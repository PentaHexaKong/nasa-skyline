# 0005: Planned-relay coverage and rover reach as one extension

Status: **proposed** | Refines [0004](0004-relay-mode-as-extension.md)

## Context

The baseline answers requirements R1–R5: terrain-aware Sun and Earth over the horizon, per site and date. The project's own results show why a planner needs more: at the hill sites Earth's centre is out of view for up to 303 h (Malapert Massif) and 322 h (Shackleton connecting ridge) in a row.

Research (sources in [data/sources.md](../data/sources.md#relays-rovers-and-surface-temperature)):

- **Relays.** Orbit parameters are published in primary sources for ESA/SSTL **Lunar Pathfinder** (service guide, marked "indicative") and the **Intuitive Machines Lunar Data Network** (AAS 25-758, per satellite). ESA **Moonlight** publishes periods and semi-major axes only. NASA LCRNS orbits are "defined by the service provider". Queqiao-2 has only conflicting secondary sources and is not usable by NASA-funded landers (Wolf Amendment). Nothing is flying for NASA landers yet; every date has slipped.
- **Existing tools.** NASA has the capability internally (LCRNS Government Analysis Tools; Glenn's Lunar Site Analysis Software, US release only; VIPER's SHERPA and VERVE). Public tools cover parts: SSTL's Lunar Pathfinder Mission Builder (one relay, no terrain), JPL Moon Trek line of sight (no relay library). We found **no public tool that combines a site's terrain-aware Earth gaps with the planned relay services**.
- **Rovers.** For rover missions, traversable terrain is a site-selection criterion: VIPER's sites had to meet volatiles, sunlight, traversable terrain and direct-to-Earth contact, and its traverse legs require both Sun and Earth in view (relays would lift the Earth part). Planned south-pole rovers: VIPER (2027), Chang'e-7 (postponed, apparently 2027), LUPEX (~2028, unconfirmed), Artemis LTV (2028). No rover is returning south-polar ground truth today.
- **Rejected along the way:** an "AI site recommender" (no ground truth to validate, unexplainable picks) and "how many relays/rovers do we need" (no defensible answer; the claims policy bans a required satellite count).

## Decision

One extension, three layers on the same terrain-aware engine. The full ordered plan, with the cut line, is the table in [scope.md](../solution/scope.md#plan) (items 6–10 are this extension); sources are in [references.md](../solution/references.md).

1. **Planned-relay coverage (now).** For a site and date: which relay services exist (status and source as of a date), when the lander sees a relay over its skyline while that relay sees Earth (same instant), and the gaps that remain against direct-to-Earth alone. Ladder: direct → + Lunar Pathfinder (service-guide orbit, indicative) → + Intuitive Machines network (AAS 25-758). Moonlight later, illustrative. Orbit frames checked against each source's own figures; propagation simplified over about a lunar month and labelled.
2. **Power support and masts (now).** `power_potential` per panel model (already specified in [metrics.md](../science/metrics.md)); mast presets at 2, 10, 20 m (NASA VSAT, Blue Origin Power Tower) and 30 m (Astrobotic VSAT-XL) by rerunning the skyline at that observer height; dark stretches to bridge (hours, with dates). **Mast placement v1:** sunniest spots within a user-set cable radius from PGDA 69 (ground level), then each candidate checked by our pipeline at every mast height.
3. **Rover reach (now, one site: the Shackleton connecting ridge, target of Blue Moon MK1 and VIPER).** The area a rover can reach within a lunar month while lit and in contact (direct, + Pathfinder, + IM network), user-set speed and maximum slope, optional corridor to a target. Per-cell horizons use a near/far split (far horizon shared from the site's own skyline, near horizon per cell from the 20 m DEM within ~5 km), checked against the full pipeline at the site cell. Output is a **corridor, not a drivable route** (20 m terrain shows no rocks). More sites are a stretch item.

Next (roadmap): Moonlight and a year-by-year relay timeline, ground stations (DSN, LEGS), the matched comparison with NASA's LCRNS slide, Diviner temperature, a ground-truth slot, point-to-point routes.

Contact means geometric line of sight only. Relay orbits are propagated for about one lunar month or labelled simplified.

## Consequences

- The story connects: lander power and contact → planned relays close gaps → relays widen what a rover can reach.
- New data work: relay orbit library (cited, versioned), per-cell horizon masks for small patches, Diviner polar temperatures.
- Validation: compare against NASA's March 2025 LCRNS result (direct-to-Earth only 17–43%, +1 relay 80–86%, +2 relays 100%, worst/best south-pole sites) **only after** matching its definitions (elevation mask, ground stations, Earth-centre rule); our direct-to-Earth shares are higher, so the difference must be explained first.
- Rover routing overlaps NASA's internal tools and many published planners; it is framed as "what can a rover reach from this site" (a site comparison, which the requirements ask for), not as an operations planner.

## Alternatives considered

- AI landing-site recommender: rejected (above). A transparent site finder (filters + ranked list over PGDA maps, like `pipeline.pick`) stays a cheap optional add-on.
- Relay count optimiser ("you need N relays"): rejected by the claims policy; may return as a what-if, never as a requirement.
- Full point-to-point rover route planner: deferred; the reach map uses the same data and fits the site-comparison question.
