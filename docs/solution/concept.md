# Concept: Lunar Landing Site Navigation

## One line

A browser tool that compares lunar landing sites and dates for **sunlight** and **direct Earth contact**, drawn against each site's real terrain skyline. It then measures **how much relay satellites shrink the communication gaps that remain**.

## The questions we answer per site and date

| # | Question | We show | It does **not** prove |
| --- | --- | --- | --- |
| 1 | Is there sunlight? | Sun elevation now; % of time sunlit (partial disk counted by visible area); longest dark stretch; **time to the next sunset** | Battery capacity, delivered power, survival |
| 2 | Can the lander see Earth? | Earth elevation now; % of time Earth is above the skyline; longest gap; adjustable elevation margin; **time to the next Earthset** | A working radio link, ground-station availability |
| 3 | How much does a relay help? *(ours, optional)* | Geometric contact for each relay setup; longest remaining gap | Link budget, capacity, pointing, continuous service |

Questions 1–2 are the baseline. Question 3 is the project's differentiator.

## Why the south pole is hard (the explainer story)

- The Moon's spin axis is tilted only **~1.54°** to the ecliptic, so at the pole the Sun skims the horizon. Terrain decides everything.
- The Sun circles the full horizon once per **29.53 d** (synodic month).
- At the exact pole, Earth sits near one azimuth and bobs about **±6.7°** in elevation over **27.21 d** (libration in latitude), so before terrain it is below the horizon about half of each month.
- The Sun's disk is **0.53°** across and Earth's is **~1.9°**, so partial-disk handling matters.
- Curvature: the ground 100 km away is **~2.9 km** below the local horizontal, but a 5 km massif at that distance still rises **+1.2°** and blocks a Sun at +1.0°. The skyline therefore needs terrain out to roughly 150–200 km.
- One-way light time to Earth is **1.28 s**. Relays add reach, not speed.

All of these numbers are checked in [science/reference-numbers.md](../science/reference-numbers.md).

## Relay Mode (extension)

When Earth is behind the skyline, a satellite that can see both the lander and Earth passes data along. **Relays carry data, not power.** Each setup is credited only with what it adds over the setup above it:

| Setup | Could help with | Must be established |
| --- | --- | --- |
| Direct to Earth only | Baseline | Site- and date-specific gaps with a stated elevation margin |
| One high elliptical relay (Queqiao-2-like) | Long viewing periods over the pole from apolune | Sees the lander and Earth at the same time; remaining blackouts |
| Two independent relays | Complementary periods, a second route | Phasing, overlap, an Earth link for each. Not a proven minimum |
| Mother plus smaller nodes (the original idea) | Short local hops for low-power landers | Every hop usable at the same moment; a mother outage stops everything |
| Rim node plus relay | A route around one specific obstacle | Terrain clearance on both hops, deployment, the node's own power |

Live contact requires **every hop at the same instant**. Store-and-forward is a separate, weaker model and gets its own label.

### Planned-relay coverage, rover reach and power support

The extension is now one story on the same terrain-aware engine ([ADR-0005](../decisions/0005-relay-coverage-and-rover-reach.md)):

1. **Can a lander here get power and talk to Earth?** The baseline.
2. **Do the planned relay services close the gaps?** For a site and date: which relays exist then (status and source, as of a date), when the lander sees a relay over its skyline while the relay sees Earth, and what gaps remain. Lunar Pathfinder and the Intuitive Machines network from published orbits; Moonlight illustrative. We do not say how many relays a mission *needs*.
3. **What can a rover reach from this site?** The area reachable in a lunar month while staying in sunlight and in contact, with and without relays (VIPER's rule: drive with Sun and Earth in view; relays lift the Earth part). Output is a corridor, not a drivable route.
4. **Power support:** `power_potential` per panel model (horizontal, vertical tracking), a mast-height what-if, dark stretches to bridge (hours), Diviner temperature as orbital context. Never watts or battery survival.

Why this is a differentiator: NASA runs this analysis internally (LCRNS analysis tools, VIPER's SHERPA/VERVE), and public tools cover parts (SSTL's one-relay Mission Builder, Moon Trek line of sight), but we found no public tool joining a site's terrain-aware gaps to the planned relays and to rover reach. Position it as a public, transparent version of that analysis, not as a first.

Plan and order: [scope.md](scope.md#plan). Sources: [references.md](references.md).

Dropped: an AI landing-site recommender (no ground truth; unexplainable) and "how many relays/rovers" (no defensible answer; banned by the claims policy). A transparent site finder (filters + ranked list) stays optional.

### Relay landscape

Current status and published orbits: [data/sources.md](../data/sources.md#relays-rovers-and-surface-temperature). The table below is a snapshot.


| When | What | Note |
| --- | --- | --- |
| 2018 | Queqiao-1 (China) | Far-side relay for Chang'e-4 |
| 2024 | Queqiao-2 (China) | Elliptical frozen orbit over the south pole. The Wolf Amendment limits NASA cooperation |
| 2025 | Khon-1 (Intuitive Machines) | Launched with IM-2; status unclear |
| **NET Dec 2026 / 2027** | ESA **Lunar Pathfinder** + Firefly **Elytra** on **Blue Ghost Mission 2** (far-side landing) | Sources disagree: one said "late 2026, NET November"; Wikipedia (Nov 2026) lists 2027, and March 2026 reports said NET Dec 2026 |
| 2026–27 | IM relay satellites on IM-3 / IM-4 | Verify the dates before quoting them |
| 2028–30 | ESA Moonlight | 1 comms + 4 nav satellites, south pole first |

### Artemis context

In Feb 2026 NASA restructured Artemis. **Artemis III no longer lands.** The first crewed landing is now **Artemis IV (planned 2028)**. The 9 south-pole candidate regions were announced for Artemis III on 28 Oct 2024 and remain the reference list for crewed landing regions (Payload Space, 27 Feb 2026; NASA, 28 Oct 2024). Call them "Artemis candidate regions", not "Artemis III sites".

## Delivery shape

A static web app over precomputed data. Python (SPICE geometry, LOLA terrain) produces JSON, and the browser draws it. The architecture discussion is in [ADR-0001](../decisions/0001-static-first-hybrid-architecture.md).

## Open design questions

1. What leads the main screen? Skyline first / Map first / Compare first
2. What shape is the skyline chart? Unrolled panorama / Sky dome / 3D terrain
3. How does Relay Mode show up? Toggle adds a lane / Scenario ladder / Relay lab tab
4. How is time shown? Stacked lanes / Day grid / One combined band
5. Which relay setup comes first? One HEO relay (recommended) / Two relays / Mother + nodes
6. Which "wow" comes first after the baseline? Prediction vs a real LRO photo / Stand at the site and unroll the horizon / Real landing replay (IM-1, IM-2) / Landing-window calendar / Relay payoff curve + DSN stations / AI science-value layer

Recommendations are in [review.md §5](review.md#5-recommended-picks-for-the-open-questions).
