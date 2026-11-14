import hashlib
import json
import time
from pathlib import Path
from datetime import datetime,timedelta,timezone
from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest,Constraints
from skyline_mission_science.optimization import SearchRequest,search

root=Path.cwd()
planPath=root/'experiments/broadPlan.json'
planBytes=planPath.read_bytes()
plan=json.loads(planBytes)
engine=Engine(root/'data/raw',root/'data/cache')
measurements=[]
start=time.perf_counter()
for index in range(plan['benchmark']['count']):
    query=EvaluationRequest(site=plan['sites'][index%3],startUtc=datetime(2025,1,1,tzinfo=timezone.utc)+timedelta(hours=4*index),durationS=14400,cadenceS=3600)
    before=time.perf_counter()
    result=engine.evaluate(query)
    measurements.append(dict(index=index,wallS=time.perf_counter()-before,state=result.dataState,error=result.error))
    if (index+1)%10==0:
        print('Scalability',index+1,'elapsed',round(time.perf_counter()-start,2),flush=True)
    if result.dataState!='computed':
        raise RuntimeError(result.error)
benchmark=dict(planHash=hashlib.sha256(planBytes).hexdigest(),wallS=time.perf_counter()-start,evaluations=measurements,
               ephemerisHits=engine.ephemerisCache.hits,ephemerisMisses=engine.ephemerisCache.misses,
               horizonHits=engine.horizonCache.hits,horizonMisses=engine.horizonCache.misses)
(root/'benchmarks/hundredScenarios.json').write_text(json.dumps(benchmark,indent=2))
candidates=[EvaluationRequest(site=site,startUtc=date+'T00:00:00Z',durationS=plan['durationS'],cadenceS=plan['selectionCadenceS'],constraints=Constraints(**plan['constraints'])) for site in plan['sites'] for date in plan['selectionDates']]
print('Selection begins',flush=True)
selected=search(engine,SearchRequest(candidates=candidates,delaysDays=plan['selectionDelays']))
(root/'experiments/broadSelection.json').write_text(json.dumps(selected,indent=2))
strategies=dict(illumination=selected['baselineA'],nominal=next(iter(selected['baselineB']),None),robust=next(iter(selected['robustPareto']),None))
heldout={}
for strategy,index in strategies.items():
    results=[]
    if index is not None:
        for delay in plan['heldOutDelays']:
            query=candidates[index].model_copy(update={'startUtc':candidates[index].startUtc+timedelta(days=delay),'cadenceS':plan['evaluationCadenceS']})
            response=engine.evaluate(query)
            results.append(dict(delay=delay,response=response.model_dump(mode='json')))
    heldout[strategy]=dict(selectedIndex=index,results=results)
    print('Held-out strategy',strategy,'completed',flush=True)
assert planBytes==planPath.read_bytes()
(root/'experiments/broadHeldOut.json').write_text(json.dumps(dict(planHash=hashlib.sha256(planBytes).hexdigest(),strategies=heldout),indent=2))
print('Broad study completed',flush=True)
