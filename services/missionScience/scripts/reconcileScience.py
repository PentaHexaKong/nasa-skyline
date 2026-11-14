import json
from pathlib import Path
import numpy as np
import spiceypy as spice
from skyline_mission_science.spiceGeometry import loadSpice
from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest
from scipy.optimize import brentq

root=Path.cwd()
rows=[]
with loadSpice(root/'data/raw/spice'):
    start=spice.str2et('2025-01-01T00:00:00Z')
    site=spice.latrec(1739.342855,np.deg2rad(-137.411),np.deg2rad(-89.4679))
    for offset in np.arange(0,28*86400,86400):
        et=start+offset
        source=spice.pxform('MOON_ME_DE421','J2000',et)
        target=spice.pxform('MOON_ME_DE440_ME421','J2000',et)
        bridge=spice.pxform('MOON_ME_DE421','MOON_ME_DE440_ME421',et)
        residual=float(np.max(np.abs(source@site-target@bridge@site)))
        assert residual<1e-10
        vectors={profile:spice.spkcpo('SUN',et,'MOON_ME_DE421','OBSERVER',correction,site,'MOON','MOON_ME_DE421')[0][:3] for profile,correction in [('geometric','NONE'),('apparent','LT+S')]}
        angularDifference=float(np.rad2deg(spice.vsep(vectors['geometric'],vectors['apparent']))*3600)
        rows.append(dict(offsetS=int(offset),frameClosureKm=residual,profileDifferenceArcsec=angularDifference))
(root/'experiments/frameReconciliation.json').write_text(json.dumps(dict(frame='MOON_ME_DE421',comparisonFrame='MOON_ME_DE440_ME421',rows=rows,convention='planetocentric, signed east normalized',dsCatalogStatus='unavailable until realization-specific source coordinates are verified'),indent=2))
# Independent dense classification at a known real Earth horizon crossing.
from datetime import datetime,timedelta,timezone
engine=Engine(root/'data/raw',root/'data/cache')
query=EvaluationRequest(startUtc=datetime(2025,1,1,tzinfo=timezone.utc)+timedelta(seconds=487073-1800),durationS=3600,cadenceS=600)
coarse=engine.evaluate(query)
fine=engine.evaluate(query.model_copy(update={'cadenceS':30}))
assert coarse.dataState==fine.dataState=='computed'
a=coarse.result['bodies']['EARTH']['eventsS']
b=fine.result['bodies']['EARTH']['eventsS']
assert len(a)==len(b)>0
error=max(min(abs(x-y) for y in b) for x in a)
assert error<2
(root/'experiments/eventConvergence.json').write_text(json.dumps(dict(coarseEventsS=a,fineEventsS=b,maximumDifferenceS=error,coarseCadenceS=600,fineCadenceS=30,independence='Separate cadence searches using common SPICE physics. Analytical grazing tests use independent closed-form roots.'),indent=2))
print('Frame/profile reconciliation and real event convergence passed',flush=True)
