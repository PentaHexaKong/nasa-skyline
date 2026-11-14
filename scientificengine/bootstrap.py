'''Resolve the pinned scientific source checkout without copying its physical algorithms.'''
import os
from pathlib import Path
import sys

EXPECTED_VERSION = 'skyline-scientific-engine/1.0.0'


def createEngine(timeoutS=240.):
    external = Path(__file__).resolve().parents[1] / 'external/int4'
    root = Path(os.environ.get('SKYLINE_SCIENCE_ROOT', str(external))).resolve()
    if not (root / 'src/science/engine.py').is_file():
        raise RuntimeError('Set SKYLINE_SCIENCE_ROOT to the INT-4 engine checkout')
    sys.path.insert(0, str(root))
    from src.science import ENGINE_VERSION, EnginePaths, ScientificEngine
    if ENGINE_VERSION != EXPECTED_VERSION:
        raise RuntimeError('Unsupported scientific engine version')
    assets = Path(os.environ.get('SKYLINE_ASSET_ROOT', str(external / 'data/raw'))).resolve()
    cache = Path(os.environ.get('SKYLINE_CACHE_ROOT', str(Path(__file__).resolve().parent / 'data/cache'))).resolve()
    return ScientificEngine(EnginePaths(str(root), str(assets), str(cache)), timeoutS=timeoutS)
