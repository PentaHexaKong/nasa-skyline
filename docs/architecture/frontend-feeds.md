# Frontend feeds: what the pipeline delivers

The Planner is built against the files listed here. To integrate a feature, write its JSON file into `frontend/data/feeds/` and rebuild. No frontend change is needed.

Until a file exists, its panel shows "Not computed yet". A file that breaks its contract is hidden and never shown as a result.

## Files

| Panel | File | JSON Schema |
| --- | --- | --- |
| What mast height buys (item 6) | `frontend/data/feeds/power/<site-id>.json` | [power](../../contracts/feeds/power.schema.json) |
| Where to put the mast (item 8) | `frontend/data/feeds/mast/<site-id>.json` | [mast](../../contracts/feeds/mast.schema.json) |
| What each relay adds (item 7) | `frontend/data/feeds/relay/<site-id>.json` | [relay](../../contracts/feeds/relay.schema.json) |
| What if we designed the relays? (D9) | `frontend/data/feeds/relay-study.json` | [relay-study](../../contracts/feeds/relay-study.schema.json) |
| Our numbers next to NASA's maps (item 9) | `frontend/data/feeds/validation.json` | [validation](../../contracts/feeds/validation.schema.json) |

`<site-id>` is the `id` in `ds/pipeline/sites.py`. The source of truth is `frontend/src/lib/feed-schemas.ts`. After changing it, run `pnpm contracts` in `frontend/`. A test fails if the exported schemas are stale.

Example files with the right shape are in `frontend/fixtures/feeds/`. Their values are invented.

## Rules for every file

- Set `origin` to `computed`. Anything else must say `fixture`, and the app labels it on screen.
- Fill in `provenance`: algorithm version, UTC time, sources and assumptions. The app shows them next to the result.
- Shares are 0 to 1. Gaps are hours. Times are ISO UTC, and spans are `[start, end)`.
- Set a `*_truncated` flag to `true` when a gap touches the edge of the period, because its true length may be longer.

## The relay study

Send every tested configuration in `candidates`, with its results at each site in `by_site`. The app works out which ones no other tested configuration beats on relay count, contact share and longest gap, and which is the smallest that meets the user's target. A candidate is scored by its worst chosen site.

Leave `target` as `null` unless the target has a citable source. `search.candidates_tested` appears in the on-screen claim, so it must be the real count.

This feature is open decision D9 in [STATUS.md](../STATUS.md). The screen says "what-if" and never "you need N relays".

## See the panels with example data

Open `/analyze?fixtures=1` on the dev server. Production builds do not include fixtures.

## Not built yet

- Rover reach (item 10). It needs a per-cell result format, which depends on item 7.
- Relays drawn in the `/explore` space scene. It needs satellite positions over time.
- Custom coordinates through `POST /api/run` (N5). The DS service is still a stub.
