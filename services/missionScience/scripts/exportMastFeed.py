import argparse
from pathlib import Path
from urllib.request import Request, urlopen

from pydantic import TypeAdapter
from skyline_mission_science.mastPlacementModels import (
    MastPlacementRequest,
    MastPlacementResponse,
)
from skyline_mission_science.mastFeeds import writeMastFeed


def main():
    parser = argparse.ArgumentParser(
        description='Export authoritative mast placement results through the Go proxy'
    )
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument(
        '--api-url',
        dest='apiUrl',
        default='http://localhost:8080/api/mission-science/v1/mast-placement-evaluations',
    )
    parser.add_argument(
        '--output-root', dest='outputRoot', type=Path, default=Path('data/feeds')
    )
    args = parser.parse_args()
    request = MastPlacementRequest.model_validate_json(
        args.request.read_text(encoding='utf-8')
    )
    operation = Request(
        args.apiUrl,
        data=request.model_dump_json().encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urlopen(operation, timeout=610) as reply:
        response = TypeAdapter(MastPlacementResponse).validate_json(reply.read())
    print(writeMastFeed(response, args.outputRoot))


if __name__ == '__main__':
    main()
