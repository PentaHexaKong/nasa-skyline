import json
from pathlib import Path

appRoot = Path(__file__).resolve().parents[3]
catalog = json.loads((appRoot/'services/missionScience/src/skyline_mission_science/siteCatalog.json').read_text())
legacy = {'CR1': 'connecting-ridge', 'GR1': 'de-gerlache-rim', 'SR1': 'shackleton-rim'}
entries = []
for site in catalog['sites']:
    identifier = site.get('frontendId') or legacy.get(site['canonicalId'])
    if not identifier:
        continue
    entries.append(dict(id=identifier, canonicalId=site['canonicalId'], name=site['displayName'], body='moon',
        observerHeightM=2, referenceStartUtc='2026-11-14', terrainResolutionM=site.get('terrainResolutionM',80),
        liveEvaluation=site['liveEvaluation'], latitudeDeg=site['latitudeDeg'], longitudeDegEast=site['longitudeDegEast'],
        frame=site['frame'], coordinateSource=site['coordinateSource'], publishedElevationM=site.get('publishedElevationM'),
        coordinateUncertaintyM=site.get('coordinateUncertaintyM'), uncertaintyComponent=site.get('uncertaintyComponent'), uncertaintyQualifier=site.get('uncertaintyQualifier'), publishedElevationDatum=site.get('publishedElevationDatum'),
        qualification=site.get('evaluationQualification','computed, independent validation status in response'),
        locationRole=site.get('locationRole','published ROI center' if site['canonicalId'] in legacy else 'catalogue observer'),
        agency=site.get('agency'), mission=site.get('mission'), notes=site.get('notes',[]), frameEvidence=site.get('frameEvidence'),
        relayStatus=site['relay']['status']))
output = appRoot/'frontend/data/catalogue/sites.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(entries,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
(appRoot/'examples/siteCatalog.json').write_text(json.dumps(catalog,indent=2,ensure_ascii=True)+'\n',encoding='utf-8')
