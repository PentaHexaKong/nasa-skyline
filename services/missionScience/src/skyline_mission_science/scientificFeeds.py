import json
import os
from pathlib import Path
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from pydantic import TypeAdapter
from .scientificModels import ComputedResponse, ScientificRequest, ScientificResponse

responseAdapter = TypeAdapter(ScientificResponse)


def stableContent(response):
    return response.model_dump(
        mode='json',
        exclude={'provenance': {'execution'}},
    )


def writeScientificFeed(response, outputRoot):
    response = responseAdapter.validate_python(response)
    if not isinstance(response, ComputedResponse):
        raise ValueError(
            f'Cannot publish {response.dataState} as a computed feed: {response.error.message}'
        )
    destination = Path(outputRoot) / (response.scenarioId + '.json')
    return writeImmutableJson(
        destination,
        response.model_dump(mode='json'),
        lambda payload: stableContent(responseAdapter.validate_python(payload)),
    )


def writeImmutableJson(destination, payload, normalize=lambda value: value):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode='w',
            encoding='utf-8',
            dir=destination.parent,
            suffix='.tmp',
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, indent=2, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, destination)
        except FileExistsError:
            existing = json.loads(destination.read_text(encoding='utf-8'))
            if normalize(existing) != normalize(payload):
                raise ValueError(
                    'Conflicting scientific content for an existing scenario identity'
                )
        return destination
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def exportScientificFeed(apiUrl, request, outputRoot):
    request = ScientificRequest.model_validate(request)
    operation = Request(
        apiUrl,
        data=request.model_dump_json().encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urlopen(operation, timeout=100) as reply:
            response = responseAdapter.validate_json(reply.read())
    except HTTPError as error:
        response = responseAdapter.validate_json(error.read())
        raise ValueError(f'{response.dataState}: {response.error.message}') from error
    return writeScientificFeed(response, outputRoot)
