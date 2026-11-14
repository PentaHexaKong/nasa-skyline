# Integrated scientific assumptions

Only nominal Candidate 2 is exposed. It is distinct from Front C C2 or C4. Its two-body Moon-centered J2000 states are reused within the original half-open 28-day window starting 2025-01-01 UTC. The verified-replay tier never propagates them to a new epoch. State-file checksum mismatch returns unavailable.

Supported sites are the published CR1, GR1 and SR1 centers in MOON_ME_DE421. Sites sit on interpolated radial DEM heights above the 1737400 m reference sphere with zero added observer height. The adapter rotates relay positions explicitly from J2000 to DE421 ME. Earth directions use NONE. Surface visibility uses the copied terrain skyline, a zero-degree floor, 80 m local and 240 m extended DEMs and the original horizon configuration. The +20 km far-terrain envelope and distant-target restrictions remain active.

A relay path requires a visible site-relay leg and a visible relay-Earth leg at the same timestamp through the same relay. The relay-Earth test uses finite-segment spherical lunar occultation. Assisted availability is direct Earth OR at least one valid relay path.

The Go comparison verifies explicit frame and correction, DEM and kernel identities, observer positions within 1e-6 m and exact direct boolean parity on common 120 s timestamps. Mission-science's final endpoint is excluded from bin weights. Communication fractions and longest blackout are recomputed using half-open 120 s bins. Refined environmental intervals remain separate fields. The added provenance field changes neither the environmental metric definition nor the INT-4 schemas.

Geometric connectivity is reported with rfQualified false and rfAvailability null. RF link budgets, antenna pointing, station scheduling, occultation by subpixel terrain, continuous-time coverage, lunar harmonics and operational reliability remain outside this replay scenario.

## Propagated tier

Any request outside the verified replay (a different start date, 1 or 3 or 4 satellites, or a cadence other than 120 s) uses the `propagated-two-body` tier. The two saved satellites share one two-body orbit. Fitting row 0 of each with `oscelt` at GM 4902.800066 km^3/s^2 and advancing with `conics` reproduces every saved row to sub-millimetre. The propagated tier uses exactly those elements, so it matches the replay inside January 2025. There is no Earth third-body force and no lunar gravity harmonics, so accuracy away from January 2025 is unvalidated. The window must lie inside the loaded SPICE kernel coverage (the DE440s SPK and DE421 lunar PCK, 1900 through 2050). Otherwise the response is `unavailable` with the coverage in the message.

Satellites nest. Satellites 1 and 2 are the verified pair. Each further satellite sits on the same orbit at the mean anomaly midway across the largest gap, going round the circle, between the mean anomalies already chosen. A tie goes to the gap that starts at the smallest mean anomaly. Count k is count k-1 plus one satellite. Cadence is a multiple of 120 s up to 960 s, and start and duration must be whole multiples of it from 2025-01-01T00:00:00Z. Every response carries `provenance.tier` and `provenance.satellites`.
