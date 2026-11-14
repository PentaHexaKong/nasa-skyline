'''SPICE infrastructure. All callers must serialize access to the global kernel pool.'''

from contextlib import contextmanager
import os
from pathlib import Path

import numpy as np
import spiceypy as spice

moonFrame = 'MOON_ME_DE440_ME421'
siteFrame = 'MOON_ME_DE421'
kernelNames = (
    'naif0012.tls', 'pck00011.tpc', 'de440s.bsp',
    'moon_pa_de421_1900-2050.bpc', 'moon_080317.tf',
    'moon_pa_de440_200625.bpc', 'moon_de440_250416.tf',
)


def validateTimes(times):
    times = np.asarray(times, dtype=float)
    if times.ndim != 1 or not np.all(np.isfinite(times)):
        raise ValueError('times must be a finite one-dimensional array of SPICE ET seconds')
    return times


@contextmanager
def loadSpice(dataRoot=None):
    '''Load exact official filenames recursively under LUNAR_DATA_ROOT; unload owned files.

    Preflight is atomic; no downloads or kclear. Nested contexts preserve outer loads.
    The two DE421 kernels bridge the published site coordinates without frame aliasing.
    '''
    dataRoot = dataRoot if dataRoot is not None else os.environ.get('LUNAR_DATA_ROOT')
    if not dataRoot:
        raise ValueError('Set LUNAR_DATA_ROOT to the local official NAIF kernel directory')
    rootPath = Path(dataRoot).expanduser().resolve()
    if not rootPath.is_dir():
        raise FileNotFoundError(f'Kernel root does not exist: {rootPath}')
    kernelPaths = []
    for kernelName in kernelNames:
        matches = sorted(rootPath.rglob(kernelName))
        if len(matches) != 1:
            raise FileNotFoundError(f'Expected one {kernelName} under {rootPath}; found {len(matches)}')
        kernelPaths.append(matches[0].resolve())
    existingPaths = {Path(spice.kdata(index, 'ALL')[0]).resolve()
                     for index in range(spice.ktotal('ALL'))}
    ownedPaths = []
    try:
        for kernelPath in kernelPaths:
            if kernelPath not in existingPaths:
                spice.furnsh(str(kernelPath))
                ownedPaths.append(kernelPath)
        yield tuple(kernelPaths)
    finally:
        for kernelPath in reversed(ownedPaths):
            spice.unload(str(kernelPath))


def frameRotations(times, fromFrame='J2000', toFrame=moonFrame):
    times = validateTimes(times)
    return np.array([spice.pxform(fromFrame, toFrame, float(et)) for et in times]).reshape(-1, 3, 3)


def transformStates(states, times, fromFrame='J2000', toFrame=moonFrame):
    '''Transform (..., time, 6) states in km and km/s, including frame angular velocity.'''
    times = validateTimes(times)
    states = np.asarray(states, dtype=float)
    if states.ndim < 2 or states.shape[-2:] != (len(times), 6) or not np.all(np.isfinite(states)):
        raise ValueError('states must have finite shape (..., time, 6)')
    transforms = np.array([spice.sxform(fromFrame, toFrame, float(et)) for et in times]).reshape(-1, 6, 6)
    return np.einsum('tij,...tj->...ti', transforms, states)


def earthPositions(times, frame='J2000'):
    '''Geometric Earth center relative to Moon center, km; aberration correction NONE.'''
    times = validateTimes(times)
    return np.array([spice.spkpos('EARTH', float(et), frame, 'NONE', 'MOON')[0]
                     for et in times]).reshape(-1, 3)


def moonRadius():
    '''Spherical MVP radius from the mean of the official PCK's lunar radii, km.'''
    return float(np.mean(spice.bodvrd('MOON', 'RADII', 3)[1]))
