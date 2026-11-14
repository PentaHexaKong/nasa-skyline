"""Pick a hill-top site: the pixel of highest average Sun visibility inside a stated region.

    uv run python -m pipeline.pick malapert-massif
    uv run python -m pipeline.pick shackleton-ridge [--radius-km 7]

Maps are PGDA product 69 (average visibility over 18.6 years, south of 85S at 60 m). Ties on the Sun map go to the
highest Earth visibility, then to the pixel nearest the region centre.
"""

import argparse
import math
from dataclasses import dataclass

import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform

from . import fetch
from .terrain import MOON_RADIUS_M, load_polar

SUN_MAP = "AVGVISIB_85S_060M_201608.TIF"
EARTH_MAP = "AVGVISIB_85S_060M_201608_EARTH.TIF"
SLOPE_DEM_RADIUS_KM = 1.0


@dataclass(frozen=True)
class Region:
    centre_lat: float
    centre_lon_east: float
    radius_km: float
    centre_source: str
    radius_source: str


REGIONS = {
    "malapert-massif": Region(
        -86.0, 0.0, 7.5,
        "LROC featured image 1294 (lroc.im-ldi.com/images/1294): 'the relatively flat area (86 S, 0 E) ... is the heart of the Artemis 3 landing region'; checked 2026-11-14.",
        "NASA, Artemis III candidate regions: 'Each region is approximately 9.3 by 9.3 miles (15 by 15 kilometers)' (nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/); checked 2026-11-14. "
        "The disc of radius 7.5 km is a stand-in: the USGS region shapefiles (ScienceBase 671a6fa8d34efed5620f89f8) were not reachable (HTTP 403).",
    ),
    "shackleton-ridge": Region(
        -89.684, 196.739, 14.0,
        "LROC featured image 1247 (lroc.im-ldi.com/images/1247): the Shackleton - de Gerlache ridge meets the Shackleton rim at 89.684 S, 196.739 E; checked 2026-11-14.",
        "Same page: 'Ridgeline is about 14 kilometers long'. A disc of that radius around the Shackleton end holds the whole ridgeline.",
    ),
}


def disc_mask(lat: np.ndarray, lon: np.ndarray, centre_lat: float, centre_lon: float, radius_km: float) -> np.ndarray:
    """Pixels whose centre is within radius_km (great circle on the lunar sphere) of the centre."""
    p1, p2 = np.radians(lat), math.radians(centre_lat)
    dl = np.radians(lon - centre_lon)
    cos_d = np.sin(p1) * math.sin(p2) + np.cos(p1) * math.cos(p2) * np.cos(dl)
    dist_km = np.arccos(np.clip(cos_d, -1, 1)) * MOON_RADIUS_M / 1000
    return dist_km <= radius_km


def pick_max(sun: np.ndarray, earth: np.ndarray, region: np.ndarray, dist_km: np.ndarray | None = None) -> tuple[int, int]:
    """(row, col) of the highest Sun value inside the region; plateau ties go to the highest Earth value, then the nearest to the centre.
    NaN and pixels outside the region are ignored."""
    ok = region & ~np.isnan(sun)
    if not ok.any():
        raise ValueError("no valid pixel inside the region")
    best = np.nanmax(np.where(ok, sun, np.nan))
    tied = ok & (sun == best)
    e = np.where(tied & ~np.isnan(earth), earth, -np.inf)
    tied &= e == e.max()
    if dist_km is not None and tied.sum() > 1:
        d = np.where(tied, dist_km, np.inf)
        return np.unravel_index(int(np.argmin(d)), d.shape)
    r, c = np.nonzero(tied)
    return int(r[0]), int(c[0])


def horn_slope_deg(h: np.ndarray, r: int, c: int, cell_m: float) -> float:
    """Horn 3x3 slope at (r, c)."""
    w = h[r - 1 : r + 2, c - 1 : c + 2]
    dzdx = ((w[0, 2] + 2 * w[1, 2] + w[2, 2]) - (w[0, 0] + 2 * w[1, 0] + w[2, 0])) / (8 * cell_m)
    dzdy = ((w[2, 0] + 2 * w[2, 1] + w[2, 2]) - (w[0, 0] + 2 * w[0, 1] + w[0, 2])) / (8 * cell_m)
    return math.degrees(math.atan(math.hypot(dzdx, dzdy)))


def read_map(name: str):
    with rasterio.open(fetch.fetch({name: fetch.ILLUMINATION_MAPS[name]})[0]) as d:
        raw = d.read(1)
        arr = np.where(raw == d.nodata, np.nan, raw.astype(np.float64) * d.scales[0] + d.offsets[0])
        return arr, d.transform, d.crs


def run(site_id: str, radius_km: float | None = None) -> dict:
    reg = REGIONS[site_id]
    radius = radius_km or reg.radius_km
    sun, tf, crs = read_map(SUN_MAP)
    earth, tf_e, _ = read_map(EARTH_MAP)
    assert tf == tf_e and sun.shape == earth.shape
    rows, cols = np.indices(sun.shape)
    x, y = tf * (cols + 0.5, rows + 0.5)  # AREA_OR_POINT=Area: the transform is the pixel corner
    lon, lat = warp_transform(crs, crs.geodetic_crs, x.ravel().tolist(), y.ravel().tolist())
    lat, lon = np.reshape(lat, sun.shape), np.reshape(lon, sun.shape) % 360.0
    region = disc_mask(lat, lon, reg.centre_lat, reg.centre_lon_east, radius)
    p1, p2 = np.radians(lat), math.radians(reg.centre_lat)
    dist = np.arccos(np.clip(np.sin(p1) * math.sin(p2) + np.cos(p1) * math.cos(p2) * np.cos(np.radians(lon - reg.centre_lon_east)), -1, 1)) * MOON_RADIUS_M / 1000
    r, c = pick_max(sun, earth, region, dist)
    best = float(sun[r, c])
    out = {
        "id": site_id, "lat": float(lat[r, c]), "lon_east": float(lon[r, c]), "radius_km": radius,
        "sun_avg": best, "earth_avg": float(earth[r, c]),
        "sun_region_max": float(np.nanmax(np.where(region, sun, np.nan))), "sun_region_mean": float(np.nanmean(np.where(region, sun, np.nan))),
        "earth_region_max": float(np.nanmax(np.where(region, earth, np.nan))), "earth_region_mean": float(np.nanmean(np.where(region, earth, np.nan))),
        "pixels_in_region": int(region.sum()), "pixels_tied_at_max": int((region & (sun == best)).sum()),
        "distance_from_centre_km": float(dist[r, c]),
    }
    dem = load_polar(fetch.LOLA_20M_URL, out["lat"], out["lon_east"], SLOPE_DEM_RADIUS_KM)
    h = dem.heights_m
    ix, iy = dem.to_xy(np.array([out["lat"]]), np.array([out["lon_east"]]))
    rr, cc = int(round((dem.y0 - iy[0]) / dem.dy)), int(round((ix[0] - dem.x0) / dem.dx))
    out["ground_m"] = float(dem.sample(np.array([out["lat"]]), np.array([out["lon_east"]]))[0])
    out["slope_deg"] = horn_slope_deg(h, rr, cc, dem.dx)
    out["slope_method"] = f"Horn 3x3 on LDEM_80S_20MPP_ADJ ({dem.dx:g} m cells, {2 * dem.dx:g} m baseline)"
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("site", choices=sorted(REGIONS))
    ap.add_argument("--radius-km", type=float, default=None, help="override the region radius (sensitivity check)")
    a = ap.parse_args()
    reg = REGIONS[a.site]
    o = run(a.site, a.radius_km)
    print(f"region: centre {reg.centre_lat}, {reg.centre_lon_east} E, radius {o['radius_km']} km\n  centre: {reg.centre_source}\n  radius: {reg.radius_source}")
    print(f"pick:   lat {o['lat']:.5f}, lon {o['lon_east']:.5f} E ({o['distance_from_centre_km']:.2f} km from the centre)")
    print(f"sun:    {o['sun_avg']:.4f} at the point; region max {o['sun_region_max']:.4f}, mean {o['sun_region_mean']:.4f}; {o['pixels_tied_at_max']} pixel(s) tied at max of {o['pixels_in_region']}")
    print(f"earth:  {o['earth_avg']:.4f} at the point; region max {o['earth_region_max']:.4f}, mean {o['earth_region_mean']:.4f}")
    print(f"ground: {o['ground_m']:.1f} m above the 1737.4 km sphere; slope {o['slope_deg']:.1f} deg ({o['slope_method']})")


if __name__ == "__main__":
    main()
