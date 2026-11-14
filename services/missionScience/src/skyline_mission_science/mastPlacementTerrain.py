import math

import numpy as np

from .intermediateCache import identityKey
from .schemas import Site
from .terrainHorizon import LUNAR_RADIUS_M, TerrainCoverageError, localBasis, unitVector


def candidateOffsets(searchRadiusM, gridResolutionM):
    if (
        not math.isfinite(searchRadiusM)
        or not math.isfinite(gridResolutionM)
        or searchRadiusM < 0
        or gridResolutionM <= 0
    ):
        raise ValueError(
            'Finite nonnegative radius and positive grid resolution required'
        )
    extent = math.floor(searchRadiusM / gridResolutionM)
    if extent > 4:
        raise ValueError('Maximum 49 generated grid locations')
    offsets = []
    for northIndex in range(-extent, extent + 1):
        for eastIndex in range(-extent, extent + 1):
            eastM, northM = eastIndex * gridResolutionM, northIndex * gridResolutionM
            if math.hypot(eastM, northM) <= searchRadiusM:
                offsets.append((float(eastM), float(northM)))
    if len(offsets) > 49:
        raise ValueError('Maximum 49 generated grid locations')
    return sorted(
        offsets, key=lambda offset: (math.hypot(*offset), offset[1], offset[0])
    )


def offsetCoordinates(latitudeDeg, longitudeDeg, eastM, northM):
    if not np.isfinite([latitudeDeg, longitudeDeg, eastM, northM]).all():
        raise ValueError('Finite coordinates and offsets required')
    basis = localBasis(latitudeDeg, longitudeDeg)
    distanceM = math.hypot(eastM, northM)
    if distanceM == 0:
        return float(latitudeDeg), float(longitudeDeg)
    if distanceM >= math.pi * LUNAR_RADIUS_M:
        raise ValueError('Offset must be shorter than a reference-sphere semicircle')
    angle = distanceM / LUNAR_RADIUS_M
    tangent = (eastM * basis[0] + northM * basis[1]) / distanceM
    direction = math.cos(angle) * basis[2] + math.sin(angle) * tangent
    latitude = math.degrees(math.atan2(direction[2], math.hypot(*direction[:2])))
    longitude = math.degrees(math.atan2(direction[1], direction[0]))
    return latitude, longitude


def coordinateOffsets(latitudeDeg, longitudeDeg, targetLatitudeDeg, targetLongitudeDeg):
    basis = localBasis(latitudeDeg, longitudeDeg)
    target = unitVector(targetLatitudeDeg, targetLongitudeDeg)
    cosine = float(np.clip(target @ basis[2], -1, 1))
    projected = target - cosine * basis[2]
    sine = float(np.linalg.norm(projected))
    if sine < 1e-15:
        if cosine < 0:
            raise ValueError('Antipodal offset direction is ambiguous')
        return 0.0, 0.0
    tangent = projected * (LUNAR_RADIUS_M * math.atan2(sine, cosine) / sine)
    return float(tangent @ basis[0]), float(tangent @ basis[1])


def candidateSite(referenceSite, eastM, northM):
    if eastM == 0 and northM == 0:
        return referenceSite
    latitude, longitude = offsetCoordinates(
        referenceSite.latitudeDeg, referenceSite.longitudeDeg, eastM, northM
    )
    identity = dict(
        reference=referenceSite.model_dump(),
        eastM=eastM,
        northM=northM,
        mapping='spherical-exponential-map/1.0.0',
        radiusM=LUNAR_RADIUS_M,
    )
    return Site(
        siteId=referenceSite.siteId + '-p-' + identityKey(identity)[:20],
        latitudeDeg=latitude,
        longitudeDeg=longitude,
        sourceFrame=referenceSite.sourceFrame,
        sourceUrl=f'SKYLINE spherical offset from {referenceSite.siteId}; reference coordinate source {referenceSite.sourceUrl}',
    )


def sampleCandidateTerrain(dem, site):
    groundM = float(dem.heights(site.latitudeDeg, site.longitudeDeg))
    stepM = 2 * max(dem.dataset.res)
    offsets = [(stepM, 0), (-stepM, 0), (0, stepM), (0, -stepM)]
    probes = [
        offsetCoordinates(site.latitudeDeg, site.longitudeDeg, *offset)
        for offset in offsets
    ]
    common = dict(
        groundElevationM=groundM,
        slopeProbeStepM=stepM,
        slopeFootprintDiameterM=2 * stepM,
        demResolutionM=list(dem.dataset.res),
        unresolvedMicrotopography=True,
        constructionSafetyValidated=False,
    )
    try:
        heights = dem.heights(
            [point[0] for point in probes], [point[1] for point in probes]
        )
    except TerrainCoverageError as error:
        return dict(
            **common,
            estimatedSlopeDeg=None,
            slopeQuality='unavailable: incomplete DEM slope footprint',
            terrainError=str(error),
        )
    eastGradient = float((heights[0] - heights[1]) / (2 * stepM))
    northGradient = float((heights[2] - heights[3]) / (2 * stepM))
    slopeDeg = math.degrees(math.atan(math.hypot(eastGradient, northGradient)))
    return dict(
        **common,
        estimatedSlopeDeg=slopeDeg,
        slopeQuality='DEM-scale central-difference estimate',
        terrainError=None,
    )
