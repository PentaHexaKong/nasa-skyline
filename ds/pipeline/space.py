"""Space scene data for the web app: Moon-centred Earth and Sun ephemeris, and baked Earth, star and Sun textures.

Run from ds/:
    uv run python -m pipeline.space ephemeris --start 2026-11-14 --days 365
    uv run --group assets python -m pipeline.space textures

Conventions: ECLIPJ2000 inertial frame centred on the Moon, km, UTC. Scene axes are SPICE (x, z, -y), so ecliptic north is +y.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import spiceypy as sp

from pipeline import fetch
from pipeline.sun import ME_FRAME, utc_to_et

ALGORITHM_VERSION = "space-0.1.0"
ROOT = Path(__file__).resolve().parents[2]
EPHEMERIS_OUT = ROOT / "frontend" / "data" / "moon" / "space.json"
TEXTURE_OUT = ROOT / "frontend" / "public" / "space"
SPACE_DATA = fetch.DATA / "space"

SCENE_FROM_SPICE = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)
C = SCENE_FROM_SPICE


def quaternion(m: np.ndarray) -> np.ndarray:
    """Rotation matrix to unit quaternion (x, y, z, w), three.js order, Shepperd's method."""
    t = np.trace(m)
    if t > 0:
        s = 2 * np.sqrt(t + 1)
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] >= m[1, 1] and m[0, 0] >= m[2, 2]:
        s = 2 * np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2])
        q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] >= m[2, 2]:
        s = 2 * np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2])
        q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = 2 * np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1])
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    return np.array(q) / np.linalg.norm(q)


def load_kernels() -> list[Path]:
    paths = [fetch.DATA / name for name in fetch.MOON_KERNELS]
    missing = [p.name for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(f"missing kernels {missing}; run `python -m pipeline.run im2-mons-mouton` to fetch them")
    sp.kclear()
    for p in paths:
        sp.furnsh(str(p))
    return paths


def _scene_quaternions(body_frame: str, ets: np.ndarray) -> np.ndarray:
    out = np.empty((len(ets), 4))
    for i, et in enumerate(ets):
        q = quaternion(C @ np.array(sp.pxform(body_frame, "ECLIPJ2000", float(et))) @ C.T)
        if i and q @ out[i - 1] < 0:
            q = -q
        out[i] = q
    return out


def _positions(body: str, ets: np.ndarray) -> np.ndarray:
    return np.array([C @ sp.spkpos(body, float(et), "ECLIPJ2000", "NONE", "MOON")[0] for et in ets])


def ephemeris(start: str, days: int, step_h: int = 2) -> dict:
    kernels = load_kernels()
    et0 = utc_to_et(start)
    n = days * 24 // step_h + 1
    ets = et0 + np.arange(n) * step_h * 3600.0
    earth = _positions("EARTH", ets)
    sun = _positions("SUN", ets)
    # Linear interpolation at each interval midpoint against a direct SPICE sample (the client interpolates the same way).
    mids = ets[:-1] + step_h * 1800.0
    err = np.linalg.norm(_positions("EARTH", mids) - (earth[:-1] + earth[1:]) / 2, axis=1)
    max_err = float(err.max())
    stated_err = float(np.ceil(max_err))
    return {
        "start": start if start.endswith("Z") else f"{start}T00:00:00Z",
        "step_h": step_h,
        "n": n,
        "frame": "ECLIPJ2000, centred on the Moon; scene axes are SPICE (x, z, -y)",
        "units": "km",
        "earth_km": [round(float(v), 1) for v in earth.ravel()],
        "sun_km": [int(round(float(v))) for v in sun.ravel()],
        "moon_q": [round(float(v), 7) for v in _scene_quaternions(ME_FRAME, ets).ravel()],
        "earth_q": [round(float(v), 7) for v in _scene_quaternions("IAU_EARTH", ets).ravel()],
        "provenance": {
            "kernels": [
                {"file": p.name, "sha256": _kernel_sha(p)} for p in kernels
            ],
            "algorithm_version": ALGORITHM_VERSION,
            "interp_max_error_km": stated_err,
            "notes": [
                "Positions are geometric (abcorr NONE): no light-time or aberration. Earth and Sun are the DE440s Moon-centred vectors in ECLIPJ2000.",
                f"Moon orientation is the rotation {ME_FRAME} to ECLIPJ2000, expressed in scene axes (x, z, -y) as a three.js quaternion.",
                "Earth orientation is IAU_EARTH (pck00011.tpc, low precision, adequate for texture orientation) to ECLIPJ2000 in the same scene axes.",
                f"Samples are {step_h} h apart; the client interpolates positions linearly and quaternions by slerp. "
                f"Computed over this span, the largest error of linear interpolation of the Earth position at interval midpoints is {max_err:.1f} km "
                f"(stated bound {stated_err:.0f} km).",
                "Quaternions are sign-continuous between consecutive samples.",
            ],
        },
    }


def _kernel_sha(path: Path) -> str:
    try:
        return fetch.checksum_of(path.name)
    except (KeyError, FileNotFoundError):
        return fetch.sha256(path)


def write_ephemeris(start: str, days: int) -> None:
    doc = ephemeris(start, days)
    EPHEMERIS_OUT.parent.mkdir(parents=True, exist_ok=True)
    EPHEMERIS_OUT.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"wrote {EPHEMERIS_OUT} n={doc['n']} bytes={EPHEMERIS_OUT.stat().st_size} interp_max_error_km={doc['provenance']['interp_max_error_km']}")


# Textures -----------------------------------------------------------------------------------------------------------

CREDIT_EARTH = "NASA Blue Marble Next Generation and Black Marble via NASA GIBS"
CREDIT_CLOUDS = "NASA Earth Observatory Blue Marble cloud map (2002 MODIS composite)"
CREDIT_STARS = "NASA SVS Deep Star Maps 2020"
CREDIT_SUN = "NASA SDO/HMI"
STAR_EXPOSURE = 1.5  # tone-map scale in units of the 99.95th percentile of the HDR map


def _fetch_date(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d")


def _fetch_sun() -> Path:
    path = SPACE_DATA / "sun-HMII-2048.jpg"
    if not path.exists():
        print(f"fetch {fetch.SUN_URL}", file=sys.stderr)
        subprocess.run(["curl", "-sSLf", "--retry", "3", "-o", str(path), fetch.SUN_URL], check=True)
    return path


def disc_of(gray: np.ndarray) -> tuple[float, float, float]:
    """Centre (u, v) and radius of the bright solar disc in UV units of the image width and height."""
    h, w = gray.shape
    mask = gray > 0.06  # the sky outside the disc is exactly 0
    ys, xs = np.nonzero(mask)
    cx, cy = xs.mean() + 0.5, ys.mean() + 0.5
    r = np.sqrt(mask.sum() / np.pi)
    return cx / w, cy / h, r / w


def build_textures() -> None:
    from PIL import Image, ImageFilter

    Image.MAX_IMAGE_PIXELS = None
    SPACE_DATA.mkdir(parents=True, exist_ok=True)
    TEXTURE_OUT.mkdir(parents=True, exist_ok=True)
    srcs = {Path(k).name: p for k, p in zip(fetch.SPACE_SOURCES, fetch.fetch(fetch.SPACE_SOURCES))}
    sun_src = _fetch_sun()
    sun_head = fetch.head(fetch.SUN_URL)
    entries = []

    def rgb(path: Path) -> np.ndarray:
        return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255

    def record(name, img, quality, sources, processing, credit, **extra):
        out = TEXTURE_OUT / name
        img.save(out, quality=quality, optimize=True)
        entries.append({
            "file": name, "size_px": list(img.size), "bytes": out.stat().st_size,
            "sources": [
                {"url": url, "sha256": sha, "fetched": date} for url, sha, date in sources
            ],
            "processing": processing, "credit": credit, **extra,
        })
        print(f"{name} {img.size} {out.stat().st_size} B")

    def src(key: str):
        p = srcs[key]
        return (fetch.SPACE_SOURCES[f"space/{key}"], fetch.sha256(p), _fetch_date(p))

    # Day: Blue Marble NG shaded relief and bathymetry, graded for display, then downsampled.
    d = rgb(srcs["earth-day-src.jpg"])
    lum = d.mean(-1, keepdims=True)
    d = np.clip(lum + (d - lum) * 1.2, 0, 1)
    ocean = (d[..., 2] > d[..., 0] * 1.4)[..., None]
    d = np.where(ocean, np.clip(0.55 * d + 0.45 * np.array([0.07, 0.17, 0.42], np.float32), 0, 1), d)
    day8k = Image.fromarray((d * 255).round().astype(np.uint8))
    day = day8k.resize((4096, 2048), Image.LANCZOS)
    record("earth-day-4k.jpg", day, 88, [src("earth-day-src.jpg")],
           "8192x4096 source colour-graded for display (saturation x1.2; ocean pixels with b > 1.4 r pulled 45% toward [0.07, 0.17, 0.42]), "
           "then Lanczos downsampled to 4096x2048. Display grading, not data.", CREDIT_EARTH, graded_for_display=True)

    night = Image.open(srcs["earth-night-src.jpg"]).convert("RGB")
    record("earth-night-4k.jpg", night, 85, [src("earth-night-src.jpg")], "Re-encoded, no pixel changes.", CREDIT_EARTH)

    water = rgb(srcs["earth-water-src.jpg"]).mean(-1) > 0.42
    rough = Image.fromarray(np.where(water, 170, 255).astype(np.uint8), "L").resize((2048, 1024), Image.BILINEAR)
    record("earth-rough-2k.jpg", rough, 90, [src("earth-water-src.jpg")],
           "Water (mean > 0.42 in the OSM land/water map) = 170, land = 255, bilinear to 2048x1024. Used as a roughness map.", CREDIT_EARTH)

    clouds = Image.open(srcs["cloud_combined_2048.jpg"]).convert("L").resize((4096, 2048), Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.6))
    a = np.asarray(clouds).astype(np.float32) / 255
    a = np.clip((a - 0.08) / 0.92, 0, 1) ** 1.15
    g = np.asarray(day).astype(np.float32).min(-1) / 255
    ice = np.asarray(
        Image.fromarray((np.clip((g - 0.45) / 0.25, 0, 1) * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(6))
    ).astype(np.float32) / 255
    a *= 1 - 0.85 * ice
    record("earth-clouds-4k.jpg", Image.fromarray((a * 255).astype(np.uint8), "L"), 90, [src("cloud_combined_2048.jpg")],
           "Cloud map bicubic to 4096x2048, blur 0.6 px, black point 0.08, gamma 1.15; alpha reduced by 85% over ice found in the graded day map. "
           "A multi-day composite, not a real day.", CREDIT_CLOUDS, composite_not_a_real_day=True)

    import OpenEXR

    with OpenEXR.File(str(srcs["starmap_2020_8k.exr"])) as f:
        ch = f.channels()
        hdr = (ch["RGB"].pixels if "RGB" in ch else np.stack([ch[c].pixels for c in "RGB"], -1)).astype(np.float32)
    k = STAR_EXPOSURE / float(np.percentile(hdr, 99.95))
    s = np.clip((1 - np.exp(-hdr * k)) ** (1 / 2.2), 0, 1)
    s = np.clip((s - 0.10) / 0.90, 0, 1) ** 1.3
    stars = Image.fromarray((s * 255).round().astype(np.uint8)).resize((4096, 2048), Image.BOX)
    record("stars-4k.jpg", stars, 90, [src("starmap_2020_8k.exr")],
           f"Tone map 1 - exp(-k x), k = {STAR_EXPOSURE} / p99.95, gamma 1/2.2, background below 0.10 pulled to black, **1.3, "
           "area-averaged 2x down to 4096x2048. Display tone mapping.", CREDIT_STARS)

    sun = Image.open(sun_src).convert("RGB")
    cx, cy, r = disc_of(np.asarray(sun.convert("L")).astype(np.float32) / 255)
    record("sun-2k.jpg", sun, 90,
           [(fetch.SUN_URL, fetch.sha256(sun_src), datetime.fromtimestamp(sun_src.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))],
           "Re-encoded, no pixel changes. A daily image, so the fetch time is the image date.", CREDIT_SUN,
           disc={"centre_uv": [round(cx, 4), round(cy, 4)], "radius_uv": round(r, 4),
                 "method": "pixels brighter than 0.06 of full scale (sky is 0), centroid and sqrt(area / pi), in fractions of image width; v from the top",
                 "server_last_modified": sun_head["last_modified"]})

    total = sum(e["bytes"] for e in entries)
    doc = {
        "algorithm_version": ALGORITHM_VERSION,
        "total_bytes": total,
        "notes": [
            "The day map is colour-graded for display. The clouds are a multi-day composite (2002 MODIS), not a real day.",
            "Equirectangular, longitude -180 to 180 left to right, latitude 90 to -90 top to bottom (GIBS EPSG:4326 WMS).",
        ],
        "files": entries,
    }
    (TEXTURE_OUT / "textures.json").write_text(json.dumps(doc, indent=2))
    print(f"total {total} B ({total / 1e6:.2f} MB)")
    if total > 9_000_000:
        raise SystemExit("textures exceed the 9 MB budget")


def main() -> None:
    ap = argparse.ArgumentParser(prog="pipeline.space")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("ephemeris")
    e.add_argument("--start", default="2026-11-14")
    e.add_argument("--days", type=int, default=365)
    sub.add_parser("textures")
    args = ap.parse_args()
    if args.cmd == "ephemeris":
        write_ephemeris(args.start, args.days)
    else:
        build_textures()


if __name__ == "__main__":
    main()
