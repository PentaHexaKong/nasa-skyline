# SKYLINE Mission Science

Independent Python package for bounded lunar site/date evaluation and exhaustive schedule-robust search.

Install with `python -m pip install -e '.[test]'`. Run `python -m uvicorn skyline_mission_science.api:app` from the project root. Open `/docs` for the implemented API. Run `python -m pytest` for verification and `python scripts/runStudy.py` for the bounded real-data study.

Local assets reside in `data/raw/spice` and `data/raw/lola`. Set SKYLINE_ASSET_ROOT to another independently provisioned asset directory if needed. Runtime code imports only this package and installed dependencies. Copied asset bytes originate from the supplied local NAIF and LOLA datasets.

The curated registry contains CR1, GR1 and SR1. User coordinates explicitly use MOON_ME_DE421 and require complete terrain coverage. Missing assets, unknown IDs, unsupported coverage and SPICE coverage failures return unavailable. DS catalog sites await reference-frame reconciliation. Geometric Earth-center availability and apparent Sun-disk visibility are distinct selectable definitions.

See docs/implementation-status.md and the generated benchmark and experiment JSON for measured results and current restrictions.
