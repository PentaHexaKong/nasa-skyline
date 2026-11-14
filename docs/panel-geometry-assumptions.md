# Panel geometry assumptions

Implemented in `panelGeometry.py`. Every returned score is dimensionless and lies in [0,1].

## Directions and normals

Directions use local east/north/up coordinates. Azimuth A is clockwise from local north, with east at 90 degrees, and elevation e is above the local reference plane. The unit solar-center vector is (cos(e) sin(A), cos(e) cos(A), sin(e)). The scientific engine supplies A, e and terrain occlusion independently at every evaluated height.

| Orientation | Panel normal |
| --- | --- |
| Horizontal | (0,0,1), aligned with local radial up. |
| Vertical | (sin(P),cos(P),0), where P is the explicitly requested front-face azimuth. |
| Ideal Sun tracking | The solar-center unit direction at each timestamp. |

The incidence factor is max(0, n dot s). Horizontal and vertical panels are single-sided and have fixed normals in the local basis. The ideal tracking model has incidence 1 and unconstrained orientation. It assumes continuous perfect solar-center pointing, with mechanical travel, slew, pointing, structure, self-shadowing and power consumption omitted.

## Terrain and finite solar disk

Exposure at each sample equals the center incidence factor times the existing engine's visible solar-disk fraction. The latter uses a uniform circular disk against the locally straight horizon at the center azimuth. Panel incidence is evaluated at the solar center. A radiance/incidence integral over the visible part of the disk is outside this model.

A horizontal panel can therefore return zero when the solar center is below the local horizontal plane even while an upper part of the disk is visible. This underestimation near the limb is explicit and covered by a regression. Terrain variation across the disk, limb darkening, radiometric distance variation, atmospheric effects, reflected illumination and nearby structure geometry are omitted.

The mean geometric exposure score is the trapezoidal time integral of sample exposure divided by the elapsed SPICE ET duration. Sampling cadence and endpoint-context values come from the scientific evaluation. The score depends on sampling. Ideal-tracking mean exposure equals the returned sampled mean visible solar-disk fraction under this approximation. Horizontal and vertical exposure are bounded by the ideal-tracking score for identical visibility samples.

Solar availability remains governed by the selected any-disk, center or full-disk rule. Exposure uses the continuous disk fraction independently of that classification rule. A whole period with a partly visible disk can have 100% any-disk availability and a smaller exposure score.

## Interpretation and uncertainty

Scores describe geometric exposure opportunity. Electrical energy and power require panel area, conversion efficiency, spectral/thermal response, electrical operating point, wiring and degradation models. Those inputs are absent here, and the API emits no watt-valued output.

Mast positions are radial offsets above local interpolated ground. A horizontal panel follows the local reference plane, and a vertical panel normal follows the specified azimuth. Sloping-ground normals and mast bending are outside the current geometry.

Terrain uncertainty, metre-scale topography and physical event-time error are uncalibrated. Numerical refinement tolerances and the possible-missed-event indicators are retained from the scientific engine. Benchmark refinements provide measured numerical sensitivity for their stated cases.

The East-facing vertical panel in the CR1 example has zero geometric exposure during that particular window because its front face points away from the Sun. Its result is a computed zero. Missing or unsupported evaluations retain explicit noncomputed states.
