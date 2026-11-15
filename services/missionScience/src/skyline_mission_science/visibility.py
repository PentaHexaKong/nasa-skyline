import numpy as np
from scipy.optimize import brentq, minimize_scalar

def diskFraction(clearanceDeg, radiusDeg):
    x = np.clip(np.asarray(clearanceDeg) / np.asarray(radiusDeg), -1., 1.)
    return (np.arccos(-x) + x * np.sqrt(1-x*x))/np.pi

def eventIntervals(function, durationS, cadenceS, toleranceS, sampleTimesS=None):
    # Four probes per declared cadence bound the initial search scale.
    probeStep = cadenceS/4
    coarseTimes = np.unique(np.r_[np.arange(0., durationS, cadenceS), durationS])
    times = np.unique(np.r_[np.arange(0.,durationS,probeStep),durationS])
    if sampleTimesS is not None:
        supplied = np.asarray(sampleTimesS, dtype=float)
        if supplied.ndim != 1 or not np.isfinite(supplied).all() or np.any((supplied < 0) | (supplied > durationS)):
            raise ValueError('Initial event samples must lie inside the evaluation window')
        times = np.unique(np.r_[times, supplied])
    values = np.asarray(function(times),dtype=float)
    if values.shape != times.shape or not np.isfinite(values).all():
        raise ValueError('Invalid event function')
    samples = dict(zip(times.tolist(),values.tolist()))
    scalar = lambda time: float(function(np.array([time]))[0])
    grazings = []
    # Search both extrema within coarse intervals. Completeness requires the
    # explicitly reported regularity assumption of at most one extremum of each type.
    for left,right in zip(coarseTimes[:-1], coarseTimes[1:]):
        if right<=left:
            continue
        for sign in (-1.,1.):
            optimum=minimize_scalar(lambda time: sign*scalar(time),bounds=(left,right),method='bounded',options={'xatol':toleranceS/8})
            value=scalar(optimum.x)
            samples[float(optimum.x)]=value
            if abs(value)<1e-9 and np.ptp(values[(times>=left)&(times<=right)])>1e-9:
                grazings.append(float(optimum.x))
    points=sorted(samples)
    roots=[]
    for left,right in zip(points[:-1],points[1:]):
        if samples[left]*samples[right]<0:
            roots.append(float(brentq(scalar,left,right,xtol=toleranceS)))
        elif samples[left]==0:
            roots.append(left)
    def uniqueTimes(items):
        result=[]
        for value in sorted(items):
            if not result or value-result[-1]>toleranceS:
                result.append(value)
        return result
    roots=uniqueTimes(roots)
    grazings=uniqueTimes(grazings)
    edges=sorted(set([0.,*roots,*grazings,durationS]))
    intervals,outages=[],[]
    for left,right in zip(edges[:-1],edges[1:]):
        target=intervals if scalar((left+right)/2)>=0 else outages
        if target and target[-1][1]==left:
            target[-1][1]=right
        else:
            target.append([left,right])
    return dict(intervalsS=intervals,outageIntervalsS=outages,eventsS=roots,grazingEventsS=grazings,
                visibleFraction=sum(b-a for a,b in intervals)/durationS,
                maximumOutageS=max((b-a for a,b in outages),default=0.),
                maximumVisibleS=max((b-a for a,b in intervals),default=0.),
                possibleMissedEvents=True,searchCadenceS=cadenceS,probeStepS=probeStep,
                numericalRootToleranceS=toleranceS,
                completenessAssumption='At most one minimum and maximum per coarse interval. Arbitrary oscillatory functions and skyline jumps remain uncertified.')
