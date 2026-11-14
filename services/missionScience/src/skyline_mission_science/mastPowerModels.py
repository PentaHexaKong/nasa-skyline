from typing import Annotated, Literal
from pydantic import Field, model_validator, field_validator
from .intermediateCache import identityKey
from .scientificModels import (
    ContractModel,
    ScientificRequest,
    ComputedResponse,
    ContractError,
    Coverage,
    Units,
    Fraction,
)


class MastPowerRequest(ScientificRequest):
    schemaVersion: Literal['skyline-mast-power-request/1.0.0'] = (
        'skyline-mast-power-request/1.0.0'
    )
    observerHeightM: Literal[0] = 0
    mastHeightsM: Annotated[
        list[Annotated[float, Field(ge=0)]], Field(min_length=1, max_length=16)
    ]
    verticalAzimuthDeg: float

    @field_validator('verticalAzimuthDeg')
    @classmethod
    def wrapAzimuth(cls, value):
        return value % 360

    @model_validator(mode='after')
    def aggregateBounds(self):
        self.mastHeightsM = sorted(set(self.mastHeightsM))
        count = len(set([0.0, *self.mastHeightsM]))
        if count * self.durationS / self.cadenceS > 6000:
            raise ValueError(
                'Maximum 6000 aggregate sample intervals including the ground baseline'
            )
        return self


class PanelScore(ContractModel):
    incidenceFactor: list[Fraction]
    exposureFactor: list[Fraction]
    meanGeometricExposure: Fraction


class PanelScores(ContractModel):
    horizontal: PanelScore
    vertical: PanelScore
    tracking: PanelScore


class HeightDifference(ContractModel):
    sunlightAvailabilityFraction: float
    directEarthAvailabilityFraction: float
    longestDarknessS: float
    longestDirectEarthBlackoutS: float
    horizontalExposure: float
    verticalExposure: float
    trackingExposure: float
    maximumRawHorizonIncreaseDeg: float
    skylineNonincreasingWithinTolerance: bool
    angularToleranceDeg: float


class HeightOutcome(ContractModel):
    observerHeightM: float = Field(ge=0)
    environment: ComputedResponse
    panels: PanelScores
    differenceFromGround: HeightDifference


class MastPowerResult(ContractModel):
    baselineHeightM: Literal[0] = 0
    verticalAzimuthDeg: float = Field(ge=0, lt=360)
    outcomes: list[HeightOutcome]
    panelModel: str
    trackingAssumption: str
    exposureIntegration: str
    limitations: list[str]


class MastPowerComputed(ContractModel):
    schemaVersion: Literal['skyline-mast-power-response/1.0.0'] = (
        'skyline-mast-power-response/1.0.0'
    )
    dataState: Literal['computed'] = 'computed'
    scenarioId: str = Field(pattern=r'^mast-power-[0-9a-f]{64}$')
    request: MastPowerRequest
    units: Units = Field(default_factory=Units)
    result: MastPowerResult
    provenance: dict
    error: None = None

    @model_validator(mode='after')
    def alignedOutcomes(self):
        identity = dict(
            request=self.request.model_dump(mode='json'),
            sourceScenarioIds=[
                outcome.environment.scenarioId for outcome in self.result.outcomes
            ],
            panelModel=self.result.panelModel,
        )
        if self.scenarioId != 'mast-power-' + identityKey(identity):
            raise ValueError('Mast/power scenario identity mismatch')
        heights = [outcome.observerHeightM for outcome in self.result.outcomes]
        if heights != sorted(set([0.0, *self.request.mastHeightsM])):
            raise ValueError(
                'Every requested height and the ground baseline must be present'
            )
        if self.result.verticalAzimuthDeg != self.request.verticalAzimuthDeg:
            raise ValueError('Vertical orientation mismatch')
        baseline = self.result.outcomes[0]
        for outcome in self.result.outcomes:
            environment = outcome.environment
            if environment.result.observer.observerHeightM != outcome.observerHeightM:
                raise ValueError('Observer height mismatch')
            if (
                environment.result.skyline.azimuthDeg
                != baseline.environment.result.skyline.azimuthDeg
            ):
                raise ValueError(
                    'Height-specific skylines require matching azimuth sectors'
                )
            metrics = environment.result.metrics
            ground = baseline.environment.result.metrics
            expected = dict(
                sunlightAvailabilityFraction=metrics.sunlightAvailabilityFraction
                - ground.sunlightAvailabilityFraction,
                directEarthAvailabilityFraction=metrics.directEarthAvailabilityFraction
                - ground.directEarthAvailabilityFraction,
                longestDarknessS=metrics.longestDarkness.durationS
                - ground.longestDarkness.durationS,
                longestDirectEarthBlackoutS=metrics.longestDirectEarthBlackout.durationS
                - ground.longestDirectEarthBlackout.durationS,
                horizontalExposure=outcome.panels.horizontal.meanGeometricExposure
                - baseline.panels.horizontal.meanGeometricExposure,
                verticalExposure=outcome.panels.vertical.meanGeometricExposure
                - baseline.panels.vertical.meanGeometricExposure,
                trackingExposure=outcome.panels.tracking.meanGeometricExposure
                - baseline.panels.tracking.meanGeometricExposure,
            )
            if any(
                abs(getattr(outcome.differenceFromGround, key) - value) > 1e-10
                for key, value in expected.items()
            ):
                raise ValueError('Ground-baseline difference mismatch')
            times = [sample.elapsedS for sample in environment.result.samples]
            if any(value != 1 for value in outcome.panels.tracking.incidenceFactor):
                raise ValueError('Unconstrained tracking incidence must be one')
            fractions = [
                sample.sun.visibleDiskFraction for sample in environment.result.samples
            ]
            for panel in [
                outcome.panels.horizontal,
                outcome.panels.vertical,
                outcome.panels.tracking,
            ]:
                if len(panel.incidenceFactor) != len(times) or len(
                    panel.exposureFactor
                ) != len(times):
                    raise ValueError('Panel samples must align with scientific samples')
                if any(
                    abs(value - incidence * fraction) > 1e-12
                    for value, incidence, fraction in zip(
                        panel.exposureFactor, panel.incidenceFactor, fractions
                    )
                ):
                    raise ValueError(
                        'Exposure must combine incidence and visible disk fraction'
                    )
                mean = (
                    sum(
                        (right - left)
                        * (
                            panel.exposureFactor[index]
                            + panel.exposureFactor[index + 1]
                        )
                        / 2
                        for index, (left, right) in enumerate(zip(times, times[1:]))
                    )
                    / times[-1]
                )
                if abs(mean - panel.meanGeometricExposure) > 1e-10:
                    raise ValueError('Panel exposure mean mismatch')
        return self


class MastPowerFailure(ContractModel):
    schemaVersion: Literal['skyline-mast-power-response/1.0.0'] = (
        'skyline-mast-power-response/1.0.0'
    )
    dataState: Literal['unsupported', 'not_computed', 'unavailable', 'failed']
    scenarioId: None = None
    request: MastPowerRequest | None = None
    units: Units = Field(default_factory=Units)
    result: None = None
    provenance: None = None
    coverage: Coverage | None = None
    error: ContractError


MastPowerResponse = Annotated[
    MastPowerComputed | MastPowerFailure, Field(discriminator='dataState')
]
