from pathlib import Path
import numpy as np
from skyline_relay_adapter import orbit

statePath=Path(__file__).resolve().parents[1]/'data/states/candidate2States.csv'

def testReproducesSavedStates():
    records=np.genfromtxt(statePath,delimiter=',',skip_header=1)
    states=orbit.states(0,np.arange(0,28*86400,120.),2,statePath)
    for satellite in (0,1):
        saved=records[records[:,0]==satellite][:,2:]
        assert np.abs(states[satellite,:,:3]-saved[:,:3]).max()<1e-3

def testSatellitesNest():
    times=np.arange(0,86400,120.)
    one,two,three,four=(orbit.states(5*86400,times,count,statePath) for count in (1,2,3,4))
    assert np.array_equal(one,two[:1])
    assert np.array_equal(two,three[:2])
    assert np.array_equal(three,four[:3])
    assert four.shape==(4,len(times),6)

def testAddedSatellitesSplitLargestGap():
    anomalies=[np.degrees(element[5]) for element in orbit.fitElements(str(statePath))]
    assert abs(anomalies[2]-94.430765)<1e-6
    assert abs(anomalies[3]-162.858208)<1e-6

def testPropagatesFarFromEpoch():
    states=orbit.states(-400*86400,np.array([0.,120.]),4,statePath)
    assert np.isfinite(states).all()
    assert states.shape==(4,2,6)
