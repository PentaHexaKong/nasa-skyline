import threading

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse

from .roverEvaluation import RoverEngine, roverFailure
from .roverModels import RoverRequest, RoverResponse

app = FastAPI(title='SKYLINE Rover Reachability Prototype', version='0.1.0')
engine = RoverEngine()
requestGate = threading.Lock()


@app.middleware('http')
async def boundedAdmission(request, callNext):
    if request.method != 'POST':
        return await callNext(request)
    chunks = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 65536:
            return JSONResponse(
                roverFailure(
                    'failed', 'request_too_large', 'Maximum request size is 64 KiB'
                ).model_dump(mode='json'),
                status_code=413,
            )
        chunks.append(chunk)
    request._body = b''.join(chunks)
    if not requestGate.acquire(blocking=False):
        return JSONResponse(
            roverFailure(
                'unavailable',
                'busy',
                'One isolated rover evaluation is admitted at a time',
            ).model_dump(mode='json'),
            status_code=503,
        )
    try:
        return await callNext(request)
    finally:
        requestGate.release()


@app.exception_handler(RequestValidationError)
async def invalidRequest(request, error):
    return JSONResponse(
        roverFailure(
            'failed',
            'invalid_request',
            'Request does not satisfy the proposed rover schema',
        ).model_dump(mode='json'),
        status_code=422,
    )


@app.get('/health')
def health():
    return dict(
        status='alive',
        role='isolated optional scientific prototype',
        contractStatus='proposed-for-team-review',
        scientificReadiness='Assets and coverage validated on evaluation',
    )


@app.post('/v1/reachability-evaluations', response_model=RoverResponse)
def reachabilityEvaluation(request: RoverRequest):
    return engine.evaluate(request)
