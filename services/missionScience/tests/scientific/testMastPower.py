import copy
from pathlib import Path

import jsonschema
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from pydantic import TypeAdapter, ValidationError

from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest
from skyline_mission_science.scientificContract import evaluateScientific
from skyline_mission_science.scientificModels import ScientificRequest
from skyline_mission_science.mastPower import evaluateMastPower
from skyline_mission_science.mastPowerModels import MastPowerRequest, MastPowerResponse
from skyline_mission_science.panelGeometry import panelExposure
from skyline_mission_science.powerFeeds import powerFeed, writePowerFeed
from skyline_mission_science.terrainHorizon import LunarDem, HorizonConfig, buildHorizon
from skyline_mission_science.lunarSites import LunarSite

root = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def realMastResponse():
    request = MastPowerRequest(
        startUtc='2025-01-06T00:00:00Z',
        durationS=86400,
        cadenceS=3600,
        mastHeightsM=[0, 10, 30],
        verticalAzimuthDeg=90,
    )
    response = evaluateMastPower(
        Engine(root / 'data/raw', root / 'data/cache'), request
    )
    assert response.dataState == 'computed', response
    return response


def testIndependentPanelDotProducts():
    result = panelExposure(
        [0, 90, 180, 270], [0, 0, 0, 90], [1, 0.5, 1, 1], [0, 1, 2, 3], 0
    )
    # Independent cardinal unit vectors dotted with explicit north/up normals.
    directions = np.array([[0, 1, 0], [1, 0, 0], [0, -1, 0], [0, 0, 1]], dtype=float)
    np.testing.assert_allclose(
        result['horizontal']['incidenceFactor'],
        np.maximum(0, directions @ np.array([0, 0, 1])),
        atol=1e-15,
    )
    np.testing.assert_allclose(
        result['vertical']['incidenceFactor'],
        np.maximum(0, directions @ np.array([0, 1, 0])),
        atol=1e-15,
    )
    np.testing.assert_allclose(
        result['vertical']['exposureFactor'], [1, 0, 0, 0], atol=1e-15
    )
    assert result['tracking']['meanGeometricExposure'] == pytest.approx(5 / 6)
    assert panelExposure([90, 90], [0, 0], [1, 1], [0, 10], 90)['vertical'][
        'meanGeometricExposure'
    ] == pytest.approx(1)
    assert (
        panelExposure([0, 0], [-0.1, -0.1], [0.25, 0.25], [0, 10], 0)['horizontal'][
            'meanGeometricExposure'
        ]
        == 0
    )
    with pytest.raises(ValueError):
        panelExposure([0, 0], [0, 0], [2, 2], [0, 1], 0)


def testHeightZeroRegression(realMastResponse):
    ground = realMastResponse.result.outcomes[0].environment
    native = Engine(root / 'data/raw', root / 'data/cache').evaluate(
        EvaluationRequest(
            startUtc=ground.request.startUtc, durationS=86400, cadenceS=3600
        )
    )
    assert native.dataState == 'computed'
    np.testing.assert_array_equal(
        ground.result.skyline.terrainElevationDeg, native.result['horizonElevationDeg']
    )
    np.testing.assert_allclose(
        ground.result.observer.positionM,
        native.provenance['observerPositionM'],
        atol=0,
        rtol=0,
    )
    assert (
        ground.result.metrics.sunlightAvailabilityFraction
        == native.result['bodies']['SUN']['visibleFraction']
    )
    assert (
        ground.result.metrics.directEarthAvailabilityFraction
        == native.result['bodies']['EARTH']['visibleFraction']
    )


def testRealHeightPositionsCachesAndMonotonicity(realMastResponse):
    ground = realMastResponse.result.outcomes[0]
    identities = []
    previous = ground.environment.result.skyline.terrainElevationDeg
    for outcome in realMastResponse.result.outcomes:
        environment = outcome.environment
        assert np.linalg.norm(
            np.asarray(environment.result.observer.positionM)
            - ground.environment.result.observer.positionM
        ) == pytest.approx(outcome.observerHeightM, abs=1e-6)
        assert (
            environment.result.skyline.computationSettings['observerHeightM']
            == outcome.observerHeightM
        )
        assert outcome.differenceFromGround.skylineNonincreasingWithinTolerance
        assert (
            max(
                np.asarray(environment.result.skyline.terrainElevationDeg)
                - ground.environment.result.skyline.terrainElevationDeg
            )
            <= 1e-9
        )
        assert outcome.panels.tracking.meanGeometricExposure == pytest.approx(
            environment.result.metrics.meanVisibleSolarDiskFraction, abs=1e-12
        )
        assert (
            outcome.panels.horizontal.meanGeometricExposure
            <= outcome.panels.tracking.meanGeometricExposure + 1e-12
        )
        assert (
            np.max(
                np.asarray(environment.result.skyline.terrainElevationDeg) - previous
            )
            <= 1e-9
        )
        previous = environment.result.skyline.terrainElevationDeg
        identities.append(environment.provenance.cacheKey)
    assert len(set(identities)) == len(identities)
    jsonschema.validate(
        realMastResponse.model_dump(mode='json'),
        TypeAdapter(MastPowerResponse).json_schema(mode='serialization'),
    )


def testFlatRadialTerrainAnalyticalFixture(tmp_path):
    # Synthetic constant radial-height lunar sphere fixture.
    path = tmp_path / 'flat.tif'
    from pyproj import CRS

    crs = CRS.from_proj4(
        '+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs'
    ).to_wkt()
    with rasterio.open(
        path,
        'w',
        driver='GTiff',
        height=161,
        width=161,
        count=1,
        dtype='float32',
        crs=crs,
        transform=from_origin(-80500, 80500, 1000, 1000),
    ) as dataset:
        dataset.write(np.zeros((161, 161), dtype=np.float32), 1)
    site = LunarSite(
        'syntheticFlat',
        'Synthetic flat radial terrain',
        -90,
        0,
        sourceUrl='synthetic analytical fixture',
    )
    profiles = []
    with LunarDem(path) as dem:
        for height in [0, 10, 30]:
            config = HorizonConfig(
                azimuthStepDeg=2,
                localRadiusM=5000,
                outerRadiusM=50000,
                nearRadiusM=500,
                nearStepM=50,
                observerHeightM=height,
                globalMaxHeightM=100,
            )
            profile = buildHorizon(site, dem, dem, config)
            profiles.append(profile)
            expected = -np.rad2deg(np.arccos(1737400 / (1737400 + height)))
            assert np.max(np.abs(profile.elevationDeg - expected)) < 0.003
    assert np.all(profiles[1].elevationDeg <= profiles[0].elevationDeg + 1e-9)
    assert np.all(profiles[2].elevationDeg <= profiles[1].elevationDeg + 1e-9)


def testMissingUnsupportedHeightsAndRequestBounds(tmp_path):
    request = MastPowerRequest(
        startUtc='2025-01-01T00:00:00Z',
        durationS=3600,
        cadenceS=600,
        mastHeightsM=[10],
        verticalAzimuthDeg=0,
    )
    missing = evaluateMastPower(Engine(tmp_path, tmp_path / 'cache'), request)
    assert missing.dataState == 'unavailable' and missing.result is None
    tooHigh = evaluateScientific(
        Engine(root / 'data/raw', root / 'data/cache'),
        ScientificRequest(
            startUtc=request.startUtc, durationS=3600, cadenceS=600, observerHeightM=1e9
        ),
    )
    assert tooHigh.dataState == 'unsupported' and tooHigh.result is None
    with pytest.raises(ValidationError):
        MastPowerRequest(
            startUtc=request.startUtc, mastHeightsM=[-1], verticalAzimuthDeg=0
        )
    with pytest.raises(ValidationError):
        MastPowerRequest(
            startUtc=request.startUtc,
            durationS=86400,
            cadenceS=30,
            mastHeightsM=[0, 1, 2],
            verticalAzimuthDeg=0,
        )


def testPowerFeedManifestPublication(realMastResponse, tmp_path):
    feed = powerFeed(realMastResponse)
    assert feed['outcomes'][0]['mast_m'] == 0
    jsonschema.validate(
        feed,
        __import__('json').loads(
            (Path(__file__).resolve().parents[4] / 'contracts/feeds/power.schema.json').read_text()
        ),
    )
    path = writePowerFeed(realMastResponse, tmp_path)
    assert path.name == realMastResponse.scenarioId + '.json'
    assert (tmp_path / 'power/CR1.json').exists()
    original = path.read_bytes()
    assert (
        writePowerFeed(realMastResponse, tmp_path) == path
        and path.read_bytes() == original
    )
    changed = copy.deepcopy(realMastResponse.model_dump(mode='json'))
    changed['result']['outcomes'][1]['differenceFromGround']['horizontalExposure'] += (
        0.1
    )
    with pytest.raises(ValidationError):
        TypeAdapter(MastPowerResponse).validate_python(changed)


def testApparentHeightProfileAndTypedRouteErrors():
    from fastapi.testclient import TestClient
    from skyline_mission_science.api import app

    result = evaluateScientific(
        Engine(root / 'data/raw', root / 'data/cache'),
        ScientificRequest(
            startUtc='2025-01-06T00:00:00Z',
            durationS=3600,
            cadenceS=600,
            observerHeightM=10,
            profile='apparent',
        ),
    )
    assert (
        result.dataState == 'computed' and result.result.observer.observerHeightM == 10
    )
    assert result.provenance.aberrationCorrection == 'LT+S'
    response = TestClient(app).post(
        '/v1/mast-power-evaluations', json={'startUtc': 'invalid'}
    )
    assert response.status_code == 422
    assert response.json()['schemaVersion'] == 'skyline-mast-power-response/1.0.0'
    assert (
        response.json()['dataState'] == 'failed' and response.json()['result'] is None
    )


def testPanelQuadratureAnalyticalConvergence():
    # Synthetic meridian crossing with exact mean upward incidence 2/pi.
    errors = []
    for count in [9, 17, 33]:
        theta = np.linspace(0, np.pi, count)
        elevation = 90 - np.abs(90 - np.rad2deg(theta))
        azimuth = np.where(theta <= np.pi / 2, 0, 180)
        result = panelExposure(azimuth, elevation, np.ones_like(theta), theta, 0)
        errors.append(abs(result['horizontal']['meanGeometricExposure'] - 2 / np.pi))
    assert errors[2] < errors[1] < errors[0]
    assert errors[2] < 0.001
