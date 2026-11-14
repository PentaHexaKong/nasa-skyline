from functools import lru_cache
import numpy as np
import spiceypy as spice

GM_MOON_KM3S2=4902.800066
SATELLITES=4
_MEAN_ANOMALY=5
_GAP_TIE=1e-9

@lru_cache(maxsize=4)
def fitElements(statePath):
    '''Conic elements at the CSV epoch for each verified relay satellite, then the nested extras.

    Row 0 of each satellite in the saved Candidate 2 export is the epoch state. GM must be
    exactly 4902.800066 km^3/s^2: it reproduces all 28 days of the CSV to sub-millimetre.
    The first two satellites keep their fitted mean anomalies. Satellite k+1 shares their orbit
    and takes the mean anomaly midway across the largest gap between the mean anomalies already
    chosen, measured around the circle. A tie goes to the gap that starts at the smallest mean
    anomaly. Count k therefore always contains count k-1 plus one satellite.
    '''
    records=np.genfromtxt(statePath,delimiter=',',skip_header=1)
    elements=[]
    for satellite in (0,1):
        first=records[records[:,0]==satellite][0]
        elements.append(np.array(spice.oscelt(first[2:8],0.,GM_MOON_KM3S2)))
    anomalies=[elements[0][_MEAN_ANOMALY],elements[1][_MEAN_ANOMALY]]
    while len(anomalies)<SATELLITES:
        ordered=sorted(anomalies)
        gaps=[(ordered[(i+1)%len(ordered)]-ordered[i])%(2*np.pi) or 2*np.pi for i in range(len(ordered))]
        widest=next(i for i,gap in enumerate(gaps) if gap>=max(gaps)-_GAP_TIE)
        anomalies.append((ordered[widest]+gaps[widest]/2)%(2*np.pi))
    shared=elements[0]
    for anomaly in anomalies[2:]:
        extra=shared.copy()
        extra[_MEAN_ANOMALY]=anomaly
        elements.append(extra)
    return tuple(elements)

def states(offsetS,timesS,count,statePath):
    '''J2000 Moon-centered states, shape (count, len(timesS), 6), km and km/s.

    offsetS is seconds since the CSV epoch (2025-01-01T00:00:00Z); timesS are seconds from the request start.
    '''
    if not 1<=count<=SATELLITES:
        raise ValueError(f'satellites must be 1 to {SATELLITES}')
    elapsed=float(offsetS)+np.asarray(timesS,dtype=float)
    return np.array([[spice.conics(element,float(t)) for t in elapsed] for element in fitElements(str(statePath))[:count]])
