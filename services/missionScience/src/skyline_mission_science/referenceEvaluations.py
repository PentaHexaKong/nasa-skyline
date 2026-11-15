from datetime import datetime, timedelta
from typing import Literal

from pydantic import Field, model_validator
import spiceypy as spice

from .engine import scienceLock, fileHash
from .scientificContract import evaluateScientific, stateResponse
from .scientificModels import ContractModel, ScientificRequest
from .siteCatalog import resolveSite
from .spiceGeometry import loadSpice


class ReferenceRequest(ContractModel):
    schemaVersion: Literal['skyline-reference-request/1.0.0'] = 'skyline-reference-request/1.0.0'
    site: str
    startUtc: datetime
    endUtc: datetime
    observerHeightM: float = Field(default=2, ge=0)
    profile: Literal['geometric', 'apparent'] = 'geometric'
    solarDefinition: Literal['anyDisk', 'center', 'fullDisk'] = 'anyDisk'
    earthDefinition: Literal['center'] = 'center'
    horizonOffsetDeg: float = Field(default=0, ge=-5, le=5)
    localResolutionM: Literal[20, 80, 1895.21] = 80
    cadenceS: float = Field(default=3600, ge=30, le=3600)
    eventToleranceS: float = Field(default=1, ge=0.01, le=30)

    @model_validator(mode='after')
    def boundedUtcWindow(self):
        for value in (self.startUtc, self.endUtc):
            if value.tzinfo is None or value.utcoffset().total_seconds() != 0:
                raise ValueError('Reference timestamps require explicit UTC')
            if any((value.hour, value.minute, value.second, value.microsecond)):
                raise ValueError('Reference windows use UTC midnight boundaries')
        if not timedelta(days=1) <= self.endUtc-self.startUtc <= timedelta(days=14):
            raise ValueError('Reference windows require 1 to 14 UTC days')
        if (self.endUtc-self.startUtc).total_seconds()/self.cadenceS > 6000:
            raise ValueError('Maximum 6000 sample intervals per reference window')
        return self


class ReferenceDay(ContractModel):
    date: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    startS: float
    endS: float


class ReferenceWindow(ContractModel):
    schemaVersion: Literal['skyline-reference-window/1.0.0'] = 'skyline-reference-window/1.0.0'
    startUtc: str
    endUtc: str
    startEt: float
    endEt: float
    days: list[ReferenceDay]

    @model_validator(mode='after')
    def continuousDays(self):
        if not self.days or self.days[0].startS != 0 or self.days[-1].endS != self.endEt-self.startEt:
            raise ValueError('Day grid must cover the complete ET window')
        for index, day in enumerate(self.days):
            if day.endS <= day.startS or index and day.startS != self.days[index-1].endS:
                raise ValueError('Day grid requires positive contiguous intervals')
        return self


def referenceWindow(request, toEt):
    startEt = float(toEt(request.startUtc.isoformat().replace('+00:00', 'Z')))
    endEt = float(toEt(request.endUtc.isoformat().replace('+00:00', 'Z')))
    days = []
    at = request.startUtc
    while at < request.endUtc:
        following = at + timedelta(days=1)
        days.append(ReferenceDay(date=at.date().isoformat(),
            startS=float(toEt(at.isoformat().replace('+00:00', 'Z')))-startEt,
            endS=float(toEt(following.isoformat().replace('+00:00', 'Z')))-startEt))
        at = following
    return ReferenceWindow(startUtc=request.startUtc.isoformat().replace('+00:00', 'Z'),
        endUtc=request.endUtc.isoformat().replace('+00:00', 'Z'),
        startEt=startEt, endEt=endEt, days=days)


def evaluateReference(engine, request):
    try:
        resolveSite(request.site)
    except ValueError as error:
        return stateResponse('unsupported', 'site_unsupported', str(error))
    if not scienceLock.acquire(blocking=False):
        return stateResponse('unavailable', 'busy', 'Scientific service is evaluating another request')
    try:
        with loadSpice(engine.assetRoot / 'spice'):
            window = referenceWindow(request, spice.str2et)
            timeHash = fileHash(engine.assetRoot / 'spice' / 'naif0012.tls')
    except (ValueError, OSError, spice.utils.exceptions.SpiceyError) as error:
        return stateResponse('unavailable', 'reference_time_unavailable', str(error))
    finally:
        scienceLock.release()
    try:
        scenario = ScientificRequest(**request.model_dump(exclude={'schemaVersion', 'endUtc'}),
            durationS=window.endEt-window.startEt)
    except ValueError as error:
        return stateResponse('failed', 'invalid_reference_sampling', str(error))
    response = evaluateScientific(engine, scenario)
    if response.dataState == 'computed':
        if response.provenance.kernels.get('naif0012.tls') != timeHash:
            return stateResponse('failed', 'time_identity_changed', 'Time kernel identity changed during evaluation', scenario)
        response.provenance.sampling['referenceWindow'] = window.model_dump(mode='json')
    return response
