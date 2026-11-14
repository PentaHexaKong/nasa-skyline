'''Vectorized finite-segment spherical Moon geometry in any common Moon-centered frame.'''

from dataclasses import dataclass
import numpy as np

from .lunarSites import sitePositions, southPoleSites
from .spiceGeometry import earthPositions, frameRotations, moonRadius, validateTimes


def moonOccultation(startPositions, endPositions, radiusKm):
    '''Broadcast (..., 3) segment endpoints; True means Moon interior is intersected.

    Surface contact and exact tangency are clear. A 1e-9 km numerical skin avoids
    roundoff self-occultation; interior penetration beyond that is blocked.
    Coincident endpoints are blocked (there is no communication direction).
    '''
    startPositions = np.asarray(startPositions, dtype=float)
    endPositions = np.asarray(endPositions, dtype=float)
    radiusKm = float(radiusKm)
    if not np.isfinite(radiusKm) or radiusKm <= 0:
        raise ValueError('radiusKm must be positive and finite')
    for positions in (startPositions, endPositions):
        if positions.ndim < 1 or positions.shape[-1] != 3 or not np.all(np.isfinite(positions)):
            raise ValueError('Segment endpoints must have finite shape (..., 3)')
    startPositions, endPositions = np.broadcast_arrays(startPositions, endPositions)
    directions = endPositions - startPositions
    lengthSquared = np.sum(directions * directions, axis=-1)
    projection = np.divide(-np.sum(startPositions * directions, axis=-1), lengthSquared,
                           out=np.zeros_like(lengthSquared), where=lengthSquared > 0)
    closestPoints = startPositions + np.clip(projection, 0, 1)[..., None] * directions
    return (np.linalg.norm(closestPoints, axis=-1) < radiusKm - 1e-9) | (lengthSquared == 0)


def siteToRelay(siteVectors, relayVectors, radiusKm):
    '''Inputs (site, time, 3), (relay, time, 3); output (site, relay, time).'''
    return ~moonOccultation(siteVectors[:, None, :, :], relayVectors[None, :, :, :], radiusKm)


def relayToEarth(relayVectors, earthVectors, radiusKm):
    '''Inputs (relay, time, 3), (time, 3); output (relay, time).'''
    return ~moonOccultation(relayVectors, earthVectors, radiusKm)


def directToEarth(siteVectors, earthVectors, radiusKm):
    '''Inputs (site, time, 3), (time, 3); output (site, time).'''
    return ~moonOccultation(siteVectors, earthVectors, radiusKm)


@dataclass(frozen=True)
class GeometryAvailability:
    siteToRelay: np.ndarray
    relayToEarth: np.ndarray
    viaRelay: np.ndarray
    directToEarth: np.ndarray


def evaluateAvailability(relayStates, times, sites=southPoleSites):
    '''Moon-centered J2000 states (time, 6) or (relay, time, 6), km and km/s.

    Kernels must be loaded. Uses simultaneous geometric Earth-center visibility,
    no light time, Earth stations, antenna masks, link budgets, or terrain.
    viaRelay and directToEarth are boolean (site, time) availability arrays.
    '''
    times = validateTimes(times)
    relayStates = np.asarray(relayStates, dtype=float)
    if relayStates.ndim == 2:
        relayStates = relayStates[None, ...]
    if (relayStates.ndim != 3 or relayStates.shape[1:] != (len(times), 6)
            or not np.all(np.isfinite(relayStates))):
        raise ValueError('relayStates must have finite shape (time, 6) or (relay, time, 6)')
    radiusKm = moonRadius()
    if np.any(np.linalg.norm(relayStates[..., :3], axis=-1) <= radiusKm):
        raise ValueError('Relay positions must be strictly outside the spherical Moon')
    relayVectors = np.einsum('tij,rtj->rti', frameRotations(times), relayStates[..., :3])
    earthVectors = earthPositions(times, frame='MOON_ME_DE440_ME421')
    siteVectors = sitePositions(times, sites, radiusKm)
    siteAvailability = siteToRelay(siteVectors, relayVectors, radiusKm)
    earthAvailability = relayToEarth(relayVectors, earthVectors, radiusKm)
    return GeometryAvailability(siteAvailability, earthAvailability,
                                np.any(siteAvailability & earthAvailability[None, :, :], axis=1),
                                directToEarth(siteVectors, earthVectors, radiusKm))
