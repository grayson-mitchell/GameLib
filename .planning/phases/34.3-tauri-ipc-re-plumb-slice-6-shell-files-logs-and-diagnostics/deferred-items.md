# Deferred Items — Phase 34.3 (Tauri IPC re-plumb slice 6)

## From plan 34.3-04

Full backend `npx jest` sweep (run as part of this plan's own verification) surfaced 3
pre-existing failures, none caused by this plan's files (`src/backend/logger/index.ts`,
`src/backend/sidecar/loggerFlowRegistration.ts`, `src/backend/sidecar/__tests__/loggerFlows.test.ts`,
`src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts`). Out of scope per the executor's
scope-boundary rule (pre-existing failures in unrelated files); not fixed here.

1. **`src/backend/sidecar/__tests__/rustInvokeChannel.test.ts`** — documented Phase 34.1-era
   baseline failure, unrelated to logger channels. Already tracked across multiple prior
   SUMMARYs in this phase (34.3-01, 34.3-03).

2. **`src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts`** ("unlink of folder
   fails") — environment-path-depth-dependent test bug (asserts an error message containing an
   absolute path whose depth varies by checkout location). Already documented in
   `34.3-01-SUMMARY.md` as confirmed pre-existing via `git stash`.

3. **`src/backend/__tests__/cargoFeatures.test.ts`** ("Cargo.lock crate-name set pin") — NEW
   finding, not previously logged. Fails because plan 34.3-03 added
   `tauri-plugin-clipboard-manager` (and its transitive deps: `arboard`, `clipboard-win`,
   `wayland-*`, `x11rb*`, etc.) to `Cargo.lock`, but `EXPECTED_LOCKFILE_CRATE_NAMES` in
   `cargoFeatures.test.ts` (an AR-34.1-07/FOLLOW-UP-1 supply-chain pin) was never updated to
   match. 34.3-03's own verification ran a *targeted* jest sweep (`tauriShellSource`,
   `tauriConf`, `longRunningChannels`, `lifecycleStub`), which does not include
   `cargoFeatures.test.ts`, so the gap was never caught. Fix direction: add the 27 newly-appeared
   crate names to `EXPECTED_LOCKFILE_CRATE_NAMES` after a supply-chain review of the new
   transitive dependency tree (all already slopcheck-verified as part of 34.3-RESEARCH.md's
   package legitimacy audit for `tauri-plugin-clipboard-manager` itself, but the *transitive*
   crates were not individually audited). Natural home: the next plan in this phase that touches
   `Cargo.lock`/supply-chain pins, or a standalone follow-up.
