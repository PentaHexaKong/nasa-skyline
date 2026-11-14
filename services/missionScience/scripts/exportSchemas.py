import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
from skyline_mission_science.api import app
(root/'docs/openapi.json').write_text(json.dumps(app.openapi(),indent=2))
from skyline_mission_science.schemas import EvaluationRequest,EvaluationResponse
for model in [EvaluationRequest,EvaluationResponse]:
    (root/'docs'/f'{model.__name__}.schema.json').write_text(json.dumps(model.model_json_schema(),indent=2))
