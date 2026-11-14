from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest
from skyline_mission_science.spiceGeometry import loadSpice
import pytest

def testMissingData(tmp_path):
    response=Engine(tmp_path,tmp_path/'cache').evaluate(EvaluationRequest(startUtc='2025-01-01T00:00:00Z'))
    assert response.dataState=='unavailable'
    with pytest.raises(FileNotFoundError):
        with loadSpice(tmp_path):
            pass

def testApi(tmp_path,monkeypatch):
    from fastapi.testclient import TestClient
    from skyline_mission_science import api
    monkeypatch.setattr(api,'engine',Engine(tmp_path,tmp_path/'cache'))
    client=TestClient(api.app)
    assert client.get('/v1/sites').status_code==200
    response=client.post('/v1/evaluate',json={'startUtc':'2025-01-01T00:00:00Z'})
    assert response.status_code==200
    assert response.json()['dataState']=='unavailable'
    assert client.post('/v1/evaluate',json={'startUtc':'bad'}).status_code==422
