import numpy as np
import pytest

from pipeline.terrain import heightmap, skyline
from tests.test_geometry import DEG_M, LAT, LON, flat_dem


def test_heightmap_is_centred_and_oriented_north_up_east_right():
    # Height rises to the north-east, so the top-right cell is the highest.
    dem = flat_dem(lambda la, lo: (la - LAT) * 1e4 + (lo - LON) * 1e4 + 500)
    h = heightmap(dem, LAT, LON, radius_km=5, n=11)
    assert h.shape == (11, 11)
    assert h[5, 5] == pytest.approx(500, abs=0.5)
    assert h[0, -1] == h.max() and h[-1, 0] == h.min()


def test_skyline_reports_distance_to_the_blocking_ridge():
    # A 1 km wall 3 km south of the site.
    dem = flat_dem(lambda la, lo: np.where(np.abs(la - (LAT - 3000 / DEG_M)) < 0.004, 1000.0, 0.0))
    _, _, dist = skyline(dem, LAT, LON, 2.0, az_step_deg=90, max_km=10, with_distance=True)
    south = dist[2]
    assert 2700 < south < 3300
