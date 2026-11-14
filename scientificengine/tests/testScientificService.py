'''Synthetic transport tests. Scientific correctness is tested against the real engine separately.'''
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
import json
import threading
import urllib.error
import urllib.request

import pytest

from server import makeHandler


class SyntheticEngine:
    def __init__(self):
        self.calls = []
        self.entered = threading.Event()
        self.release = threading.Event()

    def evaluate(self, request):
        self.calls.append(request)
        if request.get('parameters', {}).get('wait'):
            self.entered.set()
            self.release.wait(3)
        return dict(schemaVersion='skyline-scientific-engine/1.0.0', dataState='computed', result=dict(fixture=True), provenance=dict(fixture=True))


@pytest.fixture
def service():
    engine = SyntheticEngine()
    server = ThreadingHTTPServer(('127.0.0.1', 0), makeHandler(engine, False))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield engine, 'http://127.0.0.1:' + str(server.server_port)
    server.shutdown()
    server.server_close()
    thread.join(3)


def send(url, payload, contentType='application/json', path='/analyze'):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    request = urllib.request.Request(url + path, data=body, headers={'Content-Type': contentType, 'X-Request-ID': 'synthetic-transport'})
    try:
        response = urllib.request.urlopen(request, timeout=5)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response), response.headers.get('X-Request-ID')


def testEnvelopeAndRequestId(service):
    engine, url = service
    status, body, identifier = send(url, {'input': {'schemaVersion': 'skyline-science-request/1.0.0', 'operation': 'describe'}})
    assert status == 200 and body['result']['fixture']
    assert identifier == 'synthetic-transport'
    assert len(engine.calls) == 1


@pytest.mark.parametrize('payload,media,status', [(b'bad', 'application/json', 400), (b'{"input":NaN}', 'application/json', 400),
    ({'input': 3}, 'application/json', 400), ({'input': {}, 'extra': True}, 'application/json', 400),
    ({'input': {}}, 'text/plain', 415), (b'x' * ((1 << 20) + 1), 'application/json', 413)])
def testTransportValidation(service, payload, media, status):
    engine, url = service
    assert send(url, payload, media)[0] == status
    assert not engine.calls


def testColdMissionExplicit(service):
    engine, url = service
    status, result, _ = send(url, {'input': {'operation': 'mission'}})
    assert status == 503 and result['error']['code'] == 'mission_not_ready'
    assert not engine.calls


def testBoundedAdmission(service):
    engine, url = service
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(send, url, {'input': {'operation': 'describe', 'parameters': {'wait': True}}})
        assert engine.entered.wait(2)
        status, result, _ = send(url, {'input': {'operation': 'describe'}})
        assert status == 503 and result['error']['code'] == 'engine_busy'
        engine.release.set()
        assert first.result()[0] == 200


def testHealthIncludesVersion(service):
    _, url = service
    with urllib.request.urlopen(url + '/healthz') as response:
        result = json.load(response)
    assert result['engineVersion'] == 'skyline-scientific-engine/1.0.0'
    assert not result['missionReady']
