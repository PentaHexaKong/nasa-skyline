from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from skyline_mission_science.globalLola import GlobalLolaDem
from skyline_mission_science.terrainHorizon import (
    TerrainCoverageError, HorizonConfig, cachedHorizon,
)
from skyline_mission_science.lunarSites import LunarSite
from skyline_mission_science.siteCatalog import loadCatalog, resolveSite
from skyline_mission_science.engine import Engine
from skyline_mission_science.scientificContract import evaluateScientific

root = Path(__file__).resolve().parents[2]
image = root / 'data/raw/lola/LDEM_16.IMG'
# Tests that read real global terrain skip, with the reason, on a checkout without the 33 MB asset.
requiresGlobalLola = pytest.mark.skipif(
    not image.is_file() or not image.with_suffix('.LBL').is_file(),
    reason='needs data/raw/lola/LDEM_16.IMG and .LBL (scripts/prepareScienceAssets.py)',
)

# A label carrying exactly the frame, datum, product and layout fields the reader checks, with LDEM_16's values, so the
# label and registration tests run on a synthetic image without the download.
SYNTHETIC_LABEL = '''PDS_VERSION_ID       = PDS3
DATA_SET_ID          = "LRO-L-LOLA-4-GDR-V1.0"
PRODUCT_ID           = "LDEM_16"
PRODUCT_VERSION_ID   = "V3.1"
OBJECT               = IMAGE
  LINES              = 2880
  LINE_SAMPLES       = 5760
  SAMPLE_TYPE        = LSB_INTEGER
  SAMPLE_BITS        = 16
  UNIT                = METER
  SCALING_FACTOR     = 0.5
  OFFSET             = 1737400
  MINIMUM            = -18257
  MAXIMUM            = 21541
END_OBJECT           = IMAGE
OBJECT               = IMAGE_MAP_PROJECTION
  MAP_PROJECTION_TYPE        = "SIMPLE CYLINDRICAL"
  COORDINATE_SYSTEM_NAME     = "MEAN EARTH/POLAR AXIS OF DE421"
  POSITIVE_LONGITUDE_DIRECTION = "EAST"
  A_AXIS_RADIUS              = 1737.4
  B_AXIS_RADIUS              = 1737.4
  C_AXIS_RADIUS              = 1737.4
  CENTER_LONGITUDE           = 180
  MAP_RESOLUTION             = 16
  MAXIMUM_LATITUDE           = 90
  MINIMUM_LATITUDE           = -90
  WESTERNMOST_LONGITUDE      = 0
  EASTERNMOST_LONGITUDE      = 360
  LINE_PROJECTION_OFFSET     = 1439.5
  SAMPLE_PROJECTION_OFFSET   = 2879.5
END_OBJECT           = IMAGE_MAP_PROJECTION
END
'''


@pytest.fixture
def flatImage(tmp_path):
    path = tmp_path / 'LDEM_16.IMG'
    with path.open('wb') as stream:
        stream.truncate(2880 * 5760 * 2)
    path.with_suffix('.LBL').write_text(SYNTHETIC_LABEL, encoding='ascii')
    return path


def testSyntheticLabelIsAccepted(flatImage):
    with GlobalLolaDem(flatImage) as dem:
        assert float(dem.heights(0.03125, 180.03125)) == 0
        assert dem.metadata()['frame'] == 'MOON_ME_DE421'


@requiresGlobalLola
def testIndependentPixelRegistrationAndWrapping():
    with GlobalLolaDem(image) as dem:
        row, column = 1200, 3100
        raw = np.fromfile(image, dtype='<i2').reshape(2880, 5760)
        latitude = 90 - (row + .5) / 16
        longitude = (column + .5) / 16
        assert float(dem.heights(latitude, longitude)) == raw[row, column] * .5
        expected = raw[row:row + 2, column:column + 2].mean() * .5
        assert float(dem.heights(latitude - 1 / 32, longitude + 1 / 32)) == expected
        assert dem.heights(latitude, longitude) == dem.heights(latitude, longitude - 360)
        seam = (float(raw[row, -1]) + float(raw[row, 0])) / 4
        assert float(dem.heights(latitude, 0)) == seam
        assert dem.metadata()['frame'] == 'MOON_ME_DE421'
        assert dem.metadata()['radialReferenceM'] == 1737400
        with pytest.raises(TerrainCoverageError, match='polar coverage'):
            dem.heights(90, 0)
        with pytest.raises(TerrainCoverageError, match='Nonfinite'):
            dem.heights(float('nan'), 0)


@pytest.mark.parametrize('old,new', [
    ('DE421', 'DE440'), ('0.5', '0.6'), ('1439.5', '1439.0'),
    ('UNIT                = METER', 'UNIT                = KILOMETER'),
])
def testRejectsUnreconciledLabels(flatImage, old, new):
    label = flatImage.with_suffix('.LBL')
    text = label.read_text()
    if old not in text:
        # Product label spacing is preserved while testing units independently.
        import re
        text = re.sub(r'(UNIT\s*=\s*)METER', r'\1KILOMETER', text)
    else:
        text = text.replace(old, new)
    label.write_text(text)
    with pytest.raises(TerrainCoverageError):
        GlobalLolaDem(flatImage)


def testInvalidPixelsAreUnavailable(flatImage):
    data = np.memmap(flatImage, mode='r+', dtype='<i2', shape=(2880, 5760))
    data[1400, 500] = -32768
    data.flush()
    del data
    with GlobalLolaDem(flatImage) as dem:
        with pytest.raises(TerrainCoverageError, match='NoData'):
            dem.heights(90 - 1400.5 / 16, 500.5 / 16)


def testIndependentFlatSphereAndHeightCacheIsolation(flatImage, tmp_path):
    site = LunarSite('flat', 'flat', 0, 0, 'MOON_ME_DE421', 'analytical fixture')
    config = HorizonConfig(azimuthStepDeg=5, nearStepM=20, localRadiusM=20000, observerHeightM=2)
    raised = cachedHorizon(site, flatImage, flatImage, tmp_path / 'cache', config)
    expected = -np.degrees(np.arccos(1737400 / 1737402))
    np.testing.assert_allclose(raised.elevationDeg, expected, atol=1e-4, rtol=0)
    ground = cachedHorizon(site, flatImage, flatImage, tmp_path / 'cache', replace(config, observerHeightM=0))
    assert ground.metadata['cacheKey'] != raised.metadata['cacheKey']
    assert np.all(ground.elevationDeg >= raised.elevationDeg)
    label = flatImage.with_suffix('.LBL')
    label.write_text(label.read_text() + '\n/* provenance fixture */\n')
    changed = cachedHorizon(site, flatImage, flatImage, tmp_path / 'cache', config)
    assert changed.metadata['cacheKey'] != raised.metadata['cacheKey']
    np.testing.assert_array_equal(changed.elevationDeg, raised.elevationDeg)


def testInternationalSourcesRemainDistinct():
    sites = {entry['canonicalId']: entry for entry in loadCatalog()['sites']}
    assert sites['CE6']['publishedElevationM'] == -5256
    assert sites['CE6']['coordinateUncertaintyM'] == 30
    assert sites['CE6']['uncertaintyComponent'] == 'horizontal'
    assert sites['CE4']['publishedElevationM'] == -5935
    assert sites['SLIM']['latitudeDeg'] != sites['SLIM_PGDA101']['latitudeDeg']
    assert resolveSite('LUNA25_TARGET') != resolveSite('LUNA25_IMPACT')
    for identifier in ['CE4', 'SLIM_PGDA101']:
        with pytest.raises(ValueError, match='unresolved'):
            resolveSite(identifier)
    for identifier in ['CE4_LROC2019', 'CE6', 'CY3', 'SLIM', 'LUNA25_TARGET', 'LUNA25_IMPACT', 'apollo11']:
        assert sites[identifier]['relay']['status'] == 'unsupported'
        assert sites[identifier]['groundElevationM'] is None


@requiresGlobalLola
@pytest.mark.parametrize('identifier', ['apollo11', 'CE4_LROC2019', 'CE6', 'CY3', 'SLIM', 'LUNA25_TARGET', 'LUNA25_IMPACT'])
def testRealExploratoryEvaluation(identifier, tmp_path):
    result = evaluateScientific(Engine(root / 'data/raw', tmp_path), dict(
        site=identifier, startUtc='2026-11-20T00:00:00Z', durationS=3600,
        cadenceS=600, observerHeightM=2, localResolutionM=1895.21,
    )).model_dump(mode='json')
    assert result['dataState'] == 'computed', result
    assert not result['provenance']['independentlyValidated']
    assert result['result']['observer']['siteId'] == identifier
    assert len(result['provenance']['dems']) == 2
    assert any('coarse' in text.lower() for text in result['provenance']['limitations'])
    if identifier in ['CE4_LROC2019', 'CE6']:
        assert result['result']['metrics']['directEarthAvailabilityFraction'] == 0
    if identifier == 'apollo11':
        assert result['result']['metrics']['directEarthAvailabilityFraction'] == 1


def testMissingGlobalTerrainAndUnsupportedResolution(tmp_path):
    result = evaluateScientific(Engine(tmp_path, tmp_path / 'cache'), dict(
        site='CE6', startUtc='2026-11-20T00:00:00Z', durationS=3600,
        localResolutionM=1895.21,
    )).model_dump(mode='json')
    assert result['dataState'] == 'unavailable'
    assert result['coverage']['missingData']
    assert 'LDEM_16.IMG' in result['error']['message']


@pytest.mark.parametrize('identifier', ['apollo11', 'shackleton-ridge', 'CE6'])
def testEnvironmentalAdmissionDoesNotExtendMastModules(identifier, tmp_path):
    from pydantic import ValidationError
    from skyline_mission_science.mastPower import evaluateMastPower
    from skyline_mission_science.mastPowerModels import MastPowerRequest
    from skyline_mission_science.mastPlacement import evaluateMastPlacement
    from skyline_mission_science.mastPlacementModels import MastPlacementRequest
    engine = Engine(tmp_path, tmp_path / 'cache')
    common = dict(site=identifier, startUtc='2026-11-20T00:00:00Z', durationS=3600,
                  mastHeightsM=[0, 2], verticalAzimuthDeg=0)
    power = evaluateMastPower(engine, common)
    placement = evaluateMastPlacement(engine, common | dict(searchRadiusM=0,
        gridResolutionM=80, maximumCableLengthM=0, evaluationBudget=dict(maxEvaluations=2)))
    assert power.dataState == placement.dataState == 'unsupported'
    assert power.result is placement.result is None
    with pytest.raises(ValidationError):
        MastPowerRequest.model_validate(common | dict(localResolutionM=1895.21))
