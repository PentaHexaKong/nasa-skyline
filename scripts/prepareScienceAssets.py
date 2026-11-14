import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile


def fileHash(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def assetPath(root, relative):
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Asset path must stay within the selected root')
    return target


def prepareAssets(sourceRoot, destinationRoot, manifest):
    for asset in manifest['files']:
        destination = assetPath(destinationRoot, asset['path'])
        if destination.is_file():
            if (
                destination.stat().st_size != asset['sizeBytes']
                or fileHash(destination) != asset['sha256']
            ):
                raise ValueError(
                    f'Existing asset differs from the pinned scientific identity: {destination}'
                )
            continue
        if sourceRoot is None:
            raise FileNotFoundError(
                f'Missing {destination}. Supply --source-root with the verified spice and lola folders.'
            )
        source = assetPath(sourceRoot, asset['path'])
        if source.stat().st_size != asset['sizeBytes']:
            raise ValueError(f'Source asset size mismatch: {source}')
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=destination.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
        try:
            shutil.copyfile(source, temporary)
            if fileHash(temporary) != asset['sha256']:
                raise ValueError(f'Source asset content mismatch: {source}')
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
    return len(manifest['files'])


def main():
    appRoot = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description='Provision or verify hash-pinned science deployment assets'
    )
    parser.add_argument('--source-root', dest='sourceRoot', type=Path)
    parser.add_argument(
        '--destination-root',
        dest='destinationRoot',
        type=Path,
        default=appRoot / 'services/missionScience/data/raw',
    )
    args = parser.parse_args()
    manifest = json.loads(
        (appRoot / 'services/scienceAssets.manifest.json').read_text()
    )
    count = prepareAssets(args.sourceRoot, args.destinationRoot, manifest)
    print(
        f'Verified {count} pinned scientific assets at {args.destinationRoot.resolve()}'
    )


if __name__ == '__main__':
    main()
