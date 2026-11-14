import numpy as np
import pytest
from skyline_mission_science.visibility import eventIntervals

@pytest.mark.parametrize('center',[.37,1.01,1.71])
def testGrazingExtremum(center):
    result=eventIntervals(lambda t:(t-center)**2,2.,1.,1e-5)
    assert min(abs(time-center) for time in result['grazingEventsS'])<1e-4
    assert result['visibleFraction']==pytest.approx(1)

@pytest.mark.parametrize('width',[.01,.05,.1])
def testNarrowWindowsIndependentRoots(width):
    center=.371
    result=eventIntervals(lambda t:width**2-(t-center)**2,2.,1.,1e-6)
    np.testing.assert_allclose(result['eventsS'],[center-width,center+width],atol=1e-5)
    assert result['visibleFraction']==pytest.approx(width,abs=1e-5)

def testCacheIdentity():
    from skyline_mission_science.intermediateCache import identityKey,ScientificCache
    assert identityKey({'site':[1,2]})!=identityKey({'site':[1,3]})
    cache=ScientificCache(1)
    assert cache.get('x',lambda:3)==3
    assert cache.get('x',lambda:4)==3
    cache.get('y',lambda:5)
    assert cache.get('x',lambda:6)==6
