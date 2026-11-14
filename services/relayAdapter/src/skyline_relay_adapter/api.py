from fastapi import FastAPI
from .engine import RelayEngine
from .schemas import RelayRequest,RelayResponse
app=FastAPI(title='SKYLINE Relay Adapter',version='1.0')
engine=RelayEngine()

@app.middleware('http')
async def limitBody(request, callNext):
    if request.method == 'POST':
        size=0
        chunks=[]
        async for chunk in request.stream():
            size+=len(chunk)
            if size>4096:
                from starlette.responses import JSONResponse
                return JSONResponse({'schemaVersion':'1.0','dataState':'unavailable','error':{'code':'request_too_large'}},status_code=413)
            chunks.append(chunk)
        request._body=b''.join(chunks)
    return await callNext(request)


@app.get('/health')
def health():
    required=[engine.root/'data/states/candidate2States.csv',engine.assets/'lola/LDEM_80S_80MPP_ADJ.TIF',engine.assets/'lola/LDEM_60S_240MPP_ADJ.TIF']
    return dict(status='alive',filesPresent=all(path.is_file() for path in required),scientificReadiness='validated on evaluation')

tiers=[dict(tier='verified-replay',satellites=2,cadenceS=120,startUtc='2025-01-01T00:00:00Z',endUtcExclusive='2025-01-29T00:00:00Z',
            dynamics='saved two-body states'),
       dict(tier='propagated-two-body',satellites=dict(minimum=1,maximum=4),cadenceS=dict(minimum=120,maximum=960,multipleOf=120),
            dynamics='two-body Moon-centered propagation of the verified Candidate 2 elements, accuracy unvalidated away from January 2025')]

def kernelRange():
    window=engine.kernelWindowUtc()
    return dict(startUtc=window[0],endUtcExclusive=window[1]) if window else None

@app.get('/v1/capabilities')
def capabilities():
    return dict(schemaVersion='1.0',sites=['CR1','GR1','SR1'],startUtc='2025-01-01T00:00:00Z',endUtcExclusive='2025-01-29T00:00:00Z',
                cadenceS=120,cadenceRangeS=dict(minimum=120,maximum=960,multipleOf=120),satellites=dict(minimum=1,maximum=4,default=2),
                durationS=dict(minimum=120,maximum=28*86400),tiers=tiers,kernelRange=kernelRange(),
                profile='geometric',rfQualified=False,maxConcurrentEvaluations=1)

@app.get('/v1/candidates')
def candidates():
    return [dict(candidateId='nominal-candidate-2',satellites=2,satelliteRange=dict(minimum=1,maximum=4),
                 cadenceRangeS=dict(minimum=120,maximum=960,multipleOf=120),tiers=tiers,kernelRange=kernelRange(),
                 dynamics='saved two-body states',verifiedSampledCoverage=1.,epoch='2025-01-01T00:00:00Z',durationDays=28)]

@app.get('/v1/provenance')
def provenance():
    import json
    return json.loads((engine.root/'docs/sourceManifest.json').read_text())

@app.post('/v1/evaluate',response_model=RelayResponse)
def evaluate(request:RelayRequest):
    return engine.evaluate(request)
