# Rover prototype limitations

A computed cell is reachable under the submitted simplified model. Operational safety remains unvalidated. The response explicitly excludes battery state of charge, thermal survival, wheel-soil interaction, detailed traction, hazards below DEM resolution, navigation and autonomy, antenna pointing, RF link budgets and ground-station guarantees.

The domain is deliberately limited to at most nine cells and two hours. Exhaustive time-expanded evaluation is deterministic within these bounds. No path, construction corridor, global optimum or arbitrary-area route is delivered. Null cells preserve missing DEM or unsupported slope coverage. Reachability is conditional on the known terrain graph.

Actual LOLA interpolation and 320 m slope footprints smooth local terrain. A sampled low slope does not establish traversability for a real rover. Two-segment edge distances omit unresolved surface roughness. Midpoint checks can miss additional terrain obstructions. All time-dependent conditions are sampled, and substep grazing events or outages can remain unresolved even though the underlying observer engine has refined-event capabilities. Rover feasibility uses sampled booleans.

Travel durations round upward independently on every edge. Finer spatial resolution can accumulate more rounding and change modeled arrival times. Refinement is not guaranteed to produce monotonic reachability. The fixed-domain synthetic test demonstrates 180 s versus 240 s corner arrival with the same 160 m Manhattan path when increasing edge count at a 30 s step. These outcomes are discretization effects requiring sensitivity reporting.

The default requires sunlight and direct geometric Earth visibility while moving and stopping. Relaxing stopping constraints allows waiting in darkness or disconnected conditions without any survival or energy assessment. Setting communication constraints false explicitly removes communication feasibility from the graph, and the result records this choice.

Mobile relay reachability is unsupported. The stationary replay comparison evaluates initial admission and waiting at a compatible canonical observer. It supplies no mobile range-extension evidence. Saved trajectories remain restricted to their verified epoch, frame, observer and profile. Source incompatibility yields unavailable assisted results and preserves a direct fallback where its computation succeeds.

The time budget is cooperative. One scientific evaluation or remote replay call can exceed the remaining deadline before control returns. Request size, graph size and operation counts are bounded. The single-request gate returns explicit unavailable responses for concurrent evaluation attempts. Process isolation and private cache avoid introducing rover readiness dependencies into existing services, while CPU, disk and memory remain shared host resources.

Real scenarios carry computed validation status with independentlyValidated false. Analytical graph fixtures and adapter consistency tests provide implementation checks. They do not establish independent physical validation of rover reachability. The proposed API is for team review and has no operational UI integration.
