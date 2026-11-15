"""Topocentric Sun and Earth directions from a site on the Moon, from SPICE."""

import math
from pathlib import Path

import numpy as np
import spiceypy as sp

SUN_RADIUS_KM = 695_700.0  # IAU 2015 nominal solar radius
EARTH_MEAN_RADIUS_KM = 6371.0
MOON_RADIUS_KM = 1737.4
ME_FRAME = 'MOON_ME_DE421'  # Published ROI coordinates and the polar DEM use this explicit realization.
BODY_RADIUS_KM = {"SUN": SUN_RADIUS_KM, "EARTH": EARTH_MEAN_RADIUS_KM}


class Ephemeris:
    def __init__(self, kernel_paths: list[Path]):
        sp.kclear()
        for k in kernel_paths:
            sp.furnsh(str(k))

    def target(self, name: str, et: np.ndarray, site, height_m: float | None = None):
        """Azimuth (deg, clockwise from north), true elevation (deg) and angular radius (deg) of SUN or EARTH.

        height_m is the observer's height above the reference surface (default: the site's observer height).
        The site sits on a 1737.4 km sphere in the ME frame; light time plus stellar aberration, no atmosphere.
        """
        h = site.observer_height_m if height_m is None else height_m
        obs = sp.latrec(MOON_RADIUS_KM + h / 1000, math.radians(site.lon_deg_east), math.radians(site.lat_deg))
        et = np.atleast_1d(et)
        az, el, rad = np.empty(et.size), np.empty(et.size), np.empty(et.size)
        for i, t in enumerate(et):
            state, _ = sp.azlcpo("ELLIPSOID", name, float(t), "LT+S", False, True, obs, "MOON", ME_FRAME)
            az[i], el[i] = state[1], state[2]
            rad[i] = math.asin(BODY_RADIUS_KM[name] / state[0])
        return np.degrees(az), np.degrees(el), np.degrees(rad)

    def subpoint(self, name: str, et: np.ndarray):
        """Sub-solar or sub-Earth latitude and longitude (deg, east) on the Moon in the ME frame (LT+S)."""
        et = np.atleast_1d(et)
        lat, lon = np.empty(et.size), np.empty(et.size)
        for i, t in enumerate(et):
            spoint, _, _ = sp.subpnt("INTERCEPT/ELLIPSOID", "MOON", float(t), ME_FRAME, "LT+S", name)
            _, lon[i], lat[i] = sp.reclat(spoint)
        return np.degrees(lat), np.degrees(lon) % 360.0


def utc_to_et(iso: str) -> float:
    return sp.str2et(iso)

