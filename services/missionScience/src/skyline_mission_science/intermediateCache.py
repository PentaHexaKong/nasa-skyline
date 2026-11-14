import hashlib
import json
import platform
from collections import OrderedDict
from importlib.metadata import version
from pathlib import Path

class ScientificCache:
    def __init__(self, limit=20000):
        self.values=OrderedDict()
        self.limit=limit
        self.hits=0
        self.misses=0
    def get(self,key,compute):
        if key in self.values:
            self.hits+=1
            self.values.move_to_end(key)
            return self.values[key]
        self.misses+=1
        result=compute()
        self.values[key]=result
        if len(self.values)>self.limit:
            self.values.popitem(last=False)
        return result

def implementationIdentity():
    root=Path(__file__).parent
    return dict(sources={path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(root.glob('*.py'))},
                dependencies={name:version(name) for name in ['numpy','scipy','spiceypy','rasterio','pyproj','pydantic']},
                python=platform.python_version())

def identityKey(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
