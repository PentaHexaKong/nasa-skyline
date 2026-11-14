import json
import math
import re
import subprocess

import numpy as np
import pytest
from rasterio.crs import CRS

from pipeline import fetch
from pipeline.sites import SITES
from pipeline.sun import ME_FRAME, Ephemeris, utc_to_et
from pipeline.terrain import MOON_RADIUS_M, Layer, PolarDem, heightmap, skyline
from tests.test_geometry import DEG_M, LAT, LON, flat_dem

WALL_DEG = 222 / DEG_M  # a 222 m thick wall, wide enough that no ray sample steps over it

SOUTH_POLAR = CRS.from_proj4("+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs")


def polar_grid(height_fn, half_km: float = 40.0, cell_m: float = 100.0, centre=(0.0, 0.0)) -> PolarDem:
    n = int(2 * half_km * 1000 / cell_m) + 1
    xs = centre[0] - half_km * 1000 + np.arange(n) * cell_m
    ys = centre[1] + half_km * 1000 - np.arange(n) * cell_m
    x, y = np.meshgrid(xs, ys)
    return PolarDem(height_fn(x, y).astype(np.float32), xs[0], ys[0], cell_m, cell_m, SOUTH_POLAR)


def moon_kernels():
    paths = [fetch.DATA / name for name in fetch.MOON_KERNELS]
    if not all(p.exists() for p in paths):
        pytest.skip("Moon kernels not fetched (run python -m pipeline.run im2-mons-mouton)")
    return paths


@pytest.mark.parametrize("lat, lon", [(-84.7906, 29.1957), (-85.0, 0.0), (-85.0, 200.0), (-85.5, 359.5), (-84.0, 120.0)])
def test_polar_dem_latlon_xy_round_trip_near_85s(lat, lon):
    dem = polar_grid(lambda x, y: np.zeros_like(x))
    x, y = dem.to_xy(np.array([lat]), np.array([lon]))
    lat2, lon2 = dem.to_latlon(x, y)
    assert lat2[0] == pytest.approx(lat, abs=1e-6)
    assert (lon2[0] - lon + 180) % 360 - 180 == pytest.approx(0, abs=1e-6)


def test_polar_dem_samples_the_ramp_it_was_given():
    # Height equals x / 100 m, so a point 5 km along the +x axis from the pole reads 50 m.
    dem = polar_grid(lambda x, y: x / 100.0)
    lat, lon = dem.to_latlon(np.array([5000.0]), np.array([0.0]))
    assert dem.sample(lat, lon)[0] == pytest.approx(50.0, abs=0.01)
    assert np.isnan(dem.sample(np.array([-80.0]), np.array([0.0]))[0])


def test_skyline_uses_the_fine_dem_inside_its_range_and_the_coarse_dem_beyond_it():
    near_wall = LAT + 3_000 / DEG_M  # 3 km north, only in the fine DEM
    far_wall = LAT + 15_000 / DEG_M  # 15 km north, only in the coarse DEM, past the fine range
    fine = flat_dem(lambda la, lo: np.where((la >= near_wall) & (la < near_wall + WALL_DEG), 600.0, 0.0))
    coarse = flat_dem(lambda la, lo: np.where((la >= far_wall) & (la < far_wall + WALL_DEG), 5000.0, 0.0))
    layers = [Layer(fine, 10_000.0), Layer(coarse)]
    sky, _, dist = skyline(layers, LAT, LON, 2.0, az_step_deg=90, max_km=30, with_distance=True)
    assert dist[0] == pytest.approx(15_000, abs=500)
    # The curvature drop d^2/2R is about 65 m at 15 km on the Moon.
    assert sky[0] == pytest.approx(math.degrees(math.atan2(4998 - dist[0] ** 2 / (2 * MOON_RADIUS_M), dist[0])), abs=0.3)
    near_only, _, near_dist = skyline(layers, LAT, LON, 2.0, az_step_deg=90, max_km=8, with_distance=True)
    assert near_dist[0] == pytest.approx(3_000, abs=300)
    assert near_only[0] == pytest.approx(math.degrees(math.atan2(598, 3_000)), abs=0.3)


def test_coarse_wall_inside_the_fine_range_is_ignored():
    wall = LAT + 3_000 / DEG_M
    fine = flat_dem(lambda la, lo: np.zeros_like(la))
    coarse = flat_dem(lambda la, lo: np.where((la >= wall) & (la < wall + WALL_DEG), 900.0, 0.0))
    sky, _ = skyline([Layer(fine, 10_000.0), Layer(coarse)], LAT, LON, 2.0, az_step_deg=90, max_km=8)
    assert sky[0] < 0.1


def test_layers_fall_through_to_the_next_dem_where_the_finer_one_has_no_data():
    wall = LAT + 3_000 / DEG_M
    hole = flat_dem(lambda la, lo: np.full_like(la, np.nan))
    coarse = flat_dem(lambda la, lo: np.where((la >= wall) & (la < wall + WALL_DEG), 900.0, 0.0))
    sky, _ = skyline([Layer(hole, 10_000.0), Layer(coarse)], LAT, LON, 2.0, az_step_deg=90, max_km=8)
    assert sky[0] == pytest.approx(math.degrees(math.atan2(898, 3_000)), abs=0.4)


def test_moon_curvature_drop_is_29_m_at_10_km():
    dem = polar_grid(lambda x, y: np.zeros_like(x), half_km=15.0, cell_m=50.0, centre=(0.0, -300_000.0))
    lat, lon = dem.to_latlon(np.array([0.0]), np.array([-300_000.0]))
    h = heightmap(dem, float(lat[0]), float(lon[0]), radius_km=10, n=11, radius_m=MOON_RADIUS_M, curvature=True)
    assert h[5, 5] == pytest.approx(0.0, abs=0.01)
    for r, c in [(5, 10), (5, 0), (0, 5), (10, 5)]:
        assert h[r, c] == pytest.approx(-28.8, abs=1.0)


def test_skyline_on_a_flat_moon_dips_by_the_lunar_horizon_angle():
    dem = polar_grid(lambda x, y: np.zeros_like(x), half_km=40.0, cell_m=100.0, centre=(0.0, -300_000.0))
    lat, lon = dem.to_latlon(np.array([0.0]), np.array([-300_000.0]))
    sky, ground = skyline([Layer(dem, 30_000.0)], float(lat[0]), float(lon[0]), 2.0, az_step_deg=90, max_km=30, radius_m=MOON_RADIUS_M)
    assert ground == pytest.approx(0.0, abs=0.01)
    assert sky == pytest.approx(np.full(4, -math.degrees(math.sqrt(2 * 2.0 / MOON_RADIUS_M))), abs=0.01)


def test_sun_at_the_im2_point_follows_the_subsolar_point_and_stays_low():
    # The spec expected |elevation| < 1.54 + 0.3 deg, which holds at the pole itself. IM-2 is 5.21 deg from the
    # pole, so the Sun there swings by up to the colatitude plus the axial tilt. Check that bound and the
    # elevation implied by SPICE's sub-solar point instead.
    kernels = moon_kernels()
    site = SITES["im2-mons-mouton"]
    eph = Ephemeris(kernels)
    et = utc_to_et("2026-11-14T00:00:00") + 3600.0 * np.arange(24 * 30)
    _, el, rad = eph.target("SUN", et, site, height_m=0.0)
    colatitude = 90 - abs(site.lat_deg)
    assert np.abs(el).max() < colatitude + 1.54 + 0.3
    assert el.max() > 0.5 and el.min() < -0.5
    sub_lat, sub_lon = eph.subpoint("SUN", et)
    phi, delta = math.radians(site.lat_deg), np.radians(sub_lat)
    dlon = np.radians(sub_lon - site.lon_deg_east)
    expected = np.degrees(np.arcsin(math.sin(phi) * np.sin(delta) + math.cos(phi) * np.cos(delta) * np.cos(dlon)))
    assert el == pytest.approx(expected, abs=0.05)
    assert rad.mean() == pytest.approx(0.266, abs=0.01)  # the Sun's disc is 0.27 deg in radius from 1 au


def test_the_earth_is_always_up_at_apollo_11():
    kernels = moon_kernels()
    site = SITES["apollo11"]
    eph = Ephemeris(kernels)
    et = utc_to_et("2026-11-14T00:00:00") + 30 * 3600.0 * np.arange(24)  # 24 samples over 30 days
    _, el, rad = eph.target("EARTH", et, site)
    assert (el > 0).all()
    assert el.min() > 40.0  # Earth stays near the sub-Earth point at the Moon's near-side equator
    assert rad.mean() == pytest.approx(0.95, abs=0.05)


def test_the_me_frame_is_the_one_the_frame_kernel_defines():
    text = (fetch.DATA / "moon_de440_250416.tf")
    if not text.exists():
        pytest.skip("frame kernel not fetched")
    assert re.search(rf"FRAME_{ME_FRAME}\s*=", text.read_text())


def horizons(command: str, lon_e: float, lat: float, times: list[str]) -> list[tuple[float, float]]:
    """Apparent azimuth and elevation of a body from a Moon surface point, JPL Horizons observer table."""
    q = {
        "format": "json", "COMMAND": f"'{command}'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_e},{lat},0'", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "QUANTITIES": "'4'",
        "TLIST": " ".join(f"'{t}'" for t in times), "TLIST_TYPE": "CAL", "ANG_FORMAT": "DEG",
    }
    args = [a for k, v in q.items() for a in ("--data-urlencode", f"{k}={v}")]
    out = subprocess.run(["curl", "-sSfG", "--retry", "3", "https://ssd.jpl.nasa.gov/api/horizons.api", *args], check=True, capture_output=True, text=True).stdout
    text = json.loads(out)["result"]
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = [ln.split() for ln in body.strip().splitlines()]
    return [(float(r[-2]), float(r[-1])) for r in rows]


@pytest.mark.net
def test_sun_and_earth_match_jpl_horizons_at_the_im2_point():
    kernels = moon_kernels()
    site = SITES["im2-mons-mouton"]
    eph = Ephemeris(kernels)
    # Horizons' TLIST takes TDB/UT calendar strings; JD in UTC is unambiguous.
    stamps = ["2026-11-14 00:00", "2026-11-24 12:00", "2027-02-11 06:30"]
    et = np.array([utc_to_et(s.replace(" ", "T") + ":00") for s in stamps])
    for command, name in [("10", "SUN"), ("399", "EARTH")]:
        az, el, _ = eph.target(name, et, site, height_m=0.0)
        for (haz, hel), a, e in zip(horizons(command, site.lon_deg_east, site.lat_deg, stamps), az, el):
            assert e == pytest.approx(hel, abs=0.01), (name, stamps)
            assert (a - haz + 180) % 360 - 180 == pytest.approx(0, abs=0.01), (name, stamps)


def test_longest_gap_between_visible_spells():
    from pipeline.run import longest_gap

    assert longest_gap([(10.0, 20.0), (50.0, 60.0)], 0.0, 100.0) == (60.0, 100.0, 40.0)
    assert longest_gap([(0.0, 100.0)], 0.0, 100.0) == (0.0, 0.0, 0.0)
    assert longest_gap([], 0.0, 100.0) == (0.0, 100.0, 100.0)


# --- Earth rules, truncated gaps, Moon day counts, window sizing, cache key, ephemeris reuse ---

import datetime as dt

import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform as warp_transform

from pipeline import moon, run as pipeline_run, terrain
from pipeline.moon import MoonTerrain

START, DAYS = "2026-11-14", 30
WINDOW_S = DAYS * 86400


def seconds(iso: str) -> float:
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def total_s(intervals) -> float:
    return sum(seconds(b) - seconds(a) for a, b in intervals)


def synthetic_terrain(layers, grid_m: float) -> MoonTerrain:
    prov = [{"role": f"layer {i}", "range_km": l.range_m / 1000, "file": f"synthetic{i}.tif", "pixel_size_m": grid_m} for i, l in enumerate(layers)]
    return MoonTerrain(layers, layers, layers, prov, "synthetic test terrain")


def polar_layer_at(site, height_fn, half_km=250.0, cell_m=1000.0):
    x, y = warp_transform(SOUTH_POLAR.geodetic_crs, SOUTH_POLAR, [site.lon_deg_east], [site.lat_deg])
    return Layer(polar_grid(lambda gx, gy: height_fn(gx - x[0], gy - y[0]), half_km, cell_m, (x[0], y[0])), 200_000.0)


def moon_run(monkeypatch, site_id, layers, grid_m):
    moon_kernels()
    monkeypatch.setattr(moon, "terrain_for", lambda site: synthetic_terrain(layers, grid_m))
    return pipeline_run.run(SITES[site_id], START, DAYS, step_min=10, az_step_deg=2.0)


@pytest.fixture(scope="module")
def synthetic_runs():
    mp = pytest.MonkeyPatch()
    try:
        im2, apollo = SITES["im2-mons-mouton"], SITES["apollo11"]
        flat_polar = [polar_layer_at(im2, lambda x, y: np.zeros_like(x))]
        walled = [polar_layer_at(im2, lambda x, y: np.where(np.hypot(x, y) > 5000, 3000.0, 0.0))]
        flat_eq = [Layer(flat_dem(lambda la, lo: np.zeros_like(la), apollo.lat_deg, apollo.lon_deg_east, half_deg=8.0, step=0.02), 200_000.0)]
        yield {
            "im2_flat": moon_run(mp, "im2-mons-mouton", flat_polar, 1000.0),
            "im2_walled": moon_run(mp, "im2-mons-mouton", walled, 1000.0),
            "apollo_flat": moon_run(mp, "apollo11", flat_eq, 2200.0),
        }
    finally:
        mp.undo()


def test_earth_centre_rule_is_the_headline_and_any_part_is_reported_alongside(synthetic_runs):
    r = synthetic_runs["im2_flat"]
    e, s = r["earth"], r["summary"]
    assert e["visible_share"] == e["center_share"] == s["earth_visible_share"]
    assert e["any_share"] == s["earth_any_share"]
    assert e["margin_deg"] == 0.0
    assert "centre" in e["rule"]
    assert 0 < e["visible_share"] < e["any_share"] < 1  # the limb clears the skyline before the centre does
    assert total_s(r["earth_intervals"]) / WINDOW_S == pytest.approx(e["visible_share"], abs=1e-4)
    assert total_s(r["earth_intervals_any"]) / WINDOW_S == pytest.approx(e["any_share"], abs=1e-4)
    for a, b in r["earth_intervals"]:
        assert any(seconds(a) >= seconds(c) and seconds(b) <= seconds(d) for c, d in r["earth_intervals_any"])


def test_earth_minutes_per_day_follow_each_rule(synthetic_runs):
    r = synthetic_runs["im2_flat"]
    assert all(d["earth_any_min"] >= d["earth_min"] for d in r["days"])
    assert sum(d["earth_min"] for d in r["days"]) / (1440 * DAYS) == pytest.approx(r["earth"]["visible_share"], abs=1e-3)
    assert sum(d["earth_any_min"] for d in r["days"]) / (1440 * DAYS) == pytest.approx(r["earth"]["any_share"], abs=1e-3)
    assert set(r["days"][0]["earth_track"]) == {"t_min", "az_deg", "el_deg", "fraction"}


def test_no_earth_gaps_are_reported_for_both_rules_and_flagged_when_cut_by_the_window(synthetic_runs):
    s = synthetic_runs["im2_flat"]["summary"]
    start_iso, end_iso = f"{START}T00:00:00Z", "2026-12-14T00:00:00Z"
    for key in ("longest_no_earth", "longest_no_earth_any"):
        assert s[f"{key}_hours"] > 0
        touches = s[f"{key}_first"] == start_iso or s[f"{key}_last"] == end_iso
        assert s[f"{key}_truncated"] is touches
    assert s["longest_no_earth_hours"] >= s["longest_no_earth_any_hours"]

    walled = synthetic_runs["im2_walled"]
    assert walled["earth"]["visible_share"] == walled["earth"]["any_share"] == 0.0
    assert walled["earth_intervals"] == [] and walled["earth_intervals_any"] == []
    for key in ("longest_no_earth", "longest_no_earth_any"):
        assert walled["summary"][f"{key}_hours"] == DAYS * 24.0
        assert (walled["summary"][f"{key}_first"], walled["summary"][f"{key}_last"]) == (start_iso, end_iso)
        assert walled["summary"][f"{key}_truncated"] is True
    assert walled["summary"]["longest_no_direct_stretch_days"] == DAYS
    assert walled["summary"]["longest_no_direct_truncated"] is True


def test_an_earth_that_never_sets_has_no_gap_to_flag(synthetic_runs):
    r = synthetic_runs["apollo_flat"]
    assert r["earth"]["visible_share"] == r["earth"]["any_share"] == 1.0
    assert r["earth_intervals"] == r["earth_intervals_any"] == [[f"{START}T00:00:00Z", "2026-12-14T00:00:00Z"]]
    assert r["summary"]["longest_no_earth_hours"] == 0.0
    assert r["summary"]["longest_no_earth_first"] is None
    assert r["summary"]["longest_no_earth_truncated"] is False
    assert r["summary"]["longest_no_earth_any_truncated"] is False


def test_moon_sites_count_night_and_all_day_sun_days_not_polar_night(synthetic_runs):
    r = synthetic_runs["apollo_flat"]
    s = r["summary"]
    assert "polar_night_days" not in s and "midnight_sun_days" not in s
    assert s["night_days"] == sum(d["daylight_min"] == 0 for d in r["days"])
    assert s["all_day_sun_days"] == sum(d["daylight_min"] >= 1439.9 for d in r["days"])
    assert s["night_days"] > 5 and s["all_day_sun_days"] > 5  # a lunar day is half a month of sun, half of night
    assert s["night_days"] + s["all_day_sun_days"] <= DAYS


def test_stretch_and_gap_flags_are_set_only_when_the_run_touches_the_window_edge():
    from pipeline.run import gap_fields, stretch_fields

    dates = [f"d{i}" for i in range(6)]
    assert stretch_fields("longest_dark", [True, True, False, True, False, False], dates)["longest_dark_truncated"] is True
    assert stretch_fields("longest_dark", [False, True, True, False, True, False], dates)["longest_dark_truncated"] is False
    tail = stretch_fields("longest_dark", [False, True, False, True, True, True], dates)
    assert (tail["longest_dark_stretch_days"], tail["longest_dark_first_day"], tail["longest_dark_last_day"], tail["longest_dark_truncated"]) == (3, "d3", "d5", True)
    none = stretch_fields("longest_dark", [False] * 6, dates)
    assert (none["longest_dark_stretch_days"], none["longest_dark_first_day"], none["longest_dark_truncated"]) == (0, None, False)

    Ephemeris(moon_kernels())
    t0 = utc_to_et("2026-11-14T00:00:00")
    day = 86400.0
    cut = gap_fields("gap", [(t0 + 10 * day, t0 + 12 * day)], t0, t0 + 20 * day)
    assert (cut["gap_hours"], cut["gap_first"], cut["gap_last"], cut["gap_truncated"]) == (240.0, "2026-11-14T00:00:00Z", "2026-11-24T00:00:00Z", True)
    inside = gap_fields("gap", [(t0, t0 + 3 * day), (t0 + 10 * day, t0 + 19 * day)], t0, t0 + 20 * day)
    assert (inside["gap_hours"], inside["gap_first"], inside["gap_last"], inside["gap_truncated"]) == (168.0, "2026-11-17T00:00:00Z", "2026-11-24T00:00:00Z", False)


def test_known_limits_name_the_dem_each_layer_supplied_at_the_site():
    site = SITES["im2-mons-mouton"]
    fine = polar_layer_at(site, lambda x, y: np.zeros_like(x), half_km=5.0, cell_m=50.0)
    coarse = polar_layer_at(site, lambda x, y: np.zeros_like(x))
    fine = Layer(fine.dem, 10_000.0)
    terrain_ = synthetic_terrain([fine, coarse], 50.0)
    terrain_.provenance[1]["pixel_size_m"] = 1000.0
    shares = terrain.coverage([fine, coarse], site.lat_deg, site.lon_deg_east, 5.0, 20.0, MOON_RADIUS_M)
    near = {c["layer"]: c["share"] for c in shares if c["to_km"] == 10.0}
    assert 0.5 < near[0] < 0.72 and near[0] + near[1] == pytest.approx(1.0, abs=1e-6)  # a 5 km half-width box holds 5 to 7 km of a 10 km ray
    assert [c for c in shares if c["to_km"] == 200.0 or c["from_km"] >= 10.0 and c["layer"] != 1] == []
    note = moon.resolution_note(terrain_, site, 5.0, 20.0)
    assert "synthetic0 (50 m)" in note and "synthetic1 (1000 m)" in note
    assert "0-10 km: synthetic0 (50 m) " in note and "10-20 km: synthetic1 (1000 m) 100%" in note
    assert "fills the rest of the band" in note
    single = moon.resolution_note(synthetic_terrain([coarse], 1000.0), site, 5.0, 20.0)
    assert "synthetic0 (1000 m) 100%" in single and "fills the rest" not in single


def global_map(tmp_path, cell_m=5000.0):
    crs = CRS.from_proj4(f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R={MOON_RADIUS_M} +units=m +no_defs")
    cols, rows = round(2 * math.pi * MOON_RADIUS_M / cell_m), round(math.pi * MOON_RADIUS_M / 2 / cell_m) * 2
    path = tmp_path / "global.tif"
    tf = from_origin(-math.pi * MOON_RADIUS_M, rows / 2 * cell_m, cell_m, cell_m)
    with rasterio.open(path, "w", driver="GTiff", height=rows, width=cols, count=1, dtype="float32", crs=crs, transform=tf) as d:
        d.write(np.zeros((rows, cols), dtype="float32"), 1)
    return str(path)


@pytest.mark.parametrize("lat", [0.67, 45.0, 58.0])
def test_global_map_window_widens_east_west_by_one_over_cos_lat(tmp_path, lat):
    dem = terrain.load_polar(global_map(tmp_path), lat, 23.47, 200.0)
    rows, cols = dem.heights_m.shape
    assert cols / rows == pytest.approx(1 / math.cos(math.radians(lat)), rel=0.06)
    # every ray sample 200 km out, due east and west, lands inside the window
    east_lat, east_lon = terrain._destination(lat, 23.47, np.radians([90.0, 270.0]), np.array([199_000.0 / MOON_RADIUS_M]))
    assert not np.isnan(dem.sample(east_lat, east_lon)).any()


def test_global_map_window_refuses_a_box_across_the_seam(tmp_path):
    with pytest.raises(ValueError, match="seam"):
        terrain.load_polar(global_map(tmp_path), 50.0, 179.0, 200.0)


def test_window_cache_key_changes_with_the_etag():
    a = terrain.window_cache_path("https://x/y/LDEM.TIF", '"abc"', 1, 2, 3, 4)
    b = terrain.window_cache_path("https://x/y/LDEM.TIF", '"abd"', 1, 2, 3, 4)
    assert a != b and a.name.startswith("LDEM_") and a.name.endswith("_1_2_3x4.npy")
    assert terrain.window_cache_path("https://x/y/LDEM.TIF", None, 1, 2, 3, 4) is None


def test_shared_ephemeris_is_rewritten_unless_start_days_version_and_kernels_all_match(tmp_path):
    moon_kernels()
    out = tmp_path / "moon" / "ephemeris.json"
    assert pipeline_run.write_moon_ephemeris(START, 1, out) is True
    assert pipeline_run.write_moon_ephemeris(START, 1, out) is False
    assert pipeline_run.write_moon_ephemeris(START, 2, out) is True
    assert pipeline_run.write_moon_ephemeris("2026-11-15", 2, out) is True
    stored = json.loads(out.read_text())
    for edit in (lambda p: p.update(algorithm_version="0.0.1"), lambda p: p["kernels"][0].update(sha256="0" * 64)):
        edit(stored["provenance"])
        out.write_text(json.dumps(stored))
        assert pipeline_run.write_moon_ephemeris("2026-11-15", 2, out) is True
        stored = json.loads(out.read_text())
        assert pipeline_run.write_moon_ephemeris("2026-11-15", 2, out) is False
