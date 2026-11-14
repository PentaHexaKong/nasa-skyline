import numpy as np

from .intermediateCache import identityKey
from .mastPowerModels import MastPowerRequest, MastPowerComputed, MastPowerFailure
from .panelGeometry import panelExposure
from .scientificContract import evaluateScientific
from .scientificModels import ScientificRequest


def mastFailure(state, code, message, request=None, coverage=None):
    return MastPowerFailure(
        dataState=state,
        request=request,
        coverage=coverage,
        error=dict(code=code, message=message),
    )


def evaluateMastPower(engine, request):
    request = MastPowerRequest.model_validate(request)
    outcomes = []
    for height in sorted(set([0.0, *request.mastHeightsM])):
        single = ScientificRequest(
            **request.model_dump(
                exclude={
                    'schemaVersion',
                    'mastHeightsM',
                    'verticalAzimuthDeg',
                    'observerHeightM',
                }
            ),
            observerHeightM=height,
        )
        environment = evaluateScientific(engine, single)
        if environment.dataState != 'computed':
            return mastFailure(
                environment.dataState,
                environment.error.code,
                environment.error.message,
                request,
                environment.coverage,
            )
        samples = environment.result.samples
        panels = panelExposure(
            [sample.sun.azimuthDeg for sample in samples],
            [sample.sun.elevationDeg for sample in samples],
            [sample.sun.visibleDiskFraction for sample in samples],
            [sample.elapsedS for sample in samples],
            request.verticalAzimuthDeg,
        )
        if outcomes:
            first = outcomes[0]
            baseline = first['environment']
            if (
                environment.provenance.kernels != baseline.provenance.kernels
                or environment.provenance.dems != baseline.provenance.dems
                or environment.provenance.implementation
                != baseline.provenance.implementation
            ):
                return mastFailure(
                    'unavailable',
                    'source_identity_changed',
                    'Scientific inputs changed during height comparison',
                    request,
                )
        else:
            baseline = environment
            first = dict(panels=panels)
        metrics = environment.result.metrics
        ground = baseline.result.metrics
        increase = float(
            max(
                0,
                np.max(
                    np.asarray(environment.result.skyline.terrainElevationDeg)
                    - np.asarray(baseline.result.skyline.terrainElevationDeg)
                ),
            )
        )
        delta = dict(
            sunlightAvailabilityFraction=metrics.sunlightAvailabilityFraction
            - ground.sunlightAvailabilityFraction,
            directEarthAvailabilityFraction=metrics.directEarthAvailabilityFraction
            - ground.directEarthAvailabilityFraction,
            longestDarknessS=metrics.longestDarkness.durationS
            - ground.longestDarkness.durationS,
            longestDirectEarthBlackoutS=metrics.longestDirectEarthBlackout.durationS
            - ground.longestDirectEarthBlackout.durationS,
            horizontalExposure=panels['horizontal']['meanGeometricExposure']
            - first['panels']['horizontal']['meanGeometricExposure'],
            verticalExposure=panels['vertical']['meanGeometricExposure']
            - first['panels']['vertical']['meanGeometricExposure'],
            trackingExposure=panels['tracking']['meanGeometricExposure']
            - first['panels']['tracking']['meanGeometricExposure'],
            maximumRawHorizonIncreaseDeg=increase,
            skylineNonincreasingWithinTolerance=increase <= 1e-9,
            angularToleranceDeg=1e-9,
        )
        outcomes.append(
            dict(
                observerHeightM=height,
                environment=environment,
                panels=panels,
                differenceFromGround=delta,
            )
        )
    identity = dict(
        request=request.model_dump(mode='json'),
        sourceScenarioIds=[outcome['environment'].scenarioId for outcome in outcomes],
        panelModel='solar-center-incidence-times-visible-disk-fraction/1.0.0',
    )
    return MastPowerComputed(
        scenarioId='mast-power-' + identityKey(identity),
        request=request,
        result=dict(
            verticalAzimuthDeg=request.verticalAzimuthDeg,
            outcomes=outcomes,
            panelModel=identity['panelModel'],
            trackingAssumption='Ideal unconstrained single-sided panel normal tracks the solar center; no slew, pointing or mechanical limits',
            exposureIntegration='Trapezoidal time integral of center incidence times visible-disk fraction divided by elapsed ET duration',
            limitations=[
                'Dimensionless geometric exposure; no electrical, thermal, area or efficiency model',
                'Incidence is evaluated at the solar center, not integrated over the visible disk',
                'Near-limb horizontal exposure can be underestimated when the solar center is below the local horizontal plane',
                'A zero-degree visibility floor limits height benefits over negative terrain horizons',
                'Finite-target parallax and event/discretization error can affect visibility monotonicity',
                'Numerical and physical event uncertainties remain those of each environment evaluation',
            ],
        ),
        provenance=dict(
            sourceScenarioIds=identity['sourceScenarioIds'],
            panelModel=identity['panelModel'],
            validationStatus='computed',
            independentlyValidated=False,
        ),
    )
