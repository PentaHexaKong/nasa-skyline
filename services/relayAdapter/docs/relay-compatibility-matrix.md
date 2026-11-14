# Relay scientific compatibility

| Combination | Status | Conditions |
| --- | --- | --- |
| CR1/GR1/SR1, Candidate 2 saved states, 2025-01-01 to 2025-01-29 exclusive | Fully supported with implemented harmonization | NONE, MOON_ME_DE421, DEM height, zero observer height and mask, common 120 s bins |
| Mission-science refined intervals versus relay sample-bin metrics | Supported after harmonization | Recompute both direct and relay metrics from common left-endpoint booleans. Keep refined environmental metrics separately labeled |
| Full 28-day replay | Relay supported, mission API requires chunking | Mission API limits 6000 intervals. Integrated endpoint limits common comparisons to one day |
| Arbitrary sites or trajectories outside the exported state window | Unsupported | No new propagation or fabricated states |
| Apparent LT+S comparison | Unsupported | Saved relay geometry is geometric NONE |
| RF-qualified availability | Unverified and unavailable | Saved geometric scenario has no harmonized RF parameters for all legs |
| Original spherical regression | Supported as a separate regression profile | 1737.4 km sphere and original DE440 ME site chain. Not mixed with terrain direct baseline |
| DS catalog IDs | Unsupported | Their source coordinate realization is not reconciled with this registry |

Source orbital revision 827d9af913c95f8701c8fe4fb2480c6078019279. Nominal Candidate 2 is distinct from Front C C2 and C4. The exported states use two-body propagation and provide epoch offsets in seconds, Moon-centered J2000 km and km/s. Earth ephemeris and terrain visibility will be recomputed from those immutable states and copied scientific modules.

Raw kernel coverage does not extend the validity of the saved trajectories. Service validity is restricted to the exported window. Terrain uses the existing 80 m/240 m radial-height DEMs, DE421 registration, 0.25-degree sectors and documented far-terrain envelope. Relay-Earth occultation is spherical. Missing data raises unavailable without fallback.
