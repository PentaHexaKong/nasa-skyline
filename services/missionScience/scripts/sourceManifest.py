from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
if 'SKYLINE_UPSTREAM_ROOT' not in os.environ:
    sys.exit('Set SKYLINE_UPSTREAM_ROOT to the upstream Nasa science checkout')
old=Path(os.environ['SKYLINE_UPSTREAM_ROOT'])
app=Path(__file__).resolve().parents[3]
entries=[]
paths=[old/'src/geometry'/name for name in ['spiceGeometry.py','lunarSites.py','terrainHorizon.py','visibility.py']]
paths += [old/relative for relative in ['src/communication/coverageMetrics.py','src/validation/verifyCoverage.py','src/optimization/problemDefinition.py','scenariosandstuffs/Nasa-int4/src/science/engine.py']]
paths += [app/'ds/pipeline'/name for name in ['sun.py','moon.py','visibility.py','run.py','sites.py']]
paths += [app/'contracts'/name for name in ['scientificengine-request.schema.json','scientificengine-result.schema.json']]
for path in paths:
    shown=path.relative_to(app).as_posix() if path.is_relative_to(app) else 'Nasa/'+path.relative_to(old).as_posix()
    entries.append(dict(path=shown,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        revision=subprocess.check_output(['git','-C',str(path.parent),'rev-parse','HEAD'],text=True).strip(),
                        reuse='adapted' if path.name in ['spiceGeometry.py','lunarSites.py','terrainHorizon.py'] else 'reference only'))
(root/'configs/sourceManifest.json').write_text(json.dumps(entries,indent=2))

