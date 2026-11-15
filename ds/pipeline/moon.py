"""Lunar terrain: which LOLA DEM covers which range around a site, and where each came from."""

import math
from dataclasses import dataclass
from pathlib import Path

from . import fetch
from .sites import Site
from .terrain import MOON_RADIUS_M, Layer, PolarDem, coverage, load_polar

SOUTH_POLAR_EDGE_KM = 304.0  # the 80S grids are 608 km wide, centred on the pole
NEAR_KM = 15.0
MID_KM = 100.0
FAR_KM = 200.0

LOLA_20M = fetch.LOLA_20M_URL
LOLA_75S_30M = f"{fetch.PGDA}/LDEM_75S_30MPP_ADJ.TIF"
LOLA_60S_60M = f"{fetch.PGDA}/LDEM_60S_60MPP_ADJ.TIF"
POLAR_FINE_EDGE_DEG = 75.0  # the finest polar grids (20 m to 80 S, 30 m to 75 S) end here
GLOBAL_118M = "https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif"
# planetarymaps.usgs.gov answers every range request with a redirect (about 2 s each); the redirect target serves the same bytes directly.
GLOBAL_118M_READ = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif"


@dataclass(frozen=True)
class MoonTerrain:
    layers: list[Layer]  # finest first, for the skyline
    inner: list[Layer]  # the layers the island's 10 km tier reads
    outer: list[Layer]  # the layer the island's 60 km tier reads
    provenance: list[dict]
    product: str


def is_global(site: Site) -> bool:
    """Sites outside the polar caps read the global equirectangular map, not the polar stereographic grids."""
    return abs(site.lat_deg) < 60


def _pole_distance_km(site: Site) -> float:
    return 2 * 1737.4 * math.tan(math.radians(90 - abs(site.lat_deg)) / 2)


def _entry(dem: PolarDem, role: str, range_km: float, **extra) -> dict:
    return {"role": role, "range_km": range_km, **dem.source, **extra}


def _windowed(url: str, site: Site, box_km: float, role: str, range_km: float, read_url: str | None = None):
    info = {**fetch.head(read_url or url), "url": url, "mode": "windowed HTTP range requests (GDAL /vsicurl); no full download"}
    if read_url:
        info["read_from"] = read_url
    dem = load_polar(read_url or url, site.lat_deg, site.lon_deg_east, box_km, source_info=info)
    return Layer(dem, range_km * 1000), _entry(dem, role, range_km)


def _local(name: str, site: Site, box_km: float, role: str, range_km: float):
    path = fetch.fetch({name: fetch.LOLA_DEMS[name]})[0]
    info = {"file": name, "sha256": fetch.checksum_of(name), "url": fetch.LOLA_DEMS[name], "mode": "downloaded"}
    dem = load_polar(str(path), site.lat_deg, site.lon_deg_east, box_km, source_info=info)
    return Layer(dem, range_km * 1000), _entry(dem, role, range_km)


def terrain_for(site: Site) -> MoonTerrain:
    """Polar sites: 20 m to 15 km, 80 m to 100 km, 240 m to 200 km. 60 to 75 S: 60 m to 100 km, 240 m to 200 km.
    Equatorial: the global 118 m map to 200 km."""
    if is_global(site):
        near, p = _windowed(GLOBAL_118M, site, FAR_KM + 1, "global map, all ranges", FAR_KM, GLOBAL_118M_READ)
        return MoonTerrain([near], [near], [near], [p], "LOLA global DEM 118 m (USGS Astrogeology, Mar 2014)")
    if abs(site.lat_deg) < POLAR_FINE_EDGE_DEG:
        # Chandrayaan-3 and Luna-25 near 69 S: past the 20 m and 30 m grids, inside the 60 m grid to 60 S.
        near, p_near = _windowed(LOLA_60S_60M, site, MID_KM + 1, "near and mid field", MID_KM)
        far, p_far = _local("LDEM_60S_240MPP_ADJ.TIF", site, FAR_KM + 1, "far field", FAR_KM)
        return MoonTerrain(
            [near, far], [near], [far], [p_near, p_far],
            "LOLA PGDA product 90 (Barker et al. 2023), south polar stereographic 60 m and 240 m, heights above the 1737.4 km sphere, ME frame",
        )
    layer, p = _windowed(LOLA_20M, site, NEAR_KM + 1, "near field", NEAR_KM)
    layers, prov, inner_count = [layer], [p], 1
    if _pole_distance_km(site) + NEAR_KM > SOUTH_POLAR_EDGE_KM:
        # The 20 m grid ends at 80 S; fill the near field beyond it from the 30 m grid to 75 S.
        layer, p = _windowed(LOLA_75S_30M, site, NEAR_KM + 1, "near field beyond the 80S grid edge", NEAR_KM)
        layers.append(layer)
        prov.append(p)
        inner_count = 2
    for name, box, role, rng in [("LDEM_80S_80MPP_ADJ.TIF", MID_KM + 1, "mid field", MID_KM), ("LDEM_60S_240MPP_ADJ.TIF", FAR_KM + 1, "far field", FAR_KM)]:
        layer, p = _local(name, site, box, role, rng)
        layers.append(layer)
        prov.append(p)
    return MoonTerrain(
        layers, layers[:inner_count], layers[-1:], prov,
        "LOLA PGDA product 90 (Barker et al. 2023), south polar stereographic, heights above the 1737.4 km sphere, ME frame",
    )


def resolution_note(terrain: MoonTerrain, site: Site, az_step_deg: float, max_km: float) -> str:
    """Which DEM supplied the skyline in each distance band at this site, from the layers themselves."""
    bands: dict[tuple[float, float], list[str]] = {}
    for c in coverage(terrain.layers, site.lat_deg, site.lon_deg_east, az_step_deg, max_km, MOON_RADIUS_M):
        if c["layer"] is None:
            label = "no data (no terrain)"
        else:
            e = terrain.provenance[c["layer"]]
            label = f"{Path(e.get('file') or e['url']).stem} ({e['pixel_size_m']:g} m)"
        bands.setdefault((c["from_km"], c["to_km"]), []).append(f"{label} {c['share']:.0%}")
    text = "; ".join(f"{a:g}-{b:g} km: {', '.join(items)}" for (a, b), items in bands.items())
    note = f"Terrain used for the skyline at this site, by range (share of ray length): {text}."
    if any(len(items) > 1 for items in bands.values()):
        note += " Where a band lists more than one grid, the finer grid has no data there (the edge of its file) and the next coarser one fills the rest of the band."
    return note + " Boulders and anything finer than the grid are not in the skyline."
