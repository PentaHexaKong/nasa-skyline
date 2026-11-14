import numpy as np
import pytest
from skyline_mission_science.terrainHorizon import TerrainHorizon,localBasis,unitVector,TerrainCoverageError,contentHash
from skyline_mission_science.schemas import Site

def testRidgeAndAzimuthSeam():
    profile=TerrainHorizon('fixture',1737400*unitVector(-89,0),localBasis(-89,0),np.array([10.,0.,0.,0.]),{'minimumTargetRangeM':0.})
    np.testing.assert_array_equal(profile.threshold([0,89.9,90,359.9,360]),[10,10,0,0,10])
    with pytest.raises(TerrainCoverageError):
        profile.threshold(0,-1)

def testContentIdentityAndLongitude(tmp_path):
    path=tmp_path/'data'
    path.write_bytes(b'ab')
    first=contentHash(path)
    path.write_bytes(b'cd')
    assert first!=contentHash(path)
    assert Site(siteId='same',latitudeDeg=-89,longitudeDeg=222).longitudeDeg==-138
