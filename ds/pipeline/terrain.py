"""Terrain horizon (skyline) from a geographic DEM on a spherical body."""

import hashlib
import math
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform as warp_transform
from rasterio.windows import Window

MOON_RADIUS_M = 1_737_400.0
WINDOW_CACHE = Path(__file__).resolve().parent.parent / "data" / "windows"


def _bilinear(h: np.ndarray, r: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Bilinear height at fractional pixel coordinates (centres at integers); NaN outside the grid."""
    rows, cols = h.shape
    inside = (r >= 0) & (r <= rows - 1) & (c >= 0) & (c <= cols - 1)
    r = np.clip(r, 0, rows - 1.000001)
    c = np.clip(c, 0, cols - 1.000001)
    r0, c0 = r.astype(int), c.astype(int)
    fr, fc = r - r0, c - c0
    top = h[r0, c0] * (1 - fc) + h[r0, c0 + 1] * fc
    bot = h[r0 + 1, c0] * (1 - fc) + h[r0 + 1, c0 + 1] * fc
    return np.where(inside, top * (1 - fr) + bot * fr, np.nan)


@dataclass(frozen=True)
class Dem:
    """Heights on a regular latitude/longitude grid (used for synthetic test terrain)."""

    heights_m: np.ndarray  # rows north to south, cols west to east
    lat0: float  # latitude of row 0 pixel centre
    lon0: float  # longitude of col 0 pixel centre
    dlat: float  # degrees per row (positive; rows go south)
    dlon: float  # degrees per col

    def sample(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        """Bilinear height; NaN outside the grid."""
        return _bilinear(self.heights_m, (self.lat0 - lat) / self.dlat, (lon - self.lon0) / self.dlon)


@dataclass(frozen=True)
class PolarDem:
    """Heights on a projected grid (LOLA south-polar stereographic, or the global equirectangular map).

    sample() takes planetocentric lat/lon in degrees east, converts to the file CRS with
    rasterio.warp.transform, then interpolates bilinearly. Heights are metres above the
    body's reference sphere. NaN outside the grid or where the file has no data.
    """

    heights_m: np.ndarray  # rows top to bottom (y decreasing), cols left to right
    x0: float  # CRS x of the row 0 / col 0 pixel centre
    y0: float  # CRS y of the row 0 / col 0 pixel centre
    dx: float  # metres per column (positive)
    dy: float  # metres per row (positive; rows go -y)
    crs: CRS
    source: dict = field(default_factory=dict, compare=False)  # provenance of the file this came from

    def to_xy(self, lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
        lon = (lon + 180.0) % 360.0 - 180.0  # the global map is centred on 0 and runs -180..180
        x, y = warp_transform(self.crs.geodetic_crs, self.crs, lon.ravel().tolist(), lat.ravel().tolist())
        return np.reshape(x, lat.shape), np.reshape(y, lat.shape)

    def to_latlon(self, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
        lon, lat = warp_transform(self.crs, self.crs.geodetic_crs, x.ravel().tolist(), y.ravel().tolist())
        return np.reshape(lat, x.shape), np.reshape(lon, x.shape) % 360.0

    def sample(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        x, y = self.to_xy(lat, lon)
        return _bilinear(self.heights_m, (self.y0 - y) / self.dy, (x - self.x0) / self.dx)


@dataclass(frozen=True)
class Layer:
    """A DEM used out to range_m from the observer (finest layers are listed first)."""

    dem: Dem | PolarDem
    range_m: float = math.inf


def _remote(url: str) -> str:
    return "/vsicurl/" + url if url.startswith("http") else url


GDAL_REMOTE = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF",
    CPL_VSIL_CURL_CHUNK_SIZE=str(1 << 20),
    GDAL_HTTP_MAX_RETRY="5",
    GDAL_HTTP_RETRY_DELAY="2",
)


def _read_tile(path: str, win: Window, chunk: int | None = None) -> np.ndarray:
    env = {**GDAL_REMOTE, **({"CPL_VSIL_CURL_CHUNK_SIZE": str(chunk)} if chunk else {})}
    with rasterio.Env(**env), rasterio.open(path) as d:
        return d.read(1, window=win)


def _read_window(path: str, win: Window, block: tuple[int, int], workers: int = 16) -> np.ndarray:
    """Read win from a remote or local raster, in block-aligned tiles over a thread pool.

    The PGDA host throttles each connection, so one sequential read of a 1000 x 1000 window takes minutes.
    """
    br, bc = block
    strips = br == 1
    br *= max(1, 8 // br)  # a one-row-strip file (the global map) is read 8 rows per job, not one row per job
    chunk = 1 << 16 if strips else None  # a strip holds 6.8 KB of the window: a 1 MB request chunk would read 150x too much
    r1, c1 = int(win.row_off + win.height), int(win.col_off + win.width)
    r0, c0 = int(win.row_off), int(win.col_off)
    cuts_r = sorted({r0, r1, *range((r0 // br + 1) * br, r1, br)})
    cuts_c = sorted({c0, c1, *range((c0 // bc + 1) * bc, c1, bc)})
    jobs = [
        Window(ca, ra, cb - ca, rb - ra)
        for ra, rb in zip(cuts_r, cuts_r[1:])
        for ca, cb in zip(cuts_c, cuts_c[1:])
    ]
    with ThreadPoolExecutor(workers) as pool:
        tiles = list(pool.map(lambda w: _read_tile(path, w, chunk), jobs))
    out = None
    for w, t in zip(jobs, tiles):
        if out is None:
            out = np.empty((r1 - r0, c1 - c0), dtype=t.dtype)
        out[int(w.row_off) - r0 : int(w.row_off + w.height) - r0, int(w.col_off) - c0 : int(w.col_off + w.width) - c0] = t
    return out


def window_cache_path(source: str, etag: str | None, r0: int, c0: int, rows: int, cols: int) -> Path | None:
    """Cache file of one window. The server's ETag is in the key, so a republished file never reuses old bytes; no ETag, no cache."""
    if not etag:
        return None
    tag = hashlib.sha1(etag.encode()).hexdigest()[:10]
    return WINDOW_CACHE / f"{Path(source).stem}_{tag}_{r0}_{c0}_{rows}x{cols}.npy"


def load_polar(source: str, lat: float, lon: float, radius_km: float, source_info: dict | None = None) -> PolarDem:
    """Window of a projected DEM covering a radius_km box around the site.

    source is a local path or an http(s) URL (read as HTTP range requests, cached under data/windows/).
    Reads only the window, so a 2.5 GB COG is never downloaded. Scale/offset and nodata come from the file.
    """
    remote = source.startswith("http")
    with rasterio.Env(**GDAL_REMOTE), rasterio.open(_remote(source)) as d:
        crs, tf, nodata, scale, offset, block = d.crs, d.transform, d.nodata, d.scales[0], d.offsets[0], d.block_shapes[0]
        shape = d.shape
    if abs(tf.b) + abs(tf.d) > 0 or tf.a < 0 or tf.e > 0:
        raise ValueError(f"{source}: expected a north-up grid")
    x, y = warp_transform(crs.geodetic_crs, crs, [(lon + 180.0) % 360.0 - 180.0], [lat])
    r = radius_km * 1000
    rx = r / math.cos(math.radians(lat)) if crs.to_dict().get("proj") == "eqc" else r  # a degree of longitude shrinks by cos(lat)
    inv = ~tf
    ca, ra = inv * (x[0] - rx, y[0] + r)
    cb, rb = inv * (x[0] + rx, y[0] - r)
    if rx != r and (ca < 0 or cb > shape[1]):
        raise ValueError(f"{source}: the {radius_km} km box around {lat}, {lon} crosses the +-180 deg seam of the global map")
    r0, r1 = max(0, math.floor(ra) - 1), min(shape[0], math.ceil(rb) + 2)
    c0, c1 = max(0, math.floor(ca) - 1), min(shape[1], math.ceil(cb) + 2)
    if r1 <= r0 or c1 <= c0:
        raise ValueError(f"{source}: the {radius_km} km box around {lat}, {lon} is outside the grid")
    win = Window(c0, r0, c1 - c0, r1 - r0)
    ref_radius = crs.to_dict().get("R") or crs.to_dict().get("a")
    if ref_radius is None or abs(float(ref_radius) - MOON_RADIUS_M) > 1.0:
        raise ValueError(f"{source}: reference radius {ref_radius} m in the CRS is not {MOON_RADIUS_M} m")
    info = dict(source_info or {})
    info.update(
        window={"row_off": r0, "col_off": c0, "rows": r1 - r0, "cols": c1 - c0},
        crs=crs.to_proj4(),
        reference_radius_m=float(ref_radius),
        pixel_size_m=abs(tf.a),
        dtype="float32 metres relative to the reference sphere" if scale == 1.0 and offset == 0.0 else f"scale {scale} offset {offset}",
    )
    cache = window_cache_path(source, info.get("etag"), r0, c0, r1 - r0, c1 - c0) if remote else None
    if cache and cache.exists():
        raw = np.load(cache)
    else:
        raw = _read_window(_remote(source), win, block)
        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_name(f".{os.getpid()}.{cache.name}")
            np.save(tmp, raw)
            tmp.replace(cache)
    h = raw.astype(np.float32)
    if nodata is not None and not np.isnan(nodata):
        h[raw == nodata] = np.nan
    h = h * np.float32(scale) + np.float32(offset)
    return PolarDem(
        heights_m=h,
        x0=tf.c + (c0 + 0.5) * tf.a,
        y0=tf.f + (r0 + 0.5) * tf.e,
        dx=tf.a,
        dy=-tf.e,
        crs=crs,
        source=info,
    )


def ray_distances_m(max_km: float, near_step_m: float = 10.0, growth: float = 0.005) -> np.ndarray:
    d, out = near_step_m, []
    while d <= max_km * 1000:
        out.append(d)
        d += max(near_step_m, d * growth)
    return np.array(out)


def _destination(lat_deg: float, lon_deg: float, bearing: np.ndarray, delta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Great-circle destination (lat, lon in degrees) at central angle delta along a bearing (radians, clockwise from north)."""
    phi1, lam1 = math.radians(lat_deg), math.radians(lon_deg)
    sin_phi2 = math.sin(phi1) * np.cos(delta) + math.cos(phi1) * np.sin(delta) * np.cos(bearing)
    phi2 = np.arcsin(sin_phi2)
    lam2 = lam1 + np.arctan2(
        np.sin(bearing) * np.sin(delta) * math.cos(phi1), np.cos(delta) - math.sin(phi1) * sin_phi2
    )
    return np.degrees(phi2), np.degrees(lam2)


def _layered(dem_or_layers) -> list[Layer]:
    return list(dem_or_layers) if isinstance(dem_or_layers, (list, tuple)) else [Layer(dem_or_layers)]


def _ray_heights(layers: list[Layer], lat: float, lon: float, az_step_deg: float, max_km: float, radius_m: float):
    """Terrain height at every (azimuth, distance) ray sample, and the index of the layer that supplied it (-1: none)."""
    az = np.radians(np.arange(0.0, 360.0, az_step_deg))[:, None]
    dist = ray_distances_m(max_km)
    delta = (dist / radius_m)[None, :]
    la, lo = _destination(lat, lon, az, delta)
    h_t = np.full(la.shape, np.nan)
    source = np.full(la.shape, -1)
    for i, layer in enumerate(layers):
        k = int(np.searchsorted(dist, layer.range_m, side="right"))
        if k == 0:
            continue
        got = layer.dem.sample(la[:, :k], lo[:, :k])
        open_ = np.isnan(h_t[:, :k]) & ~np.isnan(got)
        h_t[:, :k][open_] = got[open_]
        source[:, :k][open_] = i
    return dist, delta, h_t, source


def coverage(dems, lat: float, lon: float, az_step_deg: float = 0.25, max_km: float = 40.0, radius_m: float = MOON_RADIUS_M) -> list[dict]:
    """Which layer supplied the terrain along the rays, per distance band between the layers' range limits.

    Shares are of ray length, not of samples (the samples thin out with distance). layer is the index
    into the layer list, or None for ray length that no layer has data for. Shares under 0.05% are dropped.
    """
    layers = _layered(dems)
    dist, _, _, source = _ray_heights(layers, lat, lon, az_step_deg, max_km, radius_m)
    width = np.broadcast_to(np.gradient(dist), source.shape)
    edges = [0.0] + sorted({min(l.range_m, max_km * 1000) for l in layers})
    out = []
    for a, b in zip(edges, edges[1:]):
        band = np.broadcast_to((dist > a) & (dist <= b), source.shape)
        total = width[band].sum()
        for i in [*range(len(layers)), -1]:
            share = float(width[band & (source == i)].sum() / total)
            if share > 0.0005:
                out.append({"from_km": a / 1000, "to_km": b / 1000, "layer": None if i < 0 else i, "share": share})
    return out


def skyline(
    dems,
    lat: float,
    lon: float,
    observer_height_m: float,
    az_step_deg: float = 0.25,
    max_km: float = 40.0,
    radius_m: float = MOON_RADIUS_M,
    with_distance: bool = False,
):
    """Max terrain elevation angle (deg) per azimuth, clockwise from north, az_i = i * step.

    dems is one DEM, or a list of Layer ordered finest first. Each ray sample takes its height
    from the first layer whose range covers its distance and that has data there.

    Exact spherical geometry: a point at central angle delta and height h_t, seen from
    height h_o, sits at atan2((R+h_t)cos(delta) - (R+h_o), (R+h_t)sin(delta)).
    Returns (elevation_deg, ground_height_m at the site), plus the distance (m) to the
    blocking terrain per azimuth when with_distance is set.
    """
    layers = _layered(dems)
    dist, delta, h_t, _ = _ray_heights(layers, lat, lon, az_step_deg, max_km, radius_m)
    ground = float("nan")
    for layer in layers:
        ground = float(layer.dem.sample(np.array([lat]), np.array([lon]))[0])
        if not math.isnan(ground):
            break
    r_o = radius_m + ground + observer_height_m
    r_t = radius_m + h_t
    elev = np.degrees(np.arctan2(r_t * np.cos(delta) - r_o, r_t * np.sin(delta)))
    if with_distance:
        return np.nanmax(elev, axis=1), ground, dist[np.nanargmax(elev, axis=1)]
    return np.nanmax(elev, axis=1), ground


def horizon_at(skyline_deg: np.ndarray, az_deg: np.ndarray) -> np.ndarray:
    """Linear interpolation of the skyline at arbitrary azimuths, wrapping at 360."""
    n = skyline_deg.size
    x = (np.asarray(az_deg) % 360.0) / (360.0 / n)
    i = np.floor(x).astype(int) % n
    f = x - np.floor(x)
    return skyline_deg[i] * (1 - f) + skyline_deg[(i + 1) % n] * f


def heightmap(
    dems,
    lat: float,
    lon: float,
    radius_km: float,
    n: int,
    radius_m: float = MOON_RADIUS_M,
    curvature: bool = False,
) -> np.ndarray:
    """Heights (m) on a square local east/north grid centred on the site, rows north to south.

    dems is one DEM or a list of Layer, finest first (the first with data wins).

    Without curvature the grid is a flat tangent grid mapped by lat/lon offsets (Earth: the drop
    is about 11 m at 12 km, left out). With curvature each cell sits at its great-circle distance d
    and bearing from the site (correct at the lunar poles, where parallels bend hard), and the
    spherical drop d^2/(2R) is subtracted so elevation angles from the site stay true.
    """
    t = np.linspace(-radius_km * 1000, radius_km * 1000, n)
    east, north = np.meshgrid(t, t[::-1])
    if curvature:
        d = np.hypot(east, north)
        la, lo = _destination(lat, lon, np.arctan2(east, north), d / radius_m)
    else:
        la = lat + np.degrees(north / radius_m)
        lo = lon + np.degrees(east / (radius_m * math.cos(math.radians(lat))))
    h = np.full(la.shape, np.nan)
    for layer in _layered(dems):
        got = layer.dem.sample(la, lo)
        h = np.where(np.isnan(h), got, h)
    return h - d * d / (2 * radius_m) if curvature else h
