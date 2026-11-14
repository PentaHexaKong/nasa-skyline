from datetime import datetime,timezone
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,model_validator

epoch=datetime(2025,1,1,tzinfo=timezone.utc)
replayDays=28

class RelayRequest(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    schemaVersion: Literal['1.0']='1.0'
    candidateId: Literal['nominal-candidate-2']='nominal-candidate-2'
    siteId: Literal['CR1','GR1','SR1']='CR1'
    startUtc: datetime=datetime(2025,1,1,tzinfo=timezone.utc)
    durationS: int=Field(default=86400,ge=120,le=28*86400)
    satellites: int=Field(default=2,ge=1,le=4)
    cadenceS: int=Field(default=120,ge=120,le=960,multiple_of=120)
    profile: Literal['geometric']='geometric'
    terrainProfile: Literal['lola-80-240-zero-mask']='lola-80-240-zero-mask'
    rfQualified: Literal[False]=False

    @model_validator(mode='after')
    def validateWindow(self):
        if self.startUtc.tzinfo is None or self.startUtc.utcoffset().total_seconds()!=0:
            raise ValueError('UTC timestamp required')
        offset=(self.startUtc-epoch).total_seconds()
        if offset%self.cadenceS or self.durationS%self.cadenceS:
            raise ValueError('startUtc and durationS must be whole multiples of cadenceS from 2025-01-01T00:00:00Z')
        return self

class RelayResponse(BaseModel):
    model_config=ConfigDict(extra='forbid')
    schemaVersion: Literal['1.0']='1.0'
    dataState: Literal['computed','unavailable']
    result: dict | None=None
    provenance: dict | None=None
    error: dict | None=None

    @model_validator(mode='after')
    def validateState(self):
        if self.dataState=='computed' and (self.result is None or self.provenance is None):
            raise ValueError('Computed result requires scientific result and provenance')
        if self.dataState=='unavailable' and self.error is None:
            raise ValueError('Unavailable result requires error')
        return self
