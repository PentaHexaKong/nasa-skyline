import math
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from .intermediateCache import identityKey
from .schemas import Site
from .scientificModels import (
    ContractModel,
    ScientificRequest,
    ComputedResponse,
    ContractError,
    Coverage,
    Units,
    Fraction,
)
from .mastPlacementTerrain import candidateOffsets, candidateSite
from .mastPlacementSelection import placementRanks, placementViolations


class PlacementBudget(ContractModel):
    maxEvaluations: int = Field(ge=1, le=64)
    maxWallTimeS: float = Field(default=120, ge=0.01, le=300)


class MastPlacementRequest(ScientificRequest):
    schemaVersion: Literal['skyline-mast-placement-request/1.0.0'] = (
        'skyline-mast-placement-request/1.0.0'
    )
    site: str = Field(default='CR1', max_length=80, pattern=r'^[A-Za-z0-9_-]+$')
    observerHeightM: Literal[0] = 0
    searchRadiusM: float = Field(ge=0, le=5000)
    gridResolutionM: float = Field(gt=0, le=10000)
    mastHeightsM: Annotated[
        list[Annotated[float, Field(ge=0)]], Field(min_length=1, max_length=8)
    ]
    maximumCableLengthM: float = Field(ge=0, le=10000)
    maximumSlopeDeg: float | None = Field(default=None, ge=0, le=90)
    verticalAzimuthDeg: float | None = None
    evaluationBudget: PlacementBudget

    @field_validator('verticalAzimuthDeg')
    @classmethod
    def wrapPanelAzimuth(cls, value):
        return value % 360 if value is not None else None

    @model_validator(mode='after')
    def boundEnumeration(self):
        if not all(
            math.isfinite(value) for value in self.constraints.model_dump().values()
        ):
            raise ValueError('Mission requirement thresholds must be finite')
        self.mastHeightsM = sorted(set(self.mastHeightsM))
        count = len(candidateOffsets(self.searchRadiusM, self.gridResolutionM)) * len(
            self.mastHeightsM
        )
        count += int(0 not in self.mastHeightsM)
        if count > self.evaluationBudget.maxEvaluations:
            raise ValueError(
                'Complete grid plus ground baseline exceeds the declared evaluation count budget'
            )
        if count * self.durationS / self.cadenceS > 2000:
            raise ValueError(
                'Maximum 2000 aggregate sample intervals per placement request'
            )
        return self


class PlacementPanels(ContractModel):
    horizontal: Fraction
    vertical: Fraction
    tracking: Fraction
    verticalAzimuthDeg: float = Field(ge=0, lt=360)
    model: Literal['solar-center-incidence-times-visible-disk-fraction/1.0.0'] = (
        'solar-center-incidence-times-visible-disk-fraction/1.0.0'
    )
    idealUnconstrainedTracking: Literal[True] = True


class PlacementOutcome(ContractModel):
    observerHeightM: float = Field(ge=0)
    dataState: Literal[
        'computed', 'unsupported', 'not_computed', 'unavailable', 'failed'
    ]
    feasibilityStatus: Literal['feasible', 'infeasible', 'unavailable', 'not_evaluated']
    violations: list[str]
    paretoRank: int | None = Field(ge=0)
    environment: ComputedResponse | None
    panels: PlacementPanels | None
    reason: str | None

    @property
    def metrics(self):
        return self.environment.result.metrics if self.environment else None

    @property
    def sourceScenarioId(self):
        return self.environment.scenarioId if self.environment else None

    @model_validator(mode='after')
    def enforceOutcomeState(self):
        if (self.environment is not None) != (self.dataState == 'computed'):
            raise ValueError('Computed placement outcomes require scientific data')
        if self.environment is None and (
            self.panels is not None or self.paretoRank is not None
        ):
            raise ValueError('Unevaluated outcomes cannot carry exposure or ranks')
        if self.feasibilityStatus == 'feasible' and (
            self.environment is None or self.violations
        ):
            raise ValueError(
                'Feasible outcomes require computed science and satisfied constraints'
            )
        if self.feasibilityStatus != 'feasible' and self.paretoRank is not None:
            raise ValueError('Only feasible outcomes receive a Pareto rank')
        return self


class PlacementCandidate(ContractModel):
    candidateId: str
    eastM: float
    northM: float
    site: Site
    cableDistanceM: float = Field(ge=0)
    terrainState: Literal['computed', 'unavailable']
    groundElevationM: float | None
    estimatedSlopeDeg: float | None = Field(ge=0, le=90)
    slopeQuality: str
    slopeProbeStepM: float | None = Field(gt=0)
    slopeFootprintDiameterM: float | None = Field(gt=0)
    demResolutionM: list[float]
    unresolvedMicrotopography: Literal[True] = True
    constructionSafetyValidated: Literal[False] = False
    gridFinerThanDem: bool
    terrainError: str | None
    outcomes: list[PlacementOutcome]

    @model_validator(mode='after')
    def explicitTerrainState(self):
        if (self.terrainState == 'computed') != (self.groundElevationM is not None):
            raise ValueError('Terrain state and elevation availability disagree')
        if len(self.demResolutionM) != 2 or min(self.demResolutionM) <= 0:
            raise ValueError('Two positive raster resolution components required')
        if self.estimatedSlopeDeg is not None and (
            self.slopeProbeStepM is None or self.slopeFootprintDiameterM is None
        ):
            raise ValueError('A slope estimate requires its supporting footprint')
        return self


class ParetoMember(ContractModel):
    candidateId: str
    observerHeightM: float


class PlacementSummary(ContractModel):
    generatedCandidateCount: int
    plannedEvaluationCount: int
    evaluationsPerformed: int
    feasibleOutcomeCount: int
    unknownOutcomeCount: int
    complete: bool
    terminationReason: Literal['enumerated', 'wall_time_budget']
    wallTimeS: float = Field(ge=0)
    method: Literal['bounded exhaustive enumeration'] = 'bounded exhaustive enumeration'
    objectiveDefinitions: list[dict[str, str]]
    paretoSet: list[ParetoMember]
    tradeOffs: list[str]
    rankScope: Literal['computed feasible generated location-height combinations'] = (
        'computed feasible generated location-height combinations'
    )
    globalOptimalityClaimed: Literal[False] = False


class PlacementProvenance(ContractModel):
    algorithmVersion: Literal['mast-placement/1.0.0'] = 'mast-placement/1.0.0'
    referenceSite: Site
    mapping: Literal[
        'spherical exponential map in MOON_ME_DE421, radial terrain projection'
    ] = 'spherical exponential map in MOON_ME_DE421, radial terrain projection'
    offsetRadiusM: Literal[1737400] = 1737400
    cableModel: Literal[
        'reference-sphere great-circle surface offset; vertical mast run, routing, terrain following and slack omitted'
    ] = 'reference-sphere great-circle surface offset; vertical mast run, routing, terrain following and slack omitted'
    slopeModel: Literal[
        'central radial-height differences at two projected pixels per half-baseline'
    ] = 'central radial-height differences at two projected pixels per half-baseline'
    independentlyValidated: Literal[False] = False
    constructionSafetyValidated: Literal[False] = False
    limitations: list[str]


class MastPlacementResult(ContractModel):
    baseline: ComputedResponse
    candidates: list[PlacementCandidate]
    optimization: PlacementSummary


def placementIdentity(request, result, provenance):
    candidates = []
    for candidate in result.candidates:
        geometry = candidate.model_dump(mode='json', exclude={'outcomes'})
        geometry['outcomes'] = [
            dict(
                observerHeightM=outcome.observerHeightM,
                dataState=outcome.dataState,
                feasibilityStatus=outcome.feasibilityStatus,
                violations=outcome.violations,
                paretoRank=outcome.paretoRank,
                reason=outcome.reason,
                sourceScenarioId=outcome.sourceScenarioId,
                panels=outcome.panels.model_dump(mode='json')
                if outcome.panels
                else None,
            )
            for outcome in candidate.outcomes
        ]
        candidates.append(geometry)
    return dict(
        request=request.model_dump(mode='json'),
        baselineScenarioId=result.baseline.scenarioId,
        candidates=candidates,
        provenance=provenance.model_dump(mode='json'),
        complete=result.optimization.complete,
        terminationReason=result.optimization.terminationReason,
    )


class MastPlacementComputed(ContractModel):
    schemaVersion: Literal['skyline-mast-placement-response/1.0.0'] = (
        'skyline-mast-placement-response/1.0.0'
    )
    dataState: Literal['computed'] = 'computed'
    scenarioId: str
    request: MastPlacementRequest
    units: Units = Field(default_factory=Units)
    result: MastPlacementResult
    provenance: PlacementProvenance
    error: None = None

    @model_validator(mode='after')
    def validatePlacement(self):
        if (
            self.provenance.referenceSite.siteId != self.request.site
            or self.result.baseline.result.observer.siteId != self.request.site
            or self.result.baseline.request.observerHeightM != 0
        ):
            raise ValueError('Canonical reference or ground baseline mismatch')
        for name in [
            'startUtc',
            'durationS',
            'cadenceS',
            'profile',
            'solarDefinition',
            'earthDefinition',
            'horizonOffsetDeg',
            'localResolutionM',
            'eventToleranceS',
            'constraints',
        ]:
            if getattr(self.result.baseline.request, name) != getattr(
                self.request, name
            ):
                raise ValueError('Baseline mission settings mismatch')
        expectedOffsets = candidateOffsets(
            self.request.searchRadiusM, self.request.gridResolutionM
        )
        if [
            (candidate.eastM, candidate.northM) for candidate in self.result.candidates
        ] != expectedOffsets:
            raise ValueError(
                'Candidate grid or order differs from declared enumeration'
            )
        ranks = placementRanks(self.result.candidates)
        for candidate in self.result.candidates:
            expectedSite = candidateSite(
                self.provenance.referenceSite, candidate.eastM, candidate.northM
            )
            if (
                candidate.site != expectedSite
                or candidate.candidateId != expectedSite.siteId
                or candidate.cableDistanceM
                != math.hypot(candidate.eastM, candidate.northM)
            ):
                raise ValueError(
                    'Candidate coordinate mapping or cable distance mismatch'
                )
            if [
                outcome.observerHeightM for outcome in candidate.outcomes
            ] != self.request.mastHeightsM:
                raise ValueError(
                    'Candidate heights differ from the selected height set'
                )
            for outcome in candidate.outcomes:
                metrics = (
                    outcome.environment.result.metrics if outcome.environment else None
                )
                if outcome.environment:
                    observer = outcome.environment.result.observer
                    if (
                        observer.observerHeightM != outcome.observerHeightM
                        or abs(observer.groundElevationM - candidate.groundElevationM)
                        > 1e-6
                    ):
                        raise ValueError(
                            'Candidate terrain or observer height mismatch'
                        )
                    if (
                        abs(observer.latitudeDeg - candidate.site.latitudeDeg) > 1e-9
                        or abs(
                            (
                                observer.longitudeDegEast
                                - candidate.site.longitudeDeg
                                + 180
                            )
                            % 360
                            - 180
                        )
                        > 1e-9
                    ):
                        raise ValueError('Candidate observer coordinates mismatch')
                    baseline = self.result.baseline
                    if (
                        outcome.environment.provenance.kernels
                        != baseline.provenance.kernels
                        or outcome.environment.provenance.dems
                        != baseline.provenance.dems
                        or outcome.environment.provenance.implementation
                        != baseline.provenance.implementation
                    ):
                        raise ValueError('Mixed scientific source identities')
                    if outcome.environment.request.model_dump(
                        exclude={'site', 'observerHeightM'}
                    ) != baseline.request.model_dump(
                        exclude={'site', 'observerHeightM'}
                    ):
                        raise ValueError('Candidate mission settings mismatch')
                    if (outcome.panels is not None) != (
                        self.request.verticalAzimuthDeg is not None
                    ):
                        raise ValueError('Requested panel evaluation state mismatch')
                    expected = placementViolations(
                        self.request,
                        candidate.cableDistanceM,
                        candidate.estimatedSlopeDeg,
                        metrics,
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
                        raise ValueError('Hard feasibility constraints mismatch')
                if outcome.paretoRank != ranks.get(
                    (candidate.candidateId, outcome.observerHeightM)
                ):
                    raise ValueError('Pareto rank mismatch')
        unknown = sum(
            outcome.feasibilityStatus in {'unavailable', 'not_evaluated'}
            for candidate in self.result.candidates
            for outcome in candidate.outcomes
        )
        summary = self.result.optimization
        planned = len(self.result.candidates) * len(self.request.mastHeightsM) + int(
            0 not in self.request.mastHeightsM
        )
        if (
            summary.generatedCandidateCount != len(self.result.candidates)
            or summary.plannedEvaluationCount != planned
            or not 1 <= summary.evaluationsPerformed <= planned
            or summary.unknownOutcomeCount != unknown
            or summary.feasibleOutcomeCount != len(ranks)
            or summary.complete != (unknown == 0)
        ):
            raise ValueError('Placement completeness or budget counts mismatch')
        members = [
            ParetoMember(candidateId=key[0], observerHeightM=key[1])
            for key, rank in ranks.items()
            if rank == 0
        ]
        if self.result.optimization.paretoSet != members:
            raise ValueError('Nondominated member set mismatch')
        expectedIdentity = 'mast-placement-' + identityKey(
            placementIdentity(self.request, self.result, self.provenance)
        )
        if self.scenarioId != expectedIdentity:
            raise ValueError('Placement scenario identity mismatch')
        return self


class MastPlacementFailure(ContractModel):
    schemaVersion: Literal['skyline-mast-placement-response/1.0.0'] = (
        'skyline-mast-placement-response/1.0.0'
    )
    dataState: Literal['unsupported', 'not_computed', 'unavailable', 'failed']
    scenarioId: None = None
    request: MastPlacementRequest | None = None
    units: Units = Field(default_factory=Units)
    result: None = None
    provenance: None = None
    coverage: Coverage | None = None
    error: ContractError


MastPlacementResponse = Annotated[
    MastPlacementComputed | MastPlacementFailure, Field(discriminator='dataState')
]
