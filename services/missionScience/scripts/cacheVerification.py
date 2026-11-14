import json
import time
from pathlib import Path
import numpy as np
from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest

root=Path.cwd()
engine=Engine(root/'data/raw',root/'data/cache')
request=EvaluationRequest(startUtc='2025-01-15T00:00:00Z',durationS=3600,cadenceS=600)
a=engine.evaluate(request)
engine.memo.clear()
engine.ephemerisCache.values.clear()
b=engine.evaluate(request)
assert a.result==b.result
oldKey=b.provenance['cacheKey']
customSite=engine.sites['CR1'].model_copy(update={'siteId':'coordinateCacheProbe','longitudeDeg':-137.412})
customRequest=request.model_copy(update={'site':customSite})
c=engine.evaluate(customRequest)
assert c.provenance['cacheKey']!=oldKey
assert c.provenance['execution']=='live-computed'
d=engine.evaluate(customRequest.model_copy(update={'profile':'apparent'}))
assert d.provenance['cacheKey']!=c.provenance['cacheKey']
(root/'experiments/cacheParity.json').write_text(json.dumps(dict(uncachedIntermediateParity=True,resolvedSiteInvalidates=True,profileInvalidates=True),indent=2))
