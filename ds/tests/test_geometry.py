import math

import numpy as np
import pytest

from pipeline.run import longest_true_run
from pipeline.terrain import MOON_RADIUS_M, Dem, horizon_at, skyline
from pipeline.visibility import visible_fraction


@pytest.mark.parametrize(
    "clearance, expected",
    [(0.0, 0.5), (0.25, 1.0), (-0.25, 0.0), (-0.125, 0.195501), (0.125, 0.804499), (5.0, 1.0)],
)
def test_visible_fraction_of_disk(clearance, expected):
    assert visible_fraction(np.array(clearance), np.array(0.25)) == pytest.approx(expected, abs=1e-6)


def test_horizon_interpolates_and_wraps_at_north():
    sky = np.array([0.0, 4.0, 8.0, 2.0])  # 90 deg spacing
    assert horizon_at(sky, np.array([45.0, 315.0, 360.0, -90.0])).tolist() == [2.0, 1.0, 0.0, 2.0]


# A synthetic site at mid latitude on the Moon's reference sphere, where a lat/lon grid is well behaved.
LAT, LON = -45.0, 30.0
DEG_M = MOON_RADIUS_M * math.pi / 180  # metres per degree of latitude


def flat_dem(height_fn, lat=LAT, lon=LON, half_deg=1.0, step=1 / 900):
    n = int(2 * half_deg / step) + 1
    lats = lat + half_deg - np.arange(n) * step
    lons = lon - half_deg + np.arange(n) * step
    la, lo = np.meshgrid(lats, lons, indexing="ij")
    return Dem(height_fn(la, lo), lat0=lats[0], lon0=lons[0], dlat=step, dlon=step)


def test_flat_terrain_gives_the_geometric_dip_of_the_horizon():
    dem = flat_dem(lambda la, lo: np.zeros_like(la))
    sky, ground = skyline(dem, LAT, LON, observer_height_m=2.0, az_step_deg=45, max_km=20)
    dip = -math.degrees(math.sqrt(2 * 2.0 / MOON_RADIUS_M))  # -0.0869 deg
    assert ground == 0.0
    assert sky == pytest.approx(np.full(8, dip), abs=0.002)


def test_ridge_due_north_sets_the_northern_skyline_only():
    north_of = LAT + 10_000 / DEG_M  # 10 km
    dem = flat_dem(lambda la, lo: np.where(la >= north_of, 1000.0, 0.0))
    sky, _ = skyline(dem, LAT, LON, observer_height_m=2.0, az_step_deg=90, max_km=20)
    expected = math.degrees(math.atan2(998.0 - 10_000**2 / (2 * MOON_RADIUS_M), 10_000.0))  # ~5.5 deg
    assert sky[0] == pytest.approx(expected, abs=0.05)
    assert sky[1:] == pytest.approx([sky[1]] * 3, abs=1e-9) and sky[1] < 0


def test_longest_run_of_days_without_direct_sun_counts_polar_night_too():
    direct_min = [5, 0, 0, 0, 3, 0, 0]
    assert longest_true_run([m == 0 for m in direct_min]) == (3, 1)
