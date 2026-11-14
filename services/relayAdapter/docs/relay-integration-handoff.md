# Relay integration handoff

Start mission science on 8014 and this adapter on 8015 from their project roots. Configure MISSION_SCIENCE_URL=http://127.0.0.1:8014 and RELAY_ADAPTER_URL=http://127.0.0.1:8015 before starting the existing Go backend. Compose supplies service URLs and mounts adapter raw assets and states read-only with a separate writable cache volume.

The existing mission-science page exposes Relay Engineering after a successful environmental evaluation. It discovers the verified candidate and permits comparisons for geometric CR1/GR1/SR1 windows up to 24 hours, on two-minute boundaries, within the replay window. Other selections receive an explanation. The request snapshot is held while the comparison runs, preventing a later environmental selection from being mixed with an older relay result.

POST /api/relay-engineering/compare accepts siteId, startUtc and durationS. A representative request is {"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400}. Responses contain version, direct and assisted metrics, common cadence and interval definitions, RF qualification status and both complete scientific responses with provenance. API errors distinguish unavailable services, unsupported scenarios and scientific incompatibility. Busy scientific responses are never replaced with example outputs.

The independent adapter accepts longer windows through its own API, up to the complete saved 28-day interval. The integrated one-day limit bounds the environmental event-search work and transport deadline. It is an implementation limit rather than a physical orbit-validity limit.

Documentation changes include a compatibility matrix and explicit geometric/RF semantics. Frozen INT-4 shared schemas and source artifacts are unchanged. The existing mission-science API receives only an additive observer-position provenance field. No live imports from Nasa are present in either new scientific package.
