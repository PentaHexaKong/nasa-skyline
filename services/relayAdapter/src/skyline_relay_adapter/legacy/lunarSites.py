'''Published ROI centers, not certified landing locations or terrain elevations.'''

from dataclasses import dataclass
import numpy as np

from .spiceGeometry import frameRotations, moonFrame, moonRadius, siteFrame


@dataclass(frozen=True)
class LunarSite:
    siteId: str
    name: str
    latitudeDeg: float
    longitudeDeg: float
    sourceFrame: str = siteFrame
    sourceUrl: str = 'https://arxiv.org/pdf/1208.5587#page=55'


southPoleSites = (
    LunarSite('CR1', 'Connecting Ridge', -89.4679, -137.411),
    LunarSite('GR1', 'de Gerlache Rim', -88.6952, -68.2846),
    LunarSite('SR1', 'Shackleton Rim', -89.7755, -156.448),
)


def sitePositions(times, sites=southPoleSites, radiusKm=None):
    '''Return (site, time, 3) in DE440 ME, explicitly rotating DE421 source vectors.

    Latitudes and east-positive longitudes are from De Rosa et al. Table 2.
    On a sphere geodetic and planetocentric latitude coincide. Heights are zero
    above the chosen sphere; the paper's terrain radii are not being inferred.
    '''
    radiusKm = moonRadius() if radiusKm is None else float(radiusKm)
    if not np.isfinite(radiusKm) or radiusKm <= 0:
        raise ValueError('radiusKm must be positive and finite')
    positions = []
    for site in sites:
        if (not np.isfinite(site.latitudeDeg) or not -90 <= site.latitudeDeg <= 90
                or not np.isfinite(site.longitudeDeg) or not -180 <= site.longitudeDeg <= 180):
            raise ValueError('Site coordinates must be finite latitude/longitude degrees')
        latitude, longitude = np.deg2rad([site.latitudeDeg, site.longitudeDeg])
        vector = radiusKm * np.array([np.cos(latitude) * np.cos(longitude),
                                     np.cos(latitude) * np.sin(longitude), np.sin(latitude)])
        rotations = frameRotations(times, site.sourceFrame, moonFrame)
        positions.append(np.einsum('tij,j->ti', rotations, vector))
    if not positions:
        rotations = frameRotations(times)
        return np.empty((0, len(rotations), 3))
    return np.stack(positions)
