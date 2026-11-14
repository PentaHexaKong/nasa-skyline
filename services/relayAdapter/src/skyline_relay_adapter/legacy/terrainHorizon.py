'''Cached LOLA radial-height horizons in MOON_ME_DE421; see terrainGuide.md.'''

from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
import tempfile

import numpy as np
from pyproj import CRS, Transformer
import rasterio
from rasterio.windows import Window

from .spiceGeometry import siteFrame

LUNAR_RADIUS_M = 1737400.0
DEM_FRAME = siteFrame
PRODUCT_SOURCE = 'https://pgda.gsfc.nasa.gov/products/90'
DEFAULT_DEM_ROOT = Path(__file__).resolve().parents[2] / 'data/raw/lola'
DEFAULT_CACHE_ROOT = Path(__file__).resolve().parents[2] / 'data/processed/terrain/horizons'


def contentHash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


class TerrainCoverageError(ValueError):
    '''Required terrain is missing, invalid, or outside the supported model.'''


def unitVector(latitudeDeg, longitudeDeg):
    latitude, longitude = np.deg2rad([latitudeDeg, longitudeDeg])
    if (np.any(~np.isfinite(latitude)) or np.any(~np.isfinite(longitude))
            or np.any(np.abs(latitude) > np.pi / 2)):
        raise ValueError('Invalid lunar planetocentric latitude/east longitude')
    return np.stack([np.cos(latitude) * np.cos(longitude),
                     np.cos(latitude) * np.sin(longitude), np.sin(latitude)], axis=-1)


def localBasis(latitudeDeg, longitudeDeg):
    latitude, longitude = np.deg2rad([latitudeDeg, longitudeDeg])
    east = np.array([-np.sin(longitude), np.cos(longitude), 0.])
    north = np.array([-np.sin(latitude) * np.cos(longitude),
                      -np.sin(latitude) * np.sin(longitude), np.cos(latitude)])
    return np.stack([east, north, unitVector(latitudeDeg, longitudeDeg)])


def azimuthElevation(directions, basis):
    enu = np.asarray(directions) @ basis.T
    azimuth = np.mod(np.degrees(np.arctan2(enu[..., 0], enu[..., 1])), 360.)
    elevation = np.degrees(np.arctan2(enu[..., 2], np.hypot(enu[..., 0], enu[..., 1])))
    return azimuth, elevation


class LunarDem:
    '''Only the publisher's spherical south-polar stereographic product is supported.'''

    def __init__(self, path):
        self.path = Path(path)
        if not self.path.is_file():
            raise TerrainCoverageError(f'Missing terrain raster: {self.path}')
        try:
            self.dataset = rasterio.open(self.path)
        except rasterio.errors.RasterioError as error:
            raise TerrainCoverageError(f'Cannot open terrain raster {self.path}: {error}') from error
        try:
            self.crs = CRS.from_user_input(self.dataset.crs)
            expected = CRS.from_proj4('+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 '
                                     '+x_0=0 +y_0=0 +R=1737400 +units=m +no_defs')
            if not self.crs.equals(expected, ignore_axis_order=True):
                raise TerrainCoverageError(f'Unsupported lunar projection: {self.path}: {self.crs}')
            transform = self.dataset.transform
            if (self.dataset.count != 1 or transform.a <= 0 or transform.e >= 0
                    or transform.b != 0 or transform.d != 0):
                raise TerrainCoverageError(f'Unsupported terrain grid: {self.path}')
            self.forward = Transformer.from_crs(self.crs.geodetic_crs, self.crs, always_xy=True)
            self.inverse = Transformer.from_crs(self.crs, self.crs.geodetic_crs, always_xy=True)
        except Exception as error:
            self.dataset.close()
            if isinstance(error, TerrainCoverageError):
                raise
            raise TerrainCoverageError(f'Unsupported terrain metadata {self.path}: {error}') from error

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.dataset.close()

    def xy(self, latitudeDeg, longitudeDeg):
        return self.forward.transform(longitudeDeg, latitudeDeg, errcheck=True)

    def metadata(self):
        ds = self.dataset
        return dict(path=str(self.path.resolve()), sizeBytes=self.path.stat().st_size,
                    crsWkt=self.crs.to_wkt(), shape=list(ds.shape), boundsM=list(ds.bounds),
                    resolutionM=list(ds.res), transform=list(ds.transform), dtype=ds.dtypes[0],
                    nodata='NaN' if ds.nodata is not None and not np.isfinite(ds.nodata) else ds.nodata,
                    scale=ds.scales[0], offset=ds.offsets[0],
                    unit=ds.units[0], tags=ds.tags(), bandTags=ds.tags(1),
                    frame=DEM_FRAME, radialReferenceM=LUNAR_RADIUS_M,
                    heightDatum='radial meters above 1737400 m sphere; not geoid height',
                    datumSource=PRODUCT_SOURCE)

    def heights(self, latitudeDeg, longitudeDeg):
        '''Bilinear pixel-center interpolation; all four cells must be valid.'''
        x, y = np.broadcast_arrays(*self.xy(latitudeDeg, longitudeDeg))
        inverse = ~self.dataset.transform
        col, row = inverse.a*x + inverse.c, inverse.e*y + inverse.f
        col, row = col - .5, row - .5
        c0, r0 = np.floor(col).astype(int), np.floor(row).astype(int)
        if np.any((r0 < 0) | (c0 < 0) | (r0 + 1 >= self.dataset.height)
                  | (c0 + 1 >= self.dataset.width)):
            raise TerrainCoverageError(f'Outside terrain interpolation coverage: {self.path}')
        left, top = int(c0.min()), int(r0.min())
        window = Window(left, top, int(c0.max() - left + 2), int(r0.max() - top + 2))
        data = self.dataset.read(1, window=window, masked=True)
        dr, dc = row - r0, col - c0
        result = np.zeros(x.shape)
        for dy, dx, weight in ((0, 0, (1-dr)*(1-dc)), (0, 1, (1-dr)*dc),
                               (1, 0, dr*(1-dc)), (1, 1, dr*dc)):
            values = data[r0 - top + dy, c0 - left + dx]
            if np.any(np.ma.getmaskarray(values)) or np.any(~np.isfinite(values.data)):
                raise TerrainCoverageError(f'NoData/nonfinite terrain interpolation cells: {self.path}')
            result += values.data * weight
        return result * self.dataset.scales[0] + self.dataset.offsets[0]


@dataclass(frozen=True)
class HorizonConfig:
    azimuthStepDeg: float = .25
    localRadiusM: float = 50000.
    outerRadiusM: float = 400000.
    nearRadiusM: float = 1000.
    nearStepM: float = 40.
    observerHeightM: float = 0.
    # Explicit envelope, not an inferred maximum from a partial polar DEM.
    globalMaxHeightM: float = 20000.

    def __post_init__(self):
        values = np.array(list(asdict(self).values()))
        if (np.any(~np.isfinite(values)) or not 0 < self.azimuthStepDeg <= 5
                or not np.isclose(360 / self.azimuthStepDeg, round(360 / self.azimuthStepDeg))
                or not 0 < self.nearStepM < self.nearRadiusM < self.localRadiusM < self.outerRadiusM
                or not self.outerRadiusM < np.pi * LUNAR_RADIUS_M / 2
                or self.observerHeightM < 0 or self.globalMaxHeightM <= 0):
            raise ValueError('Invalid terrain horizon configuration')


@dataclass(frozen=True)
class TerrainHorizon:
    siteId: str
    sitePositionM: np.ndarray
    basis: np.ndarray
    elevationDeg: np.ndarray
    metadata: dict

    def __post_init__(self):
        if (np.asarray(self.elevationDeg).ndim != 1 or len(self.elevationDeg) < 4
                or not np.all(np.isfinite(self.elevationDeg))
                or np.asarray(self.sitePositionM).shape != (3,)
                or np.asarray(self.basis).shape != (3, 3)
                or not np.all(np.isfinite(self.sitePositionM)) or not np.all(np.isfinite(self.basis))
                or not np.allclose(self.basis @ self.basis.T, np.eye(3), atol=1e-10)
                or not np.isfinite(self.metadata.get('minimumTargetRangeM', np.nan))):
            raise TerrainCoverageError('Invalid cached terrain horizon')

    def threshold(self, azimuthDeg, minimumElevationDeg=0.):
        if not np.isfinite(minimumElevationDeg) or not 0 <= minimumElevationDeg <= 90:
            raise TerrainCoverageError('Terrain model supports minimum elevation masks in [0, 90] degrees')
        azimuth = np.asarray(azimuthDeg)
        if np.any(~np.isfinite(azimuth)):
            raise ValueError('Azimuth must be finite')
        index = np.floor(np.mod(azimuth, 360.) * len(self.elevationDeg) / 360.).astype(int)
        return np.maximum(minimumElevationDeg, self.elevationDeg[index % len(self.elevationDeg)])

    def margins(self, targetPositionsM, minimumElevationDeg=0.):
        directions = np.asarray(targetPositionsM) - self.sitePositionM
        if (not np.all(np.isfinite(directions)) or directions.shape[-1] != 3
                or np.any(np.linalg.norm(directions, axis=-1) <= self.metadata['minimumTargetRangeM'])):
            raise TerrainCoverageError('Terrain horizon requires finite targets beyond the terrain search region')
        azimuth, elevation = azimuthElevation(directions, self.basis)
        return elevation - self.threshold(azimuth, minimumElevationDeg)


def _accumulateGrid(dem, site, position, basis, innerM, outerM, horizon, config):
    '''Visit every pixel center in the annulus, in bounded-memory row strips.'''
    ds = dem.dataset
    # A conservative projected box encloses the spherical cap, checked in full.
    x, y = dem.xy(site.latitudeDeg, site.longitudeDeg)
    latitudeLimit = max(abs(site.latitudeDeg) - np.degrees(outerM / LUNAR_RADIUS_M), 0.)
    scaleBound = 2 / (1 + np.sin(np.radians(latitudeLimit)))
    pad = outerM * scaleBound + 2 * max(ds.res)
    inverse = ~ds.transform
    c0, r1 = inverse.a*(x-pad) + inverse.c, inverse.e*(y-pad) + inverse.f
    c1, r0 = inverse.a*(x+pad) + inverse.c, inverse.e*(y+pad) + inverse.f
    c0, c1, r0, r1 = int(np.floor(c0)), int(np.ceil(c1)), int(np.floor(r0)), int(np.ceil(r1))
    if c0 < 0 or r0 < 0 or c1 > ds.width or r1 > ds.height:
        raise TerrainCoverageError(f'{site.siteId}: terrain search region exceeds {dem.path}')
    count = 0
    up = basis[2]
    for start in range(r0, r1, 128):
        stop = min(start + 128, r1)
        cols, rows = np.meshgrid(np.arange(c0, c1) + .5, np.arange(start, stop) + .5)
        px, py = ds.transform.a*cols + ds.transform.c, ds.transform.e*rows + ds.transform.f
        lon, lat = dem.inverse.transform(px, py, errcheck=True)
        units = unitVector(lat, lon)
        dot = np.clip(units @ up, -1, 1)
        arc = np.arccos(dot) * LUNAR_RADIUS_M
        keep = (arc >= innerM) & (arc <= outerM)
        if not np.any(keep):
            continue
        heights = ds.read(1, window=Window(c0, start, c1-c0, stop-start), masked=True)[keep]
        if np.any(np.ma.getmaskarray(heights)) or np.any(~np.isfinite(heights.data)):
            raise TerrainCoverageError(f'{site.siteId}: NoData/nonfinite required terrain in {dem.path}')
        heights = heights.data * ds.scales[0] + ds.offsets[0]
        if np.any(np.abs(heights) > config.globalMaxHeightM):
            raise TerrainCoverageError(f'{site.siteId}: terrain exceeds configured height envelope')
        directions = units[keep] * (LUNAR_RADIUS_M + heights[:, None]) - position
        azimuth, elevation = azimuthElevation(directions, basis)
        indices = np.floor(azimuth / config.azimuthStepDeg).astype(int) % len(horizon)
        np.maximum.at(horizon, indices, elevation)
        count += int(keep.sum())
    return count


def buildHorizon(site, localDem, extendedDem, config=HorizonConfig()):
    if site.sourceFrame != DEM_FRAME:
        raise TerrainCoverageError(f'{site.siteId}: unsupported site frame {site.sourceFrame}; expected {DEM_FRAME}')
    groundHeight = float(localDem.heights(site.latitudeDeg, site.longitudeDeg))
    if abs(groundHeight + config.observerHeightM) > config.globalMaxHeightM:
        raise TerrainCoverageError(f'{site.siteId}: observer exceeds configured radial height envelope')
    radius = LUNAR_RADIUS_M + groundHeight + config.observerHeightM
    position = radius * unitVector(site.latitudeDeg, site.longitudeDeg)
    basis = localBasis(site.latitudeDeg, site.longitudeDeg)
    theta = config.outerRadiusM / LUNAR_RADIUS_M
    maxRadius = LUNAR_RADIUS_M + config.globalMaxHeightM
    farUpper = np.degrees(np.arctan2(maxRadius*np.cos(theta) - radius, maxRadius*np.sin(theta)))
    if farUpper >= 0:
        raise TerrainCoverageError(f'{site.siteId}: search radius cannot exclude positive-elevation distant terrain')
    horizon = np.full(round(360 / config.azimuthStepDeg), -90.)
    # Resolve interpolated slopes along every azimuth through the local DEM region.
    azimuth = np.radians((np.arange(len(horizon)) + .5) * config.azimuthStepDeg)
    distances = np.r_[1., np.arange(config.nearStepM, config.localRadiusM, config.nearStepM),
                      config.localRadiusM]
    angle = distances / LUNAR_RADIUS_M
    tangent = np.cos(azimuth)[:, None]*basis[1] + np.sin(azimuth)[:, None]*basis[0]
    units = np.cos(angle)[None, :, None]*basis[2] + np.sin(angle)[None, :, None]*tangent[:, None, :]
    lat = np.degrees(np.arcsin(units[..., 2]))
    lon = np.degrees(np.arctan2(units[..., 1], units[..., 0]))
    heights = localDem.heights(lat, lon)
    if np.any(np.abs(heights) > config.globalMaxHeightM):
        raise TerrainCoverageError(f'{site.siteId}: local terrain exceeds configured height envelope')
    _, elevation = azimuthElevation(units*(LUNAR_RADIUS_M + heights[..., None])-position, basis)
    horizon[:] = elevation.max(axis=1)
    localCount = _accumulateGrid(localDem, site, position, basis, config.nearRadiusM,
                                 config.localRadiusM, horizon, config)
    extendedCount = _accumulateGrid(extendedDem, site, position, basis, config.localRadiusM,
                                    config.outerRadiusM, horizon, config)
    # Periodic sector envelope: include neighboring bins rather than interpolate down peaks.
    horizon = np.maximum.reduce([horizon, np.roll(horizon, 1), np.roll(horizon, -1)])
    metadata = dict(site=asdict(site), config=asdict(config), groundHeightM=groundHeight,
                    frame=DEM_FRAME, radialReferenceM=LUNAR_RADIUS_M,
                    farTerrainUpperElevationDeg=float(farUpper),
                    minimumTargetRangeM=2*maxRadius*np.sin(theta/2) + 2*config.globalMaxHeightM,
                    localPixelCount=localCount, extendedPixelCount=extendedCount,
                    status='supported', model='pixel-center sector envelope plus near-field bilinear rays')
    return TerrainHorizon(site.siteId, position, basis, horizon, metadata)


def cachedHorizon(site, localPath=None, extendedPath=None, cacheRoot=DEFAULT_CACHE_ROOT,
                  config=HorizonConfig()):
    localPath = Path(localPath or DEFAULT_DEM_ROOT / 'LDEM_80S_80MPP_ADJ.TIF')
    extendedPath = Path(extendedPath or DEFAULT_DEM_ROOT / 'LDEM_60S_240MPP_ADJ.TIF')
    sources = []
    for path in (localPath, extendedPath):
        if not path.is_file():
            raise TerrainCoverageError(f'Missing required terrain raster: {path}')
        stat = path.stat()
        sources.append(dict(path=str(path.resolve()), size=stat.st_size, mtimeNs=stat.st_mtime_ns, sha256=contentHash(path)))
    identity = dict(version=3, site=asdict(site), config=asdict(config), sources=sources,
                    radiusM=LUNAR_RADIUS_M, frame=DEM_FRAME)
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    root = Path(cacheRoot)
    path = root / f'{site.siteId}-{key}.npz'
    if path.exists():
        try:
            with np.load(path, allow_pickle=False) as cached:
                metadata = json.loads(str(cached['metadata']))
                if metadata['cacheKey'] != key:
                    raise TerrainCoverageError(f'Terrain cache identity mismatch: {path}')
                return TerrainHorizon(site.siteId, cached['sitePositionM'], cached['basis'],
                                      cached['elevationDeg'], metadata)
        except (OSError, ValueError, KeyError) as error:
            raise TerrainCoverageError(f'Invalid terrain cache {path}: {error}') from error
    with LunarDem(localPath) as local, LunarDem(extendedPath) as extended:
        profile = buildHorizon(site, local, extended, config)
    profile.metadata.update(cacheKey=key, cacheIdentity=identity, cachePath=str(path.resolve()))
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=root, suffix='.npz', delete=False) as handle:
        temporary = Path(handle.name)
        np.savez_compressed(handle, sitePositionM=profile.sitePositionM, basis=profile.basis,
                            elevationDeg=profile.elevationDeg, metadata=json.dumps(profile.metadata))
    temporary.replace(path)
    return profile
