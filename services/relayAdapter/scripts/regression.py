import json,time
from pathlib import Path
import numpy as np
from skyline_relay_adapter.engine import RelayEngine
from skyline_relay_adapter.schemas import RelayRequest
root=Path.cwd()
engine=RelayEngine()
results=[]
for site in ['CR1','GR1','SR1']:
    start=time.perf_counter()
    result=engine.evaluate(RelayRequest(siteId=site,durationS=28*86400))
    assert result['dataState']=='computed',result
    assert result['result']['assisted']['fraction']==1
    assert result['result']['assisted']['maximumBlackoutS']==0
    np.testing.assert_array_equal(result['result']['assistedAvailable'],np.ones(20160,dtype=bool))
    path=root/'results'/f'{site}Regression.json'
    path.write_text(json.dumps(result))
    results.append(dict(site=site,wallS=time.perf_counter()-start,direct=result['result']['direct'],assisted=result['result']['assisted']))
    print(site,'regression passed',results[-1]['wallS'],flush=True)
(root/'results/regressionSummary.json').write_text(json.dumps(results,indent=2))
