import numpy as np


def panelExposure(
    azimuthDeg, elevationDeg, visibleDiskFraction, elapsedS, verticalAzimuthDeg
):
    azimuth, elevation, fraction, times = np.broadcast_arrays(
        np.asarray(azimuthDeg, dtype=float),
        np.asarray(elevationDeg, dtype=float),
        np.asarray(visibleDiskFraction, dtype=float),
        np.asarray(elapsedS, dtype=float),
    )
    if (
        times.ndim != 1
        or len(times) < 2
        or not np.isfinite([azimuth, elevation, fraction, times]).all()
        or not np.isfinite(verticalAzimuthDeg)
    ):
        raise ValueError('Panel inputs must be aligned finite one-dimensional arrays')
    if (
        np.any(np.abs(elevation) > 90)
        or np.any((fraction < 0) | (fraction > 1))
        or times[0] != 0
        or np.any(np.diff(times) <= 0)
    ):
        raise ValueError('Invalid solar direction, disk fraction or time grid')
    azimuth, elevation = np.deg2rad(azimuth), np.deg2rad(elevation)
    direction = np.stack(
        [
            np.cos(elevation) * np.sin(azimuth),
            np.cos(elevation) * np.cos(azimuth),
            np.sin(elevation),
        ],
        axis=-1,
    )
    vertical = np.deg2rad(verticalAzimuthDeg % 360)
    normals = {
        'horizontal': np.array([0.0, 0.0, 1.0]),
        'vertical': np.array([np.sin(vertical), np.cos(vertical), 0.0]),
    }
    incidence = {
        name: np.clip(direction @ normal, 0, 1) for name, normal in normals.items()
    }
    incidence['tracking'] = np.ones_like(times)
    result = {}
    for name, factor in incidence.items():
        exposure = factor * fraction
        result[name] = dict(
            incidenceFactor=factor.tolist(),
            exposureFactor=exposure.tolist(),
            meanGeometricExposure=float(
                np.clip(np.trapezoid(exposure, times) / times[-1], 0, 1)
            ),
        )
    return result
