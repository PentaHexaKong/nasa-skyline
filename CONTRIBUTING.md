# Contributing

## Rules for results

1. **No invented science.** Every lunar number (elevation, share of time sunlit, gap length, coordinate) comes from the pipeline or from a cited source. Anything missing is `null` or `not_computed`. Synthetic data says `fixture` or `synthetic` in the data itself.
2. **Every result carries provenance.** That means dataset filenames, kernel versions, the algorithm version and the visibility rules used. See [docs/science/metrics.md](docs/science/metrics.md).
3. **Conventions are explicit.** Degrees, azimuth clockwise from local north, UTC, intervals `[start, end)`, longitude in °E within [0, 360), and the Mean Earth/Polar Axis (ME) body-fixed frame.
4. **Claims stay inside the policy.** Results are geometric opportunities under stated assumptions, not delivered power, a working radio link or guaranteed contact. See [docs/science/claims.md](docs/science/claims.md).
5. **Large data stays out of git.** GeoTIFFs and SPICE kernels are fetched into gitignored folders and checked against pinned hashes. Only small derived files with provenance are committed. [docs/setup.md](docs/setup.md) covers the fetch.
6. **The baseline comes first.** Direct sunlight and Earth visibility for the app's sites work end to end before relay, 3D or ML features.

## Keeping docs current

- [docs/STATUS.md](docs/STATUS.md) records the current state, open issues and next steps. Update it with any change that alters one of those.
- A significant choice gets an ADR in [docs/decisions/](docs/decisions/). A decided ADR is superseded by a new one, never edited in place.
- Every external fact (mission dates, dataset URLs) carries its source and an "as of" date.
- Docs are in English. [docs/glossary-id.md](docs/glossary-id.md) is the Indonesian glossary; add a term there when you introduce one.

## Checks before a change lands

```bash
cd backend && go test -count=1 ./... && go vet ./...
cd ds && uv run python -m pytest -q
cd services/missionScience && uv run python -m pytest -q
cd services/relayAdapter && uv run python -m pytest -q
cd frontend && pnpm check && pnpm test && pnpm build
```
