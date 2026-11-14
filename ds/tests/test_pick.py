import numpy as np

from pipeline.pick import disc_mask, horn_slope_deg, pick_max


def test_pick_takes_the_maximum_inside_the_region_and_ignores_a_higher_value_outside():
    sun = np.full((20, 20), 0.2)
    sun[5, 5] = 0.6
    sun[12, 12] = 0.9
    region = np.zeros((20, 20), bool)
    region[2:9, 2:9] = True
    assert pick_max(sun, np.zeros((20, 20)), region) == (5, 5)


def test_pick_breaks_a_sun_plateau_with_earth_then_distance():
    sun = np.zeros((6, 6))
    sun[1, 1] = sun[4, 4] = 0.8
    earth = np.zeros((6, 6))
    earth[4, 4] = 0.5
    region = np.ones((6, 6), bool)
    assert pick_max(sun, earth, region) == (4, 4)
    earth[1, 1] = 0.5
    dist = np.full((6, 6), 9.0)
    dist[1, 1] = 1.0
    assert pick_max(sun, earth, region, dist) == (1, 1)


def test_pick_skips_nan_and_refuses_an_empty_region():
    sun = np.array([[np.nan, 0.3], [0.1, 0.2]])
    assert pick_max(sun, np.zeros((2, 2)), np.ones((2, 2), bool)) == (0, 1)
    try:
        pick_max(sun, np.zeros((2, 2)), np.zeros((2, 2), bool))
    except ValueError:
        return
    raise AssertionError("empty region accepted")


def test_disc_mask_radius_on_the_lunar_sphere():
    lat = np.array([-86.0, -86.0 - 7.0 / 30.34, -86.0 - 8.0 / 30.34])  # 30.34 km per degree of latitude
    assert disc_mask(lat, np.zeros(3), -86.0, 0.0, 7.5).tolist() == [True, True, False]


def test_horn_slope_of_a_20_degree_ramp():
    h = np.tile(np.arange(5) * 20.0 * np.tan(np.radians(20)), (5, 1))
    assert abs(horn_slope_deg(h, 2, 2, 20.0) - 20.0) < 1e-6
