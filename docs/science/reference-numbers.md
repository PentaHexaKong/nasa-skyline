# Reference numbers (sanity checks)

Checked by direct calculation (R_moon = 1737.4 km, mean Earth–Moon distance 384,400 km). Use these for explainer copy and for unit tests' rough bounds. **They are not results.**

| Quantity | Value | Check |
| --- | --- | --- |
| Moon axis tilt to the ecliptic | ~1.54° | Standard value; the Sun stays within ~±1.5° of level at the pole |
| Synodic month (Sun lap at the pole) | 29.53 d | Standard |
| Draconic month (latitude libration period) | 27.21 d | Standard |
| Anomalistic month (longitude libration period) | 27.55 d | Standard |
| Eclipse year (subsolar-latitude cycle) | ~346.6 d | Standard; drives lunar "seasons" |
| Libration in latitude / longitude | ~±6.7° / ~±7.9° | Max values; Earth bobs ±6.7° in elevation at the pole |
| Sun angular diameter | 0.533° | 2·atan(696,000 / 149.6e6) |
| Earth angular diameter from the Moon | 1.90° (1.80–2.01°) | 2·atan(6371 / d), d = 405,500 … 363,300 km |
| Earth parallax from the lunar surface | 0.26° | asin(1737.4 / 384,400). This is why vectors must be topocentric |
| Curvature drop at 100 km | 2.88 km | d² / 2R |
| Sight line to a 5 km peak at 100 km | +1.22° | atan((5 − 2.878) / 100) |
| Geometric horizon distance, h = 2 m, smooth sphere | 2.6 km | √(2Rh) |
| Geometric horizon distance, h = 10 m | 5.9 km | √(2Rh) |
| 1° of latitude on the Moon | 30.3 km | 2πR / 360 |
| One-way light time to Earth | 1.28 s | 384,400 / c |
| Range of far-field terrain that can matter | ~150–200 km | Distance where d²/2R ≈ max relief (5–8 km): √(2R·8 km) ≈ 167 km |
