import json
import platform
import time
import tracemalloc
from pathlib import Path
from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest
from skyline_mission_science.optimization import SearchRequest,search

root=Path(__file__).resolve().parents[1]
engine=Engine(root/'data/raw',root/'data/benchmarkCache')
report=dict(environment=dict(platform=platform.platform(),python=platform.python_version(),cpu=platform.processor()),workloads=[])
request=EvaluationRequest(startUtc='2025-01-01T00:00:00Z',durationS=28*86400,cadenceS=600)
for label in ['cold','warm']:
    tracemalloc.start()
    start=time.perf_counter()
    result=engine.evaluate(request)
    elapsed=time.perf_counter()-start
    _,peak=tracemalloc.get_traced_memory()
    tracemalloc.stop()
    report['workloads'].append(dict(workload='one site 28 days',cache=label,wallS=elapsed,
                                    pythonPeakBytes=peak,throughputEvaluationsPerS=1/elapsed,
                                    execution=result.provenance.get('execution'),state=result.dataState,error=result.error))
    if result.dataState!='computed':
        raise RuntimeError(result.error)
    (root/'experiments/exampleResponse.json').write_text(result.model_dump_json(indent=2))
(root/'configs/exampleRequest.json').write_text(request.model_dump_json(indent=2))
report['workloads'] += [dict(workload='five catalog sites 28 days',state='unsupported',reason='Only three source-frame-verified catalog sites enabled'),
                        dict(workload='ten sites 365 days',state='unsupported',reason='At most 6000 intervals and only three curated sites'),
                        dict(workload='1000 configurations',state='unsupported',reason='Bounded API supports at most 128 scenario evaluations per search')]
(root/'benchmarks/results.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2),flush=True)
# Bounded deterministic experiment on identical candidates and delay scenarios.
candidates=[EvaluationRequest(startUtc=value,durationS=86400,cadenceS=1200) for value in ['2025-01-01T00:00:00Z','2025-01-15T00:00:00Z']]
start=time.perf_counter()
study=search(engine,SearchRequest(candidates=candidates))
study['wallS']=time.perf_counter()-start
study['manifest']=dict(selectionDelaysDays=[0,7,14,30],heldOutDelaysDays=[],randomness='none',
                       constraints=candidates[0].constraints.model_dump(),interpretation='In-scenario bounded demonstration. Generalization untested.')
(root/'experiments/searchResults.json').write_text(json.dumps(study,indent=2))
sensitivity=[]
for options in [dict(cadenceS=600),dict(cadenceS=1200),dict(cadenceS=1800),dict(profile='apparent'),dict(horizonOffsetDeg=-.1),dict(horizonOffsetDeg=.1),dict(localResolutionM=20)]:
    query=candidates[0].model_copy(update=options)
    result=engine.evaluate(query)
    sensitivity.append(dict(parameters=query.model_dump(mode='json'),response=result.model_dump(mode='json')))
(root/'experiments/sensitivity.json').write_text(json.dumps(sensitivity,indent=2))
print('Bounded optimization and sensitivity results saved',flush=True)

