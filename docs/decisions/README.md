# Architecture Decision Records

One file per significant decision: `NNNN-short-title.md`. Status: **proposed** → **accepted** / **rejected** → **superseded by NNNN**. Never rewrite an accepted ADR. Write a new one that supersedes it.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-static-first-hybrid-architecture.md) | Static-first delivery, one Python pipeline, optional live bridge | proposed |
| [0002](0002-pole-focus-with-contrast-sites.md) | South-pole focus plus contrast sites | proposed |
| [0003](0003-ml-off-critical-path.md) | ML service off the critical path | proposed |
| [0004](0004-relay-mode-as-extension.md) | Relay Mode as a gated extension | proposed, refined by 0005 |
| [0005](0005-relay-coverage-and-rover-reach.md) | Planned-relay coverage and rover reach as one extension | proposed |
| [0006](0006-versioned-scientific-engine.md) | Versioned scientific engine connection | implemented |
| [0007](0007-unified-scientific-contract.md) | Unified scientific data contract | implemented |
| [0008](0008-bounded-mast-placement.md) | Bounded mast placement | implemented |
| [0009](0009-isolated-rover-prototype.md) | Isolated bounded rover prototype | proposed |
| [0010](0010-scientific-services-in-application.md) | Package scientific service sources with the application | implemented |

Template:

```markdown
# NNNN — Title
Status: proposed
## Context
## Decision
## Consequences
## Alternatives considered
```
