"""Exports the local terrain around a site for the web app's 3D island."""

import argparse
import json
from pathlib import Path

import numpy as np

from . import moon
from .run import ALGORITHM_VERSION, WEB_DATA
from .sites import SITES, Site
from .sun import ME_FRAME
from .terrain import MOON_RADIUS_M, heightmap, skyline

# A fine inner tier and a coarse outer tier, so the scene reaches the ridges that set the horizon.
MOON_TIERS = {"inner": (10.0, 513), "outer": (60.0, 257)}
INT16 = np.iinfo(np.int16)


def to_int16(heights: np.ndarray) -> np.ndarray:
    """Whole metres as little-endian int16; refuses NaN holes and values that would wrap."""
    if np.isnan(heights).any():
        raise ValueError("terrain grid has cells outside the DEM")
    lo, hi = float(heights.min()), float(heights.max())
    if lo < INT16.min or hi > INT16.max:
        raise ValueError(f"heights {lo:.0f}..{hi:.0f} m overflow int16")
    return np.rint(heights).astype("<i2")


def moon_islands(site: Site) -> list[tuple[dict, np.ndarray]]:
    """Inner (+-10 km, 20 m DEM where there is one) and outer (+-60 km, 240 m DEM) tiers, curvature drop applied."""
    terrain = moon.terrain_for(site)
    _, ground, dist = skyline(
        terrain.layers, site.lat_deg, site.lon_deg_east, site.observer_height_m, 0.25, moon.FAR_KM,
        radius_m=MOON_RADIUS_M, with_distance=True,
    )
    out = []
    for tier, (radius_km, n) in MOON_TIERS.items():
        sources = terrain.inner if tier == "inner" else terrain.outer
        raw = heightmap(sources, site.lat_deg, site.lon_deg_east, radius_km, n, MOON_RADIUS_M, curvature=True)
        heights = to_int16(raw)
        stem = site.id if tier == "inner" else f"{site.id}.outer"
        used = {id(layer.dem) for layer in sources}
        out.append((
            {
                "kind": "lunar_terrain",
                "synthetic": False,
                "site_id": site.id,
                "tier": tier,
                "body": "moon",
                "curvature": "drop d^2/2R applied",
                "file": f"{stem}.bin",
                "encoding": "int16 little-endian, metres relative to the 1737.4 km reference sphere minus the drop d^2/2R, rows north to south, cols west to east",
                "n": n,
                "radius_km": radius_km,
                "cell_m": round(2 * radius_km * 1000 / (n - 1), 3),
                "frame": f"{ME_FRAME}; local east/north grid centred on the site, each cell placed at its great-circle distance d and bearing from the site; the drop d^2/(2R), R = 1737.4 km, is subtracted so elevation angles from the site stay true",
                "ground_height_m": round(ground, 1),
                "observer_height_m": site.observer_height_m,
                "min_m": int(heights.min()),
                "max_m": int(heights.max()),
                "skyline_inside_share": round(float(np.mean(dist <= radius_km * 1000)), 4),
                "provenance": {
                    "algorithm_version": ALGORITHM_VERSION,
                    "dem_product": terrain.product,
                    "dem": [e for e, layer in zip(terrain.provenance, terrain.layers) if id(layer.dem) in used],
                    "sampling": "bilinear" + ("; the cells are upsampled from the 118 m global map" if moon.is_global(site) else ""),
                },
            },
            heights,
        ))
    return out


def write(out_dir: Path, meta: dict, heights: np.ndarray) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / meta["file"]).write_bytes(heights.tobytes())
    (out_dir / meta["file"].replace(".bin", ".json")).write_text(json.dumps(meta, indent=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site", choices=sorted(SITES))
    ap.add_argument("--out", type=Path, default=WEB_DATA / "terrain")
    a = ap.parse_args()
    site = SITES[a.site]
    for meta, heights in moon_islands(site):
        write(a.out, meta, heights)
        print(json.dumps({k: meta[k] for k in ("site_id", "tier", "ground_height_m", "min_m", "max_m", "skyline_inside_share")}))


if __name__ == "__main__":
    main()
