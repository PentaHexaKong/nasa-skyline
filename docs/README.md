# docs/ — index

Project documentation for contributors. Each file has one job. Prefer linking to repeating.

| File | Purpose | Update when |
| --- | --- | --- |
| [STATUS.md](STATUS.md) | Living state: done / in progress / next / blockers / open decisions | Every working session |
| **product/** | | |
| [product/requirements.md](product/requirements.md) | Product requirements with stable IDs (R/O/C/B) | When the product scope changes |
| **solution/** | | |
| [solution/concept.md](solution/concept.md) | The product concept | When the concept changes |
| [solution/review.md](solution/review.md) | Requirements coverage: what the app covers, gaps, fixes | After major scope changes |
| [solution/scope.md](solution/scope.md) | The plan table (done / now / stretch / next) | During planning |
| [solution/references.md](solution/references.md) | Every research source behind the extension and the space scene, with a reliability key | When research adds a source |
| **science/** | | |
| [science/method.md](science/method.md) | Geometry pipeline: frames, terrain horizon, ephemeris, visibility | When the method changes |
| [science/metrics.md](science/metrics.md) | Exact metric and event definitions (the source of truth for labels) | Before changing any metric |
| [science/claims.md](science/claims.md) | Claims policy: what we may and may not say about results | When a claim boundary changes |
| [science/reference-numbers.md](science/reference-numbers.md) | Physical constants and sanity numbers, with checks | Rarely |
| **data/** | | |
| [data/sources.md](data/sources.md) | Datasets and SPICE kernels with exact filenames and URLs | When a source changes |
| [data/sites.md](data/sites.md) | Curated site candidates and their verification status | As sites are verified |
| **architecture/** | | |
| [architecture/overview.md](architecture/overview.md) | Current code, target architecture, data flow | When structure changes |
| [architecture/contracts.md](architecture/contracts.md) | What `contracts/*.json` mean, plus proposed changes | With every schema change |
| [architecture/frontend-feeds.md](architecture/frontend-feeds.md) | The JSON files the pipeline delivers to the Planner | With every feed schema change |
| [architecture/handoff-vs-frontend.md](architecture/handoff-vs-frontend.md) | Every field in the DS handoff against what the app reads and shows (Explore, Analyze) | When the handoff, the pipeline output or a page changes |
| [architecture/backend-handoff.md](architecture/backend-handoff.md) | Go bridge behaviour, limits, and operations | When the backend changes |
| **decisions/** | [decisions/README.md](decisions/README.md): ADRs | New significant choice |
| [glossary-id.md](glossary-id.md) | Indonesian glossary (Glosarium) of domain and tech terms | New term introduced |

## Conventions for writing docs

- Lead with the answer. Tables for things people compare, prose for reasoning.
- External facts get `(source, as of YYYY-MM-DD)`.
- Mark the status of proposals clearly: **proposed**, **accepted** or **superseded**.
- Never paste computed lunar numbers into docs without the run ID or provenance.
