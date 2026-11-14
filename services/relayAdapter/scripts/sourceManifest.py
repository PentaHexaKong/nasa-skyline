from pathlib import Path
import hashlib,json,os,sys
root=Path.cwd()
if 'SKYLINE_UPSTREAM_ROOT' not in os.environ:
    sys.exit('Set SKYLINE_UPSTREAM_ROOT to the upstream Nasa science checkout')
source=Path(os.environ['SKYLINE_UPSTREAM_ROOT'])
entries=[]
for name in ['spiceGeometry.py','lunarSites.py','terrainHorizon.py','visibility.py','__init__.py']:
    path=source/'src/geometry'/name
    entries.append(dict(path='Nasa/'+path.relative_to(source).as_posix(),revision='827d9af913c95f8701c8fe4fb2480c6078019279',sha256=hashlib.sha256(path.read_bytes()).hexdigest(),reuse='provenance-tracked copy',license='Existing source headers retained; no repository license header present in these modules'))
path=source/'data/processed/optimization/audit/candidate2States.csv'
entries.append(dict(path='Nasa/'+path.relative_to(source).as_posix(),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),reuse='immutable saved trajectory input'))
(root/'docs/sourceManifest.json').write_text(json.dumps(entries,indent=2))
