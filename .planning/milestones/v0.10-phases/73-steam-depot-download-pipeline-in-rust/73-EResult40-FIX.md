# 73 EResult-40 parity fix (ad hoc, before plan 73-16)

Operator decision: "Fix to match TS". Not a plan; no SUMMARY.md by design.

## EResult-40 parity fix (pre-73-16)

### What changed

TS spec: `buildDepotPlan` (plan.ts) skips a depot when Steam refuses its key or its manifest with eresult 40, records it in `skippedDepots`, and `throwIfAllDepotsSkipped` fails the whole plan (eresult 40, depotBlocked copy) when nothing is left. The key half was already in `buildDepotRefs` (73-13). This fixes the manifest half on the Rust path.

Chosen route: carry the eresult through the request-code callback (the 40 comes from steam-user `getManifestRequestCode`, the call getRawManifest makes internally).

- `requestCodeRefresher` (install.ts): rethrows only a literal `eresult === 40`; every other failure is still `null`.
- `depotManifestRequestCode` handler (depotHostRegistration.ts): answers `{eresult: 40}` for that rejection, `null` otherwise.
- shell `ShellJobHost::manifest_request_code` (depot_dispatch.rs): `{eresult: 40}` becomes `Err("eresult:40")` (`reply_to_code`).
- crate `fetch.rs`: `request_code_from_node` turns that marker into a `manifest_unavailable` failure with `eresult: 40`; any other host error still degrades to "no code". No new error kind, so ERROR_KINDS and the D-09 parity test are unchanged.
- crate `download.rs` (install, verify_only and select_files share it): that failure drops the depot and the job continues; skipped ids are recorded in new `Outcome.skippedDepots`. If every depot is dropped the job fails before any chunk or ACF with `manifest_unavailable`, eresult 40, and the message byte-identical to plan.ts's all-blocked error (it is embedded in the UI copy).
- crate `manifest.rs` summarize: skips blocked depots (`SummarizeResult.skippedDepots`); all blocked is the same failure.
- Four consumers:
  1. Native install (install.ts): `skippedDepots = refs.skippedDepots + outcome.skippedDepots`; all blocked leaves it undefined like the TS throw; all-blocked error classifies identically (message and action).
  2. Prescreen (secondary.ts): screens the remaining depots (logs the skip); all blocked resolves `unknown`, as the TS throw does.
  3. Resume (secondary.ts): partial skip finalizes in Rust for the remaining depots. All blocked previously returned normally with no ACF (the "1026 fallback" in the 73-14 note did not actually trigger on an error outcome); `resumeVerifyRust` now rejects on `status: error` with no ACF so resume.ts writes the honest-empty 1026, as the TS plan-build throw does.
  4. originalRestore (secondary.ts): partial skip gives `done` with no files for a path in the blocked depot (TS `not-in-depot`); all blocked gives the TS error status and message instead of `download-failed`.
- Types: `RustOutcome.skippedDepots`, `RustSummarizeResult.skippedDepots`; stub and fixtures updated. Default flag stays `ts`.

### Commits

- 241f9b89c fix(73): skip depots Steam refuses with EResult 40 in the Rust crate
- Second commit (TS consumers, message parity, this doc and STATE.md): see `git log` for `fix(73): honour skipped EResult-40 depots on the TS side of the rust pipeline`.

### Test evidence

- `cargo test -p gamelib-depot`: all green, including the Tier-1 golden (`expected.json` untouched). New: `blocked_manifest_skips_that_depot_and_installs_the_rest`, `blocked_every_depot_fails_with_eresult_40_and_downloads_nothing` (asserts the exact message), `non_blocked_node_error_still_fails_the_job` (job_install.rs); `summarize_skips_a_blocked_depot_and_reports_it`, `summarize_with_every_depot_blocked_fails_with_eresult_40` (manifest.rs). FakeHost gained `with_blocked`.
- `cargo test -p gamelib-shell request_code_reply`: passes. `cargo +1.99.1 clippy -p gamelib-depot --all-targets -- -D warnings` clean; shell clippy ratchet shows only the known pre-existing `needless_range_loop`.
- jest (`rustInstall`, `rustSecondary`, `depotHostChannels`): new cases per consumer (install partial and all-blocked, prescreen partial and all-blocked, restore partial and all-blocked, resume partial and all-blocked, refresher, handler). `tsc`, eslint (0 errors) and prettier clean on touched files.
- Full `jest src/backend/storeManagers/steam src/backend/sidecar src/backend/__tests__`: 4 failures. Two are the known `macArchKnownFixRouting` and `tauriShellSource` WR-07. Two others were NOT caused by this change and are not in deferred-items.md: `steamAuthSessionPolicy` Rule E (acquireAuthenticated allow-list lacks depotRust/install.ts and secondary.ts, from 73-13/14) and `dialogOptionForwarding` (UNBOUNDED_RUST_CHANNELS now includes RUST_DEPOT_JOB_RUN, from 73-11). Left unfixed (out of scope); plan 73-16 or a follow-up should update those two allow-lists.
