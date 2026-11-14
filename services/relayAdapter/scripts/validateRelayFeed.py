"""Replay supported windows through Go and record measured RelayFeed evidence."""
import argparse
import json
from pathlib import Path
import time
import urllib.error
import urllib.request

from exportRelayFeed import publishRelayFeed


def fetch(url, request):
    query = urllib.request.Request(url, data=json.dumps(request).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(query, timeout=100) as response:
        return json.load(response)


def validateSamples(feed):
    comparison = feed['comparison']
    grid, samples = comparison['grid'], comparison['samples']
    count = grid['sampleCount']
    assert grid['elapsedS'] == list(range(0, comparison['durationS'], 120))
    assert count == comparison['durationS'] // 120
    assert abs(grid['missionEpochEt'] - grid['replayEpochEt']) <= 1e-6
    for index in range(count):
        via = any(samples['siteRelayAvailable'][satellite][index] and samples['relayEarthAvailable'][satellite][index] for satellite in range(2))
        assert via == samples['viaRelayAvailable'][index]
        assert samples['assistedAvailable'][index] == (samples['directAvailable'][index] or via)
    for name, key in [('direct', 'directAvailable'), ('assisted', 'assistedAvailable')]:
        metrics, available = comparison[name], samples[key]
        assert metrics['fraction'] == sum(available) / count
        assert metrics['availableDurationS'] == sum(available) * 120
        windows = sorted(metrics['availableIntervals'] + metrics['blackoutIntervals'], key=lambda interval: interval['startS'])
        cursor = 0
        for window in windows:
            assert window['startS'] == cursor
            assert window['endS'] > window['startS']
            assert window['startClipped'] == (window['startS'] == 0)
            assert window['endClipped'] == (window['endS'] == comparison['durationS'])
            cursor = window['endS']
        assert cursor == comparison['durationS']
        assert metrics['longestBlackoutS'] == max((window['endS'] - window['startS'] for window in metrics['blackoutIntervals']), default=0)
    assert comparison['rfQualified'] is False
    assert comparison['continuousAvailabilityValidated'] is False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-url', dest='apiUrl', default='http://localhost:8080/api/relay-engineering/v1/relay-feed')
    parser.add_argument('--app-root', dest='appRoot', type=Path, required=True)
    args = parser.parse_args()
    appRoot = args.appRoot
    root = Path(__file__).resolve().parents[1]
    cases = []
    for epoch in ['2025-01-06T00:00:00Z', '2025-01-28T00:00:00Z']:
        for site in ['CR1', 'GR1', 'SR1']:
            request = dict(siteId=site, startUtc=epoch, durationS=86400)
            started = time.perf_counter()
            feed = fetch(args.apiUrl, request)
            wallS = time.perf_counter() - started
            validateSamples(feed)
            path = publishRelayFeed(feed, appRoot / 'frontend/data/feeds', appRoot / 'contracts')
            cases.append(dict(request=request, wallS=wallS, scenarioId=feed['scenarioId'], epochDifferenceS=feed['comparison']['grid']['epochDifferenceS'], direct=feed['comparison']['direct'], assisted=feed['comparison']['assisted'], path=str(path)))
            if site == 'CR1' and epoch.startswith('2025-01-06'):
                assert feed['comparison']['direct']['fraction'] == 0.3625
                assert feed['comparison']['assisted']['fraction'] == 1
                for destination in [appRoot / 'examples/relayFeed.computed.json', root / 'examples/relayFeed.computed.json']:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_text(json.dumps(feed, indent=2) + '\n')
            print(json.dumps({'site': site, 'epoch': epoch, 'wallS': wallS, 'direct': feed['comparison']['direct']['fraction'], 'assisted': feed['comparison']['assisted']['fraction']}), flush=True)
    boundary = fetch(args.apiUrl, dict(siteId='CR1', startUtc='2025-01-28T23:58:00Z', durationS=120))
    validateSamples(boundary)
    rejected = []
    for request in [
        dict(siteId='apollo11', startUtc='2025-01-06T00:00:00Z', durationS=86400),
        dict(siteId='CR1', startUtc='2026-11-20T00:00:00Z', durationS=86400),
        dict(siteId='CR1', startUtc='2025-01-06T00:00:01Z', durationS=86400),
        dict(siteId='CR1', startUtc='2025-01-06T00:00:00Z', durationS=121),
        dict(siteId='CR1', startUtc='2025-01-28T23:58:00Z', durationS=240),
    ]:
        try:
            fetch(args.apiUrl, request)
            raise AssertionError('Unsupported request was accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 422
            rejected.append(dict(request=request, status=error.code))
    report = dict(cases=cases, exactElapsedGrid=True, absoluteEtToleranceS=1e-6, booleanHopConsistency=True, sampleIntervalChecks=True, finalReplayBinPassed=True, rejected=rejected, independentlyValidated=False)
    for destination in [root / 'docs/relayFeedRuntime.json', appRoot / 'docs/relayFeedRuntime.json']:
        destination.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
