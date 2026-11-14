import copy
import math
from pathlib import Path
from types import SimpleNamespace

import jsonschema
import numpy as np
import pytest
import rasterio
from pyproj import CRS
from pydantic import TypeAdapter, ValidationError
from rasterio.transform import from_origin

from skyline_mission_science.engine import Engine
from skyline_mission_science.mastPlacement import (
    evaluateMastPlacement,
    placementEnvironment,
)
from skyline_mission_science.mastPlacementModels import (
    MastPlacementRequest,
    MastPlacementResponse,
)
from skyline_mission_science.mastPlacementSelection import (
    placementRanks,
    placementViolations,
)
from skyline_mission_science.mastPlacementTerrain import (
    candidateOffsets,
    candidateSite,
    coordinateOffsets,
    offsetCoordinates,
    sampleCandidateTerrain,
)
from skyline_mission_science.mastFeeds import MastFeedV1, mastFeed, writeMastFeed
from skyline_mission_science.schemas import Site
from skyline_mission_science.siteCatalog import resolveSite
from skyline_mission_science.terrainHorizon import (
    LunarDem,
    TerrainCoverageError,
    unitVector,
)

root = Path(__file__).resolve().parents[2]


def placementRequest(**overrides):
    return MastPlacementRequest.model_validate(
        dict(
            site='CR1',
            startUtc='2025-01-06T00:00:00Z',
            durationS=3600,
            cadenceS=1800,
            searchRadiusM=80,
            gridResolutionM=80,
            mastHeightsM=[0, 2],
            maximumCableLengthM=80,
            verticalAzimuthDeg=90,
            evaluationBudget=dict(maxEvaluations=10, maxWallTimeS=300),
        )
        | overrides
    )


@pytest.fixture(scope='module')
def realPlacement():
    engine = Engine(root / 'data/raw', root / 'data/cache')
    request = placementRequest()
    response = evaluateMastPlacement(engine, request)
    assert response.dataState == 'computed', response
    assert response.result.optimization.complete, response
    return engine, request, response


def testSphericalOffsetAnalyticalAndRoundTrips():
    distance = 1000
    assert offsetCoordinates(0, 0, distance, 0) == pytest.approx(
        (0, math.degrees(distance / 1737400)), abs=1e-12
    )
    assert offsetCoordinates(0, 0, 0, distance) == pytest.approx(
        (math.degrees(distance / 1737400), 0), abs=1e-12
    )
    for siteId in ['CR1', 'GR1', 'SR1']:
        site = resolveSite(siteId)
        assert offsetCoordinates(site.latitudeDeg, site.longitudeDeg, 0, 0) == (
            site.latitudeDeg,
            site.longitudeDeg,
        )
        for east, north in [(80, 0), (-80, 160), (0, -1000), (3000, 3000)]:
            latitude, longitude = offsetCoordinates(
                site.latitudeDeg, site.longitudeDeg, east, north
            )
            assert coordinateOffsets(
                site.latitudeDeg, site.longitudeDeg, latitude, longitude
            ) == pytest.approx((east, north), abs=1e-7)
    with pytest.raises(ValueError):
        offsetCoordinates(0, 0, float('nan'), 0)


def testGridReproducibilityAndNestedSpatialResolution():
    coarse = candidateOffsets(160, 160)
    fine = candidateOffsets(160, 80)
    assert len(coarse) == 5 and len(fine) == 13
    assert coarse[0] == fine[0] == (0, 0)
    assert set(coarse) <= set(fine)
    assert candidateOffsets(160, 80) == fine
    site = resolveSite('CR1')
    for offset in coarse:
        assert candidateSite(site, *offset) == candidateSite(
            site, *fine[fine.index(offset)]
        )
    assert candidateOffsets(0, 80) == [(0, 0)]
    with pytest.raises(ValueError):
        candidateOffsets(5000, 1)


def testFlatAndPlanarDEMSlopeFixtures(tmp_path):
    path = tmp_path / 'syntheticPlane.tif'
    crs = CRS.from_proj4(
        '+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m'
    )
    transform = from_origin(-1000, 1000, 20, 20)
    rows, columns = np.indices((100, 100))
    east = -1000 + (columns + 0.5) * 20
    north = 1000 - (rows + 0.5) * 20
    for eastSlope, northSlope in [(0, 0), (0.1, 0.2)]:
        heights = (eastSlope * east + northSlope * north).astype('float64')
        with rasterio.open(
            path,
            'w',
            driver='GTiff',
            width=100,
            height=100,
            count=1,
            dtype='float64',
            crs=crs.to_wkt(),
            transform=transform,
        ) as raster:
            raster.write(heights, 1)
        with LunarDem(path) as dem:
            site = Site(
                siteId='synthetic-plane',
                latitudeDeg=-90,
                longitudeDeg=0,
                sourceUrl='synthetic analytical fixture',
            )
            sampled = sampleCandidateTerrain(dem, site)
            assert sampled['groundElevationM'] == pytest.approx(0, abs=1e-12)
            assert sampled['estimatedSlopeDeg'] == pytest.approx(
                math.degrees(math.atan(math.hypot(eastSlope, northSlope))), abs=1e-7
            )
            assert sampled['slopeProbeStepM'] == 40
            assert sampled['slopeFootprintDiameterM'] == 80
            assert sampled['constructionSafetyValidated'] is False


def testZeroOffsetBaselineAndExactP1Reuse(realPlacement):
    engine, request, response = realPlacement
    center = response.result.candidates[0]
    assert center.candidateId == 'CR1' and center.eastM == center.northM == 0
    independent = placementEnvironment(engine, request, 'CR1', 0)
    ground = center.outcomes[0].environment
    assert (
        ground.scenarioId
        == independent.scenarioId
        == response.result.baseline.scenarioId
    )
    assert ground.result == independent.result
    np.testing.assert_array_equal(
        ground.result.skyline.terrainElevationDeg,
        independent.result.skyline.terrainElevationDeg,
    )


def testRealDEMSamplingPositionAndCacheIsolation(realPlacement):
    engine, _, response = realPlacement
    sourceIds = set()
    positions = set()
    with LunarDem(root / 'data/raw/lola/LDEM_80S_80MPP_ADJ.TIF') as dem:
        for candidate in response.result.candidates:
            assert candidate.groundElevationM == float(
                dem.heights(candidate.site.latitudeDeg, candidate.site.longitudeDeg)
            )
            for outcome in candidate.outcomes:
                assert outcome.dataState == 'computed'
                observer = outcome.environment.result.observer
                expected = unitVector(
                    candidate.site.latitudeDeg, candidate.site.longitudeDeg
                ) * (1737400 + candidate.groundElevationM + outcome.observerHeightM)
                np.testing.assert_allclose(
                    observer.positionM, expected, atol=1e-6, rtol=0
                )
                sourceIds.add(outcome.environment.scenarioId)
                positions.add(tuple(observer.positionM))
    assert len(sourceIds) == len(positions) == 10
    assert len(engine.horizonCache.values) == 10
    assert len({key[1] for key in engine.ephemerisCache.values}) == 10


def testIndependentParetoAndHardConstraintBoundaries():
    def candidate(name, cable, height, sun, earth, blackout, feasible='feasible'):
        metrics = SimpleNamespace(
            sunlightAvailabilityFraction=sun,
            directEarthAvailabilityFraction=earth,
            longestDarkness=SimpleNamespace(durationS=blackout),
            longestDirectEarthBlackout=SimpleNamespace(durationS=blackout),
        )
        return SimpleNamespace(
            candidateId=name,
            cableDistanceM=cable,
            outcomes=[
                SimpleNamespace(
                    feasibilityStatus=feasible, metrics=metrics, observerHeightM=height
                )
            ],
        )

    records = [
        candidate('A', 0, 0, 0.5, 0.5, 50),
        candidate('B', 80, 2, 0.9, 0.9, 10),
        candidate('C', 160, 10, 0.4, 0.4, 60),
        candidate('rejected', 10, 0, 1, 1, 0, 'infeasible'),
    ]
    assert placementRanks(records) == {('A', 0): 0, ('B', 2): 0, ('C', 10): 1}
    request = placementRequest(
        maximumSlopeDeg=5,
        constraints=dict(
            minimumSolar=0.5,
            minimumEarth=0.5,
            maximumSolarOutageS=50,
            maximumEarthOutageS=50,
        ),
    )
    metrics = records[0].outcomes[0].metrics
    assert placementViolations(request, 80, 5, metrics) == []
    assert placementViolations(
        request, np.nextafter(80, np.inf), np.nextafter(5, np.inf), metrics
    ) == ['maximum_cable_length', 'maximum_DEM_scale_slope']


def testMissingTerrainAndRequiredSlopeStayUnavailable(monkeypatch, realPlacement):
    import skyline_mission_science.mastPlacement as module

    engine, _, _ = realPlacement
    original = module.sampleCandidateTerrain

    def missing(dem, site):
        if site.siteId != 'CR1':
            raise TerrainCoverageError('synthetic missing candidate terrain')
        return original(dem, site)

    monkeypatch.setattr(module, 'sampleCandidateTerrain', missing)
    response = evaluateMastPlacement(engine, placementRequest(mastHeightsM=[0]))
    assert response.dataState == 'computed', response
    assert response.result.optimization.unknownOutcomeCount == 4
    for candidate in response.result.candidates[1:]:
        assert candidate.groundElevationM is None
        assert candidate.outcomes[0].environment is None
        assert candidate.outcomes[0].dataState == 'unavailable'
        assert candidate.outcomes[0].paretoRank is None

    def missingSlope(dem, site):
        return original(dem, site) | dict(
            estimatedSlopeDeg=None,
            slopeQuality='synthetic missing slope support',
            terrainError='synthetic missing slope support',
        )

    monkeypatch.setattr(module, 'sampleCandidateTerrain', missingSlope)
    response = evaluateMastPlacement(
        engine, placementRequest(searchRadiusM=0, mastHeightsM=[0], maximumSlopeDeg=5)
    )
    assert response.dataState == 'computed', response
    assert response.result.candidates[0].outcomes[0].feasibilityStatus == 'unavailable'
    assert not response.result.optimization.complete


def testBudgetCountsAndCooperativePartialResult(realPlacement):
    engine, _, _ = realPlacement
    with pytest.raises(ValidationError):
        placementRequest(evaluationBudget=dict(maxEvaluations=9, maxWallTimeS=120))
    with pytest.raises(ValidationError):
        placementRequest(durationS=10 * 86400, cadenceS=3600)
    ticks = iter([0] + [10] * 30)
    response = evaluateMastPlacement(
        engine,
        placementRequest(evaluationBudget=dict(maxEvaluations=10, maxWallTimeS=0.1)),
        clock=lambda: next(ticks),
    )
    assert response.dataState == 'computed', response
    assert response.result.optimization.evaluationsPerformed == 1
    assert response.result.optimization.unknownOutcomeCount == 9
    assert response.result.optimization.terminationReason == 'wall_time_budget'
    assert not response.result.optimization.complete
    feed = mastFeed(response)
    assert feed.candidates[0].outcomes[1].metrics is None


def testCablePrefilterUnsupportedSiteAndMissingDEM(realPlacement, tmp_path):
    engine, _, _ = realPlacement
    response = evaluateMastPlacement(
        engine, placementRequest(maximumCableLengthM=0, mastHeightsM=[0])
    )
    assert response.dataState == 'computed', response
    assert response.result.optimization.evaluationsPerformed == 1
    for candidate in response.result.candidates[1:]:
        assert candidate.outcomes[0].feasibilityStatus == 'infeasible'
        assert candidate.outcomes[0].dataState == 'not_computed'
    unsupported = evaluateMastPlacement(engine, placementRequest(site='apollo11'))
    assert unsupported.dataState == 'unsupported' and unsupported.result is None
    missing = evaluateMastPlacement(
        Engine(tmp_path, tmp_path / 'cache'),
        placementRequest(searchRadiusM=0, mastHeightsM=[0]),
    )
    assert missing.dataState == 'unavailable' and missing.result is None


def testPlacementSchemasInvariantsAndImmutableFeed(realPlacement, tmp_path):
    _, _, response = realPlacement
    payload = response.model_dump(mode='json')
    schema = TypeAdapter(MastPlacementResponse).json_schema(mode='serialization')
    jsonschema.validate(payload, schema)
    assert (
        TypeAdapter(MastPlacementResponse)
        .validate_json(response.model_dump_json())
        .scenarioId
        == response.scenarioId
    )
    feed = mastFeed(response)
    jsonschema.validate(
        feed.model_dump(mode='json'), MastFeedV1.model_json_schema(mode='serialization')
    )
    path = writeMastFeed(response, tmp_path)
    original = path.read_bytes()
    repeated = response.model_copy(deep=True)
    repeated.result.optimization.wallTimeS += 1
    assert writeMastFeed(repeated, tmp_path) == path
    assert path.read_bytes() == original
    for change in ['rank', 'coordinate', 'source']:
        altered = copy.deepcopy(payload)
        if change == 'rank':
            altered['result']['candidates'][0]['outcomes'][0]['paretoRank'] = 999
        elif change == 'coordinate':
            altered['result']['candidates'][0]['site']['latitudeDeg'] += 0.001
        else:
            kernels = altered['result']['candidates'][1]['outcomes'][0]['environment'][
                'provenance'
            ]['kernels']
            kernels[next(iter(kernels))] = '0' * 64
        with pytest.raises(ValidationError):
            TypeAdapter(MastPlacementResponse).validate_python(altered)


def testPlacementRouteAndTypedFailures(realPlacement, monkeypatch):
    from fastapi.testclient import TestClient
    import skyline_mission_science.api as api

    engine, _, _ = realPlacement
    monkeypatch.setattr(api, 'engine', engine)
    client = TestClient(api.app)
    request = placementRequest(
        searchRadiusM=0,
        mastHeightsM=[0],
        evaluationBudget=dict(maxEvaluations=1, maxWallTimeS=120),
    ).model_dump(mode='json')
    response = client.post('/v1/mast-placement-evaluations', json=request)
    assert response.status_code == 200
    assert response.json()['dataState'] == 'computed'
    assert response.json()['schemaVersion'] == 'skyline-mast-placement-response/1.0.0'
    invalid = client.post(
        '/v1/mast-placement-evaluations',
        json=request | {'evaluationBudget': {'maxEvaluations': 0}},
    )
    assert invalid.status_code == 422
    assert invalid.json()['dataState'] == 'failed' and invalid.json()['result'] is None
    unsupported = client.post(
        '/v1/mast-placement-evaluations', json=request | {'site': 'apollo11'}
    )
    assert unsupported.json()['dataState'] == 'unsupported'
    api.requestGate.acquire()
    try:
        busy = client.post('/v1/mast-placement-evaluations', json=request)
        assert busy.status_code == 503 and busy.json()['dataState'] == 'unavailable'
    finally:
        api.requestGate.release()
    oversized = client.post(
        '/v1/mast-placement-evaluations', content=b' ' * (1048576 + 1)
    )
    assert (
        oversized.status_code == 413
        and oversized.json()['schemaVersion'] == 'skyline-mast-placement-response/1.0.0'
    )


def testEachOfSixObjectivesIndependentlyAffectsDominance():
    # Synthetic objective basis isolates each component of the declared optimization vector.
    baseline = [0.5, 0.5, 100, 100, 80, 2]
    alternatives = [baseline]
    for axis, improvement in enumerate([0.6, 0.6, 90, 90, 40, 1]):
        vector = baseline.copy()
        vector[axis] = improvement
        alternatives.append(vector)
    candidates = []
    for index, (earth, sun, blackout, darkness, cable, height) in enumerate(
        alternatives
    ):
        metrics = SimpleNamespace(
            directEarthAvailabilityFraction=earth,
            sunlightAvailabilityFraction=sun,
            longestDirectEarthBlackout=SimpleNamespace(durationS=blackout),
            longestDarkness=SimpleNamespace(durationS=darkness),
        )
        candidates.append(
            SimpleNamespace(
                candidateId=str(index),
                cableDistanceM=cable,
                outcomes=[
                    SimpleNamespace(
                        feasibilityStatus='feasible',
                        metrics=metrics,
                        observerHeightM=height,
                    )
                ],
            )
        )
    ranks = placementRanks(candidates)
    assert ranks[('0', 2)] == 1
    assert all(
        ranks[(str(index), alternatives[index][5])] == 0 for index in range(1, 7)
    )
