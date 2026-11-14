import hashlib
import json
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = APP_ROOT / 'docs/scienceDeploymentSources.json'
# The service sources and the pinned trajectory that the Compose services are built from.
SOURCES = [
    'services/missionScience/src/skyline_mission_science',
    'services/missionScience/src/skyline_rover_science',
    'services/relayAdapter/src/skyline_relay_adapter',
    'services/relayAdapter/data/states/candidate2States.csv',
]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def sourceFiles():
    for source in SOURCES:
        path = APP_ROOT / source
        files = [path] if path.is_file() else sorted(p for p in path.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
        yield from files


def main():
    if '--write' in sys.argv:
        files = [{'path': p.relative_to(APP_ROOT).as_posix(), 'sha256': digest(p)} for p in sourceFiles()]
        MANIFEST.write_text(json.dumps({'schemaVersion': '1.0.0', 'files': files}, indent=2) + '\n')
        print(f'Wrote {len(files)} scientific source and trajectory hashes')
        return
    manifest = json.loads(MANIFEST.read_text())
    for entry in manifest['files']:
        if digest(APP_ROOT / entry['path']) != entry['sha256']:
            raise ValueError(f'Scientific source differs from the deployment snapshot: {entry["path"]}')
    print(f'Verified {len(manifest["files"])} scientific source and trajectory files')


if __name__ == '__main__':
    main()
