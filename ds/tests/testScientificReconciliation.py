import numpy as np
import pytest
import spiceypy as spice

from pipeline import fetch
from pipeline.run import spans
from pipeline.sun import Ephemeris, ME_FRAME, SUN_RADIUS_KM
from pipeline.sites import SITES
from skyline_mission_science.visibility import eventIntervals


def testHiddenWindowUsesSharedEventDetector():
    margin = lambda times: 25 - (np.atleast_1d(times) - 30) ** 2
    times = np.array([0., 60.])
    found = spans(margin, times, margin(times) > 0, 60.)
    np.testing.assert_allclose(found, [[25, 35]], atol=1.)


def testWindowClippingAndGrazing():
    times = np.array([0., 60.])
    assert spans(lambda values: -(values - 30) ** 2, times, np.array([False, False]), 60.) == []
    assert spans(lambda values: np.ones_like(values), times, np.array([True, True]), 61.) == [(0., 61.)]
    found = spans(lambda values: values - 20, times, np.array([False, True]), 61.)
    np.testing.assert_allclose(found, [[20, 61]], atol=1.)


def testAdditionalProbesPreserveCoarseSearchIntervals():
    result = eventIntervals(lambda values: .01 - (values - .371) ** 2, 2., 1., 1e-6, sampleTimesS=np.arange(0, 2, .07))
    np.testing.assert_allclose(result['eventsS'], [.271, .471], atol=1e-5)
    assert result['possibleMissedEvents']
    assert result['searchCadenceS'] == 1.


def testExplicitFrameAndSolarConstant():
    assert ME_FRAME == 'MOON_ME_DE421'
    assert SUN_RADIUS_KM == 695700.
    assert 'moon_080317.tf' in fetch.MOON_KERNELS
    assert 'moon_pa_de421_1900-2050.bpc' in fetch.MOON_KERNELS


def testObserverFrameMatchesTerrain(monkeypatch):
    captured = []
    monkeypatch.setattr(spice, 'kclear', lambda: None)
    monkeypatch.setattr(spice, 'furnsh', lambda path: None)
    def direction(*args):
        captured.append(args)
        return np.array([150000000., 0., 0., 0., 0., 0.]), 0.
    monkeypatch.setattr(spice, 'azlcpo', direction)
    Ephemeris([]).target('SUN', [0.], SITES['connecting-ridge'])
    assert captured[0][-1] == 'MOON_ME_DE421'
    expected = spice.latrec(1737.402, np.deg2rad(222.589), np.deg2rad(-89.4679))
    np.testing.assert_allclose(captured[0][-3], expected)


def testExplicitFrameTransformWithRealKernels():
    paths = [fetch.DATA / name for name in fetch.MOON_KERNELS]
    if not all(path.exists() for path in paths):
        pytest.skip('Pinned kernels are required for frame closure')
    Ephemeris(paths)
    try:
        epoch = spice.str2et('2026-11-14T00:00:00Z')
        observer = spice.latrec(1737.402, np.deg2rad(222.589), np.deg2rad(-89.4679))
        rotation = spice.pxform('MOON_ME_DE421', 'MOON_ME_DE440_ME421', epoch)
        transformed = rotation @ observer
        assert np.linalg.norm(transformed - observer) * 1000 > .1
        first = spice.spkcpo('SUN', epoch, 'J2000', 'OBSERVER', 'NONE', observer, 'MOON', 'MOON_ME_DE421')[0][:3]
        second = spice.spkcpo('SUN', epoch, 'J2000', 'OBSERVER', 'NONE', transformed, 'MOON', 'MOON_ME_DE440_ME421')[0][:3]
        np.testing.assert_allclose(first, second, rtol=0, atol=1e-6)
    finally:
        spice.kclear()


def testChunkBoundaryDoesNotCreateAnEvent():
    times = np.arange(0., 172800., 3600.)
    assert spans(lambda values: np.ones_like(values), times, np.ones(len(times), dtype=bool), 172800.) == [(0., 172800.)]
