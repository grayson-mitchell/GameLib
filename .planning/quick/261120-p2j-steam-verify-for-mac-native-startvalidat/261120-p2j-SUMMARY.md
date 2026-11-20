---
phase: quick-261120-p2j
plan: 01
subsystem: steam-install
tags: [steam, verify, bridge-helper, depot, rust, macos]
requires:
  - phase: 79
    provides: gamelib-depot crate, rust depot job pipeline
  - phase: 74
    provides: bridge update follow-ups, nativeInstallsInFlight
provides:
  - "--steam-validateapp helper subcommand (runtime-verified StartValidatingApp + IPC app-state wait)"
  - "Mac-native Verify: validateRegisteredSteamGame (helper, steam://validate fallback)"
  - "Bridge Verify: verifyBridgeGame + verifyInstalledDepotsRust (pinned-GID install-mode job)"
  - "gamelib-depot write_file chunk reuse; reconcile progress counter"
affects: [steam repair(), dispatch.repair, Move install todo]
tech-stack:
  added: []
  patterns:
    - "helper slot resolved by unique IPC high half + neighbour guard"
    - "install-mode depot job pinned to installed GIDs for verify"
key-files:
  created:
    - src/backend/storeManagers/steam/validateNative.ts
    - src/backend/storeManagers/steam/verifyBridge.ts
    - src/backend/storeManagers/steam/depotRust/verify.ts
    - src/backend/storeManagers/steam/__tests__/validateNative.test.ts
    - src/backend/storeManagers/steam/__tests__/verifyBridge.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts
    - .planning/todos/pending/2026-11-20-implement-steam-move-install.md
  modified:
    - native/steam-bridge/helper/gamelib_installapp.h
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/steamInstallApp.ts
    - src/backend/storeManagers/steam/gameProtocolUrl.ts
    - src/backend/storeManagers/steam/gameMaintenance.ts
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/steam/depotRust/progressBridge.ts
    - src/backend/gamedetails/dispatch.ts
    - src/common/types.ts
    - src-tauri/crates/gamelib-depot/src/download.rs
    - src-tauri/crates/gamelib-depot/src/reconcile.rs
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/tests/job_modes.rs
    - src-tauri/crates/gamelib-depot/tests/reconcile.rs
decisions:
  - "Validate is not gated on isSteamExperimentalInstallAppEnabled (uninstall is not gated either; spike 069 measured validate as silent)"
  - "Verify is an install-mode job with chunk reuse, not verify_only"
  - "Completion of a Mac-native validate is read over helper IPC, not the ACF"
status: complete
metrics:
  duration: single session
  completed: 2026-11-20
commits: 3
plan_head_before: 58a0c1c7a81beabbb9fe94bb925e71736fc1b466
plan_head_after: 6369f1d3b43a9dafc086dbd0d0a2c8755de9c2a1
actuals:
  tokens: 17500
  tasks: 3
  commits: 3
---

# Phase quick-261120-p2j Plan 01: Steam Verify on both install routes Summary

Verify and Repair now does real work for Steam games: a Steam-registered Mac game is validated silently by running Mac Steam through the bridge helper (held as `repairing` until Steam's own app state goes inactive), and a bridge game gets a GameLib depot verify that re-fetches only the chunks whose SHA-1 fails, then re-places the shim and re-checks the redist ledger.

Status: all 3 tasks complete and committed. The live gate (Task 3 human-check) is **pending**, to be run by the operator.

## What was built

- **Task 1 (commit 2bf8758cc), Mac-native Verify, tracer slice.** New helper subcommand `--steam-validateapp <appId> [--wait] [--dry-run]` in `gamelib_installapp.h`, dispatched from `bridge_helper.c`. It resolves StartValidatingApp (0x5078) by unique IPC high half and requires CancelValidation (0x9949) at that slot + 1; otherwise `method-unverified:StartValidatingApp`, never a hard-coded call. With `--wait` it polls GetAppInstallState (0xeaf2) and GetDownloadingAppID (0xae86) once a second and prints one final JSON line. TS side: `requestSteamValidateApp` (4th `signal` param on the run seam, `VALIDATE_WAIT_TIMEOUT_MS`), `buildSteamProtocolUrl('validate')`, `validateRegisteredSteamGame`, `ExecResult.handedOffToSteam`, and `dispatch.repair` skipping the "Finished Repairing" toast on a hand-off or abort. `repair()` routes a Steam-registered install to it.
- **Task 2 (commit bf4df5676), bridge Verify.** `write_file` in the depot crate now reuses SHA-1-verified chunks of an existing regular file (never through a symlink) and fetches only the rest; the reconcile hash walk feeds done-bytes as files verify (`reconcile_with_progress`). `verifyInstalledDepotsRust` runs an install-mode job with every ref pinned to the ACF InstalledDepots manifest and finalize carrying the installed buildid. `verifyBridgeGame` refuses a running or busy game, registers in `nativeInstallsInFlight`, runs the job, then ALWAYS runs `runBridgeUpdateFollowUps` before mapping the outcome. `progressBridge` gained `repair: true` (status `repairing`). The old restore-only `repair()` body is gone; `isBridgeGameRunning` is now exported from `updateBridge.ts` as the one running check.
- **Task 3 (commit 6369f1d3b), todo split.** Move install moved to `.planning/todos/pending/2026-11-20-implement-steam-move-install.md` (severity medium, platform macos, ready live-gate; spike-first, references spike 090 and slotmap rows 67-70). The original todo was `git mv`ed to `completed/` with a Resolution section.

## Departures from the plan (recorded as requested)

1. **`verify_only` downloads nothing, so Verify is an install-mode job with chunk reuse.** `verify_only` reports damage but cannot repair it (test `verify_only_fetches_nothing`). An `install` job reconciles first, then fetches what is queued; `write_file` previously truncated an existing file and re-downloaded every chunk, so it now reuses good chunks. Tests: `install_over_corrupt_file_fetches_only_bad_chunks` (one chunk fetched, unowned `extra/user.cfg` and `a.bin.gamelib-orig` byte-identical, ACF StateFlags 4) and `install_over_truncated_file_fetches_only_tail_chunks`.
2. **Validate end is detected over helper IPC, not the ACF.** Spike 069 measured StateFlags staying 4 through a validate and only TargetBuildID flipping, and the Rust steampoll update arm completes only on a build change. The helper therefore waits on IPC app state itself (installState intersecting 0x8/0x100/0x400/0x20000, or downloading appId equal to the app), finishing after 2 consecutive inactive samples, a 20 s never-started grace, a pause (`paused`), or the 6 h cap (`wait-cap`). `dispatch.repair` already holds `repairing` while `game.repair()` is pending, so no poll loop was added.
3. **Refs are pinned to the installed GIDs.** `buildDepotRefs` returns the branch's current manifests and buildid; each ref's `gid` is replaced by the ACF installed manifest (depots missing from the plan get a key via `fetchDepotKey`, owner `dlcAppId ?? appId`) and finalize uses the ACF buildid, so a verify cannot become an update.

Smaller discretion items:
- `reconcile_partial_state` kept its 4-argument signature (three integration tests call it); the progress counter went into a new `reconcile_with_progress` that it delegates to, and `download.rs` calls the new function.
- The `reused_bytes` stat at download.rs ~879 belongs to the delta file-fallback path, not this one, so it was left alone.
- Validate is not gated on the experimental InstallApp setting (same reasoning as uninstall).

## Deviations from Plan (auto-fixed)

None beyond the departures above. No Rule 1-4 deviations.

## Renderer confirmation

`src/frontend/screens/Game/GameSubMenu/index.tsx` ~690-698 renders "Verify and Repair" (`submenu.verify`) for Steam, hidden only for sideloaded or third-party-managed games and disabled while `is.playing` (`isSteam && is.playing`). No edit needed.

## Verification run

- `pnpm codecheck` clean; scoped `npx prettier --check` clean over every written TS file; `npx eslint` over the touched TS shows only pre-existing warnings; `pnpm build-steam-bridge` builds.
- Jest: steamInstallAppHelper (compiles and runs the real helper under a fake HOME), steamInstallApp, validateNative, games, gameDetailsModules, fakeHomeIsolation, rustVerify, progressBridge.stage, rustInstall, verifyBridge, updateBridge all green.
- `cargo test -p gamelib-depot` all green (job_modes 7 -> 9, reconcile +1); `cargo fmt --check` and `cargo clippy --all-targets` clean.
- Todo gate (`python3 .planning/todos/todo-frontmatter-gate.py`): OK, 13 pending todos.
- Against the operator's live Mac Steam, `public/bin/arm64/darwin/steam-bridge-helper --steam-validateapp 440 --dry-run` resolved engineSlot 43, validateSlot 27, installStateSlot 4, downloadingAppSlot 42, matching the spike measurements. No validate was actually started.
- Formatter: `.c`/`.h` have no prettier parser and `.rs` is covered by `cargo fmt`; the `.planning` todo files are prettier-ignored, so no prettier check was written for them.

## Live gate: PENDING (human)

Not run by the executor. Prep: `pnpm build-steam-bridge`, `pnpm build:sidecar`, restart with `pnpm tauri:dev` (never `tauri:dev:run`).

(a) Mac-native: with Mac Steam running and signed in, take a small Steam-registered game, note the SHA-1 of a data file, corrupt a few bytes (`dd ... conv=notrunc`). Click Verify and Repair: Repairing shows, no Steam window or dialog appears, content_log shows "Start validating appID" then "scheduler finished", Repairing clears only after that, the SHA-1 matches again and the game launches. Repeat with Steam quit: `steam://validate` opens Steam, and no "Finished Repairing" toast appears.

(b) Bridge: corrupt a few bytes in one large data file of a bridge game. Verify: Repairing shows with progress, and the `[depot-rust] outcome` log line shows net bytes on the order of one chunk. The file is restored, the `steam_api` DLL is shim bytes again with the genuine DLL in `<dll>.gamelib-orig`, and the game launches through the shim ("verified" = helper HELLO plus a clean game Steam-init log). With the game running, Verify is refused.

Risks to watch in the live run: (1) Rust requests a manifest request code for the INSTALLED manifest GID on the branch; if Steam refuses codes for a manifest that is no longer current, bridge Verify will fail there (the same call the delta path makes for old manifests, but not yet proven for a verify). (2) The helper treats "never seen active within 20 s" as finished, so a very fast validate on a tiny game reads as done.

## Known Stubs

None.

## Threat Flags

None new. The mitigations in the plan's threat register are implemented: numeric appId guards in TS/C/URL builder (T-p2j-01), unique-high-half slot resolution plus the CancelValidation neighbour guard (T-p2j-02), `sanitizeInstalldir` before the job (T-p2j-03), manifest-owned files only, asserted by the Rust test (T-p2j-04), SHA-1-gated chunk reuse with the whole-file check kept (T-p2j-05), abort signal plus finite timeout and no TS timers (T-p2j-06), pinned GIDs and installed buildid asserted in rustVerify.test.ts (T-p2j-07), running/in-flight refusal on both routes (T-p2j-08), fake-HOME helper spawns (T-p2j-09).

## Notes for the orchestrator

- Per instructions SUMMARY.md, STATE.md and PLAN.md are not committed by the executor, and ROADMAP.md was not touched. `.planning/ROADMAP.md` showed as modified in the working tree late in the run; it was not edited by this task and was not staged.
- Task 3's first commit attempt staged only the rename because one `git add` pathspec was invalid; the commit was amended (my own unpushed commit) to include the new todo and the Resolution note, giving the final hash 6369f1d3b.

## Self-Check: PASSED

Files created exist (validateNative.ts, verifyBridge.ts, depotRust/verify.ts, the three new test files, the Move todo). Commits 2bf8758cc, bf4df5676, 6369f1d3b are ancestors of HEAD; the measured count `git rev-list --count 58a0c1c7a..HEAD` is 3.
