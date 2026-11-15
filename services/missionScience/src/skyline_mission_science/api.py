import threading
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from starlette.responses import JSONResponse
from .scientificModels import ScientificRequest, ScientificResponse
from .referenceEvaluations import ReferenceRequest, evaluateReference
from .scientificContract import evaluateScientific, stateResponse
from .mastPower import evaluateMastPower, mastFailure
from .mastPowerModels import MastPowerRequest, MastPowerResponse
from .mastPlacement import evaluateMastPlacement, placementFailure
from .mastPlacementModels import MastPlacementRequest, MastPlacementResponse
from pydantic import BaseModel, Field
from .engine import Engine
from .siteCatalog import CatalogResponse, loadCatalog
from .schemas import EvaluationRequest, EvaluationResponse
from .optimization import SearchRequest, search

app = FastAPI(title='SKYLINE Mission Science', version='1.0')
engine = Engine()
requestGate = threading.Lock()


class BatchRequest(BaseModel):
    evaluations: list[EvaluationRequest] = Field(min_length=1, max_length=16)


@app.middleware('http')
async def boundRequest(request, callNext):
    if request.method == 'POST':
        total = 0
        chunks = []
        async for chunk in request.stream():
            total += len(chunk)
            if total > 1048576:
                from starlette.responses import JSONResponse

                if request.url.path in {
                    '/v1/scientific-evaluations',
                    '/v1/reference-evaluations',
                    '/v1/mast-power-evaluations',
                    '/v1/mast-placement-evaluations',
                }:
                    return JSONResponse(
                        failureForPath(
                            request.url.path,
                            'failed',
                            'request_too_large',
                            'Request exceeds the transport size limit',
                        ).model_dump(mode='json'),
                        status_code=413,
                    )
                return JSONResponse(
                    {'error': {'code': 'request_too_large'}}, status_code=413
                )
            chunks.append(chunk)
        request._body = b''.join(chunks)
        if not requestGate.acquire(blocking=False):
            from starlette.responses import JSONResponse

            if request.url.path in {
                '/v1/scientific-evaluations',
                    '/v1/reference-evaluations',
                '/v1/mast-power-evaluations',
                    '/v1/mast-placement-evaluations',
            }:
                return JSONResponse(
                    failureForPath(
                        request.url.path,
                        'unavailable',
                        'busy',
                        'Scientific service is evaluating another request',
                    ).model_dump(mode='json'),
                    status_code=503,
                )
            return JSONResponse({'error': {'code': 'busy'}}, status_code=503)
        try:
            return await callNext(request)
        finally:
            requestGate.release()
    return await callNext(request)


@app.get('/health')
def health():
    return dict(
        status='alive',
        kernelsPresent=(engine.assetRoot / 'spice').is_dir(),
        terrainPresent=(engine.assetRoot / 'lola').is_dir(),
        readiness='Presence only. Coverage and identity checked on evaluation',
    )


@app.get('/v1/capabilities')
def capabilities():
    return dict(
        schemaVersion='1.0',
        maxIntervals=6000,
        maxDurationDays=365,
        maxCompare=16,
        maxSearchEvaluations=128,
        maxConcurrentRequests=1,
        execution='synchronous bounded admission',
        arbitraryCoordinates='conditional on complete DEM search extent and DE421 kernel coverage',
        earthDefinition='center geometric visibility',
        dsCatalog='unavailable pending source-frame reconciliation',
    )


@app.get('/v1/sites')
def sites():
    return [site.model_dump() for site in engine.sites.values()]


@app.get('/v1/scientific-profiles')
def profiles():
    return dict(
        geometric=dict(correction='NONE', observer='site, observation epoch'),
        apparent=dict(
            correction='LT+S',
            observer='site, observation epoch',
            meaning='reception light time and stellar aberration',
        ),
    )


@app.post('/v1/evaluate', response_model=EvaluationResponse)
def evaluate(request: EvaluationRequest):
    return engine.evaluate(request)


@app.post('/v1/compare', response_model=list[EvaluationResponse])
def compare(request: BatchRequest):
    if (
        len(
            {
                (
                    item.profile,
                    item.solarDefinition,
                    item.earthDefinition,
                    item.horizonOffsetDeg,
                    item.localResolutionM,
                )
                for item in request.evaluations
            }
        )
        != 1
    ):
        raise HTTPException(
            422, 'Comparison requires consistent scientific definitions'
        )
    return [engine.evaluate(item) for item in request.evaluations]


@app.post('/v1/optimize')
def optimize(request: SearchRequest):
    try:
        if (
            len(
                {
                    (
                        item.profile,
                        item.solarDefinition,
                        item.earthDefinition,
                        item.horizonOffsetDeg,
                        item.localResolutionM,
                    )
                    for item in request.candidates
                }
            )
            != 1
        ):
            raise ValueError(
                'Search candidates require consistent scientific definitions'
            )
        return search(engine, request)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.get('/v1/site-catalog', response_model=CatalogResponse)
def siteCatalog():
    return loadCatalog()


@app.exception_handler(RequestValidationError)
async def scientificValidationError(request, error):
    if request.url.path in {'/v1/reference-evaluations', '/v1/scientific-evaluations', '/v1/mast-power-evaluations', '/v1/mast-placement-evaluations'}:
        return JSONResponse(
            failureForPath(
                request.url.path,
                'failed',
                'invalid_request',
                'Request does not satisfy scientific request schema 1.0.0',
            ).model_dump(mode='json'),
            status_code=422,
        )
    return await request_validation_exception_handler(request, error)


@app.post('/v1/scientific-evaluations', response_model=ScientificResponse)
def scientificEvaluation(request: ScientificRequest):
    return evaluateScientific(engine, request)


def failureForPath(path, state, code, message):
    producer = {
        '/v1/mast-power-evaluations': mastFailure,
        '/v1/mast-placement-evaluations': placementFailure,
    }.get(path, stateResponse)
    return producer(state, code, message)


@app.post('/v1/mast-power-evaluations', response_model=MastPowerResponse)
def mastPowerEvaluation(request: MastPowerRequest):
    return evaluateMastPower(engine, request)


@app.post('/v1/mast-placement-evaluations', response_model=MastPlacementResponse)
def mastPlacementEvaluation(request: MastPlacementRequest):
    return evaluateMastPlacement(engine, request)


@app.post('/v1/reference-evaluations', response_model=ScientificResponse)
def referenceEvaluation(request: ReferenceRequest):
    return evaluateReference(engine, request)
