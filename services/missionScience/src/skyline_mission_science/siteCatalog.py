import json
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from .schemas import Site

catalogPath = Path(__file__).with_name('siteCatalog.json')


class CatalogEntry(BaseModel):
    model_config = ConfigDict(extra='allow')
    canonicalId: str
    displayName: str
    body: Literal['moon', 'earth']
    latitudeDeg: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitudeDegEast: float = Field(ge=0, lt=360, allow_inf_nan=False)
    frame: str
    coordinateSource: str
    coordinateUncertaintyM: float | None
    observerHeightM: float
    groundElevationM: float | None
    datum: str
    dems: list[dict]
    epochs: dict | None
    missionLimits: dict | None
    profiles: list[str]
    supportedObserverHeightsM: list[float]
    liveEvaluation: str
    relay: dict
    aliases: list[str]


class CatalogResponse(BaseModel):
    model_config = ConfigDict(extra='allow')
    schemaVersion: Literal['site-catalog/1.0.0']
    longitudeConvention: str
    aliases: dict[str, str]
    sites: list[CatalogEntry]
    sourceEvidence: dict
    externalRegistries: list[dict]
    tolerances: dict


def loadCatalog():
    return CatalogResponse.model_validate_json(
        catalogPath.read_text(encoding='utf-8')
    ).model_dump()


def equivalentObservers(first, second):
    for key in ['body', 'frame', 'datum', 'demIdentity']:
        if first.get(key) is None or first.get(key) != second.get(key):
            return False
    for key in ['latitudeDeg', 'longitudeDegEast', 'observerHeightM']:
        if first.get(key) is None or second.get(key) is None:
            return False
        if not np.isfinite([first[key], second[key]]).all():
            return False
    limits = loadCatalog()['tolerances']
    deltaLongitude = (
        first['longitudeDegEast'] - second['longitudeDegEast'] + 180
    ) % 360 - 180
    if abs(first['latitudeDeg'] - second['latitudeDeg']) > limits['coordinateDeg']:
        return False
    if abs(deltaLongitude) > limits['coordinateDeg']:
        return False
    if (
        abs(first['observerHeightM'] - second['observerHeightM'])
        > limits['observerPositionM']
    ):
        return False
    firstPosition = np.asarray(first.get('observerPositionM'), dtype=float)
    secondPosition = np.asarray(second.get('observerPositionM'), dtype=float)
    if firstPosition.shape != (3,) or secondPosition.shape != (3,):
        return False
    if not np.isfinite(firstPosition).all() or not np.isfinite(secondPosition).all():
        return False
    return bool(
        np.linalg.norm(firstPosition - secondPosition) <= limits['observerPositionM']
    )


def resolveSite(identifier):
    catalog = loadCatalog()
    canonical = catalog['aliases'].get(identifier, identifier)
    for entry in catalog['sites']:
        if entry['canonicalId'] == canonical:
            if not entry['liveEvaluation'].startswith('supported'):
                raise ValueError(
                    f'{identifier}: scientific coordinate mapping unresolved or unsupported'
                )
            return Site(
                siteId=entry['canonicalId'],
                latitudeDeg=entry['latitudeDeg'],
                longitudeDeg=entry['longitudeDegEast'],
                sourceFrame=entry['frame'],
                sourceUrl=entry['coordinateSource'],
            )
    raise ValueError(f'Unknown site identifier: {identifier}')
