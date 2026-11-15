from importlib.metadata import version
import hashlib
import json
import os
from pathlib import Path
import threading
from dataclasses import asdict
import numpy as np
import spiceypy as spice
from .schemas import Site, EvaluationRequest, EvaluationResponse
from .siteCatalog import resolveSite, loadCatalog, catalogPath
from .lunarSites import southPoleSites, LunarSite
from .spiceGeometry import loadSpice
from .terrainHorizon import cachedHorizon, HorizonConfig, TerrainCoverageError
from .visibility import diskFraction, eventIntervals
from .intermediateCache import ScientificCache, implementationIdentity, identityKey as cacheIdentityKey

scienceLock = threading.Lock()

def fileHash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

class Engine:
    def __init__(self, assetRoot=None, cacheRoot=None):
        self.assetRoot = Path(assetRoot or os.environ.get('SKYLINE_ASSET_ROOT', 'data/raw')).resolve()
        self.cacheRoot = Path(cacheRoot or 'data/cache').resolve()
        self.sites = {site.siteId: resolveSite(site.siteId) for site in southPoleSites}
        self.memo = {}
        self.horizonCache = ScientificCache(32)
        self.ephemerisCache = ScientificCache(200000)

    def evaluate(self, request):
        request = EvaluationRequest.model_validate(request)
        if not scienceLock.acquire(blocking=False):
            return EvaluationResponse(dataState='unavailable', error={'code':'busy','message':'One scientific evaluation is admitted at a time'})
        try:
            return self.compute(request)
        except (ValueError, OSError, spice.utils.exceptions.SpiceyError) as error:
            return EvaluationResponse(dataState='unavailable', error={'code':'scientific_unavailable','message':str(error)})
        finally:
            scienceLock.release()

    def compute(self, request, observerHeightM=0., horizonConfig=None):
        config = horizonConfig or HorizonConfig(observerHeightM=observerHeightM)
        if config.observerHeightM != observerHeightM:
            raise ValueError('Observer height and horizon configuration disagree')
        site = resolveSite(request.site) if isinstance(request.site, str) else request.site
        if site is None:
            raise TerrainCoverageError('Unknown or unverified site identifier')
        localPath = self.assetRoot / f'lola/LDEM_80S_{request.localResolutionM}MPP_ADJ.TIF'
        extendedPath = self.assetRoot / 'lola/LDEM_60S_240MPP_ADJ.TIF'
        terrainPaths = [localPath, extendedPath]
        if request.localResolutionM == 1895.21:
            localPath = extendedPath = self.assetRoot / 'lola/LDEM_16.IMG'
            terrainPaths = [localPath, localPath.with_suffix('.LBL')]
        demHashes = {str(path): fileHash(path) for path in terrainPaths}
        with loadSpice(self.assetRoot / 'spice') as kernels:
            kernelHashes = {path.name: fileHash(path) for path in kernels}
            identity = dict(catalogueSha256=fileHash(catalogPath), version='0.4.0', terrainConfig=asdict(config), engineVersion=version('skyline-mission-science'), implementation=dict(**implementationIdentity(), catalogueSha256=fileHash(catalogPath)), resolvedSite=site.model_dump(), request=request.model_dump(mode='json'), kernels=kernelHashes, dems=demHashes)
            identityKey = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
            if identityKey in self.memo:
                response = self.memo[identityKey].model_copy(deep=True)
                response.provenance['execution'] = 'cached'
                return response
            terrainSite = LunarSite(site.siteId, site.siteId, site.latitudeDeg, site.longitudeDeg, site.sourceFrame, site.sourceUrl)
            horizonKey = cacheIdentityKey(dict(site=site.model_dump(),dems=demHashes,config=asdict(config),implementation=identity['implementation']))
            horizon = self.horizonCache.get(horizonKey, lambda: cachedHorizon(terrainSite, localPath, extendedPath, self.cacheRoot / 'horizons', config=config))
            epochEt = spice.str2et(request.startUtc.isoformat().replace('+00:00','Z'))
            correction = 'NONE' if request.profile == 'geometric' else 'LT+S'
            kernelKey = cacheIdentityKey(kernelHashes)
            sourceKey = cacheIdentityKey(identity['implementation'])
            def tracks(body, offsets):
                positions = []
                for offset in offsets:
                    key = (kernelKey, tuple(horizon.sitePositionM), correction, body, float(epochEt+offset), 'MOON_ME_DE421', sourceKey)
                    vector = self.ephemerisCache.get(key, lambda: spice.spkcpo(body, epochEt+float(offset), 'MOON_ME_DE421', 'OBSERVER', correction, horizon.sitePositionM/1000, 'MOON', 'MOON_ME_DE421')[0][:3].copy())
                    positions.append(vector)
                enu = np.asarray(positions) @ horizon.basis.T
                azimuth = np.mod(np.degrees(np.arctan2(enu[:,0], enu[:,1])),360.)
                elevation = np.degrees(np.arctan2(enu[:,2],np.hypot(enu[:,0],enu[:,1])))
                ranges = np.linalg.norm(positions,axis=1)
                radius = np.degrees(np.arcsin((695700. if body == 'SUN' else 6371.)/ranges))
                # Periodic sector envelopes retained from the inherited horizon implementation.
                indices = np.floor(azimuth/360*len(horizon.elevationDeg)).astype(int)%len(horizon.elevationDeg)
                terrain = np.maximum(0.,horizon.elevationDeg[indices]+request.horizonOffsetDeg)
                clearance = elevation-terrain
                return dict(azimuthDeg=azimuth,elevationDeg=elevation,angularRadiusDeg=radius,clearanceDeg=clearance,
                            visibleDiskFraction=diskFraction(clearance,radius))
            times = np.unique(np.r_[np.arange(0.,request.durationS,request.cadenceS),request.durationS])
            bodies = {}
            for body in ('SUN','EARTH'):
                bodyTracks = tracks(body,times)
                adjustment = {'center':0,'anyDisk':1,'fullDisk':-1}[request.solarDefinition] if body == 'SUN' else 0
                def margin(offsets):
                    values = tracks(body,offsets)
                    return values['clearanceDeg']+adjustment*values['angularRadiusDeg']
                intervals = eventIntervals(margin,request.durationS,request.cadenceS,request.eventToleranceS)
                intervals['eventType'] = 'sunrise/sunset' if body == 'SUN' else 'earthrise/earthset'
                if body == 'SUN':
                    def limbMargin(offsets, sign):
                        values = tracks(body, offsets)
                        return values['clearanceDeg'] + sign * values['angularRadiusDeg']
                    intervals['diskPhaseWindows'] = {
                        'anyDisk': eventIntervals(lambda offsets: limbMargin(offsets, 1), request.durationS, request.cadenceS, request.eventToleranceS),
                        'fullDisk': eventIntervals(lambda offsets: limbMargin(offsets, -1), request.durationS, request.cadenceS, request.eventToleranceS),
                    }
                    fraction = bodyTracks['visibleDiskFraction']
                    bodyTracks['diskClass'] = np.where(fraction <= 0, 'obscured', np.where(fraction >= 1, 'full', 'partial'))
                bodies[body] = {**{key:value.tolist() for key,value in bodyTracks.items()},**intervals}
            solar, earth = bodies['SUN'],bodies['EARTH']
            constraints = request.constraints
            violations = dict(solarDeficit=max(0.,constraints.minimumSolar-solar['visibleFraction']),
                              earthDeficit=max(0.,constraints.minimumEarth-earth['visibleFraction']),
                              solarOutageExcessS=max(0.,solar['maximumOutageS']-constraints.maximumSolarOutageS),
                              earthOutageExcessS=max(0.,earth['maximumOutageS']-constraints.maximumEarthOutageS))
            result = dict(site=site.model_dump(), timesS=times.tolist(), bodies=bodies,
                          horizonElevationDeg=horizon.elevationDeg.tolist(),constraints=violations,
                          feasible=not any(violations.values()))
            provenance = dict(**identity, execution='live-computed', cacheKey=identityKey,epochEt=float(epochEt),
                              frame='MOON_ME_DE421',correction=correction,interval='half-open [start,end)',
                              observer='site-topocentric, frame orientation at observation epoch',
                              diskModel='uniform circular disk, locally straight horizon at center azimuth',
                              terrain=horizon.metadata, observerPositionM=horizon.sitePositionM.tolist(),
                              limitations=['Possible missed subcadence events and tangencies','Sector horizon is discontinuous',
                                           'Zero-degree elevation floor','Earth center geometry only',
                                           'Terrain perturbations are uncalibrated scenarios','Root tolerance is numerical',
                                           'Solar disk ignores variation of terrain across disk'])
            catalogueEntry = next((entry for entry in loadCatalog()['sites'] if entry['canonicalId'] == site.siteId), None) if isinstance(request.site, str) else None
            if catalogueEntry and catalogueEntry.get('evaluationQualification'):
                provenance['limitations'].append(catalogueEntry['evaluationQualification'])
            if request.localResolutionM == 1895.21:
                provenance['limitations'].extend(['Coarse global LOLA terrain has nominal 1895.21 m spacing; subpixel ridges and hazards are unresolved', 'Exploratory site evaluation has no independent site-specific visibility validation', 'Observer ground elevation is sampled from the declared DEM; published site elevations retain their separate provenance'])
            response = EvaluationResponse(dataState='computed',result=result,provenance=provenance)
            if len(self.memo) >= 32:
                self.memo.pop(next(iter(self.memo)))
            self.memo[identityKey] = response
            return response





