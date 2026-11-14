"""Publish an immutable RelayFeed obtained from the authoritative Go comparison route."""
import argparse
import copy
import json
import os
from pathlib import Path
import tempfile
import urllib.request

from jsonschema import Draft202012Validator, FormatChecker


def normalizedFeed(feed):
    normalized = copy.deepcopy(feed)
    for scenario in normalized.get('scenarios', []):
        scenario.pop('as_of', None)
    return normalized


def writeImmutableJson(destination, payload):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=destination.parent, delete=False) as stream:
        temporaryPath = Path(stream.name)
        json.dump(payload, stream, indent=2, allow_nan=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    try:
        try:
            os.link(temporaryPath, destination)
        except FileExistsError:
            if normalizedFeed(json.loads(destination.read_text(encoding='utf-8-sig'))) != normalizedFeed(payload):
                raise ValueError(f'Immutable feed collision at {destination}')
    finally:
        temporaryPath.unlink(missing_ok=True)
    return destination


def publishRelayFeed(feed, outputRoot, contractRoot):
    contractRoot, outputRoot = Path(contractRoot), Path(outputRoot)
    validator = Draft202012Validator(
        json.loads((contractRoot / 'relayFeedV1.schema.json').read_text(encoding='utf-8-sig')),
        format_checker=FormatChecker(),
    )
    validator.validate(feed)
    scenarioId, siteId = feed['scenarioId'], feed['site_id']
    if siteId != feed['scenario']['request']['siteId']:
        raise ValueError('Feed site and scenario request differ')
    manifest = dict(
        schemaVersion='skyline-relay-manifest/1.0.0', siteId=siteId,
        scenarioSelectionRequired=True, scenarioPathTemplate='scenarios/{scenarioId}.json',
    )
    Draft202012Validator(
        json.loads((contractRoot / 'relayManifest.schema.json').read_text(encoding='utf-8-sig')),
        format_checker=FormatChecker(),
    ).validate(manifest)
    # Publish the immutable payload before exposing its lookup convention.
    payloadPath = writeImmutableJson(outputRoot / 'relay' / 'scenarios' / f'{scenarioId}.json', feed)
    writeImmutableJson(outputRoot / 'relay' / f'{siteId}.json', manifest)
    return payloadPath


def exportRelayFeed(request, apiUrl, outputRoot, contractRoot):
    body = json.dumps(request, allow_nan=False).encode('utf-8')
    query = urllib.request.Request(apiUrl, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(query, timeout=100) as response:
        feed = json.load(response)
    if feed.get('scenario', {}).get('request') != request:
        raise ValueError('Go response scenario differs from the requested scenario')
    return publishRelayFeed(feed, outputRoot, contractRoot)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--api-url', dest='apiUrl', default='http://localhost:8080/api/relay-engineering/v1/relay-feed')
    parser.add_argument('--output-root', dest='outputRoot', type=Path, default=Path('data/feeds'))
    parser.add_argument('--contract-root', dest='contractRoot', type=Path, required=True)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding='utf-8-sig'))
    print(exportRelayFeed(request, args.apiUrl, args.outputRoot, args.contractRoot))


if __name__ == '__main__':
    main()
