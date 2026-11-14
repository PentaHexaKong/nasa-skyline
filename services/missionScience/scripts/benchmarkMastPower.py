import platform
import json
from pathlib import Path
import tempfile
from time import perf_counter

import numpy as np

from skyline_mission_science.engine import Engine
from skyline_mission_science.mastPower import evaluateMastPower
from skyline_mission_science.mastPowerModels import MastPowerRequest
from skyline_mission_science.scientificModels import ScientificRequest
from skyline_mission_science.scientificContract import (
    evaluateScientific,
    adaptScientificResponse,
)
from skyline_mission_science.schemas import EvaluationRequest
from skyline_mission_science.terrainHorizon import HorizonConfig
from skyline_mission_science.spiceGeometry import loadSpice
from skyline_mission_science.panelGeometry import panelExposure
from skyline_mission_science.powerFeeds import powerFeed, writePowerFeed

root = Path.cwd()
app = Path(__file__).resolve().parents[3]
cacheRoot = (root / 'data/cache').resolve()
report = dict(runtime=dict(platform=platform.platform(),processor=platform.processor(),python=platform.python_version()),cases=[], temporalConvergence=[], terrainConvergence={})
with tempfile.TemporaryDirectory(
    dir=cacheRoot, prefix='mastPowerBenchmark-'
) as directory:
    temporaryRoot = Path(directory).resolve()
    assert temporaryRoot.parent == cacheRoot
    engine = Engine(root / 'data/raw', temporaryRoot / 'engineCache')
    for identifier in ['CR1', 'GR1', 'SR1']:
        request = MastPowerRequest(
            site=identifier,
            startUtc='2025-01-06T00:00:00Z',
            durationS=86400,
            cadenceS=3600,
            mastHeightsM=[0, 2, 10, 30],
            verticalAzimuthDeg=90,
        )
        start = perf_counter()
        response = evaluateMastPower(engine, request)
        coldS = perf_counter() - start
        assert response.dataState == 'computed', response
        start = perf_counter()
        repeated = evaluateMastPower(engine, request)
        warmS = perf_counter() - start
        assert (
            repeated.dataState == 'computed'
            and repeated.scenarioId == response.scenarioId
        )
        report['cases'].append(
            dict(
                site=identifier,
                request=request.model_dump(mode='json'),
                coldTerrainAndResultS=coldS,
                warmResultS=warmS,
                sourceScenarioIds=response.provenance['sourceScenarioIds'],
                outcomes=[
                    dict(
                        heightM=outcome.observerHeightM,
                        metrics=outcome.environment.result.metrics.model_dump(
                            mode='json'
                        ),
                        panelMeans={
                            name: getattr(outcome.panels, name).meanGeometricExposure
                            for name in ['horizontal', 'vertical', 'tracking']
                        },
                        delta=outcome.differenceFromGround.model_dump(mode='json'),
                    )
                    for outcome in response.result.outcomes
                ],
            )
        )
        print(identifier, 'cold', round(coldS, 3), 'warm', round(warmS, 3), flush=True)
        if identifier == 'CR1':
            (root / 'examples').mkdir(exist_ok=True)
            encoded = json.dumps(response.model_dump(mode='json'), indent=2)
            (root / 'examples/mastPowerResponse.computed.json').write_text(
                encoded, encoding='utf-8'
            )
            (app / 'examples/mastPowerResponse.computed.json').write_text(
                encoded, encoding='utf-8'
            )
            (app / 'examples/mastPowerRequest.json').write_text(
                request.model_dump_json(indent=2), encoding='utf-8'
            )
            (root / 'examples/powerFeed.computed.json').write_text(
                json.dumps(powerFeed(response), indent=2), encoding='utf-8'
            )
            writePowerFeed(response, root / 'data/feeds')
            writePowerFeed(response, app / 'frontend/data/feeds')
    for cadence in [3600, 1800, 900]:
        request = ScientificRequest(
            site='CR1',
            startUtc='2025-01-06T00:00:00Z',
            durationS=86400,
            cadenceS=cadence,
            observerHeightM=10,
        )
        start = perf_counter()
        response = evaluateScientific(engine, request)
        assert response.dataState == 'computed', response
        samples = response.result.samples
        panels = panelExposure(
            [item.sun.azimuthDeg for item in samples],
            [item.sun.elevationDeg for item in samples],
            [item.sun.visibleDiskFraction for item in samples],
            [item.elapsedS for item in samples],
            90,
        )
        report['temporalConvergence'].append(
            dict(
                cadenceS=cadence,
                wallTimeS=perf_counter() - start,
                metrics=response.result.metrics.model_dump(mode='json'),
                panelMeans={
                    name: panels[name]['meanGeometricExposure'] for name in panels
                },
            )
        )
        if cadence == 1800:
            coarse = response
    request = ScientificRequest(
        site='CR1',
        startUtc='2025-01-06T00:00:00Z',
        durationS=86400,
        cadenceS=1800,
        observerHeightM=10,
    )
    start = perf_counter()
    config = HorizonConfig(observerHeightM=10, azimuthStepDeg=0.125, nearStepM=20)
    native = engine.compute(
        EvaluationRequest(
            **request.model_dump(exclude={'schemaVersion', 'observerHeightM'})
        ),
        observerHeightM=10,
        horizonConfig=config,
    )
    with loadSpice(engine.assetRoot / 'spice'):
        refined = adaptScientificResponse(engine, request, native)
    fine = np.asarray(refined.result.skyline.terrainElevationDeg)
    first = np.asarray(coarse.result.skyline.terrainElevationDeg)
    report['terrainConvergence'] = dict(
        coarseAzimuthStepDeg=0.25,
        refinedAzimuthStepDeg=0.125,
        coarseNearStepM=40,
        refinedNearStepM=20,
        refinedWallTimeS=perf_counter() - start,
        maximumAlignedHorizonDifferenceDeg=float(np.max(np.abs(first - fine[1::2]))),
        coarseMetrics=coarse.result.metrics.model_dump(mode='json'),
        refinedMetrics=refined.result.metrics.model_dump(mode='json'),
    )
report['interpretation'] = (
    'Measured fixed-site/date numerical sensitivity. These cases do not establish universal temporal or terrain convergence. Cold cases rebuild terrain in an empty temporary cache; warm cases reuse result memoization.'
)
report['limitations'] = [
    'Single 2025-01-06 date for three supported ROI sites',
    'Center-incidence disk-fraction approximation',
    'One terrain refinement pair at CR1',
    'Geometric opportunities only; no electrical or RF qualification',
]
(root / 'docs/mastPowerBenchmark.json').write_text(
    json.dumps(report, indent=2), encoding='utf-8'
)
print('Benchmark report written.', flush=True)
