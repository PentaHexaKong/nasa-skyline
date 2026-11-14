from fastapi.testclient import TestClient
from skyline_relay_adapter.api import app
from skyline_relay_adapter.schemas import RelayRequest
from skyline_relay_adapter.engine import RelayEngine,metrics
import json
from pathlib import Path
import pytest

def testCapabilitiesAndUnsupported():
    client=TestClient(app)
    assert client.get('/v1/capabilities').json()['rfQualified'] is False
    for request in [{'siteId':'unknown'},{'profile':'apparent'},{'durationS':121},{'rfQualified':True},{'satellites':0},{'satellites':5},{'cadenceS':100},{'cadenceS':1080},{'durationS':360,'cadenceS':240}]:
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

@pytest.fixture(scope='module')
def engine():
    return RelayEngine()

def testPropagatedRequestOutsideReplayWindow(engine):
    response=engine.evaluate(dict(startUtc='2026-11-20T00:00:00Z',durationS=7200,satellites=3,cadenceS=240))
    assert response['dataState']=='computed'
    assert response['provenance']['tier']=='propagated-two-body'
    assert response['provenance']['satellites']==3
    assert response['result']['timesS'][:3]==[0.,240.,480.]
    assert len(response['result']['viaRelayAvailable'])==30

def testDefaultRequestOnLaterDatePropagates(engine):
    response=engine.evaluate(dict(startUtc='2026-11-20T00:00:00Z'))
    assert response['dataState']=='computed'
    assert response['provenance']['tier']=='propagated-two-body'

def testReplayWindowWithOtherSatelliteCountPropagates(engine):
    response=engine.evaluate(dict(startUtc='2025-01-06T00:00:00Z',durationS=7200,satellites=4))
    assert response['provenance']['tier']=='propagated-two-body'

def testNestedSatellitesNeverLoseCoverage(engine):
    fractions=[]
    for count in (1,2,3,4):
        response=engine.evaluate(dict(startUtc='2026-11-20T00:00:00Z',durationS=14400,satellites=count))
        fractions.append(sum(response['result']['viaRelayAvailable']))
    assert fractions==sorted(fractions)

def testOutsideKernelCoverageUnavailable(engine):
    for start in ('2060-01-01T00:00:00Z','1800-01-01T00:00:00Z'):
        response=engine.evaluate(dict(startUtc=start,durationS=7200))
        assert response['dataState']=='unavailable'
        assert 'kernel coverage' in response['error']['message']

def testVerifiedRequestMatchesRecordedOutput(engine):
    recorded=json.loads((Path(__file__).parent/'fixtures/verifiedCr1Jan06.json').read_text())
    response=engine.evaluate(dict(siteId='CR1',startUtc='2025-01-06T00:00:00Z',durationS=86400))
    provenance=response['provenance']
    assert provenance['tier']=='verified-replay'
    assert provenance['satellites']==2
    volatile=('tier','satellites','implementation','request')
    assert json.dumps(response['result'],sort_keys=True,separators=(',',':'))==json.dumps(recorded['result'],sort_keys=True,separators=(',',':'))
    assert {k:v for k,v in provenance.items() if k not in volatile}==recorded['provenance']

def testCapabilitiesReportBothTiers():
    client=TestClient(app)
    capabilities=client.get('/v1/capabilities').json()
    assert [tier['tier'] for tier in capabilities['tiers']]==['verified-replay','propagated-two-body']
    assert capabilities['satellites']['maximum']==4
    assert capabilities['cadenceRangeS']['maximum']==960
    assert client.get('/v1/candidates').json()[0]['satelliteRange']['maximum']==4
