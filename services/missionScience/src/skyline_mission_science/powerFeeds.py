from pathlib import Path
from pydantic import TypeAdapter

from .mastPowerModels import MastPowerResponse, MastPowerComputed
from .scientificFeeds import writeImmutableJson


def powerFeed(response):
    response = TypeAdapter(MastPowerResponse).validate_python(response)
    if not isinstance(response, MastPowerComputed):
        raise ValueError('A PowerFeed requires a fully computed mast/power scenario')
    outcomes = []
    for outcome in response.result.outcomes:
        metrics = outcome.environment.result.metrics
        outcomes.append(
            dict(
                mast_m=outcome.observerHeightM,
                sun_share=metrics.sunlightAvailabilityFraction,
                longest_no_sun_h=metrics.longestDarkness.durationS / 3600,
                longest_no_sun_truncated=metrics.longestDarkness.touchesCoverageBoundary,
                earth_center_share=metrics.directEarthAvailabilityFraction,
                longest_no_earth_h=metrics.longestDirectEarthBlackout.durationS / 3600,
                longest_no_earth_truncated=metrics.longestDirectEarthBlackout.touchesCoverageBoundary,
                potential_vertical=outcome.panels.vertical.meanGeometricExposure,
                potential_horizontal=outcome.panels.horizontal.meanGeometricExposure,
                potential_tracking=outcome.panels.tracking.meanGeometricExposure,
            )
        )
    ground = response.result.outcomes[0].environment
    sources = sorted(
        [name + ':' + sha for name, sha in ground.provenance.kernels.items()]
        + [item.filename + ':' + item.sha256 for item in ground.provenance.dems]
    )
    return dict(
        schema_version=1,
        origin='computed',
        site_id=ground.result.observer.siteId,
        period=dict(
            start_utc=ground.result.period.startUtc, end_utc=ground.result.period.endUtc
        ),
        outcomes=outcomes,
        provenance=dict(
            algorithm_version=ground.provenance.algorithmVersion,
            sources=sources,
            assumptions=[
                response.result.panelModel,
                response.result.trackingAssumption,
                response.result.exposureIntegration,
                *response.result.limitations,
            ],
        ),
        scenario=dict(
            scenarioId=response.scenarioId,
            request=response.request.model_dump(mode='json'),
            engineVersion=ground.provenance.engineVersion,
            algorithmVersion=ground.provenance.algorithmVersion,
            siteId=ground.result.observer.siteId,
            startUtc=ground.result.period.startUtc,
            durationS=response.request.durationS,
            observerHeightsM=[
                outcome.observerHeightM for outcome in response.result.outcomes
            ],
            profile=response.request.profile,
            verticalAzimuthDeg=response.request.verticalAzimuthDeg,
            sourceScenarioIds=response.provenance['sourceScenarioIds'],
            observer=ground.result.observer.model_dump(mode='json'),
        ),
        panelGeometry=dict(
            verticalAzimuthDeg=response.result.verticalAzimuthDeg,
            incidenceModel=response.result.panelModel,
            trackingAssumption=response.result.trackingAssumption,
        ),
    )


def writePowerFeed(response, outputRoot):
    feed = powerFeed(response)
    siteId = feed['site_id']
    if '/' in siteId or '\\' in siteId or siteId in {'.', '..'}:
        raise ValueError('Invalid site identifier')
    directory = Path(outputRoot) / 'power'
    scenarioPath = directory / 'scenarios' / (feed['scenario']['scenarioId'] + '.json')

    writeImmutableJson(scenarioPath, feed)
    manifest = dict(
        schemaVersion='skyline-power-manifest/1.0.0',
        siteId=siteId,
        scenarioSelectionRequired=True,
        scenarioPathTemplate='scenarios/{scenarioId}.json',
    )
    writeImmutableJson(directory / (siteId + '.json'), manifest)
    return scenarioPath
