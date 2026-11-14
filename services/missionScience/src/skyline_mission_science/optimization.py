from datetime import timedelta
from pydantic import BaseModel, Field, ConfigDict
from .schemas import EvaluationRequest

class SearchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    candidates: list[EvaluationRequest] = Field(min_length=1,max_length=32)
    delaysDays: list[int] = Field(default=[0,7,14,30],min_length=1,max_length=8)

    def requests(self):
        if len(self.candidates)*len(set(self.delaysDays)) > 128 or any(day<0 or day>90 for day in self.delaysDays):
            raise ValueError('At most 128 evaluations and delay offsets in [0,90] days')
        return [(candidate,sorted(set([0]+self.delaysDays))) for candidate in self.candidates]

def nondominated(vectors):
    return [index for index,vector in enumerate(vectors)
            if not any(all(a<=b for a,b in zip(other,vector)) and any(a<b for a,b in zip(other,vector))
                       for otherIndex,other in enumerate(vectors) if otherIndex != index)]

def search(engine, request):
    records=[]
    for candidateIndex,(candidate,delays) in enumerate(request.requests()):
        scenarios=[]
        for delay in delays:
            shifted=candidate.model_copy(update={'startUtc':candidate.startUtc+timedelta(days=delay)})
            response=engine.evaluate(shifted)
            if response.dataState != 'computed':
                scenarios.append(dict(delayDays=delay,dataState='unavailable',error=response.error))
                continue
            result=response.result
            scenarios.append(dict(delayDays=delay,dataState='computed',solar=result['bodies']['SUN']['visibleFraction'],
                                  earth=result['bodies']['EARTH']['visibleFraction'],
                                  solarOutageS=result['bodies']['SUN']['maximumOutageS'],
                                  earthOutageS=result['bodies']['EARTH']['maximumOutageS'],
                                  feasible=result['feasible'],constraints=result['constraints']))
        supported=all(item['dataState']=='computed' for item in scenarios)
        record=dict(candidateIndex=candidateIndex,scenarios=scenarios,supported=supported)
        if supported:
            nominal=scenarios[0]
            sensitivity=max(nominal['solar']-item['solar'] for item in scenarios)
            record.update(nominal=nominal,robustFeasible=all(item['feasible'] for item in scenarios),
                          violationFrequency=sum(not item['feasible'] for item in scenarios)/len(scenarios),
                          worstSolar=min(item['solar'] for item in scenarios),worstEarth=min(item['earth'] for item in scenarios),
                          worstSolarOutageS=max(item['solarOutageS'] for item in scenarios),
                          worstEarthOutageS=max(item['earthOutageS'] for item in scenarios),delaySensitivity=sensitivity)
        records.append(record)
    valid=[record for record in records if record['supported']]
    robust=[record for record in valid if record['robustFeasible']]
    vectors=[[-record['worstSolar'],-record['worstEarth'],record['worstSolarOutageS'],record['worstEarthOutageS'],record['delaySensitivity']] for record in robust]
    nominalVectors=[[-record['nominal']['solar'],-record['nominal']['earth'],record['nominal']['solarOutageS'],record['nominal']['earthOutageS']] for record in valid]
    return dict(records=records,robustPareto=[robust[index]['candidateIndex'] for index in nondominated(vectors)],
                baselineA=max(valid,key=lambda record:record['nominal']['solar'])['candidateIndex'] if valid else None,
                baselineB=[valid[index]['candidateIndex'] for index in nondominated(nominalVectors)],
                method='exhaustive enumeration',probabilities=None,
                interpretation='violation frequencies are fractions of specified scenarios, without probability weights')
