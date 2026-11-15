import json
from pathlib import Path
from skyline_mission_science.referenceEvaluations import ReferenceRequest, ReferenceWindow

appRoot = Path(__file__).resolve().parents[3]
for model, name in [(ReferenceRequest, 'referenceRequest'), (ReferenceWindow, 'referenceWindow')]:
    schema = json.dumps(model.model_json_schema(), indent=2) + '\n'
    for directory in [appRoot / 'contracts', appRoot / 'frontend/src/lib']:
        (directory / f'{name}.schema.json').write_text(schema, encoding='utf-8')
