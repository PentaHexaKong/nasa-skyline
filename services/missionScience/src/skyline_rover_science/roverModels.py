from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, model_validator
from skyline_mission_science.scientificModels import (
    ContractModel,
    Units,
    Utc,
    ContractError,
)


class RoverBudget(ContractModel):
    maxGeometryEvaluations: int = Field(default=21, ge=0, le=21)
    maxGraphNodes: int = Field(default=1089, ge=1, le=1089)
    maxTransitions: int = Field(default=10000, ge=1, le=10000)
    maxWallTimeS: float = Field(default=300, ge=0.01, le=300)


class RoverRequest(ContractModel):
    schemaVersion: Literal['skyline-rover-request/0.1.0'] = (
        'skyline-rover-request/0.1.0'
    )
    site: str = Field(default='CR1', pattern=r'^[A-Za-z0-9_-]+$', max_length=60)
    startUtc: datetime
    durationS: int = Field(default=1800, ge=60, le=7200)
    timeStepS: int = Field(default=120, ge=30, le=600)
    terrainDemId: Literal['LDEM_80S_80MPP_ADJ.TIF'] = 'LDEM_80S_80MPP_ADJ.TIF'
    projectionId: Literal['LOLA-south-polar-stereographic-DE421'] = (
        'LOLA-south-polar-stereographic-DE421'
    )
    gridRadiusCells: Literal[0, 1] = 1
    gridResolutionM: float = Field(default=80, ge=80, le=320)
    observerHeightM: float = Field(default=0, ge=0, le=20)
    speedMps: float = Field(gt=0)
    maximumSlopeDeg: float = Field(ge=0, le=90)
    movementRule: Literal['four-neighbor-no-diagonals'] = 'four-neighbor-no-diagonals'
    allowWaiting: bool = True
    movementRequiresSunlight: bool = True
    movementRequiresCommunication: bool = True
    stoppingRequiresSunlight: bool = True
    stoppingRequiresCommunication: bool = True
    solarDefinition: Literal['anyDisk', 'center', 'fullDisk'] = 'anyDisk'
    profile: Literal['geometric'] = 'geometric'
    horizonOffsetDeg: Literal[0] = 0
    communicationMode: Literal['direct-only', 'relay-assisted'] = 'direct-only'
    budget: RoverBudget = Field(default_factory=RoverBudget)

    @model_validator(mode='after')
    def boundedWindow(self):
        if (
            self.startUtc.tzinfo is None
            or self.startUtc.utcoffset().total_seconds() != 0
        ):
            raise ValueError('Explicit UTC epoch required')
        if self.durationS % self.timeStepS or self.durationS // self.timeStepS > 120:
            raise ValueError(
                'An aligned window with at most 120 time intervals is required'
            )
        side = 2 * self.gridRadiusCells + 1
        geometryCount = side * side + 2 * side * (side - 1)
        needsVisibility = any(
            [
                self.movementRequiresSunlight,
                self.stoppingRequiresSunlight,
                self.movementRequiresCommunication,
                self.stoppingRequiresCommunication,
            ]
        )
        requiredGeometry = (
            geometryCount
            if needsVisibility
            else int(
                self.communicationMode == 'relay-assisted' and self.gridRadiusCells == 0
            )
        )
        if requiredGeometry > self.budget.maxGeometryEvaluations:
            raise ValueError(
                'Declared geometry budget cannot cover the complete grid and edge midpoints'
            )
        if (
            side * side * (self.durationS // self.timeStepS + 1)
            > self.budget.maxGraphNodes
        ):
            raise ValueError(
                'Declared graph-node budget cannot cover the time-expanded grid'
            )
        return self


class RoverPoint(ContractModel):
    pointId: str
    latitudeDeg: float
    longitudeDegEast: float
    groundElevationM: float | None
    estimatedSlopeDeg: float | None
    terrainValid: bool
    terrainReason: str | None
    surfacePositionM: list[float] | None
    row: int | None
    column: int | None
    projectedXM: float
    projectedYM: float


class RoverEdge(ContractModel):
    sourceCell: int
    targetCell: int
    midpointPoint: int
    traversable: bool
    distanceM: float | None
    maximumSegmentGradeDeg: float | None
    reason: str | None


class RoverGrid(ContractModel):
    rows: int
    columns: int
    startCell: int
    frame: Literal['MOON_ME_DE421'] = 'MOON_ME_DE421'
    projectionId: str
    projectionWkt: str
    projectedCellDimensionsM: list[float]
    affineCornerTransform: list[float]
    indexing: Literal['row-major; columns +projection X, rows -projection Y'] = (
        'row-major; columns +projection X, rows -projection Y'
    )
    terrainValidMask: list[list[bool]]
    terrainTraversableMask: list[list[bool]]
    points: list[RoverPoint]
    cellPointIndices: list[int]
    edges: list[RoverEdge]
    dem: dict
    referenceSite: dict
    slopeProbeStepM: float
    slopeFootprintDiameterM: float


class RoverSection(ContractModel):
    dataState: Literal[
        'computed', 'unsupported', 'not_computed', 'unavailable', 'failed'
    ]
    reason: str | None = None
    reachableMask: list[list[bool | None]] | None = None
    earliestArrivalS: list[list[float | None]] | None = None
    earliestArrivalUtc: list[list[str | None]] | None = None
    reachedAtTimeMask: list[list[bool]] | None = None
    reachableTimeLevelFraction: list[list[float | None]] | None = None
    waitingOpportunityBinMask: list[list[bool]] | None = None
    arrivalAtEndBoundaryMask: list[list[bool]] | None = None
    startAdmitted: bool | None = None
    transitionsChecked: int | None = None
    communicationConstraintApplied: bool | None = None

    @model_validator(mode='after')
    def explicitAvailability(self):
        values = [
            getattr(self, name)
            for name in type(self).model_fields
            if name not in {'dataState', 'reason'}
        ]
        if self.dataState == 'computed' and any(value is None for value in values):
            raise ValueError(
                'Computed reachability requires complete result arrays and counts'
            )
        if self.dataState != 'computed' and any(value is not None for value in values):
            raise ValueError(
                'Noncomputed reachability cannot contain placeholder results'
            )
        return self


class RoverTimeGrid(ContractModel):
    nominalStartUtc: Utc
    elapsedS: list[float]
    timestampsUtc: list[Utc]
    endpointIncluded: Literal[True] = True
    durationScale: Literal['elapsed SPICE ET seconds'] = 'elapsed SPICE ET seconds'
    timeLevelFractionDenominator: int = Field(ge=2, le=121)
    waitingBins: Literal['half-open [start,end); sampled stopping opportunities'] = (
        'half-open [start,end); sampled stopping opportunities'
    )


class RoverResult(ContractModel):
    grid: RoverGrid
    timeGrid: RoverTimeGrid
    directOnly: RoverSection
    relayAssisted: RoverSection
    difference: dict
    visibility: dict
    requestedModeState: str


class RoverComputed(ContractModel):
    schemaVersion: Literal['skyline-rover-response/0.1.0'] = (
        'skyline-rover-response/0.1.0'
    )
    contractStatus: Literal['proposed-for-team-review'] = 'proposed-for-team-review'
    dataState: Literal['computed'] = 'computed'
    scenarioId: str = Field(pattern=r'^rover-[0-9a-f]{64}$')
    request: RoverRequest
    units: Units = Field(default_factory=Units)
    result: RoverResult
    provenance: dict
    error: None = None

    @model_validator(mode='after')
    def resultDimensions(self):
        grid = self.result.grid
        levels = self.request.durationS // self.request.timeStepS + 1
        if (
            grid.rows != 2 * self.request.gridRadiusCells + 1
            or grid.columns != grid.rows
            or grid.projectedCellDimensionsM != [self.request.gridResolutionM] * 2
        ):
            raise ValueError(
                'Result grid differs from requested spatial discretization'
            )
        for section in [self.result.directOnly, self.result.relayAssisted]:
            if section.dataState != 'computed':
                continue
            if len(section.reachableMask) != grid.rows or any(
                len(row) != grid.columns for row in section.reachableMask
            ):
                raise ValueError('Reachability mask dimensions disagree with the grid')
            if len(section.reachedAtTimeMask) != levels or any(
                len(row) != grid.rows * grid.columns
                for row in section.reachedAtTimeMask
            ):
                raise ValueError('Time-expanded result dimensions disagree')
        return self


class RoverFailure(ContractModel):
    schemaVersion: Literal['skyline-rover-response/0.1.0'] = (
        'skyline-rover-response/0.1.0'
    )
    contractStatus: Literal['proposed-for-team-review'] = 'proposed-for-team-review'
    dataState: Literal['unsupported', 'not_computed', 'unavailable', 'failed']
    scenarioId: None = None
    request: RoverRequest | None = None
    units: Units = Field(default_factory=Units)
    result: None = None
    provenance: None = None
    error: ContractError
    coverage: dict | None = None


RoverResponse = Annotated[
    RoverComputed | RoverFailure, Field(discriminator='dataState')
]
