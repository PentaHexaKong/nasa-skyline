import argparse
from pathlib import Path
from urllib.request import Request, urlopen

from pydantic import TypeAdapter
from skyline_mission_science.mastPowerModels import MastPowerRequest, MastPowerResponse
from skyline_mission_science.powerFeeds import writePowerFeed

parser = argparse.ArgumentParser(
    description='Generate scenario-addressed PowerFeeds from the authoritative mast/power API'
)
parser.add_argument(
    '--api-url',
    dest='apiUrl',
    default='http://localhost:8080/api/mission-science/v1/mast-power-evaluations',
)
parser.add_argument('--request', type=Path, required=True)
parser.add_argument(
    '--output-root', dest='outputRoot', type=Path, default=Path('data/feeds')
)
arguments = parser.parse_args()
request = MastPowerRequest.model_validate_json(
    arguments.request.read_text(encoding='utf-8-sig')
)
operation = Request(
    arguments.apiUrl,
    data=request.model_dump_json().encode(),
    headers={'Content-Type': 'application/json'},
    method='POST',
)
with urlopen(operation, timeout=610) as reply:
    response = TypeAdapter(MastPowerResponse).validate_json(reply.read())
print(writePowerFeed(response, arguments.outputRoot))
