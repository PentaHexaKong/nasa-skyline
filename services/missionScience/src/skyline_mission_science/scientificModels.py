from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .schemas import EvaluationRequest
from .intermediateCache import identityKey

utcPattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$'
Utc = Annotated[str, Field(pattern=utcPattern)]
Fraction = Annotated[float, Field(ge=0, le=1)]
Seconds = Annotated[float, Field(ge=0)]


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        allow_inf_nan=False,
        json_schema_serialization_defaults_required=True,
    )


class ScientificRequest(EvaluationRequest):
    startUtc: datetime = Field(
        json_schema_extra={
            'pattern': r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$'
        }
    )
    schemaVersion: Literal['skyline-scientific-request/1.0.0'] = (
        'skyline-scientific-request/1.0.0'
    )
    observerHeightM: float = Field(default=0, ge=0)


class Units(ContractModel):
    angles: Literal['deg'] = 'deg'
    distances: Literal['m'] = 'm'
    durations: Literal['s'] = 's'
    fractions: Literal['fraction'] = 'fraction'
    timestamps: Literal['UTC ISO 8601'] = 'UTC ISO 8601'


class Coverage(ContractModel):
    completeSearchRegion: bool | None
    missingData: bool | None
    boundaryChecked: bool
    reason: str


class Period(ContractModel):
    startUtc: Utc
    endUtc: Utc
    durationS: Seconds
    intervalConvention: Literal['[start,end)'] = '[start,end)'
    durationScale: Literal['elapsed SPICE ET seconds'] = 'elapsed SPICE ET seconds'


class Observer(ContractModel):
    siteId: str
    latitudeDeg: float = Field(ge=-90, le=90)
    longitudeDegEast: float = Field(ge=0, lt=360)
    frame: Literal['MOON_ME_DE421']
    coordinateSource: str
    coordinateUncertaintyM: float | None
    groundElevationM: float
    observerHeightM: float
    radialReferenceM: float
    positionM: Annotated[list[float], Field(min_length=3, max_length=3)]
    datum: str


class DemIdentity(ContractModel):
    filename: str
    sourceUrl: str
    sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    resolutionM: Annotated[list[float], Field(min_length=2, max_length=2)]
    boundsM: Annotated[list[float], Field(min_length=4, max_length=4)]
    frame: Literal['MOON_ME_DE421']
    projection: str


class Skyline(ContractModel):
    azimuthDeg: list[float]
    terrainElevationDeg: list[float]
    visibilityHorizonElevationDeg: list[float]
    azimuthStepDeg: float = Field(gt=0)
    azimuthReference: Literal['local north, clockwise, east at 90 deg']
    binConvention: Literal['left-inclusive periodic sectors in [0,360)']
    horizonOffsetDeg: float
    minimumElevationDeg: Literal[0] = 0
    model: str
    curvature: str
    computationSettings: dict[str, float]
    farTerrainUpperElevationDeg: float
    minimumTargetRangeM: float = Field(gt=0)
    assumptions: list[str]
    coverage: Coverage

    @model_validator(mode='after')
    def alignedArrays(self):
        if (
            not self.azimuthDeg
            or len(
                {
                    len(self.azimuthDeg),
                    len(self.terrainElevationDeg),
                    len(self.visibilityHorizonElevationDeg),
                }
            )
            != 1
        ):
            raise ValueError('Skyline arrays must align and be nonempty')
        if (
            self.azimuthDeg[0] != 0
            or any(
                right <= left
                for left, right in zip(self.azimuthDeg, self.azimuthDeg[1:])
            )
            or self.azimuthDeg[-1] >= 360
        ):
            raise ValueError('Azimuth sectors must increase within [0,360)')
        return self


class Direction(ContractModel):
    azimuthDeg: float = Field(ge=0, lt=360)
    elevationDeg: float = Field(ge=-90, le=90)
    horizonElevationDeg: float
    clearanceDeg: float

    @model_validator(mode='after')
    def clearanceIdentity(self):
        if abs(self.elevationDeg - self.horizonElevationDeg - self.clearanceDeg) > 1e-9:
            raise ValueError('Clearance must equal elevation minus effective horizon')
        return self


class SolarSample(Direction):
    angularRadiusDeg: float = Field(gt=0)
    visibleDiskFraction: Fraction
    diskState: Literal['fully_visible', 'partially_visible', 'obscured']
    sunlightVisible: bool

    @model_validator(mode='after')
    def diskClassification(self):
        expected = (
            'obscured'
            if self.visibleDiskFraction == 0
            else 'fully_visible'
            if self.visibleDiskFraction == 1
            else 'partially_visible'
        )
        if self.diskState != expected:
            raise ValueError('Disk state disagrees with visible fraction')
        return self


class EarthSample(Direction):
    centerVisible: bool

    @model_validator(mode='after')
    def centerThreshold(self):
        if self.centerVisible != (self.clearanceDeg >= 0):
            raise ValueError('Earth center visibility requires nonnegative clearance')
        return self


class TrackSample(ContractModel):
    timestampUtc: Utc
    elapsedS: Seconds
    scientificProfile: Literal['geometric', 'apparent']
    endpointContext: bool
    sun: SolarSample
    earth: EarthSample


class Interval(ContractModel):
    startUtc: Utc
    endUtc: Utc
    startS: Seconds
    endS: Seconds
    startClipped: bool
    endClipped: bool

    @model_validator(mode='after')
    def positiveDuration(self):
        if self.endS <= self.startS:
            raise ValueError('Intervals require start < end')
        return self


class Event(ContractModel):
    timestampUtc: Utc
    elapsedS: Seconds
    eventType: Literal['sunrise', 'sunset', 'earthrise', 'earthset', 'grazing']
    numericalToleranceS: Seconds
    physicalUncertaintyS: float | None
    method: Literal['numerical transition estimate', 'extremum estimate']


class Detection(ContractModel):
    possibleMissedEvents: bool
    searchCadenceS: Seconds
    probeStepS: Seconds
    numericalRootToleranceS: Seconds
    physicalUncertaintyS: float | None
    completenessAssumption: str
    discontinuousSkyline: Literal[True] = True


class VisibilityWindows(ContractModel):
    available: list[Interval]
    unavailable: list[Interval]
    events: list[Event]
    detection: Detection


class LongestInterval(ContractModel):
    durationS: Seconds
    interval: Interval | None
    touchesCoverageBoundary: bool


class MissionMetrics(ContractModel):
    sunlightDurationS: Seconds
    sunlightAvailabilityFraction: Fraction
    directEarthDurationS: Seconds
    directEarthAvailabilityFraction: Fraction
    meanVisibleSolarDiskFraction: Fraction
    longestDarkness: LongestInterval
    longestDirectEarthBlackout: LongestInterval
    denominatorS: Seconds
    denominatorSemantics: str
    meanDiskFractionMethod: str


class SolarDefinition(ContractModel):
    availabilityRule: Literal['anyDisk', 'center', 'fullDisk']
    diskFractionThreshold: float | None
    thresholdOperator: Literal[
        'greater_than', 'greater_than_or_equal', 'center_clearance_nonnegative'
    ]
    diskModel: str
    classification: dict[str, str]
    limitations: list[str]


class EarthDefinition(ContractModel):
    visibilityRule: Literal['center clearance >= safety margin'] = (
        'center clearance >= safety margin'
    )
    safetyMarginDeg: Literal[0] = 0
    rfConnectivity: Literal['not_computed'] = 'not_computed'
    interpretation: str


class ScientificResult(ContractModel):
    period: Period
    observer: Observer
    skyline: Skyline
    samples: Annotated[list[TrackSample], Field(min_length=2)]
    solarVisibility: SolarDefinition
    directEarthVisibility: EarthDefinition
    sunlightIntervals: VisibilityWindows
    directEarthIntervals: VisibilityWindows
    metrics: MissionMetrics
    cadenceS: Seconds

    @model_validator(mode='after')
    def scientificInvariants(self):
        duration = self.period.durationS
        if self.samples[0].elapsedS != 0 or self.samples[-1].elapsedS != duration:
            raise ValueError('Track samples must include both window endpoints')
        if any(
            right.elapsedS <= left.elapsedS
            for left, right in zip(self.samples, self.samples[1:])
        ):
            raise ValueError('Sample times must strictly increase')
        for sample in self.samples:
            solar = sample.sun
            expectedVisible = {
                'anyDisk': solar.visibleDiskFraction > 0,
                'center': solar.clearanceDeg >= 0,
                'fullDisk': solar.visibleDiskFraction == 1,
            }[self.solarVisibility.availabilityRule]
            if solar.sunlightVisible != expectedVisible:
                raise ValueError(
                    'Sunlight predicate disagrees with selected solar definition'
                )
            if sample.endpointContext != (sample.elapsedS == duration):
                raise ValueError('Only final sample is endpoint context')
        for windows in [self.sunlightIntervals, self.directEarthIntervals]:
            for collection in [windows.available, windows.unavailable]:
                for index, interval in enumerate(collection):
                    if (
                        interval.endS > duration
                        or interval.startClipped != (interval.startS == 0)
                        or interval.endClipped != (interval.endS == duration)
                    ):
                        raise ValueError('Interval coverage or clipping mismatch')
                    if index and interval.startS < collection[index - 1].endS:
                        raise ValueError(
                            'Visibility intervals overlap or are unordered'
                        )
            partition = sorted(
                [*windows.available, *windows.unavailable],
                key=lambda interval: interval.startS,
            )
            if (
                not partition
                or partition[0].startS != 0
                or partition[-1].endS != duration
                or any(
                    abs(right.startS - left.endS) > 1e-9
                    for left, right in zip(partition, partition[1:])
                )
            ):
                raise ValueError(
                    'Available and unavailable intervals must partition the entire period'
                )
            if any(not 0 < event.elapsedS < duration for event in windows.events):
                raise ValueError(
                    'Window endpoints cannot be reported as rise/set events'
                )
            if any(
                right.elapsedS < left.elapsedS
                for left, right in zip(windows.events, windows.events[1:])
            ):
                raise ValueError('Events must be ordered')
        for windows, total, fraction, longest in [
            (
                self.sunlightIntervals,
                self.metrics.sunlightDurationS,
                self.metrics.sunlightAvailabilityFraction,
                self.metrics.longestDarkness,
            ),
            (
                self.directEarthIntervals,
                self.metrics.directEarthDurationS,
                self.metrics.directEarthAvailabilityFraction,
                self.metrics.longestDirectEarthBlackout,
            ),
        ]:
            expected = sum(
                interval.endS - interval.startS for interval in windows.available
            )
            if abs(total - expected) > 1e-7 or abs(fraction - total / duration) > 1e-10:
                raise ValueError('Duration/fraction metrics disagree with intervals')
            maximum = max(
                (interval.endS - interval.startS for interval in windows.unavailable),
                default=0,
            )
            if abs(longest.durationS - maximum) > 1e-7:
                raise ValueError('Longest outage metric disagrees with intervals')
            if longest.interval is None:
                if maximum != 0 or longest.touchesCoverageBoundary:
                    raise ValueError(
                        'Missing longest interval requires zero computed outage'
                    )
            elif (
                longest.interval not in windows.unavailable
                or longest.touchesCoverageBoundary
                != (longest.interval.startClipped or longest.interval.endClipped)
            ):
                raise ValueError('Longest interval boundary metadata disagrees')
        integratedFraction = (
            sum(
                (right.elapsedS - left.elapsedS)
                * (left.sun.visibleDiskFraction + right.sun.visibleDiskFraction)
                / 2
                for left, right in zip(self.samples, self.samples[1:])
            )
            / duration
        )
        if abs(self.metrics.meanVisibleSolarDiskFraction - integratedFraction) > 1e-10:
            raise ValueError(
                'Mean solar-disk fraction disagrees with declared sample quadrature'
            )
        for longest in [
            self.metrics.longestDarkness,
            self.metrics.longestDirectEarthBlackout,
        ]:
            if (
                longest.interval
                and abs(
                    longest.durationS
                    - (longest.interval.endS - longest.interval.startS)
                )
                > 1e-7
            ):
                raise ValueError('Longest interval duration mismatch')
        if self.metrics.denominatorS != duration:
            raise ValueError('Metric denominator must equal evaluation duration')
        return self


class Provenance(ContractModel):
    engineVersion: str
    algorithmVersion: str
    implementation: dict
    scientificProfile: Literal['geometric', 'apparent']
    aberrationCorrection: Literal['NONE', 'LT+S']
    kernels: dict[str, str]
    dems: list[DemIdentity]
    cacheKey: str
    execution: str
    validationStatus: Literal['computed'] = 'computed'
    independentlyValidated: Literal[False] = False
    validationEvidence: list[str]
    sampling: dict
    assumptions: list[str]
    limitations: list[str]


class ContractError(ContractModel):
    code: str
    message: str


class ComputedResponse(ContractModel):
    schemaVersion: Literal['skyline-scientific-response/1.0.0'] = (
        'skyline-scientific-response/1.0.0'
    )
    dataState: Literal['computed'] = 'computed'
    scenarioId: str = Field(pattern=r'^scenario-[0-9a-f]{64}$')
    request: ScientificRequest
    units: Units = Field(default_factory=Units)
    result: ScientificResult
    provenance: Provenance
    error: None = None

    @model_validator(mode='after')
    def scenarioConsistency(self):
        expectedIdentity = 'scenario-' + identityKey(
            dict(
                request=self.request.model_dump(mode='json'),
                sourceIdentity=self.provenance.cacheKey,
            )
        )
        if self.scenarioId != expectedIdentity:
            raise ValueError(
                'Scenario identity disagrees with normalized request and scientific source identity'
            )
        if (
            self.request.durationS != self.result.period.durationS
            or self.request.cadenceS != self.result.cadenceS
        ):
            raise ValueError('Scenario period or cadence mismatch')
        if self.request.observerHeightM != self.result.observer.observerHeightM:
            raise ValueError('Scenario observer height mismatch')
        if self.request.solarDefinition != self.result.solarVisibility.availabilityRule:
            raise ValueError('Scenario sunlight definition mismatch')
        if self.provenance.scientificProfile != self.request.profile or any(
            sample.scientificProfile != self.request.profile
            for sample in self.result.samples
        ):
            raise ValueError('Scientific profile mismatch')
        if self.provenance.aberrationCorrection != (
            'NONE' if self.request.profile == 'geometric' else 'LT+S'
        ):
            raise ValueError('Ephemeris correction mismatch')
        return self


class StateResponse(ContractModel):
    schemaVersion: Literal['skyline-scientific-response/1.0.0'] = (
        'skyline-scientific-response/1.0.0'
    )
    dataState: Literal['unsupported', 'not_computed', 'unavailable', 'failed']
    scenarioId: str | None = None
    request: ScientificRequest | None = None
    units: Units = Field(default_factory=Units)
    result: None = None
    provenance: None = None
    coverage: Coverage | None = None
    error: ContractError


ScientificResponse = Annotated[
    ComputedResponse | StateResponse, Field(discriminator='dataState')
]
