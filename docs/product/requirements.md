# Product requirements

What the app must do, with stable IDs so docs, tests and ADRs can point at them. Core requirements (R) come first; objectives (O) and considerations (C) refine them; background points (B) explain why they matter.

## The ask

> An intuitive tool that lets mission planners, educators and the public compare landing sites and dates quickly, showing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows.

## Core requirements (R)

| ID | Requirement |
| --- | --- |
| R1 | Compare **landing sites and dates** quickly (rapid scenario comparison). |
| R2 | Visualize **Sun and Earth positions relative to the horizon** at a site and date. |
| R3 | Help assess **power generation potential** (sunlight). |
| R4 | Help assess **direct-to-Earth (DTE) communication windows**. |
| R5 | Be intuitive for **three audiences**: mission planners, educators, the public. |

## Objectives (O)

| ID | Objective |
| --- | --- |
| O1 | **Curated site list**: past Apollo missions, future CLPS targets, other commercial missions, other countries' programs. **Plus custom coordinates.** |
| O2 | **Side-by-side or sequential comparison** of multiple sites. |
| O3 | **Date/time selection**, and exploring how conditions change across lunar days and seasons. |
| O4 | Show **time remaining before sunset or Earthset**. |
| O5 | Key metrics: **solar elevation angle**, **duration of sunlight**, **Earth visibility windows**. |
| O6 | Multiple visualization approaches: 2D maps, 3D surfaces, other creative forms. |
| O7 | **Temporal dynamics**: animations or timelines over a lunar day or several days. |
| O8 | **Accessibility across skill levels**: detail for planners, explanation for educators and the public. |

## Considerations (C)

| ID | Consideration |
| --- | --- |
| C1 | Ephemeris from JPL Horizons, or precomputed datasets. |
| C2 | LOLA topography for realistic surfaces and accurate horizons. |
| C3 | **No atmosphere**: the horizon is set by local terrain and the edge of the lunar sphere. No refraction. |
| C4 | Display **solar elevation** prominently. |
| C5 | Prioritize rapid comparison of many site-date combinations. |
| C6 | Communicate the **time to sunset/Earthset** clearly; it is critical operational information. |
| C7 | Make the **lunar vs terrestrial** differences apparent. |
| C8 | Help users understand **why small location or date changes have large impacts**. |
| C9 | Account for actual topography, since terrain changes horizon positions and windows. |
| C10 | Consider **Earth libration** and the Moon's orbital variations. |
| C11 | Represent the south pole's steep slopes, deep craters and extreme shadow. |
| C12 | Support science/engineering coordination, **fast response to schedule or hardware slips**, and education. |

## Background (B)

| ID | Point |
| --- | --- |
| B1 | Missions slip. Planners must re-evaluate **alternative sites in the same region** or **alternative dates at the same site**, and do it fast. |
| B2 | Existing tools (Quickmap, Moon Trek, JPL Horizons) are powerful but hard for non-specialists to use for rapid comparison. Our gap is accessibility and speed. |
| B3 | The south pole matters (water ice). Its geometry creates extreme variation in illumination and Earth visibility. |
| B4 | The Sun gives power and thermal conditions. Earth gives DTE comms without relays. |

## Extensions beyond the baseline

Relay Mode, mast placement, rover reach, 3D terrain and ML. They are optional and must never come at the expense of R1–R5 or O1–O5.
