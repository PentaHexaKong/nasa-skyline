# ds: the Skyline pipeline

Given a site on the Moon, compute the terrain skyline, where the Sun and Earth stand in its sky, how much of each disc clears the terrain, and when. It uses NASA LOLA terrain and JPL NAIF SPICE geometry. The app ships results for three south-polar sites (Connecting Ridge, de Gerlache Rim, Shackleton Rim); `pipeline/sites.py` also defines other Moon sites that can be computed and added back.

`pipeline/` is the computation. `server.py` and `Dockerfile` are the HTTP service the Go backend calls (`POST /analyze`); it is still a stub that echoes its input and does not call the pipeline yet.

## Run it

```bash
cd ds
uv sync
uv run python -m pipeline.run connecting-ridge --start 2026-11-14 --days 365  # Sun, Earth, skyline -> ../frontend/data/connecting-ridge.json
uv run python -m pipeline.island connecting-ridge  # 3D terrain: inner (+-10 km) and outer (+-60 km) tiers
uv run pytest -q                 # offline
uv run pytest -q -m net          # adds the JPL Horizons cross-check
```

The web app in `../frontend/` reads those files at `pnpm dev` / `pnpm build`. A run also refreshes `../frontend/data/moon/ephemeris.json` when its start, length, algorithm version or kernels differ, so pass the app's period (`--start 2026-11-14 --days 365`) or `--out` to a scratch path for a quick test.

The first run downloads the Moon kernels, `LDEM_80S_80MPP_ADJ.TIF` (189 MB) and `LDEM_60S_240MPP_ADJ.TIF` (219 MB) into `data/` (gitignored); the 2.7 GB 20 m and 30 m grids and the 8.5 GB global map are never downloaded, only the windows around a site are read over HTTP range requests and cached in `data/windows/`. PGDA serves each connection slowly, so downloads and window reads run in parallel; `pipeline/checksums.json` (committed) pins each file's sha256 on first fetch and fails loudly if a file changes.

## Pipeline

| Stage | Module | Output |
| --- | --- | --- |
| Terrain | `moon.py`, `terrain.py` | `PolarDem` reads LOLA south-polar-stereographic grids (CRS and sphere radius from the file). `skyline` gives the max terrain elevation angle every 0.25° of azimuth, exact spherical geometry, taking each ray sample from the finest grid in range: 20 m to 15 km, 80 m to 100 km, 240 m to 200 km (outside the polar grids: the global 118 m map) |
| Sun and Earth | `sun.py`, `run.py` | `Ephemeris.target`: `azlcpo` from a point on the 1737.4 km sphere in `MOON_ME_DE440_ME421`, LT+S, no atmosphere. Earth is a 6371 km disc sampled every 10 min with 1 s edges |
| Visibility | `visibility.py` | Share of a disc above the skyline (circular segment, straight local horizon) |
| Events and metrics | `run.py` | Direct-sun and Earth intervals bisected to 1 s, minutes per UTC day, longest stretches without direct sun or Earth. `frontend/data/moon/ephemeris.json` holds the hourly sub-solar and sub-Earth points |

Conventions: degrees; azimuth clockwise from north; UTC; intervals `[start, end)`; longitude °E in [0, 360). Every output carries its inputs' checksums, the algorithm version and its known limits.

## Checks

- `uv run pytest -q`: geometry on synthetic terrain (horizon dip, a known ridge, layered grids, curvature drop), visibility of a disc, interval and gap bookkeeping.
- `uv run pytest -q -m net`: Sun and Earth directions against JPL Horizons.
- Ground heights at the three sites agree with the independent scientific engine to about 1 m (see `docs/STATUS.md`).
