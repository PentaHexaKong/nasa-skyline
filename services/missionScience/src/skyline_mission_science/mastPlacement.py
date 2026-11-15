import logging
import math
import time

import spiceypy as spice

from .engine import fileHash
from .intermediateCache import identityKey
from .mastPlacementModels import (
    MastPlacementRequest,
    MastPlacementComputed,
    MastPlacementFailure,
    MastPlacementResult,
    PlacementCandidate,
    PlacementOutcome,
    PlacementProvenance,
    PlacementSummary,
    placementIdentity,
)
from .mastPlacementSelection import (
    objectiveDefinitions,
    placementRanks,
    placementViolations,
)
from .mastPlacementTerrain import (
    candidateOffsets,
    candidateSite,
    sampleCandidateTerrain,
)
from .panelGeometry import panelExposure
from .scientificContract import evaluateScientific
from .scientificModels import ScientificRequest
from .siteCatalog import resolveSite
from .terrainHorizon import LunarDem, TerrainCoverageError


placementFields = {
    'schemaVersion',
    'searchRadiusM',
    'gridResolutionM',
    'mastHeightsM',
    'maximumCableLengthM',
    'maximumSlopeDeg',
    'verticalAzimuthDeg',
    'evaluationBudget',
    'observerHeightM',
}


def placementFailure(state, code, message, request=None, coverage=None):
    return MastPlacementFailure(
        dataState=state,
        request=request,
        coverage=coverage,
        error=dict(code=code, message=message),
    )


def placementEnvironment(engine, request, site, heightM):
    single = ScientificRequest(
        **request.model_dump(exclude=placementFields | {'site'}),
        site=site,
        observerHeightM=heightM,
    )
    return evaluateScientific(engine, single)


def placementPanels(environment, verticalAzimuthDeg):
    if verticalAzimuthDeg is None:
        return None
    samples = environment.result.samples
    scores = panelExposure(
        [sample.sun.azimuthDeg for sample in samples],
        [sample.sun.elevationDeg for sample in samples],
        [sample.sun.visibleDiskFraction for sample in samples],
        [sample.elapsedS for sample in samples],
        verticalAzimuthDeg,
    )
    return dict(
        **{name: score['meanGeometricExposure'] for name, score in scores.items()},
        verticalAzimuthDeg=verticalAzimuthDeg,
    )


def samePlacementSources(environment, baseline):
    return (
        environment.provenance.kernels == baseline.provenance.kernels
        and environment.provenance.dems == baseline.provenance.dems
        and environment.provenance.implementation == baseline.provenance.implementation
    )


def evaluateMastPlacement(engine, request, clock=time.perf_counter):
    request = MastPlacementRequest.model_validate(request)
    started = clock()
    try:
        reference = resolveSite(request.site)
    except ValueError as error:
        return placementFailure('unsupported', 'site_unsupported', str(error), request)
    if reference.siteId not in engine.sites:
        return placementFailure('unsupported', 'site_unsupported', 'This observer has no qualified mast-placement terrain scenario', request)
    if reference.siteId != request.site:
        return placementFailure(
            'unsupported',
            'canonical_site_required',
            'Use the canonical site identifier for placement enumeration',
            request,
        )
    baseline = placementEnvironment(engine, request, request.site, 0)
    if baseline.dataState != 'computed':
        return placementFailure(
            baseline.dataState,
            baseline.error.code,
            baseline.error.message,
            request,
            baseline.coverage,
        )
    performed = 1
    candidates = []
    stopped = False
    localPath = (
        engine.assetRoot / f'lola/LDEM_80S_{request.localResolutionM}MPP_ADJ.TIF'
    )
    try:
        with LunarDem(localPath) as dem:
            initialHash = fileHash(localPath)
            expectedHash = next(
                item.sha256
                for item in baseline.provenance.dems
                if item.filename == localPath.name
            )
            if initialHash != expectedHash:
                return placementFailure(
                    'unavailable',
                    'source_identity_changed',
                    'Candidate DEM differs from the baseline DEM',
                    request,
                )
            for eastM, northM in candidateOffsets(
                request.searchRadiusM, request.gridResolutionM
            ):
                site = candidateSite(reference, eastM, northM)
                geometry = dict(
                    candidateId=site.siteId,
                    eastM=eastM,
                    northM=northM,
                    site=site,
                    cableDistanceM=math.hypot(eastM, northM),
                    gridFinerThanDem=request.gridResolutionM < max(dem.dataset.res),
                )
                try:
                    terrain = sampleCandidateTerrain(dem, site)
                    terrain['terrainState'] = 'computed'
                except TerrainCoverageError as error:
                    terrain = dict(
                        terrainState='unavailable',
                        groundElevationM=None,
                        estimatedSlopeDeg=None,
                        slopeQuality='unavailable: missing terrain',
                        slopeProbeStepM=None,
                        slopeFootprintDiameterM=None,
                        demResolutionM=list(dem.dataset.res),
                        terrainError=str(error),
                    )
                outcomes = []
                preViolations = placementViolations(
                    request, geometry['cableDistanceM'], terrain['estimatedSlopeDeg']
                )
                for heightM in request.mastHeightsM:
                    environment = None
                    reason = None
                    violations = list(preViolations)
                    if terrain['terrainState'] == 'unavailable':
                        state, feasible, reason = (
                            'unavailable',
                            'unavailable',
                            terrain['terrainError'],
                        )
                    elif eastM == 0 and northM == 0 and heightM == 0:
                        environment = baseline
                        state, feasible = 'computed', 'feasible'
                    elif preViolations:
                        state, feasible, reason = (
                            'not_computed',
                            'infeasible',
                            'Rejected by known cable or DEM-scale slope constraints before visibility evaluation',
                        )
                    elif (
                        request.maximumSlopeDeg is not None
                        and terrain['estimatedSlopeDeg'] is None
                    ):
                        state, feasible, reason = (
                            'unavailable',
                            'unavailable',
                            'Required slope constraint cannot be evaluated from the available DEM footprint',
                        )
                    elif clock() - started >= request.evaluationBudget.maxWallTimeS:
                        stopped = True
                        state, feasible, reason = (
                            'not_computed',
                            'not_evaluated',
                            'wall_time_budget',
                        )
                    else:
                        evaluated = placementEnvironment(
                            engine,
                            request,
                            request.site if eastM == 0 and northM == 0 else site,
                            heightM,
                        )
                        performed += 1
                        state = evaluated.dataState
                        if state == 'computed':
                            environment, feasible = evaluated, 'feasible'
                        else:
                            feasible, reason = 'unavailable', evaluated.error.message
                    if environment is not None:
                        if not samePlacementSources(environment, baseline):
                            return placementFailure(
                                'unavailable',
                                'source_identity_changed',
                                'Scientific sources changed during placement enumeration',
                                request,
                            )
                        violations = placementViolations(
                            request,
                            geometry['cableDistanceM'],
                            terrain['estimatedSlopeDeg'],
                            environment.result.metrics,
                        )
                        feasible = 'infeasible' if violations else 'feasible'
                        if (
                            request.maximumSlopeDeg is not None
                            and terrain['estimatedSlopeDeg'] is None
                        ):
                            feasible, reason = (
                                'unavailable',
                                'Required DEM slope is unavailable',
                            )
                    outcomes.append(
                        PlacementOutcome(
                            observerHeightM=heightM,
                            dataState=state,
                            feasibilityStatus=feasible,
                            violations=violations,
                            paretoRank=None,
                            environment=environment,
                            panels=placementPanels(
                                environment, request.verticalAzimuthDeg
                            )
                            if environment
                            else None,
                            reason=reason,
                        )
                    )
                candidates.append(
                    PlacementCandidate(**geometry, **terrain, outcomes=outcomes)
                )
            if fileHash(localPath) != initialHash:
                return placementFailure(
                    'unavailable',
                    'source_identity_changed',
                    'Candidate DEM changed during enumeration',
                    request,
                )
        ranks = placementRanks(candidates)
        for candidate in candidates:
            for outcome in candidate.outcomes:
                outcome.paretoRank = ranks.get(
                    (candidate.candidateId, outcome.observerHeightM)
                )
        unknown = sum(
            outcome.feasibilityStatus in {'unavailable', 'not_evaluated'}
            for candidate in candidates
            for outcome in candidate.outcomes
        )
        front = [
            dict(candidateId=key[0], observerHeightM=key[1])
            for key, rank in ranks.items()
            if rank == 0
        ]
        tradeOffs = [
            f'{len(ranks)} computed feasible location-height combinations yield {len(front)} nondominated combinations over six objectives.'
        ]
        if front:
            members = [
                (candidate, outcome)
                for candidate in candidates
                for outcome in candidate.outcomes
                if outcome.paretoRank == 0
            ]
            for name, values, unit in [
                (
                    'direct Earth availability',
                    [
                        outcome.environment.result.metrics.directEarthAvailabilityFraction
                        for _, outcome in members
                    ],
                    'fraction',
                ),
                (
                    'sunlight availability',
                    [
                        outcome.environment.result.metrics.sunlightAvailabilityFraction
                        for _, outcome in members
                    ],
                    'fraction',
                ),
                (
                    'longest direct Earth blackout',
                    [
                        outcome.environment.result.metrics.longestDirectEarthBlackout.durationS
                        for _, outcome in members
                    ],
                    's',
                ),
                (
                    'longest darkness',
                    [
                        outcome.environment.result.metrics.longestDarkness.durationS
                        for _, outcome in members
                    ],
                    's',
                ),
                (
                    'cable distance',
                    [candidate.cableDistanceM for candidate, _ in members],
                    'm',
                ),
                (
                    'mast height',
                    [outcome.observerHeightM for _, outcome in members],
                    'm',
                ),
            ]:
                tradeOffs.append(
                    f'Nondominated {name} spans {min(values):.9g} to {max(values):.9g} {unit}.'
                )
        summary = PlacementSummary(
            generatedCandidateCount=len(candidates),
            plannedEvaluationCount=len(candidates) * len(request.mastHeightsM)
            + int(0 not in request.mastHeightsM),
            evaluationsPerformed=performed,
            feasibleOutcomeCount=len(ranks),
            unknownOutcomeCount=unknown,
            complete=unknown == 0,
            terminationReason='wall_time_budget' if stopped else 'enumerated',
            wallTimeS=clock() - started,
            objectiveDefinitions=objectiveDefinitions,
            paretoSet=front,
            tradeOffs=tradeOffs,
        )
        result = MastPlacementResult(
            baseline=baseline, candidates=candidates, optimization=summary
        )
        provenance = PlacementProvenance(
            referenceSite=reference,
            limitations=[
                'Generated grid locations have unverified construction safety and physical coordinate uncertainty',
                'Cable distance is an idealized reference-sphere surface offset; vertical mast run, routing, slack and terrain following are omitted',
                'Slope describes a coarse DEM footprint; rocks, microtopography, bearing strength and engineering suitability are unresolved',
                'Subpixel candidate spacing shares interpolated DEM information',
                'Pareto dominance uses exact computed numbers; physical significance below terrain and event uncertainty is unresolved',
                'Search is conditional on the generated grid, selected heights, scientific profile and resolved outcomes',
                'Wall-time admission is checked between scientific evaluations; an in-flight evaluation can overrun the limit',
                'Panel exposure uses center incidence times visible solar-disk fraction with ideal unconstrained tracking',
                *baseline.provenance.limitations,
            ],
        )
        scenarioId = 'mast-placement-' + identityKey(
            placementIdentity(request, result, provenance)
        )
        return MastPlacementComputed(
            scenarioId=scenarioId,
            request=request,
            result=result,
            provenance=provenance,
        )
    except (TerrainCoverageError, OSError, spice.utils.exceptions.SpiceyError) as error:
        return placementFailure(
            'unavailable',
            'placement_terrain_or_ephemeris_unavailable',
            str(error),
            request,
        )
    except Exception:
        logging.exception('Mast placement failed')
        return placementFailure(
            'failed',
            'placement_failed',
            'Placement computation or contract validation failed',
            request,
        )
