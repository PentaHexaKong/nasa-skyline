# Option B implementation status

Implemented and scientifically tested within the supported replay scenario are the independent adapter, original geometry regressions, three full-window Candidate 2 replays, strict same-scenario comparison and missing/unsupported-data errors.

Implemented application components are the Go candidate discovery and comparison routes, advanced frontend section, request snapshot protection, immutable asset mounts and independent Compose service. The Go comparison uses both real local scientific services. Final frontend/Compose checks are appended below.

Desktop browser behavior and complete Compose execution are verified for the cases recorded in compose-validation.md. Arbitrary relay dates and sites, apparent-profile relay comparisons, RF-qualified availability and generalized orbit propagation are unsupported. The primary mission-science evaluator remains available for its existing supported requests.

Optional B4 is deferred. The inspected original runNsga2 and runPerturbedExperiment functions have explicit evaluation budgets, seeds and checkpoint support, but the adapter does not contain a validated isolated propagation/optimization job service, progress protocol, cancellation semantics or independent optimized-candidate acceptance pipeline. Existing orbital research is available for a separate future package adaptation. Running optimization in the read-only source tree would violate the repository boundary. No ML/RL authority is used.

The frozen INT-4 contracts and original scientific source files are unmodified. The supported regression scenario retains its original model limitations and epoch validity.
Verification: 18 adapter tests and 23 mission-science tests. The Go suite has 20 top-level tests, with one existing INT-4 live test skipped and zero failures. go vet, Compose configuration validation, the frontend production build, TypeScript checks and JavaScript syntax validation are clean.

Actual SPK and binary-PCK ET coverage windows are saved in results/kernelCoverageEt.json. Those kernel windows do not expand the validity of the saved trajectory scenario.

Complete-stack and rendered-browser verification is documented in [compose-validation.md](compose-validation.md).
