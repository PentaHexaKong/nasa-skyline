import numpy as np
from skyline_mission_science.schemas import EvaluationRequest,EvaluationResponse
from skyline_mission_science.optimization import SearchRequest,search

class ScenarioEngine:
    def evaluate(self,query):
        # Explicit synthetic test evaluator for selection behavior only.
        solar=.9 if query.startUtc.day<7 else .1
        return EvaluationResponse(dataState='computed',result={'feasible':solar>=.5,'constraints':{'solarDeficit':max(0,.5-solar)},'bodies':{'SUN':{'visibleFraction':solar,'maximumOutageS':100},'EARTH':{'visibleFraction':1,'maximumOutageS':0}}})

def testWorstCaseFiltering():
    candidate=EvaluationRequest(startUtc='2025-01-01T00:00:00Z')
    result=search(ScenarioEngine(),SearchRequest(candidates=[candidate],delaysDays=[0,7]))
    assert result['baselineA']==0
    assert result['robustPareto']==[]
    assert result['records'][0]['violationFrequency']==.5

def testUnavailableCannotBeRobust():
    class MissingEngine:
        def evaluate(self,query):
            return EvaluationResponse(dataState='unavailable',error={'code':'missing'})
    result=search(MissingEngine(),SearchRequest(candidates=[EvaluationRequest(startUtc='2025-01-01T00:00:00Z')]))
    assert not result['records'][0]['supported']
    assert result['robustPareto']==[]
