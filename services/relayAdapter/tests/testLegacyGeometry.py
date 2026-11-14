'''Run: python -m unittest discover -s tests/geometry -p 'test*.py'.'''

import os
import tempfile
import unittest

import numpy as np
import spiceypy as spice

from skyline_relay_adapter.legacy import (
    directToEarth, earthPositions, evaluateAvailability, frameRotations, loadSpice,
    moonFrame, moonOccultation, moonRadius, relayToEarth, sitePositions,
    siteToRelay, southPoleSites, transformStates,
)


class TestSphericalGeometry(unittest.TestCase):
    def testAnalyticSegments(self):
        starts = [[2, 0, 0], [2, 1, 0], [1, 0, 0], [1, 0, 0],
                  [1, 0, 0], [2, 0, 0], [0, 0, 0], [2, 0, 0]]
        ends = [[-2, 0, 0], [-2, 1, 0], [2, 0, 0], [-2, 0, 0],
                [1, 2, 0], [3, 0, 0], [2, 0, 0], [2, 0, 0]]
        np.testing.assert_array_equal(moonOccultation(starts, ends, 1),
                                      [True, False, False, True, False, False, True, True])
        np.testing.assert_array_equal(moonOccultation(ends, starts, 1),
                                      moonOccultation(starts, ends, 1))

    def testNearLimb(self):
        starts = [[2, 1 - 1e-7, 0], [2, 1 + 1e-7, 0]]
        ends = [[-2, 1 - 1e-7, 0], [-2, 1 + 1e-7, 0]]
        np.testing.assert_array_equal(moonOccultation(starts, ends, 1), [True, False])

    def testOccultationAgainstQuadraticRoots(self):
        randomSource = np.random.default_rng(440421)
        starts = randomSource.normal(size=(500, 3))
        starts *= 2 / np.linalg.norm(starts, axis=-1)[:, None]
        ends = randomSource.normal(size=(500, 3))
        ends *= 3 / np.linalg.norm(ends, axis=-1)[:, None]
        expected = []
        for start, end in zip(starts, ends):
            direction = end - start
            coefficientA = direction @ direction
            coefficientB = 2 * (start @ direction)
            coefficientC = start @ start - 1
            discriminant = coefficientB ** 2 - 4 * coefficientA * coefficientC
            if discriminant <= 0:
                expected.append(False)
            else:
                entry = (-coefficientB - np.sqrt(discriminant)) / (2 * coefficientA)
                exitTime = (-coefficientB + np.sqrt(discriminant)) / (2 * coefficientA)
                expected.append(entry < 1 and exitTime > 0)
        np.testing.assert_array_equal(moonOccultation(starts, ends, 1), expected)

    def testBroadcastAndComposition(self):
        siteVectors = np.array([[[1., 0, 0], [1, 0, 0]], [[-1., 0, 0], [-1, 0, 0]]])
        relayVectors = np.array([[[2., 0, 0], [-2, 0, 0]]])
        earthVectors = np.array([[100., 0, 0], [100, 0, 0]])
        np.testing.assert_array_equal(siteToRelay(siteVectors, relayVectors, 1),
                                      [[[True, False]], [[False, True]]])
        np.testing.assert_array_equal(relayToEarth(relayVectors, earthVectors, 1), [[True, False]])
        np.testing.assert_array_equal(directToEarth(siteVectors, earthVectors, 1),
                                      [[True, True], [False, False]])

    def testInvalidSegments(self):
        for badValue in ([np.nan, 0, 0], [1, 2], [np.inf, 0, 0]):
            with self.assertRaises(ValueError):
                moonOccultation(badValue, [2, 0, 0], 1)
        for radiusKm in (0, -1, np.nan):
            with self.assertRaises(ValueError):
                moonOccultation([1, 0, 0], [2, 0, 0], radiusKm)

    def testPublishedCoordinates(self):
        self.assertEqual([(site.siteId, site.latitudeDeg, site.longitudeDeg, site.sourceFrame)
                          for site in southPoleSites],
                         [('CR1', -89.4679, -137.411, 'MOON_ME_DE421'),
                          ('GR1', -88.6952, -68.2846, 'MOON_ME_DE421'),
                          ('SR1', -89.7755, -156.448, 'MOON_ME_DE421')])

    def testMissingKernelPreflight(self):
        initialCount = spice.ktotal('ALL')
        with tempfile.TemporaryDirectory() as rootPath:
            with self.assertRaisesRegex(FileNotFoundError, 'naif0012.tls'):
                with loadSpice(rootPath):
                    self.fail('Missing kernels must fail')
        self.assertEqual(spice.ktotal('ALL'), initialCount)

    @unittest.skipUnless(os.environ.get('LUNAR_DATA_ROOT'), 'Set LUNAR_DATA_ROOT for real-kernel tests')
    def testKernelCleanupOnException(self):
        initialCount = spice.ktotal('ALL')
        with self.assertRaisesRegex(RuntimeError, 'fixture failure'):
            with loadSpice():
                self.assertGreater(spice.ktotal('ALL'), initialCount)
                raise RuntimeError('fixture failure')
        self.assertEqual(spice.ktotal('ALL'), initialCount)


@unittest.skipUnless(os.environ.get('LUNAR_DATA_ROOT'), 'Set LUNAR_DATA_ROOT for real-kernel tests')
class TestSpiceGeometry(unittest.TestCase):
    def setUp(self):
        self.kernelContext = loadSpice()
        self.kernelContext.__enter__()
        self.addCleanup(self.kernelContext.__exit__, None, None, None)
        self.times = np.array([0., 86400., 86400. * 365.25 * 25])

    def testRotationsAndStateDerivative(self):
        rotations = frameRotations(self.times)
        for rotation in rotations:
            np.testing.assert_allclose(rotation @ rotation.T, np.eye(3), atol=1e-14)
            self.assertAlmostEqual(np.linalg.det(rotation), 1.)
        states = np.tile([2000., 400., -100., 0.1, -0.2, 0.3], (3, 1))
        transformed = transformStates(states, self.times)
        recovered = transformStates(transformed, self.times, moonFrame, 'J2000')
        np.testing.assert_allclose(recovered, states, atol=1e-11)
        step = 0.5
        forward = np.einsum('tij,tj->ti', frameRotations(self.times + step),
                            states[:, :3] + step * states[:, 3:])
        backward = np.einsum('tij,tj->ti', frameRotations(self.times - step),
                             states[:, :3] - step * states[:, 3:])
        np.testing.assert_allclose(transformed[:, 3:], (forward - backward) / (2 * step), atol=1e-8)
        self.assertFalse(np.allclose(frameRotations(self.times, 'IAU_MOON'),
                                     frameRotations(self.times, moonFrame), atol=1e-8))

    def testEarthObserverAndFrame(self):
        positions = earthPositions(self.times)
        distances = np.linalg.norm(positions, axis=-1)
        self.assertTrue(np.all((distances > 350000) & (distances < 410000)))
        for index, et in enumerate(self.times):
            earthState = spice.spkezr('EARTH', float(et), 'J2000', 'NONE', 'MOON')[0]
            np.testing.assert_allclose(positions[index], earthState[:3], atol=1e-9)
        np.testing.assert_allclose(earthPositions(self.times, moonFrame),
                                   np.einsum('tij,tj->ti', frameRotations(self.times), positions), atol=1e-9)

    def testSourceFrameBridge(self):
        positions = sitePositions(self.times)
        np.testing.assert_allclose(np.linalg.norm(positions, axis=-1), moonRadius(), atol=1e-10)
        for siteIndex, site in enumerate(southPoleSites):
            sourceVector = spice.latrec(moonRadius(), np.deg2rad(site.longitudeDeg),
                                        np.deg2rad(site.latitudeDeg))
            for timeIndex, et in enumerate(self.times):
                inertialVector = spice.mxv(spice.pxform('MOON_ME_DE421', 'J2000', float(et)), sourceVector)
                recovered = spice.mxv(spice.pxform(moonFrame, 'J2000', float(et)), positions[siteIndex, timeIndex])
                np.testing.assert_allclose(recovered, inertialVector, atol=1e-10)

    def testEndToEndAndEmptyAxes(self):
        siteVectors = sitePositions(self.times)
        relayFixed = siteVectors[0] * 2
        relayJ2000 = np.einsum('tji,tj->ti', frameRotations(self.times), relayFixed)
        states = np.concatenate([relayJ2000, np.zeros_like(relayJ2000)], axis=-1)
        availability = evaluateAvailability(states, self.times)
        self.assertEqual(availability.siteToRelay.shape, (3, 1, 3))
        self.assertTrue(availability.siteToRelay[0].all())
        np.testing.assert_array_equal(availability.viaRelay,
                                      (availability.siteToRelay & availability.relayToEarth[None]).any(axis=1))
        np.testing.assert_array_equal(availability.directToEarth,
                                      directToEarth(siteVectors, earthPositions(self.times, moonFrame), moonRadius()))
        emptyRelays = evaluateAvailability(np.empty((0, 3, 6)), self.times)
        self.assertFalse(emptyRelays.viaRelay.any())
        self.assertEqual(evaluateAvailability(np.empty((0, 6)), []).directToEarth.shape, (3, 0))
        self.assertEqual(evaluateAvailability(states, self.times, sites=()).viaRelay.shape, (0, 3))
        for badStates, badTimes in ((states[:, :3], self.times), (states, [np.nan] * 3),
                                    (states * np.nan, self.times), (np.zeros((3, 6)), self.times)):
            with self.assertRaises(ValueError):
                evaluateAvailability(badStates, badTimes)

    def testCoverageFailureAndPoolOwnership(self):
        with self.assertRaises(spice.utils.exceptions.SpiceyError):
            earthPositions([1e12])
        countBefore = spice.ktotal('ALL')
        with loadSpice():
            self.assertEqual(spice.ktotal('ALL'), countBefore)
        self.assertEqual(spice.ktotal('ALL'), countBefore)


if __name__ == '__main__':
    unittest.main()

