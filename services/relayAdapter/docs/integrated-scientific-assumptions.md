# Integrated scientific assumptions

Only nominal Candidate 2 is exposed. It is distinct from Front C C2 or C4. Its two-body Moon-centered J2000 states are reused within the original half-open 28-day window starting 2025-01-01 UTC. The service never propagates them to a new epoch. State-file checksum mismatch returns unavailable.

Supported sites are the published CR1, GR1 and SR1 centers in MOON_ME_DE421. Sites sit on interpolated radial DEM heights above the 1737400 m reference sphere with zero added observer height. The adapter rotates relay positions explicitly from J2000 to DE421 ME. Earth directions use NONE. Surface visibility uses the copied terrain skyline, a zero-degree floor, 80 m local and 240 m extended DEMs and the original horizon configuration. The +20 km far-terrain envelope and distant-target restrictions remain active.

A relay path requires a visible site-relay leg and a visible relay-Earth leg at the same timestamp through the same relay. The relay-Earth test uses finite-segment spherical lunar occultation. Assisted availability is direct Earth OR at least one valid relay path.

The Go comparison verifies explicit frame and correction, DEM and kernel identities, observer positions within 1e-6 m and exact direct boolean parity on common 120 s timestamps. Mission-science's final endpoint is excluded from bin weights. Communication fractions and longest blackout are recomputed using half-open 120 s bins. Refined environmental intervals remain separate fields. The added provenance field changes neither the environmental metric definition nor frozen INT-4 schemas.

Geometric connectivity is reported with rfQualified false and rfAvailability null. RF link budgets, antenna pointing, station scheduling, occultation by subpixel terrain, continuous-time coverage, lunar harmonics and operational reliability remain outside this replay scenario.
