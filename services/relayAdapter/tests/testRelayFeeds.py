import copy
import importlib.util
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from jsonschema import ValidationError

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('exportRelayFeed', root / 'scripts/exportRelayFeed.py')
exportModule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exportModule)


def exampleFeed():
    return json.loads((root / 'examples/relayFeed.computed.json').read_text(encoding='utf-8'))


def testRealRelayFeedSchemaAndImmutablePublication(tmp_path):
    feed = exampleFeed()
    path = exportModule.publishRelayFeed(feed, tmp_path, root / 'docs')
    original = path.read_bytes()
    repeat = copy.deepcopy(feed)
    for scenario in repeat['scenarios']:
        scenario['as_of'] = '2026-11-14'
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert all(result == path for result in pool.map(lambda _: exportModule.publishRelayFeed(repeat, tmp_path, root / 'docs'), range(3)))
    assert path.read_bytes() == original
    manifest = json.loads((tmp_path / 'relay/CR1.json').read_text())
    assert manifest['scenarioSelectionRequired'] is True
    assert manifest['scenarioPathTemplate'] == 'scenarios/{scenarioId}.json'
    conflict = copy.deepcopy(feed)
    conflict['comparison']['direct']['fraction'] = 0.99
    with pytest.raises(ValueError, match='collision'):
        exportModule.publishRelayFeed(conflict, tmp_path, root / 'docs')
    assert path.read_bytes() == original


def testRelayFeedRejectsMissingScienceAndLegacyFileCollision(tmp_path):
    feed = exampleFeed()
    missing = copy.deepcopy(feed)
    del missing['comparison']['samples']
    with pytest.raises(ValidationError):
        exportModule.publishRelayFeed(missing, tmp_path, root / 'docs')
    assert not list(tmp_path.rglob('*.json'))
    invalid = copy.deepcopy(feed)
    invalid['comparison']['rfQualified'] = True
    with pytest.raises(ValidationError):
        exportModule.publishRelayFeed(invalid, tmp_path, root / 'docs')
    siteFile = tmp_path / 'relay/CR1.json'
    siteFile.parent.mkdir(parents=True)
    siteFile.write_text('{"legacy":"preserved"}')
    with pytest.raises(ValueError, match='collision'):
        exportModule.publishRelayFeed(feed, tmp_path, root / 'docs')
    assert json.loads(siteFile.read_text()) == {'legacy': 'preserved'}
