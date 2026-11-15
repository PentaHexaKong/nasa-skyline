# Skyline

Skyline compares lunar landing sites and dates by showing where the Sun and Earth sit relative to each site's terrain horizon. That tells mission planners, educators and the public how much sunlight a site gets (power potential) and when it can see Earth (direct-to-Earth communication windows).

## Stack

| Part | Path | Tech |
| --- | --- | --- |
| Web app | `frontend/` | TanStack Start, React, Tailwind CSS v4, Vite, Biome |
| API | `backend/` | Go |
| Science pipeline | `ds/` | Python 3.12, uv |
| Science services | `services/` | Python, FastAPI |

## AI assistance

This project is built with AI coding assistants. Claude (Anthropic) and Codex (OpenAI) help generate and review code and documentation. Every change is reviewed, and every scientific number comes from the pipeline's own computation or a cited source, never from a model.

## International catalogue and global terrain

The `/sites` catalogue exposes source-qualified international observers and explicit unresolved coordinate variants. Daily and annual reference pages compute supported exploratory scenarios through the scientific API. See [catalogue methodology and source reconciliation](docs/internationalSiteCatalogue.md).

Download the optional coarse global LOLA product into the scientific asset root. The image and detached PDS label are both required. These commands work with GNU wget, including `wget.exe` on Windows.

```sh
wget -c -P services/missionScience/data/raw/lola https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_16.IMG
wget -c -P services/missionScience/data/raw/lola https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/LDEM_16.LBL
python scripts/prepareScienceAssets.py --global-terrain
```

The verifier checks all nine existing required science assets plus these two global files against pinned SHA-256 identities. Existing kernel and polar DEM provisioning remains in [the deployment guide](docs/scienceDeploymentHandoff.md). The global profile has approximately 1.9 km nominal equatorial spacing and carries exploratory limitations. New catalogue observers retain unsupported relay, rover and mast-placement states until separately qualified.
