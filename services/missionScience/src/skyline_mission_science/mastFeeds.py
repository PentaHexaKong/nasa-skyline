from pathlib import Path
from typing import Literal

from pydantic import Field, TypeAdapter, model_validator

from .intermediateCache import identityKey
from .mastPlacementModels import (
    MastPlacementResponse,
    MastPlacementComputed,
    MastPlacementRequest,
    PlacementCandidate,
    PlacementPanels,
    PlacementSummary,
    PlacementProvenance,
    ParetoMember,
)
from .mastPlacementSelection import placementRanks, placementViolations
from .mastPlacementTerrain import candidateOffsets
from .scientificFeeds import writeImmutableJson
from .scientificModels import ContractModel, MissionMetrics, Observer, DemIdentity, Utc


class MastFeedOutcome(ContractModel):
    observerHeightM: float = Field(ge=0)
    dataState: Literal[
        'computed', 'unsupported', 'not_computed', 'unavailable', 'failed'
    ]
    feasibilityStatus: Literal['feasible', 'infeasible', 'unavailable', 'not_evaluated']
    violations: list[str]
    paretoRank: int | None = Field(ge=0)
    sourceScenarioId: str | None
    metrics: MissionMetrics | None
    panels: PlacementPanels | None
    reason: str | None

    @model_validator(mode='after')
    def explicitMetricState(self):
        computed = self.dataState == 'computed'
        if computed != (self.metrics is not None) or computed != (
            self.sourceScenarioId is not None
        ):
            raise ValueError(
                'Computed feed outcomes require metrics and scientific identity'
            )
        if not computed and (self.panels is not None or self.paretoRank is not None):
            raise ValueError(
                'Noncomputed outcomes cannot carry exposure or Pareto rank'
            )
        if self.feasibilityStatus != 'feasible' and self.paretoRank is not None:
            raise ValueError('Only feasible outcomes receive ranks')
        return self


class MastFeedCandidate(PlacementCandidate):
    outcomes: list[MastFeedOutcome]


class MastFeedProvenance(ContractModel):
    algorithm_version: Literal['mast-placement/1.0.0'] = 'mast-placement/1.0.0'
    sources: list[str]
    assumptions: list[str]
    engineVersion: str
    environmentAlgorithmVersion: str
    implementation: dict
    kernels: dict[str, str]
    dems: list[DemIdentity]
    baselineScenarioId: str
    placement: PlacementProvenance
    validationStatus: Literal['computed'] = 'computed'
    independentlyValidated: Literal[False] = False


class MastFeedPeriod(ContractModel):
    start_utc: Utc
    end_utc: Utc
    durationS: float = Field(gt=0)
    durationScale: Literal['elapsed SPICE ET seconds'] = 'elapsed SPICE ET seconds'


class MastFeedV1(ContractModel):
    schema_version: Literal[1] = 1
    contractVersion: Literal['skyline-mast-feed/1.0.0'] = 'skyline-mast-feed/1.0.0'
    dataState: Literal['computed'] = 'computed'
    origin: Literal['computed'] = 'computed'
    scenarioId: str = Field(pattern=r'^mast-placement-[0-9a-f]{64}$')
    site_id: str
    period: MastFeedPeriod
    request: MastPlacementRequest
    referenceObserver: Observer
    baselineMetrics: MissionMetrics
    rule: str
    candidates: list[MastFeedCandidate]
    optimization: PlacementSummary
    provenance: MastFeedProvenance

    @model_validator(mode='after')
    def feedConsistency(self):
        if (
            self.site_id != self.request.site
            or self.site_id != self.referenceObserver.siteId
        ):
            raise ValueError('Mast feed reference identity mismatch')
        if [
            (candidate.eastM, candidate.northM) for candidate in self.candidates
        ] != candidateOffsets(self.request.searchRadiusM, self.request.gridResolutionM):
            raise ValueError('Mast feed grid mismatch')
        ranks = placementRanks(self.candidates)
        identities = []
        for candidate in self.candidates:
            if [
                outcome.observerHeightM for outcome in candidate.outcomes
            ] != self.request.mastHeightsM:
                raise ValueError('Mast feed height set mismatch')
            record = candidate.model_dump(mode='json', exclude={'outcomes'})
            record['outcomes'] = []
            for outcome in candidate.outcomes:
                if outcome.paretoRank != ranks.get(
                    (candidate.candidateId, outcome.observerHeightM)
                ):
                    raise ValueError('Mast feed Pareto rank mismatch')
                if outcome.metrics is not None:
                    expected = placementViolations(
                        self.request,
                        candidate.cableDistanceM,
                        candidate.estimatedSlopeDeg,
                        outcome.metrics,
                    )
                    expectedStatus = 'infeasible' if expected else 'feasible'
                    if (
                        self.request.maximumSlopeDeg is not None
                        and candidate.estimatedSlopeDeg is None
                    ):
                        expectedStatus = 'unavailable'
                    if (
                        outcome.violations != expected
                        or outcome.feasibilityStatus != expectedStatus
                    ):
                        raise ValueError('Mast feed feasibility mismatch')
                    metrics = outcome.metrics
                    duration = self.request.durationS
                    if (
                        metrics.denominatorS != duration
                        or abs(
                            metrics.sunlightDurationS / duration
                            - metrics.sunlightAvailabilityFraction
                        )
                        > 1e-12
                        or abs(
                            metrics.directEarthDurationS / duration
                            - metrics.directEarthAvailabilityFraction
                        )
                        > 1e-12
                        or max(
                            metrics.longestDarkness.durationS,
                            metrics.longestDirectEarthBlackout.durationS,
                        )
                        > duration
                    ):
                        raise ValueError(
                            'Mast feed metric units or denominator mismatch'
                        )
                record['outcomes'].append(
                    outcome.model_dump(mode='json', exclude={'metrics'})
                )
            identities.append(record)
        expectedMembers = [
            ParetoMember(candidateId=key[0], observerHeightM=key[1])
            for key, rank in ranks.items()
            if rank == 0
        ]
        unknown = sum(
            outcome.feasibilityStatus in {'unavailable', 'not_evaluated'}
            for candidate in self.candidates
            for outcome in candidate.outcomes
        )
        if (
            self.optimization.paretoSet != expectedMembers
            or self.optimization.feasibleOutcomeCount != len(ranks)
            or self.optimization.unknownOutcomeCount != unknown
            or self.optimization.complete != (unknown == 0)
        ):
            raise ValueError('Mast feed Pareto members or completeness mismatch')
        identity = dict(
            request=self.request.model_dump(mode='json'),
            baselineScenarioId=self.provenance.baselineScenarioId,
            candidates=identities,
            provenance=self.provenance.placement.model_dump(mode='json'),
            complete=self.optimization.complete,
            terminationReason=self.optimization.terminationReason,
        )
        if self.scenarioId != 'mast-placement-' + identityKey(identity):
            raise ValueError('Mast feed source/scenario identity mismatch')
        return self


class MastManifest(ContractModel):
    schemaVersion: Literal['skyline-mast-manifest/1.0.0'] = (
        'skyline-mast-manifest/1.0.0'
    )
    siteId: str
    scenarioSelectionRequired: Literal[True] = True
    scenarioPathTemplate: Literal['scenarios/{scenarioId}.json'] = (
        'scenarios/{scenarioId}.json'
    )


def mastFeed(response):
    response = TypeAdapter(MastPlacementResponse).validate_python(response)
    if not isinstance(response, MastPlacementComputed):
        raise ValueError('MastFeed publication requires a computed placement result')
    baseline = response.result.baseline
    science = baseline.provenance
    candidates = []
    for candidate in response.result.candidates:
        record = candidate.model_dump(mode='json', exclude={'outcomes'})
        record['outcomes'] = [
            dict(
                observerHeightM=outcome.observerHeightM,
                dataState=outcome.dataState,
                feasibilityStatus=outcome.feasibilityStatus,
                violations=outcome.violations,
                paretoRank=outcome.paretoRank,
                sourceScenarioId=outcome.sourceScenarioId,
                metrics=outcome.metrics,
                panels=outcome.panels,
                reason=outcome.reason,
            )
            for outcome in candidate.outcomes
        ]
        candidates.append(record)
    return MastFeedV1(
        scenarioId=response.scenarioId,
        site_id=response.request.site,
        period=dict(
            start_utc=baseline.result.period.startUtc,
            end_utc=baseline.result.period.endUtc,
            durationS=response.request.durationS,
        ),
        request=response.request,
        referenceObserver=baseline.result.observer,
        baselineMetrics=baseline.result.metrics,
        candidates=candidates,
        optimization=response.result.optimization,
        rule='Feasibility before exact six-objective Pareto filtering over the generated location-height grid',
        provenance=dict(
            sources=sorted(
                [name + ':' + digest for name, digest in science.kernels.items()]
                + [dem.filename + ':' + dem.sha256 for dem in science.dems]
            ),
            assumptions=response.provenance.limitations,
            engineVersion=science.engineVersion,
            environmentAlgorithmVersion=science.algorithmVersion,
            implementation=science.implementation,
            kernels=science.kernels,
            dems=science.dems,
            baselineScenarioId=baseline.scenarioId,
            placement=response.provenance,
        ),
    )


def writeMastFeed(response, outputRoot):
    feed = mastFeed(response)
    directory = Path(outputRoot) / 'mast'
    scenarioPath = directory / 'scenarios' / (feed.scenarioId + '.json')

    def normalize(payload):
        parsed = MastFeedV1.model_validate(payload)
        return parsed.model_dump(
            mode='json',
            exclude={'optimization': {'wallTimeS'}},
        )

    writeImmutableJson(scenarioPath, feed.model_dump(mode='json'), normalize)
    manifest = MastManifest(siteId=feed.site_id)
    writeImmutableJson(
        directory / (feed.site_id + '.json'), manifest.model_dump(mode='json')
    )
    return scenarioPath
