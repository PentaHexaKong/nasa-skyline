import numpy as np
import pytest
from skyline_mission_science.visibility import diskFraction,eventIntervals
from skyline_mission_science.terrainHorizon import localBasis,unitVector,azimuthElevation
from skyline_mission_science.schemas import EvaluationRequest,Site
from skyline_mission_science.optimization import nondominated

def testDiskLimits():
    np.testing.assert_allclose(diskFraction(np.array([-2,-1,0,1,2]),1),[0,0,.5,1,1])
    x=np.linspace(-1,1,101)
    np.testing.assert_allclose(diskFraction(x,1)+diskFraction(-x,1),1,atol=1e-15)

def testEventsAndBoundaries():
    result=eventIntervals(lambda time:np.cos(time),2*np.pi,.1,1e-8)
    np.testing.assert_allclose(result['eventsS'],[np.pi/2,3*np.pi/2],atol=1e-8)
    assert abs(result['visibleFraction']-.5)<1e-8
    for sign in [-1,1]:
        result=eventIntervals(lambda time:np.full_like(time,sign),100,10,.01)
        assert result['maximumOutageS']==(100 if sign<0 else 0)

def testCadenceConvergenceAndMissedGrazing():
    values=[eventIntervals(lambda time:np.cos(time),6.28,step,1e-7) for step in [.5,.25,.125]]
    assert max(item['visibleFraction'] for item in values)-min(item['visibleFraction'] for item in values)<1e-6
    assert eventIntervals(lambda time:-(time-1)**2,2,.3,.01)['possibleMissedEvents']

def testCoordinates():
    for latitude,longitude in [(-90,0),(-88,359),(0,0),(90,180)]:
        basis=localBasis(latitude,longitude)
        np.testing.assert_allclose(basis@basis.T,np.eye(3),atol=1e-14)
        assert azimuthElevation(np.array([basis[2]]),basis)[1][0]==pytest.approx(90)
    with pytest.raises(ValueError):
        Site(siteId='bad',latitudeDeg=-91,longitudeDeg=0)

def testBounds():
    with pytest.raises(ValueError):
        EvaluationRequest(startUtc='2025-01-01',durationS=60)
    with pytest.raises(ValueError):
        EvaluationRequest(startUtc='2025-01-01T00:00:00Z',durationS=31536000,cadenceS=30)

def testPareto():
    assert nondominated([[1,2],[2,1],[3,3],[1,2]])==[0,1,3]
