from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
if 'SKYLINE_SCIENCE_ROOT' not in os.environ:
    sys.exit('Set SKYLINE_SCIENCE_ROOT to the INT-4 engine checkout')
engineRoot=Path(os.environ['SKYLINE_SCIENCE_ROOT'])
app=Path(__file__).resolve().parents[3]
entries=[]
paths=[engineRoot/'src/geometry'/name for name in ['spiceGeometry.py','lunarSites.py','terrainHorizon.py','visibility.py']]
paths += [engineRoot/relative for relative in ['src/communication/coverageMetrics.py','src/validation/verifyCoverage.py','src/optimization/problemDefinition.py','src/science/engine.py']]
paths += [app/'ds/pipeline'/name for name in ['sun.py','moon.py','visibility.py','run.py','sites.py']]
paths += [app/'contracts'/name for name in ['scientificengine-request.schema.json','scientificengine-result.schema.json']]
for path in paths:
    shown=path.relative_to(app).as_posix() if path.is_relative_to(app) else 'int4/'+path.relative_to(engineRoot).as_posix()
    entries.append(dict(path=shown,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        revision=subprocess.check_output(['git','-C',str(path.parent),'rev-parse','HEAD'],text=True).strip(),
                        reuse='adapted' if path.name in ['spiceGeometry.py','lunarSites.py','terrainHorizon.py'] else 'reference only'))
(root/'configs/sourceManifest.json').write_text(json.dumps(entries,indent=2))

