import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('verifyScienceDeployment', Path(__file__).with_name('verifyScienceDeployment.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def testTextLineEndingsAndContent(tmp_path):
    source = tmp_path / 'source.py'
    source.write_bytes(b'value = 1\n')
    expected = verifier.digest(source)
    source.write_bytes(b'value = 1\r\n')
    assert verifier.digest(source) == expected
    source.write_bytes(b'value = 2\r\n')
    assert verifier.digest(source) != expected


def testTrajectoryBytesRemainExact(tmp_path):
    source = tmp_path / 'states.csv'
    source.write_bytes(b'1,2\n')
    expected = verifier.digest(source)
    source.write_bytes(b'1,2\r\n')
    assert verifier.digest(source) != expected


def testSourceInventoryRejectsUnlistedFiles(tmp_path, monkeypatch):
    source = tmp_path / 'science'
    source.mkdir()
    first = source / 'one.py'
    first.write_text('value = 1\n')
    manifest = tmp_path / 'manifest.json'
    manifest.write_text(json.dumps({'files': [{'path': 'science/one.py', 'sha256': verifier.digest(first)}]}))
    monkeypatch.setattr(verifier, 'APP_ROOT', tmp_path)
    monkeypatch.setattr(verifier, 'MANIFEST', manifest)
    monkeypatch.setattr(verifier, 'SOURCES', ['science'])
    monkeypatch.setattr(verifier.sys, 'argv', ['verifyScienceDeployment.py'])
    verifier.main()
    (source / 'two.py').write_text('value = 2\n')
    with pytest.raises(ValueError, match='unlisted'):
        verifier.main()
