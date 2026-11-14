import os
from pathlib import Path
import numpy as np
import pytest
import spiceypy as spice
from skyline_mission_science.spiceGeometry import loadSpice,frameRotations,transformStates
from skyline_mission_science.terrainHorizon import LunarDem,localBasis,azimuthElevation
from skyline_mission_science.visibility import diskFraction

root=Path(__file__).resolve().parents[2]

def testRealKernelsAndHarmonizedGeometry():
    with loadSpice(root/'data/raw/spice'):
        epoch=spice.str2et('2025-01-01T00:00:00Z')
        np.testing.assert_allclose(frameRotations([epoch])[0]@frameRotations([epoch])[0].T,np.eye(3),atol=1e-14)
        obs=spice.latrec(1737.4,np.deg2rad(-137.411),np.deg2rad(-89.4679))
        basis=localBasis(-89.4679,-137.411)
        geometric=spice.spkcpo('EARTH',epoch,'MOON_ME_DE421','OBSERVER','NONE',obs,'MOON','MOON_ME_DE421')[0][:3]
        direct=spice.spkpos('EARTH',epoch,'MOON_ME_DE421','NONE','MOON')[0]-obs
        np.testing.assert_allclose(geometric,direct,atol=1e-8)
        apparent=spice.spkcpo('SUN',epoch,'MOON_ME_DE421','OBSERVER','LT+S',obs,'MOON','MOON_ME_DE421')[0][:3]
        reference=spice.azlcpo('ELLIPSOID','SUN',epoch,'LT+S',False,True,obs,'MOON','MOON_ME_DE421')[0]
        az,el=azimuthElevation(apparent[None],basis)
        assert az[0]==pytest.approx(np.rad2deg(reference[1]),abs=1e-8)
        assert el[0]==pytest.approx(np.rad2deg(reference[2]),abs=1e-8)
        geometricSun=spice.spkcpo('SUN',epoch,'MOON_ME_DE421','OBSERVER','NONE',obs,'MOON','MOON_ME_DE421')[0][:3]
        assert np.linalg.norm(geometricSun-apparent)>0.1

def testRealDemRegistration():
    with LunarDem(root/'data/raw/lola/LDEM_80S_80MPP_ADJ.TIF') as dem:
        lat,lon=-89.4679,-137.411
        x,y=dem.xy(lat,lon)
        rho=2*1737400*np.tan(np.pi/4+np.deg2rad(lat)/2)
        np.testing.assert_allclose([x,y],[rho*np.sin(np.deg2rad(lon)),rho*np.cos(np.deg2rad(lon))],atol=1e-6)
        assert np.isfinite(dem.heights(lat,lon))
        with pytest.raises(ValueError):
            dem.heights(0,0)

def testHarmonizedInheritedDiskFormula():
    clearance=np.linspace(-2,2,51)
    x=np.clip(-clearance,-1,1)
    reference=(np.arccos(x)-x*np.sqrt(1-x*x))/np.pi
    np.testing.assert_allclose(diskFraction(clearance,1),reference,atol=1e-15)
