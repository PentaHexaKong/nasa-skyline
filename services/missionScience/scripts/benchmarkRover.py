import argparse
import json
from pathlib import Path
import platform
import time

from benchmarkMastPlacement import processMemory
from skyline_rover_science.roverEvaluation import RoverEngine
from skyline_rover_science.roverGraph import timeExpandedReachability
from skyline_rover_science.roverModels import RoverRequest
import numpy as np


def main():
    parser = argparse.ArgumentParser(
        description='Real-data and bounded graph rover prototype benchmark'
    )
    parser.add_argument(
        '--app-root', dest='appRoot', type=Path, default=Path(__file__).resolve().parents[3]
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    engine = RoverEngine(root / 'data/raw', root / 'data/roverBenchmarkCache')
    request = RoverRequest(
        site='CR1',
        startUtc='2025-01-06T18:00:00Z',
        durationS=1800,
        timeStepS=120,
        speedMps=0.2,
        maximumSlopeDeg=20,
        budget=dict(maxGeometryEvaluations=21, maxWallTimeS=300),
    )
    cases = []
    responses = []
    for label, scenario in [
        ('realLocalGrid', request),
        ('cachedRealGrid', request),
        ('finerTimeGrid', request.model_copy(update={'timeStepS': 60})),
    ]:
        before = processMemory()
        started = time.perf_counter()
        result = engine.evaluate(scenario)
        wallS = time.perf_counter() - started
        assert result.dataState == 'computed', result
        responses.append(result)
        direct = result.result.directOnly
        cases.append(
            dict(
                label=label,
                request=scenario.model_dump(mode='json'),
                scenarioId=result.scenarioId,
                wallS=wallS,
                memoryBefore=before,
                memoryAfter=processMemory(),
                reachableCellCount=sum(
                    value is True for row in direct.reachableMask for value in row
                ),
                earliestArrivalS=direct.earliestArrivalS,
                transitionsChecked=direct.transitionsChecked,
                geometryEvaluations=result.provenance['geometryEvaluations'],
            )
        )
        print(json.dumps(cases[-1]), flush=True)
    assert responses[0].scenarioId == responses[1].scenarioId
    assert responses[0].result.directOnly == responses[1].result.directOnly
    result = responses[0]
    grid = result.result.grid
    graphRequest = request.model_copy(update={'durationS': 7200, 'timeStepS': 60})
    levels = 121
    mask = np.ones((len(grid.points), levels), dtype=bool)
    started = time.perf_counter()
    for _ in range(100):
        graph = timeExpandedReachability(
            grid,
            graphRequest,
            mask,
            mask,
            [f'synthetic-{index}' for index in range(levels)],
        )
    graphWallS = time.perf_counter() - started
    report = dict(
        cases=cases,
        syntheticGraphBenchmark=dict(
            origin='synthetic all-visible constraints over actual terrain grid',
            iterations=100,
            nodesPerIteration=grid.rows * grid.columns * levels,
            totalWallS=graphWallS,
            transitionsPerIteration=graph.transitionsChecked,
        ),
        runtime=dict(platform=platform.platform(), python=platform.python_version()),
        memorySemantics='OS RSS including interpreter and native caches; peak is cumulative since process start',
        cacheSemantics='Terrain and result cache initially use dedicated persistent roverBenchmarkCache; OS file cache uncontrolled',
        deterministicRepeat=True,
        independentlyValidated=False,
    )
    for destination in [root, args.appRoot]:
        (destination / 'examples/roverRequest.proposed.json').write_text(
            request.model_dump_json(indent=2) + '\n', encoding='utf-8'
        )
        (destination / 'examples/roverResponse.computed.json').write_text(
            result.model_dump_json(indent=2) + '\n', encoding='utf-8'
        )
        (destination / 'docs/roverBenchmark.json').write_text(
            json.dumps(report, indent=2) + '\n', encoding='utf-8'
        )


if __name__ == '__main__':
    main()
