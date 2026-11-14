import math

import numpy as np
from skyline_mission_science.engine import fileHash
from skyline_mission_science.intermediateCache import identityKey
from skyline_mission_science.mastPlacementTerrain import sampleCandidateTerrain
from skyline_mission_science.schemas import Site
from skyline_mission_science.terrainHorizon import (
    LunarDem,
    TerrainCoverageError,
    LUNAR_RADIUS_M,
    unitVector,
)

from .roverModels import RoverGrid, RoverPoint, RoverEdge


def pointSite(reference, latitudeDeg, longitudeDeg):
    if latitudeDeg == reference.latitudeDeg and longitudeDeg == reference.longitudeDeg:
        return reference
    key = identityKey(
        dict(
            reference=reference.model_dump(),
            latitudeDeg=latitudeDeg,
            longitudeDeg=longitudeDeg,
            frame=reference.sourceFrame,
        )
    )
    return Site(
        siteId='rover-' + key[:24],
        latitudeDeg=latitudeDeg,
        longitudeDeg=longitudeDeg,
        sourceFrame=reference.sourceFrame,
        sourceUrl=f'SKYLINE projected LOLA grid from {reference.siteId}; reference source {reference.sourceUrl}',
    )


def buildRoverGrid(assetRoot, reference, request):
    path = assetRoot / 'lola' / request.terrainDemId
    with LunarDem(path) as dem:
        metadata = dem.metadata()
        metadata['sha256'] = fileHash(path)
        centerX, centerY = dem.xy(reference.latitudeDeg, reference.longitudeDeg)
        side = 2 * request.gridRadiusCells + 1
        points, sites, edges = [], [], []

        def addPoint(x, y, row=None, column=None):
            if row == request.gridRadiusCells and column == request.gridRadiusCells:
                site = reference
            else:
                longitude, latitude = dem.inverse.transform(x, y, errcheck=True)
                site = pointSite(reference, latitude, longitude)
            try:
                terrain = sampleCandidateTerrain(dem, site)
                valid = terrain['estimatedSlopeDeg'] is not None
                position = (
                    unitVector(site.latitudeDeg, site.longitudeDeg)
                    * (LUNAR_RADIUS_M + terrain['groundElevationM'])
                ).tolist()
                point = RoverPoint(
                    pointId=site.siteId,
                    latitudeDeg=site.latitudeDeg,
                    longitudeDegEast=site.longitudeDeg % 360,
                    groundElevationM=terrain['groundElevationM'],
                    estimatedSlopeDeg=terrain['estimatedSlopeDeg'],
                    terrainValid=valid,
                    terrainReason=terrain['terrainError'],
                    surfacePositionM=position,
                    row=row,
                    column=column,
                    projectedXM=x,
                    projectedYM=y,
                )
            except TerrainCoverageError as error:
                point = RoverPoint(
                    pointId=site.siteId,
                    latitudeDeg=site.latitudeDeg,
                    longitudeDegEast=site.longitudeDeg % 360,
                    groundElevationM=None,
                    estimatedSlopeDeg=None,
                    terrainValid=False,
                    terrainReason=str(error),
                    surfacePositionM=None,
                    row=row,
                    column=column,
                    projectedXM=x,
                    projectedYM=y,
                )
            points.append(point)
            sites.append(site)
            return len(points) - 1

        cells = []
        for row in range(side):
            for column in range(side):
                cells.append(
                    addPoint(
                        centerX
                        + (column - request.gridRadiusCells) * request.gridResolutionM,
                        centerY
                        + (request.gridRadiusCells - row) * request.gridResolutionM,
                        row,
                        column,
                    )
                )
        valid = [points[index].terrainValid for index in cells]
        traversable = [
            pointValid
            and points[cells[index]].estimatedSlopeDeg <= request.maximumSlopeDeg
            for index, pointValid in enumerate(valid)
        ]
        for cell in range(side * side):
            row, column = divmod(cell, side)
            for target in ([cell + 1] if column + 1 < side else []) + (
                [cell + side] if row + 1 < side else []
            ):
                first, last = points[cells[cell]], points[cells[target]]
                midpoint = addPoint(
                    (first.projectedXM + last.projectedXM) / 2,
                    (first.projectedYM + last.projectedYM) / 2,
                )
                middle = points[midpoint]
                supported = (
                    traversable[cell] and traversable[target] and middle.terrainValid
                )
                distance, grade, reason = None, None, None
                if supported:
                    segments = [(first, middle), (middle, last)]
                    distance = sum(
                        float(
                            np.linalg.norm(
                                np.asarray(b.surfacePositionM) - a.surfacePositionM
                            )
                        )
                        for a, b in segments
                    )
                    grades = []
                    for a, b in segments:
                        u, v = (
                            unitVector(a.latitudeDeg, a.longitudeDegEast),
                            unitVector(b.latitudeDeg, b.longitudeDegEast),
                        )
                        horizontal = LUNAR_RADIUS_M * math.atan2(
                            float(np.linalg.norm(np.cross(u, v))), float(u @ v)
                        )
                        grades.append(
                            math.degrees(
                                math.atan2(
                                    abs(b.groundElevationM - a.groundElevationM),
                                    horizontal,
                                )
                            )
                        )
                    grade = max(grades)
                    supported = (
                        grade <= request.maximumSlopeDeg
                        and middle.estimatedSlopeDeg <= request.maximumSlopeDeg
                    )
                    if not supported:
                        reason = 'slope_limit'
                else:
                    reason = 'invalid_or_steep_cell_or_midpoint'
                edges.append(
                    RoverEdge(
                        sourceCell=cell,
                        targetCell=target,
                        midpointPoint=midpoint,
                        traversable=supported,
                        distanceM=distance,
                        maximumSegmentGradeDeg=grade,
                        reason=reason,
                    )
                )
        reshape = lambda values: [
            values[index : index + side] for index in range(0, len(values), side)
        ]
        grid = RoverGrid(
            rows=side,
            columns=side,
            startCell=request.gridRadiusCells * side + request.gridRadiusCells,
            projectionId=request.projectionId,
            projectionWkt=metadata['crsWkt'],
            projectedCellDimensionsM=[request.gridResolutionM] * 2,
            affineCornerTransform=[
                request.gridResolutionM,
                0,
                centerX - (request.gridRadiusCells + 0.5) * request.gridResolutionM,
                0,
                -request.gridResolutionM,
                centerY + (request.gridRadiusCells + 0.5) * request.gridResolutionM,
            ],
            terrainValidMask=reshape(valid),
            terrainTraversableMask=reshape(traversable),
            points=points,
            cellPointIndices=cells,
            edges=edges,
            dem=metadata,
            referenceSite=reference.model_dump(),
            slopeProbeStepM=2 * max(dem.dataset.res),
            slopeFootprintDiameterM=4 * max(dem.dataset.res),
        )
    return grid, sites
