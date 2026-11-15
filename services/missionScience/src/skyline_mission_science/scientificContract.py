from importlib.metadata import version
import logging
from pathlib import Path

import numpy as np
from pydantic import ValidationError
import spiceypy as spice

from .engine import scienceLock
from .intermediateCache import identityKey
from .schemas import EvaluationRequest
from .scientificModels import ComputedResponse, ScientificRequest, StateResponse
from .siteCatalog import resolveSite
from .spiceGeometry import loadSpice
from .terrainHorizon import LunarDem, TerrainCoverageError, openDem


def stateResponse(state, code, message, request=None, coverage=None):
    return StateResponse(
        dataState=state,
        request=request,
        scenarioId='request-' + identityKey(request.model_dump(mode='json'))
        if request
        else None,
        coverage=coverage,
        error=dict(code=code, message=message),
    )


def visibilityWindows(body, durationS, utcAt, riseType, setType):
    def intervalRecord(bounds):
        left, right = bounds
        return dict(
            startUtc=utcAt(left),
            endUtc=utcAt(right),
            startS=left,
            endS=right,
            startClipped=left == 0,
            endClipped=right == durationS,
        )

    available = [intervalRecord(bounds) for bounds in body['intervalsS']]
    unavailable = [intervalRecord(bounds) for bounds in body['outageIntervalsS']]
    events = []
    tolerance = body['numericalRootToleranceS']
    for interval in available:
        for offset, kind in [
            (interval['startS'], riseType),
            (interval['endS'], setType),
        ]:
            if 0 < offset < durationS:
                events.append(
                    dict(
                        timestampUtc=utcAt(offset),
                        elapsedS=offset,
                        eventType=kind,
                        numericalToleranceS=tolerance,
                        physicalUncertaintyS=None,
                        method='numerical transition estimate',
                    )
                )
    for offset in body['grazingEventsS']:
        if 0 < offset < durationS and all(
            abs(event['elapsedS'] - offset) > tolerance for event in events
        ):
            events.append(
                dict(
                    timestampUtc=utcAt(offset),
                    elapsedS=offset,
                    eventType='grazing',
                    numericalToleranceS=tolerance,
                    physicalUncertaintyS=None,
                    method='extremum estimate',
                )
            )
    detection = {
        key: body[key]
        for key in [
            'possibleMissedEvents',
            'searchCadenceS',
            'probeStepS',
            'numericalRootToleranceS',
            'completenessAssumption',
        ]
    }
    detection.update(physicalUncertaintyS=None, discontinuousSkyline=True)
    return dict(
        available=available,
        unavailable=unavailable,
        events=sorted(events, key=lambda event: event['elapsedS']),
        detection=detection,
    )


def longestInterval(windows):
    interval = max(
        windows['unavailable'],
        key=lambda entry: entry['endS'] - entry['startS'],
        default=None,
    )
    return dict(
        durationS=interval['endS'] - interval['startS'] if interval else 0,
        interval=interval,
        touchesCoverageBoundary=bool(
            interval and (interval['startClipped'] or interval['endClipped'])
        ),
    )


def adaptScientificResponse(engine, request, native):
    result = native.result
    provenance = native.provenance

    def utcAt(offset):
        return spice.et2utc(provenance['epochEt'] + float(offset), 'ISOC', 6) + 'Z'

    duration = request.durationS
    times = result['timesS']
    sun = result['bodies']['SUN']
    earth = result['bodies']['EARTH']
    sunWindows = visibilityWindows(sun, duration, utcAt, 'sunrise', 'sunset')
    earthWindows = visibilityWindows(earth, duration, utcAt, 'earthrise', 'earthset')
    samples = []
    for index, offset in enumerate(times):

        def direction(body):
            elevation = body['elevationDeg'][index]
            clearance = body['clearanceDeg'][index]
            return dict(
                azimuthDeg=body['azimuthDeg'][index],
                elevationDeg=elevation,
                horizonElevationDeg=elevation - clearance,
                clearanceDeg=clearance,
            )

        fraction = sun['visibleDiskFraction'][index]
        diskState = (
            'obscured'
            if fraction == 0
            else 'fully_visible'
            if fraction == 1
            else 'partially_visible'
        )
        visible = {
            'anyDisk': fraction > 0,
            'center': sun['clearanceDeg'][index] >= 0,
            'fullDisk': fraction == 1,
        }[request.solarDefinition]
        samples.append(
            dict(
                timestampUtc=utcAt(offset),
                elapsedS=offset,
                scientificProfile=request.profile,
                endpointContext=offset == duration,
                sun=dict(
                    **direction(sun),
                    angularRadiusDeg=sun['angularRadiusDeg'][index],
                    visibleDiskFraction=fraction,
                    diskState=diskState,
                    sunlightVisible=visible,
                ),
                earth=dict(
                    **direction(earth), centerVisible=earth['clearanceDeg'][index] >= 0
                ),
            )
        )
    dems = []
    for filename, sha256 in provenance['dems'].items():
        with openDem(filename) as dem:
            metadata = dem.metadata()
            dems.append(
                dict(
                    filename=Path(filename).name,
                    sourceUrl=('https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/'+Path(filename).name if Path(filename).suffix.upper() in {'.IMG','.LBL'} else 'https://pgda.gsfc.nasa.gov/products/90'),
                    sha256=sha256,
                    resolutionM=metadata['resolutionM'],
                    boundsM=metadata['boundsM'],
                    frame=metadata['frame'],
                    projection=metadata['crsWkt'],
                )
            )
    coverage = dict(
        completeSearchRegion=True,
        missingData=False,
        boundaryChecked=True,
        reason='Required search extent and all contributing DEM cells were checked by the terrain engine',
    )
    site = result['site']
    terrain = provenance['terrain']
    horizon = np.asarray(result['horizonElevationDeg'])
    sunDuration = sum(
        interval['endS'] - interval['startS'] for interval in sunWindows['available']
    )
    earthDuration = sum(
        interval['endS'] - interval['startS'] for interval in earthWindows['available']
    )
    meanFraction = float(
        np.clip(np.trapezoid(sun['visibleDiskFraction'], times) / duration, 0, 1)
    )
    thresholds = {
        'anyDisk': (0, 'greater_than'),
        'center': (None, 'center_clearance_nonnegative'),
        'fullDisk': (1, 'greater_than_or_equal'),
    }
    threshold, operator = thresholds[request.solarDefinition]
    return ComputedResponse(
        scenarioId='scenario-'
        + identityKey(
            dict(
                request=request.model_dump(mode='json'),
                sourceIdentity=provenance['cacheKey'],
            )
        ),
        request=request,
        result=dict(
            period=dict(startUtc=utcAt(0), endUtc=utcAt(duration), durationS=duration),
            observer=dict(
                siteId=site['siteId'],
                latitudeDeg=site['latitudeDeg'],
                longitudeDegEast=site['longitudeDeg'] % 360,
                frame=site['sourceFrame'],
                coordinateSource=site['sourceUrl'],
                coordinateUncertaintyM=None,
                groundElevationM=terrain['groundHeightM'],
                observerHeightM=terrain['config']['observerHeightM'],
                radialReferenceM=terrain['radialReferenceM'],
                positionM=provenance['observerPositionM'],
                datum='radial metres above 1737400 m sphere',
            ),
            skyline=dict(
                azimuthDeg=(np.arange(len(horizon)) * 360 / len(horizon)).tolist(),
                terrainElevationDeg=horizon.tolist(),
                visibilityHorizonElevationDeg=np.maximum(
                    0, horizon + request.horizonOffsetDeg
                ).tolist(),
                azimuthStepDeg=360 / len(horizon),
                azimuthReference='local north, clockwise, east at 90 deg',
                binConvention='left-inclusive periodic sectors in [0,360)',
                horizonOffsetDeg=request.horizonOffsetDeg,
                model=terrain['model'],
                curvature='Spherical radial terrain positions and observer on the 1737400 m reference sphere',
                computationSettings=terrain['config'],
                farTerrainUpperElevationDeg=terrain['farTerrainUpperElevationDeg'],
                minimumTargetRangeM=terrain['minimumTargetRangeM'],
                assumptions=[
                    'Neighboring sector maxima preserve peaks',
                    'Visibility horizon uses a zero-degree floor after the requested offset',
                    'Bilinear near-field rays and pixel-center annuli',
                    'Distant terrain excluded using configured global radial-height envelope',
                ],
                coverage=coverage,
            ),
            samples=samples,
            cadenceS=request.cadenceS,
            solarVisibility=dict(
                availabilityRule=request.solarDefinition,
                diskFractionThreshold=threshold,
                thresholdOperator=operator,
                diskModel=provenance['diskModel'],
                classification=dict(
                    fully_visible='fraction == 1',
                    partially_visible='0 < fraction < 1',
                    obscured='fraction == 0',
                ),
                limitations=[
                    'Uniform disk, no limb darkening',
                    'Locally straight terrain at center azimuth',
                    'Terrain variation across the disk omitted',
                    'Physical terrain and event uncertainty uncalibrated',
                ],
            ),
            directEarthVisibility=dict(
                interpretation='Center-based line of sight under the requested ephemeris profile. RF connectivity has not been evaluated.'
            ),
            sunlightIntervals=sunWindows,
            directEarthIntervals=earthWindows,
            metrics=dict(
                sunlightDurationS=sunDuration,
                sunlightAvailabilityFraction=sunDuration / duration,
                directEarthDurationS=earthDuration,
                directEarthAvailabilityFraction=earthDuration / duration,
                meanVisibleSolarDiskFraction=meanFraction,
                longestDarkness=longestInterval(sunWindows),
                longestDirectEarthBlackout=longestInterval(earthWindows),
                denominatorS=duration,
                denominatorSemantics='Entire half-open requested period in elapsed SPICE ET seconds; endpoint sample is context only',
                meanDiskFractionMethod='Trapezoidal integral of returned solar-disk fractions divided by elapsed duration; sampling approximation',
            ),
        ),
        provenance=dict(
            engineVersion=version('skyline-mission-science'),
            algorithmVersion=provenance['version'],
            implementation=provenance['implementation'],
            scientificProfile=request.profile,
            aberrationCorrection=provenance['correction'],
            kernels=provenance['kernels'],
            dems=dems,
            cacheKey=provenance['cacheKey'],
            execution=provenance['execution'],
            validationEvidence=[],
            sampling=dict(
                cadenceS=request.cadenceS,
                eventToleranceS=request.eventToleranceS,
                probeStepS=request.cadenceS / 4,
                horizonAzimuthStepDeg=360 / len(horizon),
                finalSample='endpoint context, excluded from availability counting',
            ),
            assumptions=[provenance['observer'], provenance['diskModel']],
            limitations=provenance['limitations'],
        ),
    )


def evaluateScientific(engine, request):
    request = ScientificRequest.model_validate(request)
    if isinstance(request.site, str):
        try:
            resolveSite(request.site)
        except ValueError as error:
            return stateResponse('unsupported', 'site_unsupported', str(error), request)
    if not scienceLock.acquire(blocking=False):
        return stateResponse(
            'unavailable',
            'busy',
            'One scientific evaluation is admitted at a time',
            request,
        )
    try:
        nativeRequest = EvaluationRequest(
            **request.model_dump(exclude={'schemaVersion', 'observerHeightM'})
        )
        native = engine.compute(nativeRequest, observerHeightM=request.observerHeightM)
        with loadSpice(engine.assetRoot / 'spice'):
            return adaptScientificResponse(engine, request, native)
    except ValidationError:
        logging.exception('Scientific contract invariant failed')
        return stateResponse(
            'failed',
            'contract_invariant_failed',
            'Computed data failed scientific contract validation',
            request,
        )
    except TerrainCoverageError as error:
        state = (
            'unsupported'
            if 'observer exceeds configured radial height envelope' in str(error)
            else 'unavailable'
        )
        return stateResponse(
            state,
            'terrain_model_unsupported'
            if state == 'unsupported'
            else 'terrain_unavailable',
            str(error),
            request,
            dict(
                completeSearchRegion=False,
                missingData=True if 'NoData' in str(error) else None,
                boundaryChecked=False,
                reason=str(error),
            ),
        )
    except (ValueError, OSError, spice.utils.exceptions.SpiceyError) as error:
        return stateResponse(
            'unavailable',
            'scientific_unavailable',
            str(error),
            request,
            dict(
                completeSearchRegion=False
                if isinstance(error, TerrainCoverageError)
                else None,
                missingData=True
                if isinstance(error, TerrainCoverageError)
                and 'NoData' in str(error)
                or isinstance(error, FileNotFoundError)
                and any(extension in str(error).upper() for extension in ['.TIF', '.IMG', '.LBL'])
                else None,
                boundaryChecked=False,
                reason=str(error),
            ),
        )
    except Exception:
        logging.exception('Scientific evaluation failed')
        return stateResponse(
            'failed', 'evaluation_failed', 'Scientific evaluation failed', request
        )
    finally:
        scienceLock.release()
