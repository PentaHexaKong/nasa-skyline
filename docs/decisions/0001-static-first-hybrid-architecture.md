# 0001: Static-first delivery, one Python pipeline, optional live bridge

Status: **proposed**

## Context

The original concept proposes a static web app over precomputed JSON (no backend). The repo has a Go → DS → ML Docker bridge. A static site is cheap to host and always reachable. The requirements list custom coordinates (O1), which static precompute can't fully serve. Operating live services costs time and money for a side project.

## Decision

1. The DS **Python pipeline** is the single science implementation.
2. **Default path = static:** run the pipeline offline for curated sites and periods. Commit the small JSON. Host it on GitHub Pages or Netlify.
3. **Optional live path (stretch):** the existing Go bridge → DS `/analyze` serves bounded custom-coordinate requests (≤ 1 month, coarse DEM). It is used only if it's ready, and the UI degrades gracefully without it.
4. Both paths emit the same result contract.

## Consequences

- Robust delivery; near-zero hosting cost; reproducible numbers.
- The Go work isn't wasted: it becomes the live path, and its envelope and limits stay valid.
- Custom coordinates in the static baseline are limited to a precomputed grid (snap-to-nearest), stated in the UI.

## Alternatives considered

- **Services only:** requires a hosted backend with DEM access, which is fragile and costly to keep running.
- **Pure static, no custom coordinates:** simplest, but leaves O1 partially unmet.
- **Browser-side ephemeris + horizon:** possible (JS ephemeris libraries plus prebuilt horizon masks), but it duplicates the science code and is harder to validate.
