# 0010 — Package scientific service sources with the application

Status: implemented.

## Decision

Keep the independent mission-science and relay-adapter packages under services/ in the application repository. Keep runtime source bytes and the pinned trajectory identity verifiable against recorded SHA-256 identities. Point Compose builds at repository-local service directories. Share externally provisioned hash-pinned kernel and DEM data through read-only mounts, with a portable copy-and-verification script.

The source-identity snapshot permits verification of scientific source identity. Tests and schema/feed generators accompany the services. The legacy INT-4 adapter requires the external INT-4 checkout through `SKYLINE_SCIENCE_ROOT`.

## Consequences

Maintainers can review and merge scientific service code together with Go, frontend and contract changes. Asset provisioning and the external INT-4 checkout are documented deployment prerequisites. The optional rover profile keeps the explicit experimental contract and bounded scientific scope.
