import copy
import math

import numpy as np
import pytest
import rasterio
from pyproj import CRS
from pydantic import ValidationError
from rasterio.transform import from_origin

from skyline_mission_science.schemas import Site
from skyline_rover_science.roverModels import (
    RoverRequest,
    RoverGrid,
    RoverPoint,
    RoverEdge,
)
from skyline_rover_science.roverTerrain import buildRoverGrid
from skyline_rover_science.roverGraph import (
    timeExpandedReachability,
    RoverBudgetExceeded,
)
from skyline_rover_science.roverEvaluation import (
    RoverEngine,
    relayCompatibility,
    replayArrays,
)


def request(**changes):
    return RoverRequest.model_validate(
        dict(
            site='CR1',
            startUtc='2025-01-06T00:00:00Z',
            durationS=480,
            timeStepS=60,
            speedMps=1,
            maximumSlopeDeg=20,
        )
        | changes
    )


def flatGrid(spacing=80, side=3):
    points = []
    for row in range(side):
        for column in range(side):
            points.append(
                RoverPoint(
                    pointId=f'synthetic-{row}-{column}',
                    latitudeDeg=0,
                    longitudeDegEast=0,
                    groundElevationM=0,
                    estimatedSlopeDeg=0,
                    terrainValid=True,
                    terrainReason=None,
                    surfacePositionM=[column * spacing, row * spacing, 0],
                    row=row,
                    column=column,
                    projectedXM=column * spacing,
                    projectedYM=-row * spacing,
                )
            )
    edges = []
    for cell in range(side * side):
        row, column = divmod(cell, side)
        for target in ([cell + 1] if column < side - 1 else []) + (
            [cell + side] if row < side - 1 else []
        ):
            middle = points[cell].model_copy(
                update={
                    'pointId': f'synthetic-mid-{cell}-{target}',
                    'row': None,
                    'column': None,
                }
            )
            points.append(middle)
            edges.append(
                RoverEdge(
                    sourceCell=cell,
                    targetCell=target,
                    midpointPoint=len(points) - 1,
                    traversable=True,
                    distanceM=spacing,
                    maximumSegmentGradeDeg=0,
                    reason=None,
                )
            )
    return RoverGrid(
        rows=side,
        columns=side,
        startCell=(side // 2) * side + side // 2,
        projectionId='synthetic-flat-grid',
        projectionWkt='synthetic analytical fixture',
        projectedCellDimensionsM=[spacing, spacing],
        affineCornerTransform=[spacing, 0, 0, 0, -spacing, 0],
        terrainValidMask=[[True] * side for _ in range(side)],
        terrainTraversableMask=[[True] * side for _ in range(side)],
        points=points,
        cellPointIndices=list(range(side * side)),
        edges=edges,
        dem={'origin': 'synthetic analytical fixture'},
        referenceSite={'origin': 'synthetic'},
        slopeProbeStepM=160,
        slopeFootprintDiameterM=320,
    )


def run(grid, req=None, sun=None, communication=None):
    req = req or request()
    shape = (len(grid.points), req.durationS // req.timeStepS + 1)
    return timeExpandedReachability(
        grid,
        req,
        np.ones(shape, dtype=bool) if sun is None else sun,
        np.ones(shape, dtype=bool) if communication is None else communication,
        [f'synthetic-time-{index}' for index in range(shape[1])],
    )


def testAnalyticalFlatGraphAndNoTimeTravel():
    grid = flatGrid()
    result = run(grid)
    assert result.earliestArrivalS == [[240, 120, 240], [120, 0, 120], [240, 120, 240]]
    assert result.reachableMask == [[True] * 3 for _ in range(3)]
    assert sum(result.reachedAtTimeMask[0]) == 1
    assert sum(result.reachedAtTimeMask[1]) == 1
    assert result.model_dump() == run(grid).model_dump()
    for edge in grid.edges:
        snapped = (
            math.ceil(edge.distanceM / request().speedMps / request().timeStepS)
            * request().timeStepS
        )
        assert snapped >= edge.distanceM / request().speedMps


@pytest.mark.parametrize('condition', ['sunlight', 'communication'])
def testMovementSamplesMidpointAtIntermediateTimes(condition):
    grid = flatGrid()
    req = request()
    mask = np.ones((len(grid.points), 9), dtype=bool)
    edge = next(
        edge for edge in grid.edges if edge.sourceCell == 4 and edge.targetCell == 5
    )
    mask[edge.midpointPoint, 1] = False
    result = run(
        grid,
        req,
        sun=mask if condition == 'sunlight' else None,
        communication=mask if condition == 'communication' else None,
    )
    assert result.earliestArrivalS[1][2] == 240


def testWaitingRulesAndUnknownTerrainExclusion():
    grid = flatGrid()
    dark = np.ones((len(grid.points), 9), dtype=bool)
    dark[4, 1] = False
    blocked = run(grid, sun=dark)
    assert blocked.reachableMask[1] == [False, True, False]
    permitted = run(grid, request(stoppingRequiresSunlight=False), sun=dark)
    assert permitted.earliestArrivalS[1][2] == 240
    for cell in [1, 3]:
        grid.terrainValidMask[cell // 3][cell % 3] = False
        grid.terrainTraversableMask[cell // 3][cell % 3] = False
        grid.points[cell].terrainValid = False
    result = run(grid)
    assert result.reachableMask[0][0] is False
    assert result.reachableMask[0][1] is None
    assert result.reachableMask[1][0] is None


def testSpaceTimeSensitivityAndBudgetFailures():
    coarse = run(flatGrid())
    fineTime = run(flatGrid(), request(timeStepS=30))
    fineSpace = run(flatGrid(160))
    assert coarse.earliestArrivalS[1][2] == 120
    assert fineTime.earliestArrivalS[1][2] == 90
    assert fineSpace.earliestArrivalS[1][2] == 180
    assert run(flatGrid(), request(allowWaiting=False)).waitingOpportunityBinMask == [
        [False] * 9 for _ in range(8)
    ]
    with pytest.raises(RoverBudgetExceeded):
        run(flatGrid(), request(budget=dict(maxTransitions=1)))
    with pytest.raises(ValidationError):
        request(budget=dict(maxGraphNodes=1))
    with pytest.raises(ValidationError):
        request(budget=dict(maxGeometryEvaluations=20))
    with pytest.raises(ValidationError):
        request(timeStepS=70)
    with pytest.raises(ValueError):
        run(flatGrid(), sun=np.ones(9, dtype=bool))


def testActualProjectedFlatSlopeAndNoDataFixtures(tmp_path):
    path = tmp_path / 'lola/LDEM_80S_80MPP_ADJ.TIF'
    path.parent.mkdir()
    crs = CRS.from_proj4(
        '+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m'
    )
    transform = from_origin(-2000, 2000, 80, 80)
    rows, cols = np.indices((50, 50))
    x = -2000 + (cols + 0.5) * 80
    reference = Site(
        siteId='synthetic-pole',
        latitudeDeg=-90,
        longitudeDeg=0,
        sourceUrl='synthetic analytical fixture',
    )
    for slope in [0, 0.5]:
        with rasterio.open(
            path,
            'w',
            driver='GTiff',
            height=50,
            width=50,
            count=1,
            dtype='float64',
            crs=crs.to_wkt(),
            transform=transform,
            nodata=-9999,
        ) as ds:
            ds.write((slope * x).astype('float64'), 1)
            ds.update_tags(origin='synthetic analytical fixture')
        grid, _ = buildRoverGrid(tmp_path, reference, request())
        assert all(all(row) for row in grid.terrainValidMask)
        assert grid.points[4].estimatedSlopeDeg == pytest.approx(
            math.degrees(math.atan(slope)), abs=1e-5
        )
        if slope == 0:
            assert all(
                edge.traversable and edge.distanceM == pytest.approx(80, abs=1e-5)
                for edge in grid.edges
            )
        else:
            assert not any(any(row) for row in grid.terrainTraversableMask)
    with rasterio.open(path, 'r+') as ds:
        data = ds.read(1)
        data[24:26, 24:26] = -9999
        ds.write(data, 1)
    grid, _ = buildRoverGrid(tmp_path, reference, request())
    assert not grid.terrainValidMask[1][1]
    assert grid.points[4].groundElevationM is None


def testRelayCompatibilityRejectsMobileAndUnverifiedObservers():
    assert relayCompatibility(request(gridRadiusCells=0, timeStepS=120)) is None
    for changes in [
        dict(gridRadiusCells=1, timeStepS=120),
        dict(gridRadiusCells=0, observerHeightM=1.8, timeStepS=120),
        dict(gridRadiusCells=0, timeStepS=60),
        dict(gridRadiusCells=0, timeStepS=120, startUtc='2026-11-20T00:00:00Z'),
        dict(
            gridRadiusCells=0,
            timeStepS=120,
            startUtc='2025-01-28T23:58:00Z',
            durationS=120,
        ),
    ]:
        assert relayCompatibility(request(**changes)) is not None


def syntheticReplay(grid, req):
    levels = req.durationS // 120 + 1
    hashes = {
        'naif0012.tls': 'synthetic-kernel-hash',
        'candidate2States.csv': '0f328f101228015d55ad301c512ffec27091beb02adb3649d3276669b1f54bce',
    }
    provenance = dict(
        frame='MOON_ME_DE421',
        correction='NONE',
        observerHeightM=0,
        minimumElevationDeg=0,
        rfQualified=False,
        request=dict(
            siteId='CR1',
            candidateId='nominal-candidate-2',
            cadenceS=120,
            durationS=req.durationS + 120,
            startUtc=req.startUtc.isoformat(),
        ),
        sources=hashes,
        sitePositionM=grid.points[0].surfacePositionM,
        epochEt=123,
    )
    mission = dict(
        frame='MOON_ME_DE421',
        correction='NONE',
        observerPositionM=grid.points[0].surfacePositionM,
        epochEt=123,
    )
    times = list(range(0, req.durationS + 120, 120))
    return dict(
        origin='synthetic contract fixture',
        dataState='computed',
        missionScience=dict(
            dataState='computed',
            provenance=mission,
            result=dict(
                timesS=times + [req.durationS + 120],
                bodies={
                    'EARTH': {'clearanceDeg': [-1] * (levels + 1)},
                    'SUN': {
                        'visibleDiskFraction': [0.5] * (levels + 1),
                        'clearanceDeg': [-0.1] * (levels + 1),
                    },
                },
            ),
        ),
        relayScience=dict(
            dataState='computed',
            provenance=provenance,
            result=dict(
                timesS=times,
                directAvailable=[False] * levels,
                assistedAvailable=[True] * levels,
                viaRelayAvailable=[True] * levels,
                siteRelayAvailable=[[True] * levels, [False] * levels],
                relayEarthAvailable=[[True] * levels, [True] * levels],
            ),
        ),
    )


def testReplayExactGridHopAndObserverChecks():
    grid = flatGrid()
    grid.points[0].surfacePositionM = [1, 2, 3]
    req = request(gridRadiusCells=0, timeStepS=120, durationS=240)
    raw = syntheticReplay(grid, req)
    result = replayArrays(raw, grid, req, {'naif0012.tls': 'synthetic-kernel-hash'})
    assert (
        result[0] == [True] * 3 and result[1] == [False] * 3 and result[2] == [True] * 3
    )
    for field in ['hops', 'observer', 'time', 'hash', 'parity']:
        changed = copy.deepcopy(raw)
        relay = changed['relayScience']
        if field == 'hops':
            relay['result']['relayEarthAvailable'][0][0] = False
        elif field == 'observer':
            relay['provenance']['sitePositionM'][0] += 1
        elif field == 'time':
            relay['result']['timesS'][0] = 1
        elif field == 'hash':
            relay['provenance']['sources']['naif0012.tls'] = 'changed'
        else:
            relay['result']['directAvailable'][0] = True
        with pytest.raises(ValueError):
            replayArrays(changed, grid, req, {'naif0012.tls': 'synthetic-kernel-hash'})


def testIsolatedAPIExplicitErrorsAndReadiness(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import skyline_rover_science.api as api

    monkeypatch.setattr(api, 'engine', RoverEngine(tmp_path, tmp_path / 'cache'))
    client = TestClient(api.app)
    assert client.get('/health').status_code == 200
    payload = request(gridRadiusCells=0, timeStepS=120).model_dump(mode='json')
    missing = client.post('/v1/reachability-evaluations', json=payload)
    assert (
        missing.json()['dataState'] == 'unavailable'
        and missing.json()['result'] is None
    )
    unsupported = client.post(
        '/v1/reachability-evaluations', json=payload | {'site': 'apollo11'}
    )
    assert unsupported.json()['dataState'] == 'unsupported'
    assert (
        client.post(
            '/v1/reachability-evaluations', json=payload | {'speedMps': 0}
        ).status_code
        == 422
    )
    assert (
        client.post('/v1/reachability-evaluations', content=b' ' * 65537).status_code
        == 413
    )
    api.requestGate.acquire()
    try:
        assert (
            client.post('/v1/reachability-evaluations', json=payload).status_code == 503
        )
    finally:
        api.requestGate.release()


def testFixedDomainSpaceTimeSnappingSensitivity():
    coarse = run(flatGrid(80, 3), request(timeStepS=30))
    fine = run(flatGrid(40, 5), request(timeStepS=30))
    assert coarse.earliestArrivalS[0][0] == 180
    assert fine.earliestArrivalS[0][0] == 240
    # Both paths have 160 m Manhattan length. Per-edge upward snapping accumulates.
    assert coarse.earliestArrivalS[0][0] >= 160
    assert fine.earliestArrivalS[0][0] >= 160


def testExtremelySlowSpeedProducesNoOverflowOrImpossibleEdges():
    result = run(flatGrid(), request(speedMps=1e-309))
    assert result.reachableMask == [
        [False, False, False],
        [False, True, False],
        [False, False, False],
    ]


def testRealExampleSchemasAndExportedGraphConsistency():
    import json
    from pathlib import Path
    import jsonschema
    from pydantic import TypeAdapter
    from skyline_rover_science.roverModels import RoverResponse

    root = Path(__file__).resolve().parents[2]
    raw = json.loads((root / 'examples/roverResponse.computed.json').read_text())
    for name, value in [('roverRequest', raw['request']), ('roverResponse', raw)]:
        schema = json.loads(
            (root / f'docs/roverSchemas/{name}.schema.json').read_text()
        )
        jsonschema.validate(value, schema)
    response = TypeAdapter(RoverResponse).validate_python(raw)
    assert response.provenance['independentlyValidated'] is False
    assert len(response.provenance['kernels']) == 7
    assert len(response.provenance['dems']) == 2
    points = response.result.visibility['points']
    levels = len(response.result.timeGrid.timestampsUtc)
    sun = np.zeros((len(points), levels), dtype=bool)
    direct = sun.copy()
    for point in points:
        if point['dataState'] == 'computed':
            sun[point['pointIndex']] = point['sunAvailable']
            direct[point['pointIndex']] = point['directAvailable']
    replayed = timeExpandedReachability(
        response.result.grid,
        response.request,
        sun,
        direct,
        response.result.timeGrid.timestampsUtc,
    )
    assert replayed.model_dump() == response.result.directOnly.model_dump()
    assert sum(value is True for row in replayed.reachableMask for value in row) == 4
