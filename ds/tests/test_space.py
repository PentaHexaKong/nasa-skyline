import numpy as np
import pytest
import spiceypy as sp

from pipeline import fetch
from pipeline.space import C, ephemeris

START = "2026-11-14"


@pytest.fixture(scope="module")
def doc():
    if not all((fetch.DATA / n).exists() for n in fetch.MOON_KERNELS):
        pytest.skip("Moon kernels not fetched")
    return ephemeris(START, 3)


def rotate(q, v):
    x, y, z, w = q
    u = np.array([x, y, z])
    return v + 2 * np.cross(u, np.cross(u, v) + w * v)


def test_quaternions_are_sign_continuous(doc):
    for key in ("moon_q", "earth_q"):
        q = np.array(doc[key]).reshape(-1, 4)
        assert len(q) == doc["n"]
        assert (np.einsum("ij,ij->i", q[:-1], q[1:]) >= 0).all()


def test_earth_and_sun_distances_are_physical(doc):
    earth = np.linalg.norm(np.array(doc["earth_km"]).reshape(-1, 3), axis=1)
    sun = np.linalg.norm(np.array(doc["sun_km"]).reshape(-1, 3), axis=1)
    assert 356_000 <= earth.min() and earth.max() <= 407_000
    assert 1.45e8 <= sun.min() and sun.max() <= 1.53e8


def test_moon_pole_is_near_ecliptic_north(doc):
    # The lunar pole is tilted about 1.5 degrees from the ecliptic pole; scene +y is ecliptic north.
    for q in np.array(doc["moon_q"]).reshape(-1, 4):
        pole = rotate(q, np.array([0.0, 1.0, 0.0]))
        assert np.degrees(np.arccos(pole[1])) < 7


def test_the_two_hour_sample_grid_interpolates_earth_within_the_stated_error(doc):
    stated = doc["provenance"]["interp_max_error_km"]
    assert 1 < stated < 40
    step = doc["step_h"] * 3600.0
    et0 = sp.str2et(START)
    earth = np.array(doc["earth_km"]).reshape(-1, 3)
    for i in (0, 7, 20, 33):
        mid = C @ sp.spkpos("EARTH", et0 + (i + 0.5) * step, "ECLIPJ2000", "NONE", "MOON")[0]
        assert np.linalg.norm(mid - (earth[i] + earth[i + 1]) / 2) <= stated

