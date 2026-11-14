import json
import time
import tracemalloc
from pathlib import Path
from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest, Site, Constraints
from skyline_mission_science.optimization import SearchRequest,search

root=Path(__file__).resolve().parents[1]
engine=Engine(root/'data/raw',root/'data/fiveSiteBenchmarkCache')
# Explicitly chosen computational test coordinates, not claimed landing locations.
locations=['CR1','GR1','SR1',Site(siteId='coordinateProbeA',latitudeDeg=-89.5,longitudeDeg=100),Site(siteId='coordinateProbeB',latitudeDeg=-89.6,longitudeDeg=120)]
report=[]
for label in ['cold','warm']:
    tracemalloc.start()
    start=time.perf_counter()
    results=[engine.evaluate(EvaluationRequest(site=site,startUtc='2025-01-01T00:00:00Z',durationS=28*86400,cadenceS=600)) for site in locations]
    elapsed=time.perf_counter()-start
    _,peak=tracemalloc.get_traced_memory()
    tracemalloc.stop()
    report.append(dict(cache=label,wallS=elapsed,pythonPeakBytes=peak,throughputEvaluationsPerS=5/elapsed,
                       states=[item.dataState for item in results],errors=[item.error for item in results],
                       coordinateDefinitions=[site if isinstance(site,str) else site.model_dump() for site in locations],
                       execution=[item.provenance.get('execution') for item in results]))
    print(json.dumps(report[-1]),flush=True)
(root/'benchmarks/fiveSites.json').write_text(json.dumps(report,indent=2))
requirements=Constraints(minimumSolar=.5,minimumEarth=.25,maximumSolarOutageS=43200,maximumEarthOutageS=43200)
candidates=[EvaluationRequest(startUtc=value,durationS=86400,cadenceS=1200,constraints=requirements) for value in ['2025-01-01T00:00:00Z','2025-01-15T00:00:00Z']]
start=time.perf_counter()
study=search(engine,SearchRequest(candidates=candidates))
study['wallS']=time.perf_counter()-start
study['manifest']=dict(selectionDelaysDays=[0,7,14,30],heldOutDelaysDays=[],requirements=requirements.model_dump(),
                       candidates=[item.model_dump(mode='json') for item in candidates],hypothesis='No assumed superiority',
                       interpretation='Two computational test dates at CR1, one day each. In-scenario comparison only.')
(root/'experiments/constrainedSearch.json').write_text(json.dumps(study,indent=2))
print('Constrained study saved',flush=True)
