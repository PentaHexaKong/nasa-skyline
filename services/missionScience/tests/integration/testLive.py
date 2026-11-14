from pathlib import Path
from skyline_mission_science.engine import Engine
from skyline_mission_science.schemas import EvaluationRequest,EvaluationResponse

def testLiveSchemaAndTerrainAdapter():
    root=Path(__file__).resolve().parents[2]
    engine=Engine(root/'data/raw',root/'data/benchmarkCache')
    result=engine.evaluate(EvaluationRequest(startUtc='2025-01-15T00:00:00Z',durationS=3600,cadenceS=600))
    assert result.dataState=='computed',result.error
    assert 'diskPhaseWindows' in result.result['bodies']['SUN']
    EvaluationResponse.model_validate_json(result.model_dump_json())
    cached=engine.evaluate(EvaluationRequest(startUtc='2025-01-15T00:00:00Z',durationS=3600,cadenceS=600))
    assert cached.provenance['execution']=='cached'
