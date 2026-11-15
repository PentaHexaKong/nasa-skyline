from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

class Site(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    siteId: str = Field(max_length=80, pattern=r'^[A-Za-z0-9_-]+$')
    latitudeDeg: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitudeDeg: float = Field(ge=-360, le=360, allow_inf_nan=False)
    sourceFrame: Literal['MOON_ME_DE421'] = 'MOON_ME_DE421'
    sourceUrl: str = 'user supplied coordinates'

    @field_validator('longitudeDeg')
    @classmethod
    def normalizeLongitude(cls, value):
        return (value + 180) % 360 - 180

class Constraints(BaseModel):
    model_config = ConfigDict(extra='forbid')
    minimumSolar: float = Field(default=0, ge=0, le=1)
    minimumEarth: float = Field(default=0, ge=0, le=1)
    maximumSolarOutageS: float = Field(default=31536000, ge=0)
    maximumEarthOutageS: float = Field(default=31536000, ge=0)

class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    schemaVersion: Literal['1.0'] = '1.0'
    site: str | Site = 'CR1'
    startUtc: datetime
    durationS: float = Field(default=86400, ge=60, le=31536000)
    cadenceS: float = Field(default=600, ge=30, le=3600)
    profile: Literal['geometric','apparent'] = 'geometric'
    solarDefinition: Literal['center','anyDisk','fullDisk'] = 'anyDisk'
    earthDefinition: Literal['center'] = 'center'
    horizonOffsetDeg: float = Field(default=0, ge=-5, le=5)
    localResolutionM: Literal[20,80,1895.21] = 80
    eventToleranceS: float = Field(default=1, ge=0.01, le=30)
    constraints: Constraints = Field(default_factory=Constraints)

    @model_validator(mode='after')
    def checkBounds(self):
        if self.startUtc.tzinfo is None or self.startUtc.utcoffset().total_seconds() != 0:
            raise ValueError('startUtc requires explicit UTC offset')
        if self.durationS / self.cadenceS > 6000 or self.cadenceS > self.durationS:
            raise ValueError('Maximum 6000 sample intervals per request')
        return self

class EvaluationResponse(BaseModel):
    schemaVersion: Literal['1.0'] = '1.0'
    dataState: Literal['computed','unavailable']
    result: dict | None = None
    error: dict | None = None
    provenance: dict = Field(default_factory=dict)

