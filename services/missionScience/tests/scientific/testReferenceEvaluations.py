from datetime import datetime, timezone
from pathlib import Path

import jsonschema
import pytest
import spiceypy as spice
from fastapi.testclient import TestClient
from pydantic import ValidationError

from skyline_mission_science import api
from skyline_mission_science.engine import Engine, scienceLock
from skyline_mission_science.referenceEvaluations import ReferenceRequest, ReferenceWindow, evaluateReference, referenceWindow
from skyline_mission_science.scientificModels import ScientificResponse
from skyline_mission_science.spiceGeometry import loadSpice
from pydantic import TypeAdapter


def request(**changes):
    values = dict(site='CR1', startUtc='2026-01-01T00:00:00Z', endUtc='2026-01-02T00:00:00Z')
    values.update(changes)
    return ReferenceRequest.model_validate(values)


@pytest.mark.parametrize('changes', [
    dict(endUtc='2026-01-01T00:00:00Z'), dict(endUtc='2026-01-16T00:00:00Z'),
    dict(startUtc='2026-01-01T01:00:00Z'), dict(startUtc='2026-01-01T00:00:00'),
    dict(startUtc='2026-01-01T00:00:00+01:00'), dict(observerHeightM=-1),
    dict(endUtc='2026-01-15T00:00:00Z', cadenceS=30),
])
def testRejectsInvalidReferenceWindows(changes):
    values = dict(site='CR1', startUtc='2026-01-01T00:00:00Z', endUtc='2026-01-02T00:00:00Z')
    values.update(changes)
    with pytest.raises(ValidationError):
        ReferenceRequest.model_validate(values)


def testLeapDayGridAndNonuniformEtDays():
    values = ReferenceRequest(site='CR1', startUtc='2028-02-28T00:00:00Z', endUtc='2028-03-02T00:00:00Z')
    base = datetime(2028, 2, 28, tzinfo=timezone.utc)
    def toEt(value):
        offset = (datetime.fromisoformat(value.replace('Z', '+00:00'))-base).total_seconds()
        return 800000000 + offset + 1e-13*offset**2
    grid = referenceWindow(values, toEt)
    assert [day.date for day in grid.days] == ['2028-02-28', '2028-02-29', '2028-03-01']
    assert grid.days[0].startS == 0
    assert grid.days[-1].endS == grid.endEt-grid.startEt
    assert grid.days[0].endS != 86400
    for left, right in zip(grid.days, grid.days[1:]):
        assert left.endS == right.startS
    invalid = grid.model_dump()
    invalid['days'][1]['startS'] += 1
    with pytest.raises(ValidationError):
        ReferenceWindow.model_validate(invalid)


def testBusyAndUnsupportedStatesDoNotContainResults(tmp_path):
    engine = Engine(tmp_path, tmp_path/'cache')
    with scienceLock:
        response = evaluateReference(engine, request())
    assert response.dataState == 'unavailable' and response.error.code == 'busy'
    unsupported = evaluateReference(engine, ReferenceRequest(site='apollo11', startUtc='2026-01-01T00:00:00Z', endUtc='2026-01-02T00:00:00Z'))
    assert unsupported.dataState == 'unsupported' and unsupported.result is None
    missing = evaluateReference(engine, request())
    assert missing.dataState == 'unavailable' and missing.provenance is None


@pytest.mark.parametrize('site', ['CR1', 'GR1', 'SR1'])
def testRealReferenceUtcCoverageAndContract(site):
    with TestClient(api.app) as client:
        result = client.post('/v1/reference-evaluations', json=dict(site=site, startUtc='2026-11-20T00:00:00Z', endUtc='2026-11-21T00:00:00Z'))
    assert result.status_code == 200
    payload = result.json()
    assert payload['dataState'] == 'computed', payload.get('error')
    jsonschema.validate(payload, TypeAdapter(ScientificResponse).json_schema(mode='serialization'))
    grid = ReferenceWindow.model_validate(payload['provenance']['sampling']['referenceWindow'])
    assert len(grid.days) == 1
    assert grid.days[0].endS == payload['result']['period']['durationS']
    with loadSpice(api.engine.assetRoot/'spice'):
        assert grid.startEt == spice.str2et('2026-11-20T00:00:00Z')
        assert grid.endEt == spice.str2et('2026-11-21T00:00:00Z')
    assert payload['result']['observer']['siteId'] == site
    assert abs((datetime.fromisoformat(payload['result']['period']['endUtc'].replace('Z', '+00:00'))-datetime(2026, 11, 21, tzinfo=timezone.utc)).total_seconds()) <= 1e-5


def testInvalidRouteInputRetainsScientificEnvelope():
    with TestClient(api.app) as client:
        response = client.post('/v1/reference-evaluations', json=dict(site='CR1', startUtc='2026-01-01T00:00:00Z', endUtc='2026-02-01T00:00:00Z'))
    assert response.status_code == 422
    assert response.json()['dataState'] == 'failed'
    assert response.json()['result'] is None


def testPublishedReferenceSchemasMatchModels():
    import json
    root = Path(__file__).resolve().parents[4]
    for model, name in [(ReferenceRequest, 'referenceRequest'), (ReferenceWindow, 'referenceWindow')]:
        assert json.loads((root/'contracts'/f'{name}.schema.json').read_text()) == model.model_json_schema()
