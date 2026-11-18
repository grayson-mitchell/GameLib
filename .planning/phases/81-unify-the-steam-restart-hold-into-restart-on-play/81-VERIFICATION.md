---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
verified: 2026-11-18T09:06:43Z
status: gaps_found
score: 11/15 must-haves verified
covered_files: [".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-01-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-01-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-02-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-02-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-03-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-03-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-04-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-04-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-05-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-05-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-06-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-06-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-07-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-07-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-08-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-08-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-09-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-09-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-10-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-10-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-11-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-11-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-12-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-12-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-13-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-13-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-14-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-14-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-15-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-15-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-16-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-16-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-17-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-17-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-18-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-18-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-19-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-19-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-20-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-20-SUMMARY.md","native/steam-bridge/helper/bridge_helper.c","native/steam-bridge/helper/gamelib_appstate.h","src-tauri/crates/gamelib-steamfiles/src/library.rs","src-tauri/crates/gamelib-steampoll-cli/src/replay.rs","src-tauri/crates/gamelib-steampoll/src/adoption.rs","src-tauri/crates/gamelib-steampoll/src/adoption_evidence.rs","src-tauri/crates/gamelib-steampoll/src/app_state.rs","src-tauri/crates/gamelib-steampoll/src/constants.rs","src-tauri/crates/gamelib-steampoll/src/dispatch.rs","src-tauri/crates/gamelib-steampoll/src/effects.rs","src-tauri/crates/gamelib-steampoll/src/events.rs","src-tauri/crates/gamelib-steampoll/src/hold_migration.rs","src-tauri/crates/gamelib-steampoll/src/host.rs","src-tauri/crates/gamelib-steampoll/src/install_loop.rs","src-tauri/crates/gamelib-steampoll/src/install_once.rs","src-tauri/crates/gamelib-steampoll/src/lib.rs","src-tauri/crates/gamelib-steampoll/src/outbox.rs","src-tauri/crates/gamelib-steampoll/src/registry.rs","src-tauri/crates/gamelib-steampoll/src/steam_process.rs","src-tauri/crates/gamelib-steampoll/src/testing.rs","src-tauri/crates/gamelib-steampoll/src/uninstall.rs","src-tauri/src/ipc_contract.rs","src-tauri/src/main.rs","src-tauri/src/rust_dispatch.rs","src-tauri/src/steampoll_dispatch.rs","src/backend/sidecar/bootstrap.ts","src/backend/sidecar/handlers.ts","src/backend/sidecar/installFlowRegistration.ts","src/backend/sidecar/steamFlowRegistration.ts","src/backend/sidecar/steamPollEventRegistration.ts","src/backend/storeManagers/steam/adoptionStatus.ts","src/backend/storeManagers/steam/adoptionWatch.ts","src/backend/storeManagers/steam/gameInstallDepot.ts","src/backend/storeManagers/steam/gameLaunch.ts","src/backend/storeManagers/steam/gameUninstall.ts","src/backend/storeManagers/steam/games.ts","src/backend/storeManagers/steam/launchDispatch.ts","src/backend/storeManagers/steam/library/index.ts","src/backend/storeManagers/steam/library/installRoot.ts","src/backend/storeManagers/steam/library/refresh.ts","src/backend/storeManagers/steam/library/runningPoll.ts","src/backend/storeManagers/steam/library/rustRefresh.ts","src/backend/storeManagers/steam/macSteamAdoption.ts","src/backend/storeManagers/steam/noticeSeq.ts","src/backend/storeManagers/steam/playAdoption.ts","src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts","src/backend/storeManagers/steam/pollRust/steamPollTypes.ts","src/backend/storeManagers/steam/steamClientProcess.ts","src/backend/storeManagers/steam/steamInstallRuntime.ts","src/backend/testUtils/steamPollStatusFake.ts","src/common/types/ipc/rustInvoke.ts","src/common/types/ipc/sidecarInternal.ts","src/common/types/ipc/steam.ts","src/common/types/sidecarTransport.ts","src/common/types/steam.ts","src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx","src/frontend/screens/Game/GamePage/components/AdoptionNote.scss","src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx","src/frontend/screens/Game/GamePage/index.tsx","src/frontend/state/SteamAdoptionStatus.ts","src/frontend/state/SteamRequestNotice.ts","src/frontend/state/initStateSubscriptions.ts","src/preload/api/steam.ts"]
covered_digest: "v4:sha256:8da674d36dd5f94696326b78839d44b10e1846b17163d03ee05cce5275500ed1"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "D-05: with a game running in Steam, Play on a pending game is refused with the in-app notice (and its Launch without Steam action), Steam is not quit, and the record stays (macOS)"
    status: failed
    severity: blocker
    reason: "On macOS the running-game refusal can never fire. restartSteamForAdoption refuses only when deps.readRunningAppId() is non-zero, and on macOS that is readMacRunningAppId, the Rust registry.vdf probe; Mac Steam's registry.vdf has no RunningAppID, so the probe answers 0 every time. Live gate item 5 (L1, 2026-11-18): with Avadon 112100 running, Play on the pending 208400 fired steam://exit and Steam exited after 12956 ms; no 'not restarting Steam' line, no notice. Unit tests pass only because they stub readRunningAppId. The same blind reader guards Restart Steam now and the uninstall path on macOS."
    artifacts:
      - path: "src/backend/storeManagers/steam/macSteamAdoption.ts"
        issue: "createRestartDeps.readRunningAppId uses readMacRunningAppId on every OS (lines 354-361); refusal at 423-429 is unreachable on macOS"
      - path: "src/backend/storeManagers/steam/library/runningPoll.ts"
        issue: "readMacRunningAppId (line 32) reads registry.vdf RunningAppID, which Mac Steam never writes"
    missing:
      - "A macOS 'game running in Steam' signal for the restart refusal (e.g. the launch-watch/running-poll process match, or the bridge helper) that the refusal uses on darwin"
      - "A test that drives createRestartDeps on darwin with a running game, not a stubbed readRunningAppId"
      - "Re-run live gate item 5 (and its DRM sub-check) after the fix"
    tracked_in: ".planning/todos/pending/2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md"
  - truth: "D-02: wherever the page shows 'Restart Steam now', pressing it restarts Steam (including the GameLib 1026 waiting edge, where 81-08 shows the action without the note)"
    status: partial
    severity: blocker
    reason: "Phase-introduced dead button. AdoptionNote renders 'Restart Steam now' whenever is.installing && statusContext === 'steam-waiting-for-restart' (AdoptionNote.tsx:75-78), but runRestartNow returns 'no-record' and does nothing when no pending-adoption record exists (adoptionStatus.ts:127-129). A record is written at install end only when a Steam pid was found (gameInstallDepot.ts:300-321); with Steam not running at install end the record is cleared, yet a 1026 ACF still drives the poll into steam-waiting-for-restart, so the button renders and is a no-op. Both halves are pinned by passing tests ('the 1026 edge ... the action without the note' and 'no record: answers no-record and touches nothing'). Live gate item 12 is blocked (edge not reproduced). With Steam running at install end a record exists and the button does work, so the defect is narrower than the 81-08 orchestrator note states."
    artifacts:
      - path: "src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx"
        issue: "shows the action at the 1026 edge without checking that the backend has anything to act on"
      - path: "src/backend/storeManagers/steam/adoptionStatus.ts"
        issue: "runRestartNow answers no-record with no fallback; nothing visible happens"
    missing:
      - "Give the 1026-edge action a target: restart (or, if Steam is not running, start) Steam without requiring a record, or write a record at the 1026 handoff; alternatively hide the action when the status read reports no record"
      - "A test that a 1026-edge press with no record does something observable (or that the button is not shown)"
      - "Run live gate item 12"
    tracked_in: "deferred-items.md, 'Orchestrator note (after 81-08)'; no todo filed"
behavior_unverified_items:
  - truth: "The adoption watch never overlaps a slow tick: a slow helper or pgrep probe delays the next tick instead of running two evaluations at once (Phase 80 D-10 poll contract, applied to new background work)"
    test: "Add a slow-runner test to tests/adoption.rs (a ProcessRunner whose helper call sleeps longer than ADOPTION_TICK_MS and records max in-flight), mirroring the deleted install_loop test a_slow_tick_delays_the_next_one_instead_of_overlapping"
    expected: "max in-flight helper/pgrep calls stays 1 across several periods; the entry is still evaluated each completed tick"
    why_human: "The guarantee is structural (one task, tick awaited inside the select arm, MissedTickBehavior::Delay at adoption.rs:378-386), but no test exercises it. 81-10 deleted the only no-overlap tick test in the crate (it drove the removed hold probe); install_loop.rs, running.rs and uninstall.rs also rely on the same structure with no slow-tick test."
human_verification:
  - test: "Live gate item 10 (Windows 11): restart-on-Play, refused restart with a game running, Restart Steam now, unadopted uninstall, sign-out keeps the note (pid change is not adoption), ActiveUser and ACF-rewrite evidence"
    expected: "As written in 81-HUMAN-UAT.md item 10 (a)-(f)"
    why_human: "Real Windows Steam behaviour (spike 087 evidence); unit tests cover the evidence rules with fixtures only"
  - test: "Live gate item 11 (Linux): the same behaviours with a real game after relaunch, libraryfolders/content_log/connection_log evidence, sign-out keeps the note"
    expected: "As written in 81-HUMAN-UAT.md item 11"
    why_human: "Real Linux Steam behaviour; spike 088 only proved a tool app relaunch"
  - test: "Adoption watch slow-tick no-overlap (see behavior_unverified_items)"
    expected: "A test proves at most one evaluation in flight"
    why_human: "Ordering invariant not exercised by any test"
---

# Phase 81: Unify the Steam restart hold into restart-on-Play Verification Report

**Phase Goal:** One mechanism, not two, for a GameLib depot install that the running Steam client has not adopted: report the game installed once the ACF says so and let restart-on-Play handle the unadopted case; delete the hold, its persisted store and the boot re-arm; release the pending record on spike 083's evidence with "Sign in to Steam to finish" for a signed-out Steam; keep InstallApp as the preferred macOS path; give the user an in-app action. Windows/Linux get restart-on-Play per spikes 087/088.
**Verified:** 2026-11-18T09:06:43Z
**Status:** gaps_found
**Re-verification:** No, initial verification

No ROADMAP success criteria exist (Requirements: TBD, scope is CONTEXT D-01..D-15), so the must-haves below are derived from the goal, D-01..D-15 and the 20 plans' `must_haves.truths`.

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | The hold, its persisted store and the boot re-arm are gone (D-11, D-13); only the D-12 migration reads `steam_restart_hold.json` | ✓ VERIFIED | `hold.rs` and `rearm.rs` absent; grep finds the store name only in `hold_migration.rs`, `profile.rs` and tests; `steamPollsPortComplete.test.ts` deletion gate passes |
| 2  | A native depot install reports Installed as soon as the ACF says so (D-01 badge, D-11) | ✓ VERIFIED | `install_once_complete.rs` 24/24, `library.refresh`/`library.installedMap` jest pass; UAT item 2 pass |
| 3  | Play on an unadopted install quits Steam (`steam://exit`), waits up to 30 s, relaunches with the game, no prompt, `steam-starting` shown (D-04, D-14 on macOS) | ✓ VERIFIED | `playAdoption.ts:114-135`; playAdoption tests pass; UAT item 2 pass (pid 25782 -> 27614, no install dialog) |
| 4  | Installed + Play + note "Steam will restart once when you press Play." with "Restart Steam now" (D-01, D-02) for a pending installed game | ✓ VERIFIED | `AdoptionNote.tsx`; AdoptionNote tests pass; UAT items 4 and 8 pass |
| 5  | "Restart Steam now" restarts Steam wherever it is shown, including the 1026 waiting edge | ✗ FAILED (partial) | Dead button when no record exists: see Gaps |
| 6  | Signed-out Steam: note "Sign in to Steam to finish setup" + Open Steam; Play opens Steam and keeps the record (D-03) | ✓ VERIFIED | `playAdoption.ts:98-111`; test "running but signed out ... (D-03)"; UAT item 3 pass |
| 7  | Refused restart (game running / wrap owed / quit timeout) never falls back to a plain launch, shows the notice with Launch without Steam for eligible games (D-05) | ✗ FAILED (macOS, game-running case) | `readMacRunningAppId` always 0 on Mac; UAT item 5 issue; wrap-owed and quit-timeout cases are unit-tested only |
| 8  | One decision point for the launch-without-Steam setting (D-06) | ✓ VERIFIED | `launchDispatch.ts:162-165`; launchDispatch tests pass |
| 9  | Rust adoption watch runs only while records exist, emits a typed `adoptionState` event, the note clears with no reload (D-07) | ✓ VERIFIED | `adoption.rs` watch/unwatch; `tests/adoption.rs` 44/44; boot `resumeAdoptionWatches` at `bootstrap.ts:2888-2889`; UAT item 3 (note cleared 1-2 s after sign-in, same pid) |
| 10 | Helper `--steam-appstate` reports BLoggedOn and GetAppInstallState (D-08) | ✓ VERIFIED | `gamelib_appstate.h`, `bridge_helper.c`; `app_state.rs` 10/10; UAT item 1 pass in three states |
| 11 | InstallApp preferred when on; fires once only after a seen sign-in that did not adopt (D-09) | ✓ VERIFIED | `gameInstallDepot.ts:268-296`; adoption tests `on_macos_install_app_*`; UAT item 7 pass |
| 12 | Helper unavailable / unreadable state fails safe: record kept, note stays, Play as WR-01 (D-10) | ✓ VERIFIED | `on_macos_an_unavailable_helper_never_adopts_...`, `a_missing_or_unreadable_manifest_never_adopts_...`; `playAdoption.ts:88-95` |
| 13 | Boot migration turns valid persisted holds into pending records, drops ACF-gone ones, deletes the store (D-12) | ✓ VERIFIED | `migrateRestartHolds` wired at `bootstrap.ts:2888`; `hold_migration.rs` 29/29; UAT item 6 pass |
| 14 | Windows and Linux get restart-on-Play with non-helper evidence; a pid change alone is never adoption (D-14, D-15 not needed) | ? UNCERTAIN | Code and unit tests present (`adoption_evidence.rs` 27/27, `on_windows_*`/`on_linux_*` adoption tests); live items 10 and 11 not run |
| 15 | The adoption watch never overlaps a slow tick | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Structural (`adoption.rs:378-386`), no test; the crate's only slow-tick test was deleted by 81-10 |

**Score:** 11/15 truths verified (1 present, behavior-unverified; 1 uncertain pending live runs; 2 failed)

### Required Artifacts

`gsd-tools verify.artifacts` across all 20 plans: every declared artifact exists and passes (81-01 4/4, 81-04 3/3, every other plan all passed). No stubs found in the core files (`adoption.rs`, `adoption_evidence.rs`, `hold_migration.rs`, `adoptionWatch.ts`, `adoptionStatus.ts`, `playAdoption.ts`, `AdoptionNote.tsx`).

### Key Link Verification

`gsd-tools verify.key-links`: 32/33 verified. The one unverified link is 81-20's "operator run" -> `81-HUMAN-UAT.md`, which is not a code link; it maps to the partial live gate (items 10, 11 pending; 12 blocked).

Manually traced: install end -> `recordAndWatchPendingAdoption` -> Rust `steampoll_adoption_watch` -> `adoptionState` event -> TS handler clears the record -> `steamAdoptionStatusChanged` push -> `AdoptionNote` (live-confirmed by UAT item 3). Boot: `migrateRestartHolds` -> `resumeAdoptionWatches` (`bootstrap.ts:2888-2889`).

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `AdoptionNote.tsx` | `status` | `window.api.steamAdoptionStatus` query + `useSteamAdoptionStatus` push store | Yes, the pending store and the Rust watch's signed-in reading | ✓ FLOWING |
| `restartSteamForAdoption` | `runningAppId` | `readMacRunningAppId` (registry.vdf) on macOS | No on macOS: always 0 | ✗ DISCONNECTED (Gap 1) |

### Behavioral Spot-Checks and Test Runs

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| gamelib-steampoll crate | `cargo test -p gamelib-steampoll` | 478 passed, 0 failed across 23 test binaries (adoption 44, adoption_evidence 27, hold_migration 29, contracts 11 incl. `ops_sorted_and_unique`) | ✓ PASS |
| gamelib-steampoll-cli | `cargo test -p gamelib-steampoll-cli` | 10 passed, 0 failed | ✓ PASS |
| Phase 81 jest files (36 suites touched by `(81-` commits) | `npx jest --runTestsByPath <36 files>` | 36/36 suites, 1987 passed, 1 skipped (an unrelated i18n meta test in `genI18nGateScope.test.ts`), 0 failed | ✓ PASS |
| Planning gates | `pnpm -s planning-gates` | 12/12 passed | ✓ PASS |

The pre-existing reds noted in `deferred-items.md` (storeKinds, NativePortInfo census, acfUpdateReplay oracle) are not in the files run above and were not re-run.

### Probe Execution

No probes declared by the phase. Step 7c: not applicable.

### Live Gate (81-HUMAN-UAT.md, status partial)

| Item | Result |
| ---- | ------ |
| 1, 2, 3, 4, 6, 7, 8, 9 (macOS) | pass |
| 5 (macOS, D-05 refusal) | issue: Gap 1 |
| 12 (macOS, 1026 edge) | blocked, edge not reproduced: Gap 2 stands on code evidence |
| 10 (Windows 11), 11 (Linux) | pending, operator deferred |

### Requirements Coverage

No REQUIREMENTS.md IDs (Requirements: TBD). Decision coverage stands in for it below.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts: 15/15 (gate is a substring heuristic; it does not see Gap 1, where D-05 is present in code but inert on macOS).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| 63 phase-modified implementation files | - | TBD/FIXME/XXX | none found | - |
| `AdoptionNote.tsx` | 75-78 | action rendered with no backend target (no record) | 🛑 Blocker | Gap 2 |

### Test Quality Audit

| Test File | Linked Truth | Skipped | Circular | Assertion Level | Verdict |
| --------- | ------------ | ------- | -------- | --------------- | ------- |
| `playAdoption.test.ts` | D-05 game-running | 0 | no | Behavioral, but `readRunningAppId` stubbed | INSUFFICIENT for macOS: the stub hides that the real Mac reader is always 0 |
| `tests/adoption.rs` | D-07, D-09, D-10, D-14 | 0 | no | Behavioral | OK |
| `tests/hold_migration.rs` | D-12 | 0 | no | Value | OK |
| `AdoptionNote.test.tsx`, `adoptionStatus.test.ts` | D-02 1026 edge | 0 | no | Value | Pins the dead-button behaviour as correct |

### Gate-filed todos, classified

| Todo | Phase 81 gap? | Reason |
| ---- | ------------- | ------ |
| `2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md` | Yes, Gap 1 (blocker) | D-05 unmet on macOS |
| 1026-edge "Restart Steam now" (deferred-items.md, no todo) | Yes, Gap 2 (blocker) | Introduced by 81-08 |
| `2026-11-18-adoption-note-restart-flash-at-install-end.md` | Phase-introduced, warning | The default pending variant renders for 1-2 s while InstallApp or the signed-in read is in flight; outcome is correct (item 7 pass). Minor UX, not a failed truth |
| `2026-11-18-adoption-note-restart-steam-now-button-placement.md` | No (warning, UX preference) | Placement was Claude's discretion; D-02 behaviour passes (items 2, 4) |
| `2026-11-18-depot-install-misses-exec-bit-on-shell-script-launchers.md` | No, out of scope | Depot pipeline file modes (`post.rs`), predates Phase 81 |
| `2026-11-18-steam-launch-watch-misses-script-launched-game-on-relaunch.md` | No, out of scope | `startSteamLaunchWatch` already-watching path, predates Phase 81; triggered by the exec-bit failure |
| `2026-11-18-mac-uninstall-notification-not-seen-dev-build.md` | No, out of scope | Notification delivery in the dev build; item 9 behaviour passed |

### Human Verification Required

1. **Windows 11 live gate (item 10).** Run 81-HUMAN-UAT.md item 10 (a)-(f). Expected as written there. Needs real Windows Steam.
2. **Linux live gate (item 11).** Run item 11 with a real game after relaunch. Needs real Linux Steam.
3. **Adoption watch no-overlap.** Add a slow-runner test to `tests/adoption.rs`; expected max in-flight 1. No test exercises the ordering invariant.

### Gaps Summary

Most of the goal is achieved and proven. The hold, its store and the re-arm are deleted. Installed follows the ACF. Restart-on-Play, the note, Restart Steam now, the sign-in note and auto-clear (the 112100 case), InstallApp with its fallback, and boot migration all pass both tests and the Mac live gate. Two truths fail:

1. **D-05 on macOS (blocker).** The running-game refusal before a Steam restart never fires on Mac. The reader it depends on looks for a registry.vdf key that Mac Steam does not write, so Play restarts Steam under a running game, and "Launch without Steam" is never offered. The reader predates Phase 81, but the refusal and its new action are Phase 81 decisions, and the unit tests stub the reader. The same blind reader also guards Restart Steam now and uninstall on Mac.
2. **The 1026-edge "Restart Steam now" (blocker, narrow).** 81-08 shows the action at the `steam-waiting-for-restart` edge. With no pending record (Steam not running when the install ended), pressing it answers `no-record` and nothing happens.

The phase gate is also open for a non-gap reason: Windows (item 10) and Linux (item 11) have not been run live. The no-overlap tick guarantee lost its only test in 81-10. No later milestone phase covers any of these, so nothing is deferred.

---

_Verified: 2026-11-18T09:06:43Z_
_Verifier: Claude (gsd-verifier)_

> Update 2026-11-18: Gap 1 (macOS running-game refusal) is closed by quick 261118-uma (`41f68fc03`, `e70d022f3`); live re-run of UAT item 5 passed.
