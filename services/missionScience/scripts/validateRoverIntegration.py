import argparse
import concurrent.futures
import json
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import jsonschema
from pydantic import TypeAdapter
from skyline_rover_science.roverModels import RoverResponse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://localhost:8080')
    parser.add_argument('--appRoot', type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    base = json.loads((root / 'examples/roverRequest.proposed.json').read_text())
    schema = json.loads(
        (root / 'docs/roverSchemas/roverResponse.schema.json').read_text()
    )
    report = []

    def evaluate(label, request):
        started = time.perf_counter()
        query = Request(
            args.url + '/api/rover-science/v1/reachability-evaluations',
            data=json.dumps(request).encode(),
            headers={'Content-Type': 'application/json'},
        )
        try:
            reply = urlopen(query, timeout=610)
        except HTTPError as error:
            reply = error
        with reply:
            status = reply.status
            body = json.load(reply)
        jsonschema.validate(body, schema)
        TypeAdapter(RoverResponse).validate_python(body)
        for destination in [root, args.appRoot]:
            (destination / f'examples/{label}.json').write_text(
                json.dumps(body, indent=2) + '\n', encoding='utf-8'
            )
        result = body['result']
        return dict(
            label=label,
            wallS=time.perf_counter() - started,
            httpStatus=status,
            dataState=body['dataState'],
            error=body['error'],
            result=None
            if result is None
            else dict(
                requestedModeState=result['requestedModeState'],
                directOnly=result['directOnly']['reachableMask'],
                relayAssisted=result['relayAssisted']['dataState'],
                difference=result['difference'],
            ),
        )

    with concurrent.futures.ThreadPoolExecutor() as pool:
        pending = pool.submit(evaluate, 'roverResponse.live', base)
        time.sleep(2)
        for path in ['/api/mission-science/v1/capabilities', '/']:
            started = time.perf_counter()
            with urlopen(args.url + path, timeout=10) as reply:
                report.append(
                    dict(
                        path=path,
                        status=reply.status,
                        wallS=time.perf_counter() - started,
                        duringRoverEvaluation=True,
                    )
                )
        report.append(pending.result())
    if (
        report[-1]['dataState'] == 'not_computed'
        and report[-1]['error']['code'] == 'budget_exhausted'
    ):
        report.append(evaluate('roverResponse.live.retry', base))
    expected = json.loads((root / 'examples/roverResponse.computed.json').read_text())
    actualPath = root / 'examples' / (report[-1]['label'] + '.json')
    actual = json.loads(actualPath.read_text())
    assert actual['dataState'] == 'computed', (
        f'Bounded evaluation did not complete; inspect {actualPath}'
    )
    exact = (
        actual['result']['directOnly'] == expected['result']['directOnly']
        and actual['result']['timeGrid'] == expected['result']['timeGrid']
    )
    assetMatch = (
        actual['provenance']['kernels'] == expected['provenance']['kernels']
        and actual['provenance']['dems'] == expected['provenance']['dems']
    )
    assert exact and assetMatch
    report[-1]['exactReferenceArraysAndTimeGrid'] = exact
    report[-1]['referenceAssetHashesMatch'] = assetMatch
    stationary = base | dict(
        gridRadiusCells=0,
        startUtc='2025-01-06T00:00:00Z',
        durationS=240,
        communicationMode='relay-assisted',
    )
    report.append(evaluate('roverStationaryRelay', stationary))
    unsupported = base | dict(
        durationS=240,
        communicationMode='relay-assisted',
        movementRequiresSunlight=False,
        movementRequiresCommunication=False,
        stoppingRequiresSunlight=False,
        stoppingRequiresCommunication=False,
    )
    report.append(evaluate('roverMobileRelay', unsupported))
    for destination in [root, args.appRoot]:
        (destination / 'docs/roverLiveValidation.json').write_text(
            json.dumps(report, indent=2) + '\n', encoding='utf-8'
        )
    print(json.dumps(report, indent=2))
    assert all(
        item.get('dataState', 'computed') == 'computed'
        for item in report
        if (item.get('error') or {}).get('code') != 'budget_exhausted'
    )
    assert report[-2]['result']['relayAssisted'] == 'computed'
    assert report[-1]['result']['relayAssisted'] == 'unsupported'


if __name__ == '__main__':
    main()
