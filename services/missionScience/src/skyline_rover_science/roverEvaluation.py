from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

import numpy as np
import spiceypy as spice
from skyline_mission_science.engine import Engine, fileHash
from skyline_mission_science.intermediateCache import (
    identityKey,
    implementationIdentity,
)
from skyline_mission_science.scientificContract import evaluateScientific
from skyline_mission_science.scientificModels import ScientificRequest
from skyline_mission_science.siteCatalog import resolveSite
from skyline_mission_science.spiceGeometry import loadSpice
from skyline_mission_science.terrainHorizon import TerrainCoverageError

from .roverModels import (
    RoverRequest,
    RoverComputed,
    RoverFailure,
    RoverResult,
    RoverSection,
)
from .roverTerrain import buildRoverGrid
from .roverGraph import timeExpandedReachability, RoverBudgetExceeded


limitations = [
    'Reachability is conditional on a bounded projected grid and sampled simplified model',
    'Battery state of charge, thermal survival, wheel-soil interaction and detailed traction are unmodeled',
    'DEM-scale slopes and interpolated midpoint grades omit sub-resolution hazards and rocks',
    'Real navigation, autonomy and construction or operational routing safety are unvalidated',
    'Geometric Earth-center visibility has no operational RF qualification or ground-station model',
    'Source, midpoint and destination visibility must hold at every crossed time level; subcell and substep outages can remain unresolved',
    'Time snapping rounds travel duration upward; edge distance is a two-segment DEM-interpolated 3D polyline',
    'Reachable time-level fractions count discrete node states including the endpoint; they are not continuous occupancy durations',
    'Waiting-opportunity bins are sample-derived and exclude the final endpoint',
    'Waiting through darkness or communication loss is an explicit stopping-rule assumption with survival unmodeled',
    'Wall-time checks are cooperative between complete scientific evaluations',
]


def roverFailure(state, code, message, request=None, coverage=None):
    return RoverFailure(
        dataState=state,
        request=request,
        coverage=coverage,
        error=dict(code=code, message=message),
    )


def relayCompatibility(request):
    if request.gridRadiusCells != 0:
        return 'Moving grids require independently established relay compatibility at every cell and edge midpoint'
    if request.observerHeightM != 0:
        return 'Pinned replay requires the canonical zero-height observer'
    if request.timeStepS != 120:
        return 'Pinned replay requires the common 120-second grid'
    origin = datetime(2025, 1, 1, tzinfo=timezone.utc)
    offset = (request.startUtc - origin).total_seconds()
    if offset < 0 or offset % 120 or offset + request.durationS + 120 > 28 * 86400:
        return 'Pinned replay requires aligned 2025 samples including one exported endpoint lookahead'
    return None


def fetchRelayComparison(request, url):
    if not url:
        raise ValueError(
            'Configure ROVER_RELAY_COMPARE_URL for compatible stationary relay evaluation'
        )
    query = dict(
        siteId=request.site,
        startUtc=request.startUtc.isoformat().replace('+00:00', 'Z'),
        durationS=request.durationS + 120,
    )
    operation = Request(
        url,
        data=json.dumps(query).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urlopen(operation, timeout=100) as reply:
        raw = reply.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError('Relay comparison exceeded response bound')
    return json.loads(raw)


def replayArrays(comparison, grid, request, localHashes):
    mission = comparison['missionScience']
    relay = comparison['relayScience']
    if (
        comparison.get('dataState') != 'computed'
        or mission['dataState'] != 'computed'
        or relay['dataState'] != 'computed'
    ):
        raise ValueError(
            'Relay orchestration did not return computed scientific results'
        )
    a, b = mission['provenance'], relay['provenance']
    if (
        a['frame'] != 'MOON_ME_DE421'
        or b['frame'] != a['frame']
        or a['correction'] != 'NONE'
        or b['correction'] != 'NONE'
        or b['observerHeightM'] != 0
        or b['minimumElevationDeg'] != 0
        or b['rfQualified']
    ):
        raise ValueError('Relay frame or observer profile mismatch')
    source = b['request']
    if (
        source['siteId'] != request.site
        or source['candidateId'] != 'nominal-candidate-2'
        or source['cadenceS'] != 120
        or source['durationS'] != request.durationS + 120
        or datetime.fromisoformat(source['startUtc'].replace('Z', '+00:00'))
        != request.startUtc
    ):
        raise ValueError('Relay request/trajectory epoch mismatch')
    hashes = {
        Path(path.replace('\\', '/')).name: digest
        for path, digest in b['sources'].items()
    }
    for name, digest in localHashes.items():
        if hashes.get(name) != digest:
            raise ValueError('Relay kernel or DEM identity mismatch')
    if (
        hashes.get('candidate2States.csv')
        != '0f328f101228015d55ad301c512ffec27091beb02adb3649d3276669b1f54bce'
    ):
        raise ValueError('Relay trajectory identity mismatch')
    position = grid.points[grid.cellPointIndices[0]].surfacePositionM
    if (
        not np.allclose(a['observerPositionM'], position, rtol=0, atol=1e-6)
        or not np.allclose(b['sitePositionM'], position, rtol=0, atol=1e-6)
        or abs(a['epochEt'] - b['epochEt']) > 1e-6
    ):
        raise ValueError('Relay absolute clock or observer position mismatch')
    levels = request.durationS // 120 + 1
    result = relay['result']
    times = list(range(0, request.durationS + 120, 120))
    if result['timesS'] != times or mission['result']['timesS'] != times + [
        request.durationS + 120
    ]:
        raise ValueError('Relay common grid mismatch')
    earth = [
        value >= 0
        for value in mission['result']['bodies']['EARTH']['clearanceDeg'][:levels]
    ]
    direct = result['directAvailable']
    assisted = result['assistedAvailable']
    if (
        len(direct) != levels
        or len(assisted) != levels
        or direct != earth
        or len(result['siteRelayAvailable']) != 2
        or len(result['relayEarthAvailable']) != 2
    ):
        raise ValueError(
            'Relay synchronized boolean dimensions or direct parity mismatch'
        )
    if any(
        len(leg) != levels
        for leg in result['siteRelayAvailable'] + result['relayEarthAvailable']
    ):
        raise ValueError('Relay hop dimensions mismatch')
    for index in range(levels):
        via = any(
            result['siteRelayAvailable'][satellite][index]
            and result['relayEarthAvailable'][satellite][index]
            for satellite in range(2)
        )
        if via != result['viaRelayAvailable'][index] or assisted[index] != (
            direct[index] or via
        ):
            raise ValueError('Relay simultaneous-hop mismatch')
    solar = mission['result']['bodies']['SUN']
    sun = [value > 0 for value in solar['visibleDiskFraction'][:levels]]
    if request.solarDefinition == 'center':
        sun = [value >= 0 for value in solar['clearanceDeg'][:levels]]
    if request.solarDefinition == 'fullDisk':
        sun = [value == 1 for value in solar['visibleDiskFraction'][:levels]]
    return (
        sun,
        direct,
        assisted,
        a['epochEt'],
        dict(
            missionScience=a,
            relayScience=b,
            lookaheadS=120,
            absoluteEpochToleranceS=1e-6,
        ),
    )


class RoverEngine:
    def __init__(self, assetRoot=None, cacheRoot=None, relayComparisonUrl=None):
        self.science = Engine(
            assetRoot,
            cacheRoot or os.environ.get('ROVER_CACHE_ROOT', 'data/roverCache'),
        )
        self.relayComparisonUrl = (
            relayComparisonUrl
            if relayComparisonUrl is not None
            else os.environ.get('ROVER_RELAY_COMPARE_URL', '')
        )

    def evaluate(self, request):
        request = RoverRequest.model_validate(request)
        started = time.perf_counter()
        completed = 0

        def checkBudget():
            if time.perf_counter() - started >= request.budget.maxWallTimeS:
                raise RoverBudgetExceeded('Cooperative wall-time budget exhausted')

        try:
            try:
                reference = resolveSite(request.site)
            except ValueError as error:
                return roverFailure(
                    'unsupported', 'site_unsupported', str(error), request
                )
            if reference.siteId != request.site:
                return roverFailure(
                    'unsupported',
                    'canonical_site_required',
                    'A canonical starting site is required',
                    request,
                )
            grid, sites = buildRoverGrid(self.science.assetRoot, reference, request)
            if not grid.points[grid.cellPointIndices[grid.startCell]].terrainValid:
                return roverFailure(
                    'unavailable',
                    'starting_terrain_unavailable',
                    'Starting terrain or slope footprint is unavailable',
                    request,
                )
            with loadSpice(self.science.assetRoot / 'spice') as kernels:
                localHashes = {path.name: fileHash(path) for path in kernels}
                localHashes[request.terrainDemId] = grid.dem['sha256']
                localHashes['LDEM_60S_240MPP_ADJ.TIF'] = fileHash(
                    self.science.assetRoot / 'lola/LDEM_60S_240MPP_ADJ.TIF'
                )
                epochEt = spice.str2et(
                    request.startUtc.isoformat().replace('+00:00', 'Z')
                )
            levels = request.durationS // request.timeStepS + 1
            needsVisibility = any(
                [
                    request.movementRequiresSunlight,
                    request.stoppingRequiresSunlight,
                    request.movementRequiresCommunication,
                    request.stoppingRequiresCommunication,
                ]
            )
            sun = np.zeros((len(sites), levels), dtype=bool)
            direct = sun.copy()
            relaySection = RoverSection(
                dataState='not_computed', reason='Relay comparison was not requested'
            )
            relayData = None
            replay = None
            series = {}
            sources = []
            if request.communicationMode == 'relay-assisted':
                reason = relayCompatibility(request)
                if reason:
                    relaySection = RoverSection(dataState='unsupported', reason=reason)
                else:
                    try:
                        checkBudget()
                        if completed >= request.budget.maxGeometryEvaluations:
                            raise RoverBudgetExceeded('Geometry count budget exhausted')
                        completed += 1
                        replay = fetchRelayComparison(request, self.relayComparisonUrl)
                        solar, earth, assisted, epochEt, relayData = replayArrays(
                            replay, grid, request, localHashes
                        )
                        sun[0] = solar
                        direct[0] = earth
                        series[0] = dict(
                            pointIndex=0,
                            dataState='computed',
                            sourceScenarioId=None,
                            sunAvailable=solar,
                            directAvailable=earth,
                            source='authoritative Go synchronized comparison',
                        )
                    except RoverBudgetExceeded:
                        raise
                    except (ValueError, KeyError, URLError, OSError) as error:
                        replay = None
                        relayData = None
                        relaySection = RoverSection(
                            dataState='unavailable', reason=str(error)
                        )
            needed = {
                index
                for cell, index in enumerate(grid.cellPointIndices)
                if grid.terrainTraversableMask[cell // grid.columns][
                    cell % grid.columns
                ]
            }
            needed.update(edge.midpointPoint for edge in grid.edges if edge.traversable)
            if needsVisibility and replay is None:
                first = None
                for pointIndex in sorted(needed):
                    checkBudget()
                    if completed >= request.budget.maxGeometryEvaluations:
                        raise RoverBudgetExceeded('Geometry count budget exhausted')
                    response = evaluateScientific(
                        self.science,
                        ScientificRequest(
                            site=request.site
                            if pointIndex == grid.cellPointIndices[grid.startCell]
                            else sites[pointIndex],
                            startUtc=request.startUtc,
                            durationS=request.durationS,
                            cadenceS=request.timeStepS,
                            observerHeightM=request.observerHeightM,
                            profile=request.profile,
                            solarDefinition=request.solarDefinition,
                            horizonOffsetDeg=0,
                            localResolutionM=80,
                        ),
                    )
                    completed += 1
                    if response.dataState != 'computed':
                        return roverFailure(
                            response.dataState,
                            'observer_geometry_unavailable',
                            response.error.message,
                            request,
                            dict(pointIndex=pointIndex, completed=completed),
                        )
                    observedAssets = dict(response.provenance.kernels)
                    observedAssets.update(
                        {dem.filename: dem.sha256 for dem in response.provenance.dems}
                    )
                    if observedAssets != localHashes:
                        raise ValueError(
                            'Grid, time conversion and observer geometry use different scientific assets'
                        )
                    if first is None:
                        first = response
                    elif (
                        response.provenance.kernels != first.provenance.kernels
                        or response.provenance.dems != first.provenance.dems
                        or response.provenance.implementation
                        != first.provenance.implementation
                    ):
                        raise ValueError(
                            'Scientific source identities changed across rover observers'
                        )
                    solar = [
                        sample.sun.sunlightVisible for sample in response.result.samples
                    ]
                    earth = [
                        sample.earth.centerVisible for sample in response.result.samples
                    ]
                    sun[pointIndex] = solar
                    direct[pointIndex] = earth
                    series[pointIndex] = dict(
                        pointIndex=pointIndex,
                        dataState='computed',
                        sourceScenarioId=response.scenarioId,
                        sunAvailable=solar,
                        directAvailable=earth,
                        source='P1 scientific evaluation',
                    )
                    sources.append(response.provenance.model_dump(mode='json'))
            with loadSpice(self.science.assetRoot / 'spice'):
                timestamps = [
                    spice.et2utc(epochEt + index * request.timeStepS, 'ISOC', 6) + 'Z'
                    for index in range(levels)
                ]
            for pointIndex in range(len(sites)):
                if pointIndex not in series:
                    series[pointIndex] = dict(
                        pointIndex=pointIndex,
                        dataState='not_computed',
                        sourceScenarioId=None,
                        sunAvailable=None,
                        directAvailable=None,
                        source='Not required or excluded by terrain constraints',
                    )
            directSection = timeExpandedReachability(
                grid,
                request,
                sun if needsVisibility else None,
                direct if needsVisibility else None,
                timestamps,
                checkBudget,
            )
            if replay is not None:
                relaySection = timeExpandedReachability(
                    grid,
                    request,
                    sun,
                    np.asarray([assisted], dtype=bool),
                    timestamps,
                    checkBudget,
                )
            difference = dict(
                dataState=relaySection.dataState,
                additionalReachableMask=None,
                newlyReachableCellCount=None,
                earliestArrivalGainS=None,
            )
            if relaySection.dataState == 'computed':
                gains = []
                arrivalGains = []
                for row in range(grid.rows):
                    gains.append(
                        [
                            None if a is None or b is None else b and not a
                            for a, b in zip(
                                directSection.reachableMask[row],
                                relaySection.reachableMask[row],
                            )
                        ]
                    )
                    arrivalGains.append(
                        [
                            None if a is None or b is None else a - b
                            for a, b in zip(
                                directSection.earliestArrivalS[row],
                                relaySection.earliestArrivalS[row],
                            )
                        ]
                    )
                difference = dict(
                    dataState='computed',
                    additionalReachableMask=gains,
                    newlyReachableCellCount=sum(
                        value is True for row in gains for value in row
                    ),
                    earliestArrivalGainS=arrivalGains,
                )
            if (
                fileHash(self.science.assetRoot / 'lola' / request.terrainDemId)
                != grid.dem['sha256']
            ):
                raise ValueError('Terrain changed during rover evaluation')
            implementation = {
                path.name: fileHash(path)
                for path in sorted(Path(__file__).parent.glob('*.py'))
            }
            result = RoverResult(
                grid=grid,
                timeGrid=dict(
                    nominalStartUtc=request.startUtc.isoformat().replace('+00:00', 'Z'),
                    elapsedS=list(range(0, request.durationS + 1, request.timeStepS)),
                    timestampsUtc=timestamps,
                    endpointIncluded=True,
                    durationScale='elapsed SPICE ET seconds',
                    timeLevelFractionDenominator=levels,
                    waitingBins='half-open [start,end); sampled stopping opportunities',
                ),
                directOnly=directSection,
                relayAssisted=relaySection,
                difference=difference,
                visibility=dict(
                    points=[series[index] for index in range(len(sites))],
                    sampling='Source, midpoint and destination at every crossed time level',
                    subcellAndSubstepEventsUnresolved=True,
                ),
                requestedModeState=directSection.dataState
                if request.communicationMode == 'direct-only'
                else relaySection.dataState,
            )
            coreImplementation = implementationIdentity()
            identity = dict(
                request=request.model_dump(mode='json'),
                grid=grid.model_dump(mode='json'),
                timeGrid=result.timeGrid.model_dump(mode='json'),
                visibility=result.visibility,
                roverImplementation=implementation,
                coreImplementation=coreImplementation,
                scientificAssets=localHashes,
                scientificSources=[source['cacheKey'] for source in sources],
                relaySource=None
                if relayData is None
                else dict(
                    missionCacheKey=relayData['missionScience']['cacheKey'],
                    relaySources=relayData['relayScience']['sources'],
                    relayImplementation=relayData['relayScience']['implementation'],
                    relayRequest=relayData['relayScience']['request'],
                    epochEt=relayData['relayScience']['epochEt'],
                ),
            )
            return RoverComputed(
                scenarioId='rover-' + identityKey(identity),
                request=request,
                result=result,
                provenance=dict(
                    algorithmVersion='sampled-time-expanded-rover/0.1.0',
                    roverImplementation=implementation,
                    scientificSources=sources,
                    kernels={
                        name: digest
                        for name, digest in localHashes.items()
                        if not name.endswith('.TIF')
                    },
                    dems={
                        name: digest
                        for name, digest in localHashes.items()
                        if name.endswith('.TIF')
                    },
                    coreImplementation=coreImplementation,
                    relayComparison=relayData,
                    geometryEvaluations=completed,
                    wallTimeS=time.perf_counter() - started,
                    validationStatus='computed',
                    independentlyValidated=False,
                    operationalSafetyValidated=False,
                    initialAdmission='Starting terrain and stopping conditions at t0',
                    limitations=limitations,
                ),
            )
        except RoverBudgetExceeded as error:
            return roverFailure(
                'not_computed',
                'budget_exhausted',
                str(error),
                request,
                dict(geometryEvaluationsCompleted=completed),
            )
        except (
            TerrainCoverageError,
            OSError,
            ValueError,
            spice.utils.exceptions.SpiceyError,
        ) as error:
            return roverFailure(
                'unavailable', 'rover_science_unavailable', str(error), request
            )
        except Exception:
            logging.exception('Rover computation failed')
            return roverFailure(
                'failed',
                'rover_computation_failed',
                'Rover computation failed',
                request,
            )
