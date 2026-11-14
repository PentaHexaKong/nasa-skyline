# Scientific deployment services

The application repository contains the mission-science, rover and relay-adapter deployment sources. See [deployment handoff](../docs/scienceDeploymentHandoff.md) for setup, merge scope, tests and the existing frozen-engine prerequisite.

| Directory | Role |
| --- | --- |
| missionScience | Independent site catalog, terrain, Sun/Earth, mast/power, mast placement and rover packages |
| relayAdapter | Existing bounded relay replay adapter and pinned Candidate 2 trajectory |

The Compose mission-science and optional rover services build from missionScience. Relay-adapter builds from relayAdapter. Tests, scientific provenance records, example responses and schema generators accompany each service. Generated app contracts and Go/frontend consumers live in their existing repository locations.

## Download scientific data

Run the [wget commands in the root README](../README.md#scientific-data-download) from the repository root, then run the included hash verifier before starting Compose. The block provisions all seven kernels and both DEMs into the shared scientific asset directory.
