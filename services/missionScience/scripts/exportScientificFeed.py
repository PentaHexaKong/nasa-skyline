import argparse
import json
from pathlib import Path

from skyline_mission_science.scientificFeeds import exportScientificFeed

parser = argparse.ArgumentParser(
    description='Export an immutable scenario feed from the authoritative scientific API'
)
parser.add_argument(
    '--api-url',
    dest='apiUrl',
    default='http://localhost:8080/api/mission-science/v1/scientific-evaluations',
)
parser.add_argument('--request', required=True, type=Path)
parser.add_argument('--output-dir', dest='outputDir', required=True, type=Path)
arguments = parser.parse_args()
print(
    exportScientificFeed(
        arguments.apiUrl,
        json.loads(arguments.request.read_text(encoding='utf-8-sig')),
        arguments.outputDir,
    )
)
