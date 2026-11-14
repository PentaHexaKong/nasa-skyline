import argparse
import json
from pathlib import Path

from pydantic import TypeAdapter
from skyline_rover_science.roverModels import RoverRequest, RoverResponse
from exportScientificSchemas import typeScriptType, withoutDefaults


def main():
    parser = argparse.ArgumentParser(
        description='Export the proposed rover API contract for team review'
    )
    parser.add_argument(
        '--app-root', dest='appRoot', type=Path, default=Path(__file__).resolve().parents[3]
    )
    args = parser.parse_args()
    definitions = {}
    declarations = []
    output = args.appRoot / 'contracts/proposals'
    output.mkdir(parents=True, exist_ok=True)
    local = Path(__file__).resolve().parents[1] / 'docs/roverSchemas'
    local.mkdir(parents=True, exist_ok=True)
    for name, adapter, mode in [
        ('RoverRequest', TypeAdapter(RoverRequest), 'validation'),
        ('RoverResponse', TypeAdapter(RoverResponse), 'serialization'),
    ]:
        schema = adapter.json_schema(mode=mode)
        if mode == 'serialization':
            schema = withoutDefaults(schema)
        schema['$schema'] = 'https://json-schema.org/draft/2020-12/schema'
        filename = name[0].lower() + name[1:] + '.schema.json'
        for destination in [output / filename, local / filename]:
            destination.write_text(
                json.dumps(schema, indent=2) + '\n', encoding='utf-8'
            )
        definitions.update(schema.get('$defs', {}))
        declarations.append('export type ' + name + ' = ' + typeScriptType(schema))
    for name, schema in definitions.items():
        if name not in {'RoverRequest', 'RoverResponse'}:
            declarations.append('export type ' + name + ' = ' + typeScriptType(schema))
    (args.appRoot / 'frontend/src/lib/roverContract.proposed.ts').write_text(
        '// Proposed for team review. Generated from the isolated rover prototype.\n\n'
        + '\n\n'.join(declarations)
        + '\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
