import argparse
import ctypes
import json
import os
from pathlib import Path
import platform
import sys
import tempfile
import time

from skyline_mission_science.engine import Engine
from skyline_mission_science.mastFeeds import mastFeed, writeMastFeed
from skyline_mission_science.mastPlacement import evaluateMastPlacement
from skyline_mission_science.mastPlacementModels import MastPlacementRequest


def processMemory():
    if sys.platform == 'win32':

        class MemoryCounters(ctypes.Structure):
            _fields_ = [('cb', ctypes.c_ulong), ('PageFaultCount', ctypes.c_ulong)] + [
                (name, ctypes.c_size_t)
                for name in [
                    'PeakWorkingSetSize',
                    'WorkingSetSize',
                    'QuotaPeakPagedPoolUsage',
                    'QuotaPagedPoolUsage',
                    'QuotaPeakNonPagedPoolUsage',
                    'QuotaNonPagedPoolUsage',
                    'PagefileUsage',
                    'PeakPagefileUsage',
                ]
            ]

        counters = MemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        if not ctypes.windll.psapi.GetProcessMemoryInfo(
            ctypes.c_void_p(-1), ctypes.byref(counters), counters.cb
        ):
            raise OSError('Cannot measure process working set')
        return dict(
            currentRssBytes=counters.WorkingSetSize,
            processPeakRssBytes=counters.PeakWorkingSetSize,
        )
    import resource

    statm = Path('/proc/self/statm')
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return dict(
        currentRssBytes=int(statm.read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE') if statm.exists() else None,
        processPeakRssBytes=peak if sys.platform == 'darwin' else peak * 1024,  # macOS reports bytes, Linux KiB
    )


def sourceOutcomes(response):
    return {
        (candidate.candidateId, outcome.observerHeightM): outcome.environment.scenarioId
        for candidate in response.result.candidates
        for outcome in candidate.outcomes
        if outcome.environment is not None
    }


def main():
    parser = argparse.ArgumentParser(
        description='Reproducible exhaustive mast-placement spatial/runtime/memory benchmark'
    )
    parser.add_argument(
        '--app-root', dest='appRoot', type=Path, default=Path(__file__).resolve().parents[3]
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    cases = []
    with tempfile.TemporaryDirectory() as cacheRoot:
        engine = Engine(root / 'data/raw', cacheRoot)
        coarse = MastPlacementRequest(
            site='CR1',
            startUtc='2025-01-06T00:00:00Z',
            durationS=86400,
            cadenceS=3600,
            searchRadiusM=80,
            gridResolutionM=80,
            mastHeightsM=[0, 2],
            maximumCableLengthM=80,
            verticalAzimuthDeg=90,
            constraints=dict(
                minimumSolar=0.8,
                minimumEarth=0.5,
                maximumSolarOutageS=3600,
                maximumEarthOutageS=30000,
            ),
            evaluationBudget=dict(maxEvaluations=10, maxWallTimeS=300),
        )
        fine = MastPlacementRequest.model_validate(
            coarse.model_dump()
            | dict(
                gridResolutionM=40,
                evaluationBudget=dict(maxEvaluations=26, maxWallTimeS=300),
            )
        )
        responses = []
        for label, request in [
            ('coldCoarseGrid', coarse),
            ('memoizedCoarseGrid', coarse),
            ('refinedSpatialGrid', fine),
        ]:
            before = processMemory()
            started = time.perf_counter()
            response = evaluateMastPlacement(engine, request)
            wallS = time.perf_counter() - started
            assert response.dataState == 'computed', response
            assert response.result.optimization.complete, response.result.optimization
            responses.append(response)
            feed = mastFeed(response)
            record = dict(
                label=label,
                request=request.model_dump(mode='json'),
                wallS=wallS,
                memoryBefore=before,
                memoryAfter=processMemory(),
                scenarioId=response.scenarioId,
                optimization=response.result.optimization.model_dump(mode='json'),
                cacheEntries=dict(
                    nativeResult=len(engine.memo),
                    horizon=len(engine.horizonCache.values),
                    ephemeris=len(engine.ephemerisCache.values),
                ),
                feedBytes=len(feed.model_dump_json().encode()),
                underresolvedGridCandidateCount=sum(
                    candidate.gridFinerThanDem
                    for candidate in response.result.candidates
                ),
            )
            record['sourceScenarioIds'] = [dict(candidateId=key[0], observerHeightM=key[1], sourceScenarioId=value) for key, value in sourceOutcomes(response).items()]
            cases.append(record)
            print(
                json.dumps(
                    dict(
                        label=label,
                        wallS=wallS,
                        candidates=len(response.result.candidates),
                        feasible=response.result.optimization.feasibleOutcomeCount,
                        nondominated=len(response.result.optimization.paretoSet),
                    )
                ),
                flush=True,
            )
        coarseResponse, memoResponse, fineResponse = responses
        assert coarseResponse.scenarioId == memoResponse.scenarioId
        shared = sourceOutcomes(coarseResponse)
        refined = sourceOutcomes(fineResponse)
        assert all(refined[key] == value for key, value in shared.items())
        assert set(shared) <= set(refined)
        assert coarseResponse.scenarioId != fineResponse.scenarioId
        for appRoot in [args.appRoot, root]:
            (appRoot / 'examples').mkdir(exist_ok=True)
            (appRoot / 'examples/mastPlacementRequest.json').write_text(
                coarse.model_dump_json(indent=2) + '\n', encoding='utf-8'
            )
            (appRoot / 'examples/mastPlacementResponse.computed.json').write_text(
                coarseResponse.model_dump_json(indent=2) + '\n', encoding='utf-8'
            )
            (appRoot / 'examples/mastFeed.computed.json').write_text(
                mastFeed(coarseResponse).model_dump_json(indent=2) + '\n',
                encoding='utf-8',
            )
        for response in [coarseResponse, fineResponse]:
            writeMastFeed(response, args.appRoot / 'frontend/data/feeds')
        report = dict(
            cases=cases,
            scientificSourceIdentity=mastFeed(coarseResponse).provenance.model_dump(mode='json', exclude={'baselineScenarioId'}),
            sharedScientificScenarioIdsIdentical=True,
            zeroOffsetBaselinePreserved=True,
            refinedGridContainsCoarse=True,
            memoizedScenarioIdentityStable=True,
            runtime=dict(
                platform=platform.platform(), python=platform.python_version()
            ),
            memorySemantics='OS process working set and cumulative process peak RSS, including interpreter and scientific caches; peaks are cumulative across cases',
            cacheSemantics='First case uses empty temporary terrain/result caches; OS file cache uncontrolled; later cases share the evaluator and caches',
            independentlyValidated=False,
        )
        for appRoot in [root, args.appRoot]:
            (appRoot / 'docs/mastPlacementBenchmark.json').write_text(
                json.dumps(report, indent=2) + '\n', encoding='utf-8'
            )


if __name__ == '__main__':
    main()
