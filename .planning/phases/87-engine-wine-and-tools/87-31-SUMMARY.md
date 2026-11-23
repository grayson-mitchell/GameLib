---
phase: 87-engine-wine-and-tools
plan: 31
subsystem: wine
tags: [rust, dxmt, online-shim, d-06, d-17, ownership-switch, boot-task, rustinvoke]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the DXMT crate port with its hooks, the bounded boot task and EngineCtx.online with op engine_set_online, all unwired (87-30); the wine manager and the gap its install and remove opened (87-20)
provides:
  - RUST_ENGINE_SET_ONLINE (rustInvoke channel `engine_set_online`) with a strict zod tuple, generated contract and a shell arm in engine_dispatch.rs, and the shim `setEngineOnline` in enginewine/engineOnline.ts, called from the boot's online-monitor step
  - DXMT owned by Rust from one commit: manager::install and manager::remove call dxmt::on_wine_installed and dxmt::on_wine_uninstalled, `wine_releases_info_ready` starts the bounded boot task once per run and calls the new op `wine_dxmt_releases_info` (dxmt::on_releases_info) after that, and bootstrap.ts no longer registers the TS DXMT listeners
affects: [87-32, 87-56, 87-58, 98]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

plan_head_before: 080b4c61ae5a710c365933cfdbb6b81cfbe4fb09
plan_head_after: ce69925d11a1f7d544950e27b12dd254621abac4

tech-stack:
  added: []
  patterns:
    - "write-through shim: the TS monitor stays the probe and sends one typed call per status change, attached before start() so the first reading is not missed and no timer or handle is created"
    - "one once-flag per run in the shell for the boot task, injected into the function that uses it so a test drives its own"
    - "a recording scan that fails every bundle lets a golden harness see that a hook ran without changing what the golden compares"

key-files:
  created:
    - src/backend/enginewine/engineOnline.ts
  modified:
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/wine_dispatch.rs
    - src-tauri/crates/gamelib-wine/src/lib.rs
    - src-tauri/crates/gamelib-wine/src/manager/install.rs
    - src-tauri/crates/gamelib-wine/src/manager/remove.rs
    - src-tauri/crates/gamelib-wine/src/tools/dxmt.rs
    - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs
    - src/backend/sidecar/bootstrap.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/sidecar/__tests__/onlineMonitorWiring.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/bootSourceShape.test.ts

key-decisions:
  - "The boot task starts from the first wine_releases_info_ready of a run, not at context install: spawn_dxmt_boot_update needs the feed's DXMT tag (87-30 deviation), and the only source of it is that payload, which is also what the TS boot fetch ran on. Later calls are the listener (on_releases_info through op wine_dxmt_releases_info), so both entry points have a production caller and exactly one of them runs per call"
  - "The install hook runs in install() after the notification and the closing idle progress, not inside the extraction as the TS event did, so the user is not held on a DXMT download; it is awaited, so the op answers after DXMT finished (a staging install's rpc caller waits for the -DXMT copy, which a launch wants anyway)"
  - "The hook's error is logged as DxmtError's category word and the install outcome stands, matching the TS listener's unhandled rejection; wine_dxmt_releases_info likewise swallows into null"
  - "a Wine-Staging-macOS always installs to <tools>/wine, so the hook takes that folder without calling install_dir_for again (which creates directories and logs)"
  - "the online listener swallows a rejected engine_set_online call: Rust keeps its last value and the next change corrects it"

patterns-established:
  - "a TS source gate (bootSourceShape) that pins the absence of a moved wiring, over comment-stripped source"

requirements-completed: [SVC-02]

duration: 13min
completed: 2026-11-23
---

# Phase 87 Plan 31: Online-state shim and the one-commit DXMT switch Summary

**The sidecar's online monitor now writes its status through to `EngineCtx.online` over `engine_set_online`, and DXMT changed owner in a single commit: the wine manager calls its install and remove hooks, `wine_releases_info_ready` starts the bounded `wine-dxmt-boot` task once per run, and the TS `registerDxmtListeners` boot wiring is gone, closing the gap 87-20 opened.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-23T09:33:00Z
- **Completed:** 2026-11-23T09:46:00Z
- **Tasks:** 2 of 2
- **Files:** 1 created, 17 modified

## Accomplishments

- **Tracer (Task 1):** `RUST_ENGINE_SET_ONLINE` is a strict `{ online: boolean }` tuple; `gen:ipc-contract` produced the channel and `EngineSetOnlineArgs`. `engine_dispatch::rpc_engine_set_online` decodes (the generated decode ignores a second key, so the arm also refuses one), then drives the crate's `engine_set_online` through `dispatch_sync`; before install it answers `engine_set_online:not-ready`. In the boot's `online-monitor` step one `onConnectivityChange` listener is attached before `start()`, so the monitor's first status (`check-online`, not online) and every later change reach Rust, and the call is `void`ed with a swallowed rejection. No timer, watcher or handle is created. Schedule row `setEngineOnline` (shim, caller bootstrap.ts, deletedBy 98). The wiring test boots with a controllable monitor and sees frames `[true, false, false]` for online, offline, check-online.
- **Task 2 (one commit):** `manager::install` calls `dxmt::on_wine_installed` after a successful Wine install (after the stored entry, the `Installation Finished` notification and the closing `idle`), `manager::remove` calls `dxmt::on_wine_uninstalled` with the stored entry when its directory was removed, `wine_releases_info_ready` starts `spawn_dxmt_boot_update(ctx, info, DXMT_BOOT_BOUND)` on its first call of a run and calls the new crate op `wine_dxmt_releases_info` (`on_releases_info`, errors logged by category, answer `null`) on later ones, and `bootstrap.ts` drops the import and the `registerDxmtListeners(...)` call. `bootstrapWirings` expects two `releasesInfoReady` registrations instead of three; `bootSourceShape` now pins that no DXMT boot wiring returns.
- **Gap closed:** `golden_wine_manager` asserts the hooks: `install-checksum-absent` (Mac, Wine-Staging-macOS) asks the export gate about `<tools>/wine/Wine-Staging-macOS-9.21` and no other case reaches it; a staging removal takes its `-DXMT` copy with it and a Proton removal leaves a `-DXMT` sibling alone. All 17 install and remove cases and all refresh cases still match the TS goldens unchanged, because the harness's scan fails every bundle (nothing fetched, nothing copied).

## Task Commits

1. **Task 1 (tracer): setEngineOnline writes the sidecar online monitor through to EngineCtx.online** - `06bf34c19` (feat)
2. **Task 2: DXMT ownership moves to Rust in one commit and closes the wine-install gap** - `ce69925d1` (feat)

## Verification

- Task 1 verify chain: `jest` over `engineWineShimSchedule`, `bootstrap`, plus `onlineMonitorWiring`, `tauriShellSource`, `rustInvokeSchemas` all pass; `cargo test --bin gamelib-shell engine_dispatch` 21 passed (incl. two new set-online arm tests); `rustfmt --edition 2021 --check` on rust_dispatch.rs and engine_dispatch.rs clean; `pnpm check:ipc-contract` up to date; `pnpm codecheck` clean; prettier clean over the TS paths written.
- Task 2 verify chain: `grep -v '^\s*//' bootstrap.ts | grep -c registerDxmtListeners` = 0; `cargo test -p gamelib-wine --features testing` all suites pass (130 unit, `golden_wine_manager` 9, `golden_dxmt` 9); `cargo test --bin gamelib-shell` 820 passed (32 in `wine_dispatch`, incl. two new: the once-flag and the arm's decode-before-context); `cargo fmt -p gamelib-wine --check`, `rustfmt --edition 2021 --check src/wine_dispatch.rs` and `cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings` clean; `jest` over `src/backend/sidecar`, `__tests__`, `tools`, `enginewine`: 245 suites, 6255 tests pass; `pnpm codecheck` clean; `pnpm build:sidecar` then `pnpm smoke:exit-check -- --mode eof`: PASS (exit latency 8 ms, no survivors); prettier clean over the three TS paths.
- Acceptance: `grep -c setEngineOnline bootstrap.ts` = 2 (>= 1); `on_wine_installed` in install.rs and `on_wine_uninstalled` in remove.rs both >= 1 (calls, not comments, asserted by the golden).
- Red before green: the two new golden tests failed (`the DXMT gate left: []`, the copy still present) before the hooks existed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The boot task needs the releases payload, so it starts from the first `wine_releases_info_ready`**
- **Found during:** Task 2
- **Issue:** the plan says wine_dispatch starts `spawn_dxmt_boot_update(ctx, DXMT_BOOT_BOUND)` after both contexts install, but 87-30 changed the signature to take the feed's DXMT tag, which exists only in the `releasesInfoReady` payload (the event the TS boot fetch ran on). A start at install time has no tag.
- **Fix:** `wine_dispatch::dxmt_on_releases_info` starts the task on the first call of a run (once-flag, injected for the test) and the later calls are the listener. DXMT still has one owner at every commit, and its boot work is bounded with a registrant (T-87-76).
- **Files modified:** `src-tauri/src/wine_dispatch.rs`
- **Commit:** `ce69925d1`

**2. [Rule 3 - Blocking] A crate op for the listener entry point**
- **Found during:** Task 2
- **Issue:** the shell's rpc arms run outside a runtime and can only reach async crate code through an op; `on_releases_info` had none. `releases.rs` (listed in the plan's files) did not need to change.
- **Fix:** added `wine_dxmt_releases_info` to the crate's `OPS` and route (lenient one-object decode, errors logged by category, answers `null`), with a unit test.
- **Files modified:** `src-tauri/crates/gamelib-wine/src/lib.rs`
- **Commit:** `ce69925d1`

**3. [Rule 1 - Bug] The generated decode ignores unknown keys**
- **Found during:** Task 1
- **Issue:** `EngineSetOnlineArgs::from_args` accepts `{online, extra}`, so a test that expected `bad-args` got `not-ready`.
- **Fix:** the shell arm refuses any object that is not exactly one key.
- **Commit:** `06bf34c19`

**4. [Rule 1 - Documentation drift] Stale module and function docs**
- `dxmt.rs` still said "Crate-only, nothing calls these yet" and that nothing starts the boot task; rewritten. `bootSourceShape` had no DXMT expectation to update, so a gate was added instead.
- **Commit:** `ce69925d1`

### Notes (not deviations)

- The install hook is awaited inside `install()` after the user-visible notification; the TS event ran detached. The rpc answer of a Wine-Staging-macOS install therefore waits for the DXMT fetch and copy (offline it skips at once). The plan's `install` takes `&WineCtx`, so a detached task was not an option without reshaping the ctx.
- `type: execute` plan with `tdd="true"` on Task 2: the red run (two failing golden tests) was observed but not committed separately, as in 87-30, so the tree stays compilable.

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug) plus 1 documentation note
**Impact on plan:** all required to wire the 87-30 signature; no scope creep, and `src/backend/tools/dxmt.ts` stays (its tests and the TS oracle still import it; Phase 87's later plans own its removal).

## Issues Encountered

The online flag reaches Rust over the same stdin frame stream as the releases payload, and the monitor's `online` event fires before the feed answers, so the DXMT boot update normally sees `online = true`. If the first feed read ever beat the first `engine_set_online`, the boot update would log `App offline, skipping possible DXMT update.` and the next `releasesInfoReady` would retry through the listener path. 87-58 re-checks the live ordering.

## Known Stubs

None.

## Threat Flags

None. `engine_set_online` carries one boolean from the sidecar (T-87-75, mitigated as planned: strict decode, gates only Rust-initiated fetches); the boot task is bounded with a registrant and starts once (T-87-76).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-32 (winetricks in the crate) can proceed; nothing here changes its inputs.
- 87-56 deletes the TS DXMT module together with the engine TS; the schedule row `setEngineOnline` is `deletedBy: 98`.
- 87-58 should re-check at the candidate head that a Wine-Staging-macOS install on a real Mac produces its `-DXMT` copy and that the first `releasesInfoReady` logs one `DXMT boot update: <word>` line.

## Self-Check: PASSED

- FOUND: engineOnline.ts (created); engine_dispatch.rs, rust_dispatch.rs, wine_dispatch.rs, gamelib-wine lib.rs, install.rs, remove.rs, dxmt.rs, golden_wine_manager.rs, bootstrap.ts (modified)
- FOUND: `06bf34c19`, `ce69925d1` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
