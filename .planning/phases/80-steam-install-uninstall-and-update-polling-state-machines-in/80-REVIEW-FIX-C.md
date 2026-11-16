---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
part: C (TS backend)
fixed_at: 2026-11-16
review_path: .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md
iteration: 1
findings_in_scope: 9
included_info: 1
fixed: 9
skipped: 1
status: partial
---

# Phase 80: Code Review Fix Report, Part C (TS backend)

**Fixed at:** 2026-11-16
**Source review:** `.planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-REVIEW.md` (Part C only)
**Iteration:** 1

**Summary:**

- **In scope:** 9 Warnings (C-WR-01 to C-WR-09), plus one Info item included on purpose: C-IN-04, the seq guard from the event-delivery theme. The other Info items are out of scope.
- **Fixed:** 8 of 9 Warnings (C-WR-01 to C-WR-08), plus C-IN-04.
- **Skipped:** 1 (C-WR-09). It needs a design decision; see below.
- **Frontmatter counts:** `fixed: 9` counts the 8 Warnings plus C-IN-04. `skipped: 1` is C-WR-09.

All commits are on `main`, fast-forwarded from an isolated worktree after a rebase onto `293cfe719` (another session had committed Phase 79 fixes in the meantime). Every fix has a regression test. Each new test was run against the pre-fix source and failed there, except where noted.

**Verification at the final tree:**

- `npx tsc --noEmit` is clean.
- **Jest** over `src/backend/storeManagers/steam`, `src/backend/sidecar`, `src/backend/gamedetails` and `src/common`: 7877 passed, 6 failed, 5 skipped. All 6 failures are pre-existing (see "Pre-existing failures").
- **gamelib-steampoll** (`--features testing`): `cargo test` passes, `cargo clippy --all-targets -D warnings` is clean, and `cargo fmt --check` is clean. `gamelib-steampoll-cli` tests pass.
- **Shell:** `cargo test --bin gamelib-shell` passes (477 passed, 2 ignored, the same count Part B reported). To satisfy tauri-build, the sidecar binary and `build/` were copied or symlinked from the main checkout and removed again; neither was committed.
- **Prettier:** `npx prettier --check` passes over every path written. `--file-info` was checked first, and every path reported `"ignored": false`, including the new JSON fixture.
- **ESLint:** 0 errors on the changed files, and no new warnings compared with the base. One `unbound-method` warning in a new test was found and fixed before merge.
- **IPC contract:** `pnpm check:ipc-contract` (run by the pre-commit hook) reported `ipc_contract.rs` as up to date on every commit. No channel argument shapes changed.

## Fixed Issues

### C-WR-01: Kill/stop of a Steam game now depends on a steampoll rustInvoke succeeding

**Files modified:** `src/backend/gamedetails/dispatch.ts`, `src/backend/storeManagers/steam/games.ts`, `src/backend/gamedetails/__tests__/gameDetailsModules.test.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** c711d0414
**Applied fix:**

- **`kill()`:** a rejected `isDelegatedInstallPolling` now counts as "not delegated", so `deps.aborts.call` and `stop()` still run. It is a try/catch, not `.catch`, because the module mock in the test returns a bare boolean.
- **`SteamGame.stop()`:** a rejected `cancelDelegatedInstall` is logged and falls through to the bridge route.
- **Tests:** one test per path, both run with the invoke rejecting.

### C-WR-02: The bridge install `finally` and `catch` await a rustInvoke

**Files modified:** `src/backend/storeManagers/steam/gameInstallBridge.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** 32c3c502c
**Applied fix:**

- **Finalized marker:** `setBridgeInstallFinalized` never rejects. That covers all three call sites: the success `finally`, `clearFinishing()`, and the reset before the download.
- **Bottle removal:** the two `stopInstallPolling` calls ahead of `removePerGameBridgeBottle` (win64-no-shim and CEG) go through a new best-effort helper, so the bottle is still removed.
- **Tests:**
  - A rejecting marker invoke still returns `done`, sends the final `done` and fires one toast.
  - A rejecting poll stop still removes the bottle.

### C-WR-03: Failure notices and post-handoff bookkeeping throw when steampoll is unreachable

**Files modified:**

- **TS:** `src/backend/storeManagers/steam/gameUninstall.ts`, `src/backend/storeManagers/steam/updateNative.ts`, `src/backend/storeManagers/steam/library/installPolling.ts`, `src/common/types/sidecarTransport.ts` (doc)
- **Crate:** `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`, `src-tauri/crates/gamelib-steampoll/src/dispatch.rs`, `src-tauri/crates/gamelib-steampoll/tests/dispatch.rs`
- **TS tests:** `src/backend/storeManagers/steam/__tests__/{updateNative,pollsRustBranch.install,pollsRustBranch.status,pollsRustBranch.uninstallRunning,games}.test.ts`

**Commit:** 68ad4227d
**Status:** fixed: requires human verification (the `done` ownership logic for updates changed)
**Applied fix:**

- **`noticeSeq` never rejects.** On a failed read it returns a local seq: the midpoint between the highest seq this process has seen and the next integer.
  - The frontend drops a seq that is older than or equal to the latest. The fallback is newer than everything handed out so far and is always below the next seq Rust will issue, so it never hides a later Rust notice.
  - The local seq is in-memory session state.
  - One limit remains: Rust issues its own notice seqs, which TS never sees. If both the read fails and Rust has issued a higher seq, the fallback notice can still be dropped. It no longer throws.
- **Uninstall hand-off:** the poll start after `steam://uninstall` and on the `steam-uninstalled` route is logged on failure, not reported as a failed uninstall. `clearPendingAdoption` still runs.
- **Update hand-off (the reviewer's suggestion):**
  - `steampoll_install_start` now returns a bool: whether the app's poll watches an update once the call returns. The crate reads it under the start's own lock, in a new additive `InstallPolls::start_install_reporting`; `start_install` keeps its signature.
  - `startInstallPolling` returns `Promise<boolean>`.
  - `updateRegisteredSteamGame` takes ownership from the start's answer and no longer makes the separate status read that could miss a poll that had already finished. `pollOwnsUpdate` is deleted.
  - A rejected start after the hand-off returns `done` with `handedOffToSteam: false`, not an error.
- **Behaviour note:** an upgrade that carries `awaitingUpdate` onto an existing poll reports true, because `upgrade()` adopts the update. This matches what the old status read returned.
- **Shell:** it passes the result through unchanged. The contract checks only args, and `ipc_contract.rs` did not change.

### C-WR-04: Unhandled promise rejections introduced by the port

**Files modified:** `src/backend/storeManagers/steam/steamLaunchedDeps.ts`, `src/backend/storeManagers/steam/library/uninstallPolling.ts`, `src/backend/storeManagers/steam/__tests__/pollsRustBranch.uninstallRunning.test.ts`
**Commit:** fd8699e62
**Applied fix:**

- **Running-poll claim:** `rustPollerHold` attaches the rejection handler when the claim is sent. A failed hold resolves to `null` and releases nothing.
- **Uninstall poll stop:** both fire-and-forget `stopUninstallPolling` calls in `pollUninstallOnce` now have a `.catch`. The round trip on direct paths is still there; C-WR-09 covers that pipeline.
- **Test:** an `unhandledRejection` listener sees nothing, and no release is sent.

### C-WR-05: The bridge-finalized check is read at tick observation, not at the send site

**Files modified:** `src-tauri/crates/gamelib-steampoll/src/effects.rs`, `src-tauri/crates/gamelib-steampoll/src/outbox.rs`, `src-tauri/crates/gamelib-steampoll/src/install_loop.rs`, `src-tauri/crates/gamelib-steampoll/tests/outbox.rs`, `src-tauri/crates/gamelib-steampoll/tests/install_loop.rs`
**Commit:** 30880a6ad
**Status:** fixed: requires human verification (timing logic, not live-tested)
**Applied fix:** this is the Rust fix the reviewer asked for. No TS changed.

- **New crate API (additive):**
  - `Continuation::refresh_bridge_finalized`, which re-reads the marker for an `Installed` continuation the installer owns.
  - `outbox::apply_effects_with(..., bridge_finalized: Option<&dyn Fn>)`, which calls that after the ack and right before the post-ack effects run. There is no await between that read and the status emit.
- **Install loop:** it passes a live read of its `bridge_finalized` set.
- **Unchanged paths:** `apply_effects` (uninstall and re-arm) keeps the snapshot path, and `resolve()` and its tests are unchanged.
- **Residual race:** a finalize that lands in the microseconds between the read and the emit is still possible. The installer's `done` has to travel sidecar → shell → webview after its invoke returns, so it cannot overtake in practice.
- **Tests:**
  - Applier level: the marker flips during a timed-out ack, and no finishing status follows.
  - Loop level: a real bridge poll with `AckMode::Never` and `set_bridge_finalized` at 4 s. This one fails on the old code.

### C-WR-06: Ordering of fire-and-forget mirror and claim invokes is no longer guaranteed

**Files modified:** `src/backend/storeManagers/steam/gameSessionState.ts`, `src/backend/storeManagers/steam/steamLaunchWatch.ts`, `src/backend/storeManagers/steam/steamLaunchedDeps.ts`, `src/backend/storeManagers/steam/__tests__/pollsRustBranch.status.test.ts`, `src/backend/storeManagers/steam/__tests__/steamLaunchWatch.test.ts`
**Commit:** db4d406f9
**Status:** fixed: requires human verification (ordering logic, not live-tested)
**Applied fix:**

- **In-flight mirror:**
  - `MirroredInFlightMap` sends its pushes on one promise chain, so each is sent only after the previous one settled. A rejected push does not stall the chain.
  - `clear()` is overridden to mirror every removed key.
- **Launch watch:**
  - `pollerHold` now returns a `PollerRelease`: the release function with an optional `held` promise. The Rust implementation sets it to the claim, which never rejects.
  - On win32 the watch waits for `held` before it reads the last app id and decides on `launching`. It sends nothing if it was cancelled or finished in the meantime.
  - Fakes without `held` keep the old synchronous behaviour, so the existing launch-watch tests are unchanged.
  - The stale "same synchronous turn" comment is rewritten.
- **Tests:** set → delete ordering, a rejected push not stalling the chain, `clear()`, launching waiting for the claim, and a watch cancelled before the claim lands.

### C-WR-07: `refreshInstallState` can reject mid-reconcile after partial writes

**Files modified:** `src/backend/storeManagers/steam/library/refresh.ts`, `src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts`, `src/backend/storeManagers/steam/__tests__/library.refresh.test.ts`
**Commit:** f5a680142
**Applied fix:**

- **One status read:** the reconcile reads `steampoll_status` once, inside the existing scan `try`, and shares it between the restart-hold filter and the active-poll set.
  - `withoutSteamRestartHolds` takes an optional known status. Its other caller, `rustRefresh.ts`, is unchanged.
  - A rejected status read now skips the reconcile before any entry is mutated.
- **Test:** a status read that fails on its second call. Old code made two reads and rejected; new code makes one and pushes.

### C-WR-08: The `steamPollStateEvent` schema is stricter than its producer and untested against it

**Files modified:**

- **Schema and handler:** `src/common/types/ipc/sidecarInternal.ts`, `src/backend/sidecar/steamPollEventRegistration.ts`
- **TS tests:** `src/backend/sidecar/__tests__/steamPollEventRegistration.test.ts`, `src/backend/sidecar/__tests__/steamPollStateEventParity.test.ts` (new), `src/backend/sidecar/__tests__/testContainment.test.ts` (classifies the new suite)
- **Crate:** `src-tauri/crates/gamelib-steampoll/tests/contracts.rs`, `src-tauri/crates/gamelib-steampoll/tests/fixtures/state-events.json` (new)

**Commit:** ffd108571
**Applied fix:**

- **Schema relaxed to what Rust emits:**

  | Field | Before | After |
  | --- | --- | --- |
  | `sizeOnDisk` | `numericId` | `z.string().max(256)` (raw ACF string; empty or non-numeric allowed) |
  | `buildid` | max 32 | max 256 (still nullable/optional) |
  | `installPath` | max 4096 | non-empty, max 65536 (a steamapps dir joined with a raw installdir) |

  The handler stores a non-numeric or empty SizeOnDisk as 0 bytes, never NaN.

- **`rearmSettled`:** acked at once, with the reconcile run detached and its failure logged. A slow boot reconcile can no longer time out its ack and be re-run every 10 s. Nothing in Rust waits on it, because its continuation is `None`.
- **Refusals:** the rule is documented in the handler header.
  - A refusal that retrying cannot change is answered `applied: true`.
  - A thrown apply, which may be transient, stays `applied: false`.
- **Wire parity (producer side):** the new crate test `state_event_wire_fixture_matches_every_variant` serialises all 8 kinds with real edge values and compares the result with the committed `tests/fixtures/state-events.json`. Regenerate it with `GAMELIB_REGEN_STATE_EVENTS=1`. The edge values are:
  - an empty SizeOnDisk, and a non-numeric one
  - a 64-character buildid, and a null one
  - a path longer than 4200 bytes
  - a survivor present, and absent
  - a 10-digit appId
  - seq `2^53-1`
- **Wire parity (consumer side):** the new `steamPollStateEventParity.test.ts` parses every fixture event with the zod schema and applies it through the handler. A typed `Record<kind, true>` makes the kind list compile-time exhaustive.
- **Test result on the old schema:** the old schema fails the parity test.
- **No retry cap added:** Part B's notes say a cap would belong in the crate outbox. With the schema matched and refusals acked, I did not add one.

### C-IN-04 (included Info): the handler ignores `seq`

**Files modified:** `src/backend/sidecar/steamPollEventRegistration.ts`, `src/backend/sidecar/__tests__/steamPollEventRegistration.test.ts`
**Commit:** 2c461c7c5
**Status:** fixed: requires human verification (ordering logic)
**Applied fix:** this follows the Part A and Part B notes.

- **Guard scope:** the last applied seq is kept in memory, per appId for `installed` / `uninstalled` / `installIncomplete` (matching `outbox::is_install_state_kind`) and per (appId, kind) for every other kind. `rearmSettled` uses an empty appId.
- **Stale events:** an event whose seq is not newer is answered `{ applied: true, title }` with no state change, so the crate's `note_applied` drops it.
- **Where the guard lives:** it belongs to the registration (one per sidecar process) and is never persisted.
- **Failed applies:** a failed apply records no seq, so a retry of the same event applies.
- **Documented caveat:** TS-originated writes (`refreshInstallState`, `pollUninstallOnce`) carry no seq, so the guard orders Rust events only among themselves.
- **Tests:**
  - an older `installed` arriving after a newer `uninstalled`
  - the group sharing one seq across kinds
  - per-kind keys for the other kinds
  - app isolation
  - retry after a throw
  - a fresh guard for each registration
- **Unknown kinds:** an unknown future `kind` still fails validation and is retried with the same bounds. The new parity fixture catches that drift in CI before it ships.

## Skipped Issues

### C-WR-09: `pollUninstallOnce` duplicates the Rust uninstall completion pipeline

**File:** `src/backend/storeManagers/steam/library/uninstallPolling.ts:75-269`
**Reason:** skipped. It needs a design decision and a live check I could not make soundly here.

- **Both routes the reviewer offers change behaviour at the 8 direct-removal call sites.**
  - A new single-tick op (`steampoll_uninstall_once`) means a new channel through the crate, the shell contract generator, `rust_dispatch.rs` and the TS transport.
  - A started Rust poll completes only after a tick interval, not inline.
- **The two pipelines differ today:**
  - Rust emits `BridgeUninstalled` for a bridge source, while the TS callers already mark the bridge uninstalled themselves. Routing through Rust would mark it twice unless the callers change too.
  - TS clears forced-Windows and logs per root.
  - TS requires `existing` before it takes the survivor branch.
- **Operator decisions are involved.** Choosing which behaviour wins touches the LOCKED HOARD three-root and copySurvives decisions, and each of the bridge, bottle-direct, native-direct and remove-all-copies paths would need a live UAT.

**Original issue:** the Rust uninstall loop owns the survivor probe, the forced-Windows clear, the bridge-uninstalled step, the toast and the status, but the TS `pollUninstallOnce` still implements the same pipeline in full for the direct-removal call sites. The two copies have drifted, and no parity test covers them.

## Pre-existing failures (not caused by this part)

- **`tauriShellSource.test.ts` (asked about by the orchestrator):** checked in a throwaway worktree at `b7dbc199e` (the review commit, before any Part A, B or C fix). The same two tests fail there:
  - "no WebviewWindowBuilder chain passes a STRING LITERAL to .title("
  - "Gate 4 (T-UOK-03): the repair path uses no `?` try-operator"

  They also fail at the final tree: 2 failed, 287 passed in both places. The Phase 80 fixes did not cause them.
- **`shimCoverage.test.ts` and `shimGenerate.test.ts`** (1 failure each): they fail with the same counts at `b7dbc199e` and at the worktree base before any C change. They pin the generated `steam_api.def` export set.
- **`flowRegistrationCensus.test.ts` (3) and `ipcDomainCensus.test.ts` (1):** these also fail in the main checkout at `293cfe719`, before the C commits were merged. They count registrations in `appShellFlowRegistration.ts`, `shellFilesFlowRegistration.ts` and the per-domain IPC files, none of which this part touched.

## Notes

- **Commit hashes:** listed as they are on `main` after the rebase and fast-forward. The worktree branch `gsd-reviewfix/80-C-56302` was deleted after the fast-forward, and the recovery sentinel was removed.
- **Crate changes in a TS part:** C-WR-03 and C-WR-05 changed `gamelib-steampoll`. C-WR-05 is inherently Rust, as the reviewer says, and C-WR-03 took the reviewer's suggested crate return value. Both crate API changes are additive. The only wire-visible change is the `steampoll_install_start` result going from `null` to a bool, and the shell passes it through.
- **graphify:** I did not run `graphify update .`, so the graph does not reflect these commits.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
