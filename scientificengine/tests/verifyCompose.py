'''Run real scientific Compose checks after `docker compose up -d backend`.'''
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def docker(*args):
    return subprocess.check_output(['docker', *args], cwd=ROOT, text=True).strip()


def containerPython(code):
    return json.loads(docker('compose', 'exec', '-T', 'scientificengine', 'python', '-c', code))


def evaluate(operation, parameters):
    payload = json.dumps({'input': {'schemaVersion': 'skyline-science-request/1.0.0',
                                  'operation': operation, 'parameters': parameters}})
    code = f'''import json, urllib.request
request = urllib.request.Request('http://127.0.0.1:8003/analyze', data={payload!r}.encode(), headers={{'Content-Type':'application/json'}})
with urllib.request.urlopen(request, timeout=120) as response:
    print(response.read().decode())'''
    response = containerPython(code)
    assert response['dataState'] == 'computed', response
    assert response['operation'] == operation
    return response


def main():
    checks = []
    identifier = docker('compose', 'ps', '-q', 'scientificengine')
    info = json.loads(docker('inspect', identifier))[0]
    assert info['State']['Health']['Status'] == 'healthy'
    assert info['Config']['User'] == '10001:10001'
    mounts = {mount['Destination']: mount for mount in info['Mounts']}
    for path in ('/science', '/science/data/raw'):
        assert mounts[path]['Type'] == 'bind' and not mounts[path]['RW']
    for path in ('/cache', '/science/data/processed/surfaceRf/demo/horizonCache'):
        assert mounts[path]['Type'] == 'volume' and mounts[path]['RW']
    checks.append('non-root container, read-only source/assets and persistent writable caches')
    health = containerPython("import json, urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8003/healthz').read().decode())")
    assert health['missionReady']
    checks.append('mission readiness')
    assert evaluate('describe', {})['result']['sourceIntegrity'] == 'verified'
    checks.append('physical source integrity')
    ephemeris = evaluate('ephemeris', {'durationS': 120, 'stepS': 60})
    assert len(ephemeris['result']['earthPositionKm']) == 2
    assert len(ephemeris['provenance']['datasets']) == 7
    checks.append('native SPICE ephemeris and seven kernel hashes')
    terrain = evaluate('terrain', {'siteId': 'CR1'})
    assert len(terrain['result']['horizonElevationDeg']) == 1440
    assert len(terrain['provenance']['datasets']) == 2
    checks.append('native LOLA terrain horizon and two DEM hashes')
    parameters = dict(scope='S1_CR1_CONNECTING_RIDGE', orbit='C4', mastHeightM=0)
    mission = evaluate('mission', parameters)
    reference = json.loads((ROOT / 'examples/scientificengine-result.computed.json').read_text())
    assert mission['result']['designId'] == reference['result']['designId']
    assert mission['result']['feasible'] == reference['result']['feasible']
    for actual, expected in zip(mission['result']['objectives'], reference['result']['objectives'], strict=True):
        assert math.isclose(actual, expected, rel_tol=0, abs_tol=1e-9), (actual, expected)
    for name in ('C2', 'C4'):
        assert math.isclose(mission['result']['trajectoryMinimumAltitudeKm'][name],
                            reference['result']['trajectoryMinimumAltitudeKm'][name], rel_tol=0, abs_tol=1e-6)
    checks.append('native mission parity against committed INT-4 objectives and altitude')
    payload = json.dumps({'input': {'schemaVersion': 'skyline-science-request/1.0.0', 'operation': 'mission', 'parameters': parameters}})
    bridged = json.loads(docker('compose', 'exec', '-T', 'backend', 'wget', '-qO-',
        '--header=Content-Type: application/json', '--post-data=' + payload,
        'http://127.0.0.1:8080/api/scientificengine'))
    assert bridged['dataState'] == 'computed'
    assert bridged['result'] == mission['result']
    checks.append('real containerized Go-to-Python mission route')
    print(json.dumps(dict(passed=len(checks), failed=0, checks=checks), indent=2))


if __name__ == '__main__':
    main()
