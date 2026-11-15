import copy
from pathlib import Path

import jsonschema
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter, ValidationError

from skyline_mission_science import api
from skyline_mission_science.engine import Engine
from skyline_mission_science.scientificContract import (
    evaluateScientific,
    visibilityWindows,
)
from skyline_mission_science.scientificModels import (
    ScientificRequest,
    ScientificResponse,
    StateResponse,
)
from skyline_mission_science.spiceGeometry import loadSpice
from skyline_mission_science.visibility import eventIntervals
import spiceypy as spice

root = Path(__file__).resolve().parents[2]
responseAdapter = TypeAdapter(ScientificResponse)


@pytest.fixture(scope='module')
def realResponse():
    with TestClient(api.app) as client:
        response = client.post(
            '/v1/scientific-evaluations',
            json=dict(startUtc='2025-01-01T00:00:00Z', durationS=3600, cadenceS=600),
        )
    assert response.status_code == 200
    assert response.json()['dataState'] == 'computed'
    return response.json()


def testSchemaAndRealScientificInvariants(realResponse):
    schema = responseAdapter.json_schema(mode='serialization')
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.validate(realResponse, schema)
    parsed = responseAdapter.validate_python(realResponse)
    assert len(parsed.result.skyline.azimuthDeg) == 1440
    assert len(parsed.provenance.kernels) == 7
    assert len(parsed.provenance.dems) == 2
    assert parsed.result.period.startUtc == '2025-01-01T00:00:00.000000Z'
    assert parsed.result.samples[-1].endpointContext
    assert not parsed.provenance.independentlyValidated
    for sample in parsed.result.samples:
        assert sample.earth.centerVisible == (sample.earth.clearanceDeg >= 0)
        assert sample.sun.clearanceDeg == pytest.approx(
            sample.sun.elevationDeg - sample.sun.horizonElevationDeg
        )
    for windows in [
        parsed.result.sunlightIntervals,
        parsed.result.directEarthIntervals,
    ]:
        assert all(0 < event.elapsedS < 3600 for event in windows.events)


def testSchemaRejectsMissingStateAndOutOfRangeShares(realResponse):
    schema = responseAdapter.json_schema(mode='serialization')
    missing = copy.deepcopy(realResponse)
    missing.pop('dataState')
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(missing, schema)
    malformed = copy.deepcopy(realResponse)
    malformed['result']['samples'][0]['sun']['visibleDiskFraction'] = 1.01
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(malformed, schema)


@pytest.mark.parametrize(
    'mutation', ['overlap', 'mean', 'clearance', 'boundary', 'profile', 'identity']
)
def testCrossFieldInvariantRejection(realResponse, mutation):
    changed = copy.deepcopy(realResponse)
    if mutation == 'overlap':
        windows = changed['result']['sunlightIntervals']
        windows['available'] = [
            dict(
                startUtc='2025-01-01T00:00:00Z',
                endUtc='2025-01-01T01:00:00Z',
                startS=0,
                endS=3600,
                startClipped=True,
                endClipped=True,
            )
        ] * 2
    elif mutation == 'mean':
        changed['result']['metrics']['meanVisibleSolarDiskFraction'] = 0.123
    elif mutation == 'clearance':
        changed['result']['samples'][0]['earth']['clearanceDeg'] += 1
    elif mutation == 'boundary':
        changed['result']['sunlightIntervals']['events'] = [
            dict(
                timestampUtc='2025-01-01T00:00:00Z',
                elapsedS=0,
                eventType='sunrise',
                numericalToleranceS=1,
                physicalUncertaintyS=None,
                method='numerical transition estimate',
            )
        ]
    elif mutation == 'identity':
        changed['scenarioId'] = 'scenario-' + '0' * 64
    else:
        changed['result']['samples'][0]['scientificProfile'] = 'apparent'
    with pytest.raises(ValidationError):
        responseAdapter.validate_python(changed)


def testNoFabricatedWindowEvents():
    for sign in [-1, 0, 1]:
        native = eventIntervals(lambda times: np.full_like(times, sign), 100, 10, 0.01)
        windows = visibilityWindows(
            native, 100, lambda offset: f'fixture-{offset}', 'sunrise', 'sunset'
        )
        assert windows['events'] == []
        interval = (windows['available'] or windows['unavailable'])[0]
        assert interval['startClipped'] and interval['endClipped']


def testNearEndpointPartitionRegression():
    result = eventIntervals(lambda times: 99.95 - times, 100, 10, 0.1)
    assert result['outageIntervalsS'][-1][1] == 100
    assert sum(
        right - left
        for left, right in result['intervalsS'] + result['outageIntervalsS']
    ) == pytest.approx(100)
    merged = sorted(result['intervalsS'] + result['outageIntervalsS'])
    assert all(right[0] == left[1] for left, right in zip(merged, merged[1:]))


def testCloseGrazingPartitionsDoNotOverlap():
    result = eventIntervals(lambda times: (times - 50) ** 2 - 1e-8, 100, 10, 0.01)
    pieces = sorted(result['intervalsS'] + result['outageIntervalsS'])
    assert pieces[0][0] == 0 and pieces[-1][1] == 100
    assert all(left[1] == right[0] for left, right in zip(pieces, pieces[1:]))


def testUnsupportedAndMissingDataHaveNoNumbers(tmp_path):
    engine = Engine(tmp_path, tmp_path / 'cache')
    for changes in [dict(site='CE4')]:
        request = ScientificRequest(startUtc='2025-01-01T00:00:00Z', **changes)
        response = evaluateScientific(engine, request)
        assert response.dataState == 'unsupported'
        assert response.result is None
        jsonschema.validate(
            response.model_dump(mode='json'),
            responseAdapter.json_schema(mode='serialization'),
        )
    response = evaluateScientific(
        engine, ScientificRequest(startUtc='2025-01-01T00:00:00Z')
    )
    assert response.dataState == 'unavailable'
    assert response.result is None and response.coverage.missingData


def testFailedAndNotComputedStates(monkeypatch):
    engine = Engine()

    def fail(request, **kwargs):
        raise RuntimeError('fixture failure')

    monkeypatch.setattr(engine, 'compute', fail)
    response = evaluateScientific(
        engine, ScientificRequest(startUtc='2025-01-01T00:00:00Z')
    )
    assert response.dataState == 'failed' and response.result is None
    notComputed = StateResponse(
        dataState='not_computed',
        error=dict(code='not_requested', message='fixture'),
    )
    jsonschema.validate(
        notComputed.model_dump(mode='json'),
        responseAdapter.json_schema(mode='serialization'),
    )


def testInvalidRequestUsesTypedFailureAndLegacyIsPreserved():
    client = TestClient(api.app)
    response = client.post('/v1/scientific-evaluations', json={'startUtc': 'invalid'})
    assert response.status_code == 422 and response.json()['dataState'] == 'failed'
    assert response.json()['result'] is None
    assert 'detail' in client.post('/v1/evaluate', json={'startUtc': 'invalid'}).json()


def testEtUtcLeapSecondFixture():
    with loadSpice(root / 'data/raw/spice'):
        start = spice.str2et('2016-12-31T23:59:59Z')
        labels = [spice.et2utc(start + offset, 'ISOC', 6) + 'Z' for offset in [0, 1, 2]]
    assert labels == [
        '2016-12-31T23:59:59.000000Z',
        '2016-12-31T23:59:60.000000Z',
        '2017-01-01T00:00:00.000000Z',
    ]


def testSolarPartialDiskIsDistinctFromCenter():
    from skyline_mission_science.scientificModels import SolarSample
    from skyline_mission_science.visibility import diskFraction

    clearance = -0.5
    fraction = float(diskFraction(clearance, 1))
    sample = SolarSample(
        azimuthDeg=0,
        elevationDeg=clearance,
        horizonElevationDeg=0,
        clearanceDeg=clearance,
        angularRadiusDeg=1,
        visibleDiskFraction=fraction,
        diskState='partially_visible',
        sunlightVisible=True,
    )
    assert 0 < sample.visibleDiskFraction < 0.5
    assert sample.sunlightVisible and sample.clearanceDeg < 0


def testImmutableFeedPublicationAndCollision(realResponse, tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from skyline_mission_science.scientificFeeds import writeScientificFeed

    with ThreadPoolExecutor(max_workers=4) as workers:
        paths = list(
            workers.map(lambda _: writeScientificFeed(realResponse, tmp_path), range(8))
        )
    assert len(set(paths)) == 1
    assert paths[0].name == realResponse['scenarioId'] + '.json'
    assert len(list(tmp_path.iterdir())) == 1
    original = paths[0].read_bytes()
    changed = copy.deepcopy(realResponse)
    changed['provenance']['limitations'].append('Synthetic collision fixture')
    with pytest.raises(ValueError, match='Conflicting'):
        writeScientificFeed(changed, tmp_path)
    assert paths[0].read_bytes() == original
    unsupported = StateResponse(
        dataState='unsupported',
        error=dict(code='fixture', message='Unsupported fixture'),
    )
    with pytest.raises(ValueError, match='Cannot publish'):
        writeScientificFeed(unsupported, tmp_path)


def testScenarioIdentityChangesWithProfileAndEpoch(realResponse):
    engine = Engine(root / 'data/raw', root / 'data/cache')
    changedProfile = evaluateScientific(
        engine,
        ScientificRequest(
            startUtc='2025-01-01T00:00:00Z',
            durationS=3600,
            cadenceS=600,
            profile='apparent',
        ),
    )
    changedEpoch = evaluateScientific(
        engine,
        ScientificRequest(
            startUtc='2025-01-02T00:00:00Z', durationS=3600, cadenceS=600
        ),
    )
    assert (
        changedProfile.dataState == 'computed' and changedEpoch.dataState == 'computed'
    )
    assert (
        len(
            {
                realResponse['scenarioId'],
                changedProfile.scenarioId,
                changedEpoch.scenarioId,
            }
        )
        == 3
    )
