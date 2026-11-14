# Scientific assumptions

All sites have planetocentric latitude and east-positive longitude in an explicitly declared MOON_ME_DE421 frame. DEM radial heights use the 1737400 m reference sphere. Observer positions include interpolated DEM elevation. Longitude accepts signed or unsigned east coordinates. Equivalent angles yield the same physical position.

Geometric and apparent profiles use SPICE spkcpo with a constant site position in MOON_ME_DE421 and output-frame orientation referenced to the observer epoch. NONE computes simultaneous geometric directions. LT+S computes reception light-time and stellar-aberration corrected directions at the surface observer. Numerical evidence in tests compares apparent directions to azlcpo under matched geometry. The profiles are not asserted equivalent.

The Sun uses the IAU nominal radius 695700 km. Visible fraction is the analytic uniform circular-segment area divided by disk area. The terrain skyline is locally straight at the Sun-center azimuth. Terrain variation across the disk, limb darkening and physical irradiance are outside this model. anyDisk uses center clearance plus angular radius, fullDisk uses center clearance minus angular radius and center uses center clearance. Earth availability uses the body center and conveys geometric visibility.

The terrain horizon scans local 80 m and extended 240 m ADJ DEMs, with 0.25-degree sectors, spherical curvature and neighboring-sector envelope. Its complete local and extended search regions must fit the data. Zero elevation is a floor. The +20 km global far-terrain envelope is an explicit assumption. Sampled horizons are not subpixel error bounds. The 20 m resolution option requires its actual asset and fails explicitly when absent.

The time window is half-open. Endpoint states bracket the last interval and receive no sample-bin weight. Refined intervals use detected sign-change roots and midpoint classification. Coarse sampling can miss multiple crossings and grazing contacts. possibleMissedEvents is always reported. Brent tolerance measures numerical refinement only. A discontinuous sector envelope can produce a visibility jump, which is localized to the tolerance rather than a physical zero.

horizonOffsetDeg is a scenario sensitivity parameter. Its range is an API bound and has no calibrated probability or terrain-error interpretation. No delay probabilities are assumed.
