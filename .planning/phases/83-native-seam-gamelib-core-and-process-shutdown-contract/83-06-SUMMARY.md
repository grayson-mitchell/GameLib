---
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
plan: 06
subsystem: infra
tags: [rust, tauri, native-router, send-kind, slice-queue, openExternalUrl, url-crate, ipc-contract]
status: complete

requires:
  - phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
    provides: NativeRouter and nativeChannels.json (83-03), gamelib_core::shutdown (83-02), snapshot / one-owner / PortComplete gates (83-05)
provides:
  - openExternalUrl served in Rust: manifest entry, parse_open_external_url (8192 UTF-16 cap, url::Url::parse, existing scheme allow-list), no sidecar fallback
  - NativeHost / AppNativeHost, NativeSendJob, SliceQueue, spawn_slice_worker (one native-send-<slice> std thread, shutdown Registrant per job, catch_unwind), NativeRouter::route_send and send_validator
  - sidecar_send consults the router right after the allow-list verdict and returns on any outcome
  - typing-only NativeSync; openExternalUrl TS registration, zod entry and tests deleted
  - open_external removed from generate_handler! (no longer webview-reachable)
affects: [every later native send slice (inherits the FIFO queue), 83-07..83-11]

actuals:
  tokens: 14000
  tasks: 3
  commits: 5
plan_head_before: 20c608eb4f5b54d4ede802b63ae47b53a679d53e
plan_head_after: ee32337cb18af243279145ce9fc10928083bb9b4

tech-stack:
  added: ["url 2 (direct dependency; 2.5.8 already in Cargo.lock, no new lockfile name)"]
  patterns:
    - "One ordered std worker thread per slice for native sends; sidecar_send only validates and enqueues"
    - "A potentially blocking OS call runs on its own short-lived thread handed off by the handler, never on the slice worker"
    - "Rust positional args as a real tuple (String,) for one-arg channels: a one-field tuple struct is a serde newtype and takes the whole array"

key-files:
  created: []
  modified:
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/native_handlers.rs
    - src-tauri/src/relay_commands.rs
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/capabilities/default.json
    - src/common/types/ipc/shellFiles.ts
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/index.ts
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/shellFilesFlowRegistration.ts
    - src/backend/sidecar/openPolicy.ts
    - src/frontend/helpers/externalLinkClicks.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/shellFiles.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts

key-decisions:
  - "The blocking-open hand-off lives in native_handlers::open_external_url (it spawns the short-lived native-open-url thread), not inside AppNativeHost::open_url as the plan wrote it: a fake host can then prove the worker is not stalled, which the plan's own test requires"
  - "spawn_slice_worker takes the Shutdown as a parameter (no global-only wrapper) so tests never cancel the process-wide token and no unused wrapper trips dead-code"
  - "route_send takes &[Value], not Vec<Value>: sidecar_send needs args back for the sidecar path when the channel is not native"
  - "open_external is kept as a plain shell-internal helper (no #[tauri::command], not in generate_handler!) because the store embed's popup/download paths and the macOS Epic embed call it directly; deleting the function, as the plan assumed possible, would have broken those callers"
  - "A send channel needs `returns` in the manifest (parseNativeManifest requires a string): openExternalUrl declares \"void\""

patterns-established:
  - "Opener threads race: two quick openExternalUrl sends are dispatched in FIFO order but their OS opener calls are not ordered against each other"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "openExternalUrl is validated and opened by Rust off the main thread through one FIFO slice queue; the sidecar no longer knows the channel; a bad send is dropped with Ok(()) and a channel-name-only log"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "src-tauri/src/native_router.rs#tests (a_valid_open_external_url_reaches_the_host_on_the_opener_thread, a_file_url_is_dropped_with_ok_and_never_reaches_the_host, native_manifest_vectors_valid_accept_invalid_reject, native_router_send_keys_equal_generated_native_send_set); cargo test --bin gamelib-shell native_ (38 passed)"
        status: pass
      - kind: unit
        ref: "nativeChannelOwnership, nativeSeamPortComplete, ipcDomainCensus, ipcSchemaCoverage, flowRegistrationCensus jest suites; pnpm check:ipc-contract"
        status: pass
    human_judgment: true
    rationale: "The sidecar_send early return (route_send before the SidecarSendQueue path) and the real AppNativeHost opener are asserted by reading; no test builds an AppHandle or drives a real renderer send"
  - id: D2
    description: "Queue guarantees: 50 jobs dispatch in order, enqueue never waits on a blocked handler, a failed or panicking job does not stop the next, a native queue and the sidecar send queue each keep their own order, a blocked open_url does not stall the next URL, the worker holds a shutdown Registrant only while a job runs and drops jobs after cancel"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "native_router.rs#tests (slice_queue_runs_fifty_jobs_in_enqueue_order, slice_queue_enqueue_does_not_wait_for_a_blocked_handler, slice_queue_keeps_going_after_a_failed_job, slice_queue_keeps_going_after_a_panicking_job, a_native_queue_and_the_sidecar_send_queue_each_keep_their_own_order, a_blocked_open_url_does_not_stall_the_next_open_external_url, the_worker_holds_a_registrant_only_while_a_job_runs_and_drops_jobs_after_cancel)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Validation parity with the old TS path: every openPolicyCases urlCase gets the same verdict; 8192 UTF-16 units pass and 8193 fail; the cap counts UTF-16 units, not bytes or chars; a surrogate pair spanning units 8192/8193 fails; https:// and http://exa mple.com are unparseable; mailto: parses; the error is a fixed category, never the URL"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "src-tauri/src/native_handlers.rs#tests (8 tests); canParse results recorded against Node 24 URL.canParse"
        status: pass
    human_judgment: false
  - id: D4
    description: "open_external is no longer reachable from the webview (removed from generate_handler!); capabilities and the main.rs header name three app-defined relay commands; the scheme allow-list is unchanged"
    requirement: FND-03
    verification:
      - kind: unit
        ref: "tauriConf.test.ts, tauriShellSource.test.ts (only the 3 known CRLF failures), cargo test --bin gamelib-shell (open_external_scheme_check_* and open_external_command_body_calls_the_scheme_check_before_opening pass)"
        status: pass
    human_judgment: false
---

# Phase 83 Plan 06: openExternalUrl served in Rust, FIFO slice queue Summary

**The router's send kind is proven on a real channel: `openExternalUrl` is validated (8192 UTF-16 cap, `url::Url::parse`, the existing scheme allow-list) and opened by Rust through one FIFO worker thread per slice, never the main thread, with its TS registration and zod entry deleted and `open_external` no longer reachable from the webview.**

## Performance

- **Duration:** about 19 min of wall clock by the shell clock (2026-11-20T09:55:51Z to 10:14:37Z)
- **Tasks:** 3 (task 1 tracer, task 2 TDD)
- **Files:** 0 created, 20 modified

## Accomplishments

- `parse_open_external_url` in `native_handlers.rs`: args decode as a real `(String,)` tuple, then `encode_utf16().count() > 8192` is `too-long`, `url::Url::parse` failure is `unparseable`, `open_external_scheme_check` failure is `scheme`. The `Err` is a fixed category literal, never the URL. The raw string is what gets opened, as before.
- `native_router.rs`: `NativeHost`/`AppNativeHost`, `SliceQueue`, `spawn_slice_worker` (named `native-send-<slice>`, `Registrant` held per job, queued jobs dropped once the token is cancelled, `catch_unwind` per job), `NativeRouter::new(Arc<dyn NativeHost>)` with a send table, `route_send` (None for a non-native channel; invalid args are dropped, logged as `[shell] native send rejected: openExternalUrl`, and answer `Ok(())`), `send_validator`.
- `sidecar_send` takes `State<NativeRouter>` and returns `route_send`'s outcome right after `relay_channel_verdict`; nothing falls back to the sidecar (D-04). `run_setup` constructs the router with `AppNativeHost(app.handle().clone())`.
- TS: `openExternalUrl` removed from `shellFilesSyncArgs`, its registration and the `assertOpenableExternalUrl` import (the function stays for `openWebviewPage`), the three zod/flow tests; `NativeSync` added to `native.ts` and `SyncIPCFunctions`; `flowRegistrationCensus` shellFiles send 11 to 10, module docstrings re-counted (13 of 22; 3 invoke + 10 send) and the CHANNEL_KINDS count 14 to 13. `pnpm gen:ipc-contract` regenerated `ipc_contract.rs` (`NATIVE_SEND_CHANNELS` now has the channel) and the snapshot (owner native).
- `url = "2"` is a direct dependency; `Cargo.lock` only gains `"url"` in the shell package's own dependency list (the crate was already locked at 2.5.8). `cargoFeatures.test.ts` is unchanged and green.
- `open_external` is out of `generate_handler!` and carries no `#[tauri::command]`; `main.rs` header and `capabilities/default.json` say three relay commands; `OPEN_EXTERNAL`'s doc says it is the sidecar frame's channel name.

## Task Commits

1. **Task 1 (tracer): manifest, Rust validation and slice queue, sidecar_send insertion, TS deletions** - `456600895` (feat)
2. **Task 2 RED: queue liveness and validation parity tests** - `3f95398f3` (test)
3. **Task 2 GREEN: panic-proof worker, opener hand-off thread, manifest vectors, stale comments** - `c4eac18aa` (feat)
4. **Test fix: blocked-opener test no longer assumes opener thread order** - `31fbf873e` (fix)
5. **Task 3: open_external no longer a Tauri command** - `ee32337cb` (refactor)

`plan_head_before..HEAD` measures 5 commits, all this plan's. Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the tracer's cargo, check:ipc-contract, jest, codecheck, find-deadcode and prettier checks were re-run end to end before expansion and passed; no checkpoint.

## TDD Gate Compliance

Task 2 is `tdd="true"`. RED commit `3f95398f3` ran 38 `native_` tests: the two target tests failed on assertion for the planned behaviour (`slice_queue_keeps_going_after_a_panicking_job`: the worker died with the panic and the next job never ran; `a_blocked_open_url_does_not_stall_the_next_open_external_url`: the second URL never reached the host). The other new tests (FIFO, non-blocking enqueue, failed job, interleave, shutdown, the eight validation-parity tests) passed on arrival, because the plan's Task 1 tracer already implements the queue and the cap; they are characterization tests of that code, not a RED proof. GREEN `c4eac18aa` made both pass. No formal `check tdd-red-evidence` record was written (the plan is `type: execute`, not `type: tdd`).

## Decisions Made

See `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `returns` is required in a manifest entry**
- **Found during:** Task 1
- **Issue:** the plan's manifest entry for `openExternalUrl` has no `returns`; `parseNativeManifest` refuses an entry without a string `returns`.
- **Fix:** added `"returns": "void"`.
- **Files modified:** src/common/types/ipc/nativeChannels.json
- **Commit:** 456600895

**2. [Rule 1 - Bug] one-field tuple struct is a serde newtype**
- **Found during:** Task 1
- **Issue:** the plan says to decode through "a one-field positional args type"; a derive on a one-field tuple struct is a newtype struct and receives the whole array, so every valid URL was rejected.
- **Fix:** the args type is a real tuple `(String,)`, which reads exactly a one-element array. Recorded as a pattern above.
- **Files modified:** src-tauri/src/native_handlers.rs
- **Commit:** 456600895

**3. [Rule 1 - Bug] the plan's hand-off design cannot satisfy its own test**
- **Found during:** Task 2 RED
- **Issue:** the plan puts the short-lived opener thread inside `AppNativeHost::open_url`, but its behaviour test uses a fake host whose `open_url` blocks forever and expects the next URL to still arrive. With the thread inside the host, a blocking fake stalls the worker and the test could not pass.
- **Fix:** `native_handlers::open_external_url` spawns the `native-open-url` thread and calls `host.open_url` on it; `AppNativeHost::open_url` calls the plugin inline. The Task 1 test that asserted the opener ran on `native-send-app-shell` now asserts `native-open-url` and not the caller's thread.
- **Files modified:** src-tauri/src/native_handlers.rs, src-tauri/src/native_router.rs
- **Commit:** c4eac18aa

**4. [Rule 1 - Bug] `open_external` has live Rust callers; the function is not deleted**
- **Found during:** Task 3
- **Issue:** the plan calls the command unused and says to delete the function. `store_embed/open.rs` calls `open_external(...)` four times (popup, navigation, download hand-offs) and `macos_epic_embed/nav_delegate.rs` calls `crate::open_external(...)` twice. Deleting it would break those callers (the macOS ones cannot be compiled here).
- **Fix:** the `#[tauri::command]` attribute and the `generate_handler!` entry are removed, which is the D-17 goal (the webview can no longer reach it); the function stays as a documented shell-internal helper and its source-text guard test stays. Consequently two acceptance greps are intentionally not met: `grep -c "fn open_external(" relay_commands.rs` is 1 (plan: 0) and `grep -c "open_external_command_body_calls_the_scheme_check_before_opening" main.rs` is 2 (plan: 0). The scheme allow-list has three users (native channel, sidecar frame arm, this helper), not two.
- **Files modified:** src-tauri/src/relay_commands.rs, src-tauri/src/main.rs
- **Commit:** ee32337cb

**5. [Rule 1 - Bug] blocked-opener test was order-sensitive**
- **Found during:** Task 3 full `cargo test`
- **Issue:** the test asserted the blocked URL reached the host first, but each URL runs on its own opener thread, so either order is possible (it failed in 1 of 4 full runs).
- **Fix:** the host blocks by URL and the test asserts both URLs arrive while one is blocked, in either order. Stable over 4 full runs.
- **Commit:** 31fbf873e

**6. [Naming/shape] `spawn_slice_worker` takes the `Shutdown`; `route_send` takes `&[Value]`**
- The plan sketches `spawn_slice_worker(slice, handler)` and `route_send(&channel, args: Vec<Value>)`; the shipped shapes are in `key-decisions`.

**Total deviations:** 6 (4 bugs, 1 blocking, 1 shape). **Impact:** deviation 4 changes a plan deliverable (the function stays) and leaves two acceptance greps unmet by design; the rest are behaviour-preserving.

## Issues Encountered

Pre-existing Windows-local failures, none caused by this plan (listed in `deferred-items.md`): 3 `tauriShellSource` tests and 2 Rust twins (CRLF `main.rs`), `shellFilesFlows` `checkDiskSpace` (POSIX `df` fake) and `resetHeroic` (EPERM renaming `gamelib.log`). The darwin clippy ratchet (`cargo +1.99.1 clippy` plus `meta/clippyRatchet.cjs`) was not run locally; `cargo clippy --bin gamelib-shell --all-targets` reports nothing in the three Rust files this plan touched. Confirm the ratchet on CI or the Mac.

Observation for later slices: two quick `openExternalUrl` sends are queued FIFO but each opener call runs on its own thread, so their OS-level opens are not ordered against each other. The one flow that sends it twice in a row (`DialogHandler` vcRuntimeDownload) sends the same channel back to back and is unaffected in practice.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-83-17: scheme allow-list, `url::Url::parse` and the UTF-16 cap, checked against the shared `openPolicyCases.json` and the manifest vectors, with no fallback. T-83-18: `sidecar_send` only validates and enqueues; blocked-handler and blocked-opener tests prove it. T-83-19: rejection logs carry the channel name only; the opener failure line is fixed. T-83-20: the webview-reachable `open_external` command is gone from `generate_handler!`. T-83-21: the snapshot drift check, two-owner refusal and `nativeSeamPortComplete` all ran green on this move. T-83-SC: `Cargo.lock` gains no package.

Prohibition checks: no sidecar fallback exists for `openExternalUrl` (`route_send` returns before the relay path); nothing the old TS path refused is opened (policy cases, 8193, surrogate pair, `https://`, `file:`, `javascript:` all dropped).

## Next Phase Readiness

Ready for 83-07: a later native send adds a manifest entry, a validator and a match arm in `run_send_job`, and inherits the queue. `NativeKind` is still unused (`#[allow(dead_code)]`).

## Self-Check: PASSED

- No file was created; every modified file is in `git diff --name-only plan_head_before..HEAD`.
- Commits found: 456600895, 3f95398f3, c4eac18aa, 31fbf873e, ee32337cb.
- Acceptance re-run: `ipc.on('openExternalUrl'` 0; `openExternalUrl` in shellFiles.ts 0; `^url =` 1; `route_send(` in relay_commands.rs 1; `encode_utf16` in native_handlers.rs 1; `export function assertOpenableExternalUrl` 1; `openPolicyCases.json` 1 (native_handlers.rs); `catch_unwind` 2; `native_router` in externalLinkClicks.ts 1; `pub(crate) fn open_external_scheme_check` 1; `export const OPEN_EXTERNAL = 'open_external'` 1; `open_external, sidecar_store_snapshot` in capabilities 0; `^ +open_external,` in main.rs 0. Not met by design: `fn open_external(` 1 and the guard-test name 2 (deviation 4).
- Plan verification: `cargo test --bin gamelib-shell` 512 passed, 2 failed (pre-existing CRLF), stable over 4 runs; `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode`, `pnpm backend-di-ceilings`, rustfmt on the four Rust files, prettier on every written path (each confirmed not ignored) pass; the nine named jest suites pass (226 passed, 18 skipped) apart from the pre-existing tauriShellSource and shellFilesFlows Windows failures above.
