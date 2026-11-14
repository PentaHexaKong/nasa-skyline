import ast, hashlib, json
from pathlib import Path
import numpy as np
from skyline_mission_science.lunarSites import southPoleSites
from skyline_mission_science.terrainHorizon import LunarDem, HorizonConfig
from skyline_mission_science.spiceGeometry import loadSpice
import os

import spiceypy as spice

root = Path.cwd()
app = Path(__file__).resolve().parents[3]


def portablePath(path):
    """Repo-relative path, or `int4/<relative>` for the pinned INT-4 engine checkout."""
    path = Path(path).resolve()
    if path.is_relative_to(app):
        return path.relative_to(app).as_posix()
    return 'int4/' + path.relative_to(frozenRoot.resolve()).as_posix()


registryPath = app / 'ds/pipeline/sites.py'
source = ast.parse(registryPath.read_text())
ds = {}
for node in ast.walk(source):
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == 'Site'
    ):
        args = [ast.literal_eval(value) for value in node.args]
        ds[args[0]] = dict(
            zip(
                [
                    'id',
                    'name',
                    'latitudeDeg',
                    'longitudeDeg',
                    'observerHeightM',
                    'source',
                    'reference',
                    'body',
                ],
                args,
            )
        )


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


assets = root / 'data/raw'
dems = []
for name in ['LDEM_80S_80MPP_ADJ.TIF', 'LDEM_60S_240MPP_ADJ.TIF']:
    path = assets / 'lola' / name
    with LunarDem(path) as dem:
        metadata = dem.metadata()
        dems.append(
            dict(
                filename=name,
                sha256=sha(path),
                resolutionM=metadata['resolutionM'],
                boundsM=metadata['boundsM'],
                frame='MOON_ME_DE421',
                datum='radial meters above 1737400 m sphere',
            )
        )
with loadSpice(assets / 'spice') as kernels:
    kernelEvidence = [dict(filename=path.name, sha256=sha(path)) for path in kernels]
    starts = []
    ends = []
    for name in ['moon_pa_de421_1900-2050.bpc', 'moon_pa_de440_200625.bpc']:
        from spiceypy.utils.support_types import SPICEINT_CELL

        ids = SPICEINT_CELL(100)
        spice.pckfrm(str(assets / 'spice' / name), ids)
        for identifier in ids:
            window = spice.pckcov(str(assets / 'spice' / name), int(identifier))
            assert spice.wncard(window) == 1, (
                'Catalog generation requires continuous kernel coverage'
            )
            first, last = spice.wnfetd(window, 0)
            starts.append(first)
            ends.append(last)
    window = spice.spkcov(str(assets / 'spice/de440s.bsp'), 399)
    first, last = spice.wnfetd(window, 0)
    starts.append(first)
    ends.append(last)
    epochs = dict(
        startEt=max(starts),
        endEt=min(ends),
        startUtc=spice.et2utc(max(starts), 'ISOC', 3) + 'Z',
        endUtc=spice.et2utc(min(ends), 'ISOC', 3) + 'Z',
        rule='Entire requested time interval must lie within kernel intersection',
    )
entries = []
for site in southPoleSites:
    with LunarDem(assets / 'lola/LDEM_80S_80MPP_ADJ.TIF') as dem:
        elevation = float(dem.heights(site.latitudeDeg, site.longitudeDeg))
    entries.append(
        dict(
            canonicalId=site.siteId,
            displayName=site.name,
            body='moon',
            latitudeDeg=site.latitudeDeg,
            longitudeDegEast=site.longitudeDeg % 360,
            frame=site.sourceFrame,
            coordinateStatus='verified published ROI center',
            coordinateSource=site.sourceUrl,
            coordinateUncertaintyM=None,
            observerHeightM=0.0,
            groundElevationM=elevation,
            datum='radial meters above 1737400 m sphere',
            dems=dems,
            epochs=epochs,
            missionLimits=dict(
                maxDurationS=31536000,
                maxIntervals=6000,
                cadenceS=[30, 3600],
                effectiveMaxDurationS=21600000,
            ),
            profiles=['geometric', 'apparent'],
            supportedObserverHeightsM=[0],
            liveEvaluation='supported subject to asset and time checks',
            relay=dict(
                status='supported',
                candidateId='nominal-candidate-2',
                startUtc='2025-01-01T00:00:00Z',
                endUtcExclusive='2025-01-29T00:00:00Z',
                cadenceS=120,
                maxIntegratedDurationS=86400,
            ),
            aliases=[],
        )
    )
for path in sorted((app / 'frontend/data').glob('*.json')):
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    site = data['site']
    prov = data['provenance']
    identifier = site['id']
    original = ds[identifier]
    assert (
        site['lat_deg'] == original['latitudeDeg']
        and site['lon_deg_east'] == original['longitudeDeg']
        and site['observer_height_m'] == original['observerHeightM']
    )
    body = site.get('body', 'earth')
    entries.append(
        dict(
            canonicalId=identifier,
            displayName=site['name'],
            body=body,
            latitudeDeg=site['lat_deg'],
            longitudeDegEast=site['lon_deg_east'] % 360,
            frame=site.get('frame', 'ITRF93 / WGS84 as declared by DS pipeline'),
            coordinateStatus='reported by existing application, source realization unresolved'
            if body == 'moon'
            else 'Earth rehearsal',
            coordinateSource=site['source'],
            coordinateUncertaintyM=None,
            reportedCoordinateUncertaintyM=0.3 if identifier == 'apollo11' else None,
            reportedUncertaintyStatus='DS source claim, independently unverified'
            if identifier == 'apollo11'
            else 'unspecified',
            observerHeightM=site['observer_height_m'],
            groundElevationM=site.get('ground_height_m'),
            datum='DS-reported radial height above 1737400 m sphere'
            if body == 'moon'
            else 'DS-reported Copernicus terrain; vertical realization unresolved',
            dems=prov.get('dem', []),
            epochs=None,
            missionLimits=None,
            profiles=[],
            supportedObserverHeightsM=[],
            liveEvaluation='unverified coordinate realization'
            if body == 'moon'
            else 'unsupported by lunar engine',
            relay=dict(
                status='unsupported',
                reason='No verified coordinate-equivalent replay site',
            ),
            aliases=[],
            scientificCanonicalId=None,
            sourceArtifact=dict(path=portablePath(path), sha256=sha(path)),
            dsDefinition=original,
            dsRegistrySha256=sha(registryPath),
        )
    )
for entry in entries:
    entry['latitudeConvention'] = (
        'planetocentric' if entry['body'] == 'moon' else 'geodetic WGS84, reported'
    )
    entry['demRegistrationStatus'] = (
        'verified publisher DE421 CRS and pixel-center interpolation'
        if entry['canonicalId'] in {'CR1', 'GR1', 'SR1'}
        else 'unverified for live mission-science evaluation'
    )
    if entry['body'] == 'moon' and entry['groundElevationM'] is not None:
        latitude, longitude = np.deg2rad(
            [entry['latitudeDeg'], entry['longitudeDegEast']]
        )
        radius = 1737400 + entry['groundElevationM'] + entry['observerHeightM']
        position = (
            radius
            * np.array(
                [
                    np.cos(latitude) * np.cos(longitude),
                    np.cos(latitude) * np.sin(longitude),
                    np.sin(latitude),
                ]
            )
        ).tolist()
        key = (
            'observerPositionM'
            if entry['canonicalId'] in {'CR1', 'GR1', 'SR1'}
            else 'reportedObserverPositionM'
        )
        entry[key] = position
    if entry['canonicalId'] in {'CR1', 'GR1', 'SR1'}:
        entry['demIdentity'] = [dem['sha256'] for dem in dems]
        entry['observerHeightSupport'] = dict(
            mode='continuous geometry within radial envelope',
            minimumM=0,
            maximumM=HorizonConfig().globalMaxHeightM - entry['groundElevationM'],
            datum='metres above local interpolated terrain',
            engineeringCertification=False,
        )
        entry['terrainProfile'] = dict(
            localResolutionM=80,
            localRadiusM=50000,
            extendedResolutionM=240,
            extendedRadiusM=400000,
            optionalLocalResolutionM=20,
            optionalLocalStatus='requires separately provisioned and validated raster',
        )
        entry['relay'].update(
            profile='geometric',
            observerHeightM=0,
            elevationMaskDeg=0,
            maximumStandaloneDurationS=2419200,
        )
catalog = dict(
    schemaVersion='site-catalog/1.0.0',
    longitudeConvention='planetocentric latitude, east longitude in [0,360) for lunar entries',
    aliases={},
    sites=entries,
    sourceEvidence=dict(
        deRosa='https://arxiv.org/pdf/1208.5587#page=55',
        demFrame='https://pgda.gsfc.nasa.gov/products/90',
        originalScienceRevision='827d9af913c95f8701c8fe4fb2480c6078019279',
        kernels=kernelEvidence,
    ),
    tolerances=dict(
        coordinateDeg=1e-9,
        observerPositionM=1e-6,
        meaning='Numerical identity limits, not physical location uncertainty',
    ),
)
if 'SKYLINE_SCIENCE_ROOT' not in os.environ:
    raise SystemExit('Set SKYLINE_SCIENCE_ROOT to the INT-4 engine checkout')
frozenRoot = Path(os.environ['SKYLINE_SCIENCE_ROOT'])
tradeoffPath = frozenRoot / 'configs/mission/missionTradeoffs-v1.json'
baselinePath = frozenRoot / 'configs/mission/cr1MissionScenario-v1.json'
profilePath = frozenRoot / 'configs/science/scientificEngine-v1.json'
tradeoffs = json.loads(tradeoffPath.read_text(encoding='utf-8'))
baseline = json.loads(baselinePath.read_text(encoding='utf-8'))
profile = json.loads(profilePath.read_text(encoding='utf-8'))
for path in [tradeoffPath, baselinePath]:
    sourceKey = path.relative_to(frozenRoot).as_posix()
    normalizedSource = path.read_bytes().replace(b'\r\n', b'\n')
    assert (
        hashlib.sha256(normalizedSource).hexdigest()
        == profile['physicalSourceSha256Lf'][sourceKey]
    ), 'Frozen scientific source identity mismatch'

catalog['externalRegistries'] = [
    dict(
        registryId='frozen-int4-mission-scopes',
        engineVersion=profile['engineVersion'],
        baselineCommit=profile['baselineCommit'],
        sourceArtifacts=[
            dict(path=portablePath(path), sha256=sha(path))
            for path in [tradeoffPath, baselinePath, profilePath]
        ],
        coordinateFrames=baseline['coordinateFrames'],
        longitudeConvention='signed east longitude as stored in frozen configuration',
        observerDatum='radial metres above 1737400 m sphere, source declaration',
        coordinateUncertaintyM=None,
        scopes=tradeoffs['scenarios'],
        mastHeightsM=tradeoffs['mastHeightsM'],
        roverAntennaHeightM=baseline['rover']['antennaHeightM'],
        baselineMastAntennaHeightM=baseline['mast']['antennaHeightM'],
        profiles=profile['profiles'],
        aliasStatus='No scenario or traverse observer is admitted as a point-site alias',
        relayCompatibility='Frozen INT-4 mission profile only; independent nominal Candidate 2 point-site mapping unverified',
    )
]
(root / 'src/skyline_mission_science/siteCatalog.json').write_text(
    json.dumps(catalog, indent=2), encoding='utf-8'
)
print(
    'Catalog contains',
    len(entries),
    'distinct locations. No frontend-to-ROI aliases verified.',
)
