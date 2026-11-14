from fastapi.testclient import TestClient
from skyline_relay_adapter.api import app
from skyline_relay_adapter.schemas import RelayRequest
from skyline_relay_adapter.engine import RelayEngine,metrics
import pytest

def testCapabilitiesAndUnsupported():
    client=TestClient(app)
    assert client.get('/v1/capabilities').json()['rfQualified'] is False
    for request in [{'siteId':'unknown'},{'profile':'apparent'},{'startUtc':'2026-11-20T00:00:00Z'},{'durationS':121},{'rfQualified':True}]:
        assert client.post('/v1/evaluate',json=request).status_code==422

def testMissingData(tmp_path):
    result=RelayEngine(tmp_path).evaluate(RelayRequest())
    assert result['dataState']=='unavailable'

def testBinBoundaries():
    result=metrics([False,False,True,False],[0,120,240,360])
    assert result['maximumBlackoutS']==240
    assert result['blackoutIntervalsS']==[[0,240],[360,480]]
def testOversizeAndResponseContract():
    from skyline_relay_adapter.schemas import RelayResponse
    client=TestClient(app)
    assert client.post('/v1/evaluate',content=b' '*5000,headers={'Content-Type':'application/json'}).status_code==413
    with pytest.raises(ValueError):
        RelayResponse(dataState='computed')
def testChangedTrajectoryRejected(tmp_path,monkeypatch):
    import json
    engine=RelayEngine(tmp_path)
    monkeypatch.setattr(engine,'root',tmp_path)
    (tmp_path/'data/states').mkdir(parents=True)
    (tmp_path/'docs').mkdir()
    (tmp_path/'data/states/candidate2States.csv').write_text('changed')
    (tmp_path/'docs/sourceManifest.json').write_text(json.dumps([{'path':'candidate2States.csv','sha256':'incorrect'}]))
    response=engine.evaluate(RelayRequest())
    assert response['dataState']=='unavailable'
    assert 'identity mismatch' in response['error']['message']
