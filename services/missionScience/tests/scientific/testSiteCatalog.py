import copy
import numpy as np
import pytest
from pathlib import Path
from skyline_mission_science.siteCatalog import (
    loadCatalog,
    resolveSite,
    equivalentObservers,
)
from skyline_mission_science.terrainHorizon import LunarDem, TerrainCoverageError


def testCatalogRetainsEveryDistinctLocation():
    sites = {site['canonicalId']: site for site in loadCatalog()['sites']}
    assert len(sites) == 19
    assert loadCatalog()['aliases'] == {}
    assert sites['apollo11']['latitudeDeg'] == 0.67416
    assert sites['apollo11']['relay']['status'] == 'unsupported'
    assert sites['shackleton-ridge']['scientificCanonicalId'] == 'shackleton-ridge'
    assert resolveSite('shackleton-ridge') != resolveSite('CR1')
    for identifier, latitude, longitude in [
        ('CR1', -89.4679, -137.411),
        ('GR1', -88.6952, -68.2846),
        ('SR1', -89.7755, -156.448),
    ]:
        site = resolveSite(identifier)
        assert site.latitudeDeg == latitude
        assert site.longitudeDeg == pytest.approx(longitude, abs=1e-12)


def testAliasObserverAndFrameBoundaries():
    original = copy.deepcopy(loadCatalog()['sites'][0])
    assert equivalentObservers(original, original)
    wrapped = copy.deepcopy(original)
    wrapped['longitudeDegEast'] -= 360
    assert equivalentObservers(original, wrapped)
    for field, value in [
        ('frame', 'MOON_ME_DE440_ME421'),
        ('datum', 'different radial reference'),
        ('latitudeDeg', original['latitudeDeg'] + 1e-8),
        ('demIdentity', ['changed']),
    ]:
        changed = copy.deepcopy(original)
        changed[field] = value
        assert not equivalentObservers(original, changed)
    changed = copy.deepcopy(original)
    changed['observerPositionM'][0] += 1e-5
    assert not equivalentObservers(original, changed)
    changed = copy.deepcopy(original)
    changed['observerPositionM'][0] += 0.5e-6
    assert equivalentObservers(original, changed)
    changed = copy.deepcopy(original)
    changed.pop('observerPositionM')
    assert not equivalentObservers(original, changed)


@pytest.mark.parametrize(
    'latitude,longitude,expected',
    [
        (-89.4679, -137.411, (-10920, -11880)),
        (-88.6952, -68.2846, (-36760, 14640)),
        (-89.7755, -156.448, (-2720, -6240)),
    ],
)
def testPublishedProjectionFixtures(latitude, longitude, expected):
    root = Path(__file__).resolve().parents[2]
    with LunarDem(root / 'data/raw/lola/LDEM_80S_80MPP_ADJ.TIF') as dem:
        np.testing.assert_allclose(
            dem.xy(latitude, longitude), expected, atol=5, rtol=0
        )
        rho = 2 * 1737400 * np.tan(np.pi / 4 + np.deg2rad(latitude) / 2)
        np.testing.assert_allclose(
            dem.xy(latitude, longitude),
            (rho * np.sin(np.deg2rad(longitude)), rho * np.cos(np.deg2rad(longitude))),
            atol=1e-6,
            rtol=0,
        )
        with pytest.raises(TerrainCoverageError):
            dem.heights(0.67416, 23.47314)


def testVersionedEndpointPreservesOldList():
    from fastapi.testclient import TestClient
    from skyline_mission_science.api import app

    client = TestClient(app)
    assert isinstance(client.get('/v1/sites').json(), list)
    result = client.get('/v1/site-catalog').json()
    assert result['schemaVersion'] == 'site-catalog/1.0.0'
    assert len(result['sites']) == 19


def testNumericalToleranceEdges():
    original = copy.deepcopy(loadCatalog()['sites'][0])
    original['latitudeDeg'] = 0.0
    original['observerPositionM'] = [0.0, 0.0, 0.0]
    limits = loadCatalog()['tolerances']
    changed = copy.deepcopy(original)
    changed['latitudeDeg'] = limits['coordinateDeg']
    assert equivalentObservers(original, changed)
    changed['latitudeDeg'] = np.nextafter(limits['coordinateDeg'], np.inf)
    assert not equivalentObservers(original, changed)
    changed = copy.deepcopy(original)
    changed['observerPositionM'][0] = limits['observerPositionM']
    assert equivalentObservers(original, changed)
    changed['observerPositionM'][0] = np.nextafter(limits['observerPositionM'], np.inf)
    assert not equivalentObservers(original, changed)
    changed = copy.deepcopy(original)
    changed['observerHeightM'] = np.nextafter(limits['observerPositionM'], np.inf)
    assert not equivalentObservers(original, changed)
    changed = copy.deepcopy(original)
    changed['latitudeDeg'] = float('nan')
    assert not equivalentObservers(original, changed)


def testUnsupportedIdsAndMissingDemAtEntryPoint(tmp_path):
    from skyline_mission_science.engine import Engine

    engine = Engine(tmp_path, tmp_path / 'cache')
    for identifier in ['CE4', 'SLIM_PGDA101', 'missing-site']:
        result = engine.evaluate(dict(site=identifier, startUtc='2025-01-01T00:00:00Z'))
        assert result.dataState == 'unavailable'
        assert identifier in result.error['message']
    result = engine.evaluate(dict(site='CR1', startUtc='2025-01-01T00:00:00Z'))
    assert result.dataState == 'unavailable'
    assert 'LDEM_80S_80MPP_ADJ.TIF' in result.error['message']


def testDemPixelCenterRegistration():
    from rasterio.windows import Window

    root = Path(__file__).resolve().parents[2]
    with LunarDem(root / 'data/raw/lola/LDEM_80S_80MPP_ADJ.TIF') as dem:
        np.testing.assert_allclose(
            tuple(dem.dataset.transform)[:6], (80, 0, -304000, 0, -80, 304000), atol=0
        )
        # Independent analytic inverse at the average of four interior pixel centers.
        row, column = 3800, 3700
        x = -304000 + 80 * (column + 1)
        y = 304000 - 80 * (row + 1)
        latitude = np.rad2deg(2 * np.arctan(np.hypot(x, y) / (2 * 1737400)) - np.pi / 2)
        longitude = np.rad2deg(np.arctan2(x, y))
        cells = dem.dataset.read(1, window=Window(column, row, 2, 2), masked=True)
        assert not np.any(np.ma.getmaskarray(cells))
        expected = float(cells.mean()) * dem.dataset.scales[0] + dem.dataset.offsets[0]
        assert float(dem.heights(latitude, longitude)) == pytest.approx(
            expected, abs=1e-6
        )


def testCatalogContractAndCanonicalResolution():
    from skyline_mission_science.siteCatalog import CatalogResponse
    from skyline_mission_science.engine import Engine

    catalog = loadCatalog()
    CatalogResponse.model_validate(catalog)
    assert len({entry['canonicalId'] for entry in catalog['sites']}) == 19
    engine = Engine()
    assert all(
        resolveSite(identifier) == site for identifier, site in engine.sites.items()
    )


def testExplicitAliasResolution(monkeypatch):
    from skyline_mission_science import siteCatalog

    catalog = loadCatalog()
    # Synthetic alias fixture represents an already verified identical observer.
    catalog['aliases'] = {'verifiedFixtureAlias': 'CR1'}
    monkeypatch.setattr(siteCatalog, 'loadCatalog', lambda: catalog)
    assert siteCatalog.resolveSite('verifiedFixtureAlias') == siteCatalog.resolveSite(
        'CR1'
    )
    with pytest.raises(ValueError, match='Unknown'):
        siteCatalog.resolveSite('Connecting Ridge')


def testFrozenScopesRetainDistinctObservers():
    registry = loadCatalog()['externalRegistries'][0]
    assert len(registry['scopes']) == 3
    assert registry['coordinateFrames']['surface'] == 'MOON_ME_DE421'
    scope = registry['scopes'][0]
    assert scope['mastLocation']['latitudeDeg'] == -89.462
    assert scope['mastLocation']['longitudeDeg'] == -137.1
    assert scope['mastLocation']['latitudeDeg'] != resolveSite('CR1').latitudeDeg
    assert registry['roverAntennaHeightM'] == 1.8
    with pytest.raises(ValueError, match='Unknown'):
        resolveSite(scope['scenarioId'])
