# Dynamic scientific mission planner

## Entry point and response ownership

The `/analyze` planner evaluates the selected mission automatically after hydration and a 400 ms input debounce. The Go gateway forwards `POST /api/mission-science/v1/scientific-evaluations` to the existing Python mission-science engine. The engine owns SPICE geometry, terrain horizons, finite solar-disk evaluation, event refinement and environmental metrics.

Set up status, Result metrics and verdict, Dates results, the Add-ons baseline and the downloaded Markdown brief share the current API response. The brief embeds the complete versioned response, including the observer, skyline, timestamped tracks, refined intervals, dataset hashes and limitations. The existing profile controls, URL settings, date-slip controls and add-on tools remain the planner entry points.

## Scientific scenario

The planner requests geometric directions, any-visible-solar-disk sunlight, center-based direct-Earth visibility, a zero-degree horizon offset, an 80 m local DEM profile, hourly track samples and one-second numerical event-root tolerance. Observer height comes from the selected site definition and is sent explicitly in meters above terrain. Canonical live mappings are Connecting Ridge to CR1, De Gerlache Rim to GR1 and Shackleton Rim to SR1. The returned observer coordinates and MOON_ME_DE421 frame appear in provenance.

Apollo 11 and the separately defined Shackleton hill-top observer display unsupported live states, with their scientific capability explanation. These locations remain in the catalogue.

The API's sunlight and Earth availability fractions and longest-outage durations are used directly. Fractions become percentages and seconds become hours at the presentation boundary. Longest-interval coverage-boundary flags remain visible. Timeline spans retain the returned half-open UTC intervals. Simultaneous Sun/Earth share, used by existing consumers, is the intersection of returned elapsed-ET intervals divided by the engine's elapsed-ET denominator. UTC timestamp rounding does not redefine durations.

The response distinguishes computed results and independent scientific validation. The UI reports the engine's independentlyValidated value and possibleMissedEvents flags. Numerical event tolerance describes localization accuracy under the engine's search assumptions. Geometric Earth visibility describes the modeled line of sight. RF link qualification and operational power models require their respective physical inputs.

## Request lifecycle and consistency

Every request field participates in the active scenario key, including site, UTC start, duration, observer height, scientific profile, visibility definitions, DEM resolution, cadence, event tolerance and user requirements. Sites are submitted sequentially through the existing shared in-flight client. Identical in-flight calls share one request. Re-evaluation starts a fresh request after completion and permits the engine's provenance-aware intermediate caches to serve valid results.

A scenario change immediately replaces displayed results with pending states during render. The effect cleanup and request-generation guards prevent late responses from publishing after their scenario is superseded. An obsolete batch stops before starting another site. A 400 ms debounce bounds transient requests while editing. Already admitted server computations can finish.

The frontend validates the complete exported JSON schema and compares echoed request settings, canonical observer identity and height, profile, period, cadence, denominator, initial sample and terrain coverage against the selected request. Inconsistent results produce a failed state. Loading, unsupported, not_computed, unavailable and failed states retain missing metrics.

## Date navigation and reference content

The date strip retains the catalogue's annual navigation range. Each selected date is evaluated for the chosen mission duration and limits. Other dates remain unevaluated, and the planner reports this explicitly. Automatic all-year landing recommendations and slip-delta metrics require their own evaluated comparison scenarios. The current planner clears those annual-derived values.

Site-report pages now evaluate their UTC day and calendar year dynamically. Linked 3D site views use live day and exact-instant scientific responses. See [dynamic reference contracts and validation](dynamicReferences.md). Educational overview scenes retain their source-labelled narrative datasets.

## Deployment

The frontend requires the existing Go gateway and mission-science service. The gateway uses MISSION_SCIENCE_URL. Frontend dev, preview and Nginx configurations proxy the same-origin /api route. A separate gateway origin can be configured with VITE_API_URL at build time. The scientific service needs the pinned SPICE and LOLA assets described in the deployment documentation.

The Re-evaluate mission control refreshes the selected scenario and supports recovery after a service failure. Downloaded briefs preserve the state of every selected site and include complete scientific responses for computed sites.

## Validation on 2026-11-15

The complete frontend suite passed 192 tests, including the three live integration cases that each evaluate two UTC epochs through the Go gateway and actual SPICE/LOLA Python service. The live replay covered CR1, GR1 and SR1 at 2026-11-20 and 2026-12-05, using a one-day duration and 2 m observer height. The full suite completed in 35.73 seconds with scientific caches already warm. The initial isolated 26-test planner run including six live evaluations completed in 56.21 seconds. These are local validation runtimes.

Regression coverage includes request identity changes, unknown mappings, API state propagation, schema validation, observer and terrain consistency, duration units, coverage-boundary flags, exact interval use, current-date-only status, stale replies, network failure and fresh re-evaluation.

The Go suite passed 43 top-level tests and 44 subtests in 13.93 seconds, with the real mission-science integration enabled. Four optional relay, rover and legacy orbital live-integration tests were skipped in this run because their services were outside this validation session.

TypeScript compilation and the production build succeeded. Production prerendering generated 35 pages. The build emits its existing Vite JSON-import compatibility warning.

Browser verification uses the actual frontend in Edge and the native Go and Python services. The final production preview also automatically evaluated CR1, downloaded the Markdown brief, and preserved its exact scenario ID, UTC start, 2 m observer height, full scientific response and kernel/DEM identities. A supported mission automatically requests scientific results, a date slip issues a new scenario request, and Apollo 11 displays unsupported capability. The browser delayed the earlier mission response by six seconds, changed the date and verified that pending metrics were cleared and the late response could not replace the new scenario. Stopping the actual Python service produced an unavailable state with cleared metrics. Restarting it and using Re-evaluate mission recovered the computed result. Browser percentages matched the actual API fractions, and the Add-ons baseline retained the same scenario identity.

To reproduce the full frontend suite with real services, set VITE_PLANNER_LIVE_URL to the running Go origin, such as http://127.0.0.1:8080, and run pnpm test from frontend. Without that variable, three live integration cases are skipped and the deterministic tests remain available.
