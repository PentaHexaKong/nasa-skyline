"""Download kernels and DEMs into data/, pinning each file's sha256 on first fetch."""

import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
CHECKSUMS = Path(__file__).resolve().parent / "checksums.json"  # committed pins; data/ is gitignored

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
MOON_KERNELS = {
    "naif0012.tls": f"{NAIF}/lsk/naif0012.tls",
    "de440s.bsp": f"{NAIF}/spk/planets/de440s.bsp",
    "pck00011.tpc": f"{NAIF}/pck/pck00011.tpc",
    'moon_pa_de421_1900-2050.bpc': f'{NAIF}/pck/moon_pa_de421_1900-2050.bpc',
    'moon_080317.tf': f'{NAIF}/fk/satellites/moon_080317.tf',
    "moon_pa_de440_200625.bpc": f"{NAIF}/pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": f"{NAIF}/fk/satellites/moon_de440_250416.tf",
}

PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
LOLA_DEMS = {
    "LDEM_80S_80MPP_ADJ.TIF": f"{PGDA}/LDEM_80S_80MPP_ADJ.TIF",
    "LDEM_60S_240MPP_ADJ.TIF": f"{PGDA}/LDEM_60S_240MPP_ADJ.TIF",
}
ILLUMINATION = "https://pgda.gsfc.nasa.gov/data/MoonIllumination"
# PGDA product 69: average Sun and Earth visibility over 18.6 years, south of 85S at 60 m.
ILLUMINATION_MAPS = {
    "AVGVISIB_85S_060M_201608.TIF": f"{ILLUMINATION}/AVGVISIB_85S_060M_201608.TIF",
    "AVGVISIB_85S_060M_201608_EARTH.TIF": f"{ILLUMINATION}/AVGVISIB_85S_060M_201608_EARTH.TIF",
}
GIBS = (
    "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326"
    "&BBOX=-90,-180,90,180&STYLES=&FORMAT=image/jpeg"
)


def gibs(layer: str, w: int, h: int) -> str:
    return f"{GIBS}&LAYERS={layer}&WIDTH={w}&HEIGHT={h}"


# Space scene sources (static imagery; pinned). The daily SDO/HMI image is fetched by pipeline.space, unpinned.
SPACE_SOURCES = {
    "space/earth-day-src.jpg": gibs("BlueMarble_ShadedRelief_Bathymetry", 8192, 4096),
    "space/earth-night-src.jpg": gibs("VIIRS_Black_Marble", 4096, 2048),
    "space/earth-water-src.jpg": gibs("OSM_Land_Water_Map", 4096, 2048),
    "space/cloud_combined_2048.jpg": "https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg",
    "space/starmap_2020_8k.exr": "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_8k.exr",
}
SUN_URL = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_HMII.jpg"

# Too large to download: read windows over HTTP range requests (GDAL /vsicurl/).
LOLA_20M_URL = f"{PGDA}/LDEM_80S_20MPP_ADJ.TIF"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _parallel_get(url: str, dest: Path, size: int, parts: int = 64, workers: int = 16) -> None:
    """Ranged GETs, `workers` curl processes at a time over `parts` chunks: PGDA throttles each connection to ~70 kB/s,
    so one stream takes an hour. Many small chunks keep a slow connection from holding up the end."""
    chunk = -(-size // parts)
    pieces = [dest.with_name(f"{dest.name}.{i}") for i in range(parts)]

    def get(i: int) -> None:
        lo, hi = i * chunk, min(size, (i + 1) * chunk) - 1
        if pieces[i].exists() and pieces[i].stat().st_size == hi - lo + 1:
            return  # finished by an earlier, interrupted run
        cmd = ["curl", "-sSLf", "--retry", "5", "--retry-all-errors", "-r", f"{lo}-{hi}", "-o", str(pieces[i]), url]
        subprocess.run(cmd, check=True)

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(get, range(parts)))
    with dest.open("wb") as out:
        for piece in pieces:
            out.write(piece.read_bytes())
            piece.unlink()
    if dest.stat().st_size != size:
        raise RuntimeError(f"{url}: size mismatch")


def head(url: str) -> dict:
    """Size, ETag, Last-Modified and range support of a remote file (curl follows redirects)."""
    out = subprocess.run(["curl", "-sIL", url], check=True, capture_output=True, text=True).stdout
    last = out.strip().split("\r\n\r\n")[-1]
    h = {k.lower(): v.strip() for k, _, v in (ln.partition(":") for ln in last.splitlines()[1:])}
    return {
        "url": url,
        "size_bytes": int(h["content-length"]),
        "etag": h.get("etag"),
        "last_modified": h.get("last-modified"),
        "accept_ranges": h.get("accept-ranges"),
    }


def fetch(files: dict[str, str]) -> list[Path]:
    """Download missing files and check each against its pinned sha256."""
    DATA.mkdir(exist_ok=True)
    sums = json.loads(CHECKSUMS.read_text()) if CHECKSUMS.exists() else {}
    paths = []
    for name, url in files.items():
        path = DATA / name
        if not path.exists():
            print(f"fetch {url}", file=sys.stderr)
            tmp = path.with_suffix(path.suffix + ".part")
            if url.startswith("https://pgda.gsfc.nasa.gov/"):
                _parallel_get(url, tmp, head(url)["size_bytes"])
            else:
                r = subprocess.run(
                    ["curl", "-sSL", "--retry", "3", "-o", str(tmp), "-w", "%{http_code}", url],
                    check=True, capture_output=True, text=True,
                )
                if r.stdout.strip() != "200":
                    tmp.unlink(missing_ok=True)
                    raise RuntimeError(f"{url}: HTTP {r.stdout.strip()}")
            tmp.rename(path)
        digest = sha256(path)
        if sums.setdefault(name, {"url": url, "sha256": digest})["sha256"] != digest:
            raise RuntimeError(f"{name}: checksum changed; delete it and its pipeline/checksums.json entry to re-pin")
        paths.append(path)
    CHECKSUMS.write_text(json.dumps(sums, indent=2, sort_keys=True))
    return paths


def checksum_of(name: str) -> str:
    return json.loads(CHECKSUMS.read_text())[name]["sha256"]
