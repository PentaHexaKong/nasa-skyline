"""Build the Moon globe textures for the web app from the NASA SVS CGI Moon Kit.

Run from ds/: `uv run python -m pipeline.globe`. Writes frontend/public/moon/.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

from pipeline.fetch import DATA, checksum_of, fetch
from pipeline.terrain import load_polar

SVS_PAGE = "https://svs.gsfc.nasa.gov/4720"
SVS_BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
COLOR_SRC = "lroc_color_16bit_srgb_4k.tif"
LDEM_SRC = "ldem_16.tif"
SOURCES = {f"moon-kit/{n}": f"{SVS_BASE}/{n}" for n in (COLOR_SRC, LDEM_SRC)}

MOON_RADIUS_KM = 1737.4
EXAGGERATION = 6.0
POLAR_SIGMA_COLS = 0.6
COLOR_SIZE = (4096, 2048)
NORMAL_SIZE = (2048, 1024)
JPEG_QUALITY = 85

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "moon"
CREDIT = "NASA's Scientific Visualization Studio (CGI Moon Kit)"
AESTHETICS_NOTE = (
    "NASA: this color map is optimized for aesthetics, not science. "
    "Scientific applications should use the source LROC WAC Hapke normalized mosaic."
)


def write_image(path: Path, arr: np.ndarray, driver: str, **opts) -> None:
    """arr is (bands, rows, cols) uint8."""
    with rasterio.open(
        path, "w", driver=driver, width=arr.shape[2], height=arr.shape[1],
        count=arr.shape[0], dtype="uint8", **opts,
    ) as dst:
        dst.write(arr)


def build_color(src: Path) -> None:
    with rasterio.open(src) as ds:
        arr = ds.read(
            indexes=[1, 2, 3], out_shape=(3, COLOR_SIZE[1], COLOR_SIZE[0]),
            resampling=Resampling.average,
        )
    if arr.dtype == np.uint16:
        arr = (arr.astype(np.float32) / 257.0).round().astype(np.uint8)
    write_image(OUT / "color-4k.jpg", arr, "JPEG", quality=JPEG_QUALITY)


def smooth_longitude(heights: np.ndarray) -> np.ndarray:
    """Gaussian blur along each row with a constant ground-distance width.

    Equirectangular pixels shrink toward the poles, so the kernel widens as 1/cos(lat).
    That keeps the stretched polar rows from turning one-pixel noise into streaks.
    """
    rows, cols = heights.shape
    lat = np.radians(90.0 - (np.arange(rows) + 0.5) * 180.0 / rows)
    sigma = np.clip(POLAR_SIGMA_COLS / np.maximum(np.cos(lat), 0.02), 0, 40)
    out = heights.astype(np.float64).copy()
    for i, s in enumerate(sigma):
        if s < 0.5:
            continue
        r = int(3 * s)
        k = np.exp(-0.5 * (np.arange(-r, r + 1) / s) ** 2)
        k /= k.sum()
        row = np.concatenate([out[i, -r:], out[i], out[i, :r]])
        out[i] = np.convolve(row, k, "valid")
    return out


def normal_map(heights_km: np.ndarray, exaggeration: float) -> np.ndarray:
    """Tangent-space normals (+X east, +Y north, +Z out) packed to uint8 (3, rows, cols).

    Row 0 is the north edge, column 0 is -180 deg longitude. Longitude wraps; the poles clamp.
    """
    rows, cols = heights_km.shape
    h = heights_km.astype(np.float64) * exaggeration
    lat = np.radians(90.0 - (np.arange(rows) + 0.5) * 180.0 / rows)
    dlam = dphi = 2 * np.pi / cols
    dx = MOON_RADIUS_KM * np.maximum(np.cos(lat), 1e-3)[:, None] * dlam
    dy = MOON_RADIUS_KM * dphi

    dh_dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * dx)
    up = np.vstack([h[:1], h[:-1]])
    down = np.vstack([h[1:], h[-1:]])
    dh_dy = (up - down) / (2 * dy)

    n = np.stack([-dh_dx, -dh_dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=0)
    return np.round((n * 0.5 + 0.5) * 255).astype(np.uint8)


def build_normal(src: Path) -> dict:
    with rasterio.open(src) as ds:
        full = (ds.width, ds.height)
        heights = ds.read(
            1, out_shape=(NORMAL_SIZE[1], NORMAL_SIZE[0]), resampling=Resampling.average
        )
    write_image(OUT / "normal-2k.jpg", normal_map(smooth_longitude(heights), EXAGGERATION), "JPEG", quality=92)
    return {"source_size_px": list(full), "height_range_km": [float(heights.min()), float(heights.max())]}


CAP_EDGE_LAT = -75.0  # the cap covers the sites near the pole; the shader blends it in over ~1 deg
CAP_SIZE = 2048
CAP_DEM = "LDEM_60S_240MPP_ADJ.TIF"


def build_cap() -> dict:
    """Object-space normals of the south polar cap from LOLA 240 m heights, at true scale.

    Pixels are an orthographic view of the unit sphere from below: u = x / s, v = z / s with
    s = cos(edge latitude), in the globe's scene frame (x = cos lat cos lon, y = sin lat,
    z = -cos lat sin lon). Row 0 is v = +1, matching three.js textures with flipY.
    """
    s = math.cos(math.radians(CAP_EDGE_LAT))
    n = CAP_SIZE
    t = (np.arange(n) + 0.5) / n * 2 - 1
    x = (t * s)[None, :].repeat(n, 0)
    z = (-t * s)[:, None].repeat(n, 1)
    inside = x**2 + z**2 < s**2
    y = -np.sqrt(np.clip(1 - x**2 - z**2, 0, 1))
    lat = np.degrees(np.arcsin(y))
    lon = np.degrees(np.arctan2(-z, x)) % 360
    reach_km = (90 + CAP_EDGE_LAT + 1) * math.pi / 180 * MOON_RADIUS_KM
    dem = load_polar(str(DATA / CAP_DEM), -90.0, 0.0, reach_km)
    # Sample the full square (the 60S grid reaches past the cap edge) so slopes at the rim are real, not cut to 0.
    h_km = np.nan_to_num(dem.sample(lat, lon), nan=0.0) / 1000
    p = np.stack([x, y, z]) * (MOON_RADIUS_KM + h_km)
    du = np.gradient(p, axis=2)
    dv = np.gradient(p, axis=1)
    nrm = np.cross(du, dv, axis=0)
    nrm *= np.sign(np.sum(nrm * np.stack([x, y, z]), axis=0, keepdims=True))  # outward
    nrm /= np.linalg.norm(nrm, axis=0, keepdims=True)
    nrm = np.where(inside[None], nrm, np.stack([x, y, z]))
    write_image(OUT / "cap-normal-2k.jpg", np.round((nrm * 0.5 + 0.5) * 255).astype(np.uint8), "JPEG", quality=92)
    return {
        "file": "cap-normal-2k.jpg",
        "size_px": [n, n],
        "edge_lat_deg": CAP_EDGE_LAT,
        "projection": "orthographic view of the unit sphere from the south pole in the globe's scene frame: "
        "u = x / cos(edge), v = z / cos(edge); row 0 is v = +1",
        "convention": "object-space normals, RGB = n * 0.5 + 0.5, scene frame x = cos lat cos lon, y = sin lat, z = -cos lat sin lon",
        "source_file": CAP_DEM,
        "source_sha256": checksum_of(CAP_DEM),
        "source": "LOLA PGDA product 90, south polar stereographic, 240 m, heights above the 1737.4 km sphere",
        "pixel_km": round(2 * s * MOON_RADIUS_KM / n, 3),
        "vertical_exaggeration": 1.0,
        "note": "True-scale relief, lit live by the Sun in the app.",
    }


def main() -> None:
    (DATA / "moon-kit").mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    color_src, ldem_src = (fetch({k: v}) [0] for k, v in SOURCES.items())

    build_color(color_src)
    ldem = build_normal(ldem_src)
    cap = build_cap()

    meta = {
        "credit": CREDIT,
        "page": SVS_PAGE,
        "color": {
            "file": "color-4k.jpg",
            "size_px": list(COLOR_SIZE),
            "projection": "equirectangular, centred on 0 deg longitude, +X east, north up",
            "source_url": SOURCES[f"moon-kit/{COLOR_SRC}"],
            "source_file": COLOR_SRC,
            "source_sha256": checksum_of(f"moon-kit/{COLOR_SRC}"),
            "source": "2025 LROC WAC Hapke normalized mosaic colour map, 16-bit sRGB TIFF, 4k",
            "jpeg_quality": JPEG_QUALITY,
            "note": AESTHETICS_NOTE,
        },
        "normal": {
            "file": "normal-2k.jpg",
            "size_px": list(NORMAL_SIZE),
            "convention": "tangent space, +X east, +Y north (three.js normalMap), centred on 0 deg longitude",
            "source_url": SOURCES[f"moon-kit/{LDEM_SRC}"],
            "source_file": LDEM_SRC,
            "source_sha256": checksum_of(f"moon-kit/{LDEM_SRC}"),
            "source": "LOLA gridded elevation at 16 pixels per degree, float32 km relative to a 1737.4 km sphere",
            "source_size_px": ldem["source_size_px"],
            "radius_km": MOON_RADIUS_KM,
            "vertical_exaggeration": EXAGGERATION,
            "method": "block-average heights to output size, widen a longitude blur toward the poles, "
            "central differences on the sphere, "
            "normal = normalize(-dh/dx, -dh/dy, 1) with heights scaled by the exaggeration",
            "note": "Visual relief only. The exaggeration makes this unfit for any measurement.",
        },
        "cap": cap,
    }
    (OUT / "globe.json").write_text(json.dumps(meta, indent=2) + "\n")
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}\t{p.stat().st_size / 1e6:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
