---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
verified: 2026-11-19T17:33:26Z
status: human_needed
score: 13/15 must-haves verified
covered_files: [".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-01-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-01-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-02-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-02-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-03-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-03-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-04-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-04-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-05-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-05-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-06-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-06-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-07-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-07-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-08-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-08-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-09-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-09-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-10-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-10-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-11-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-11-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-12-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-12-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-13-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-13-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-14-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-14-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-15-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-15-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-16-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-16-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-17-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-17-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-18-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-18-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-19-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-19-SUMMARY.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-20-PLAN.md",".planning/phases/81-unify-the-steam-restart-hold-into-restart-on-play/81-20-SUMMARY.md","native/steam-bridge/helper/bridge_helper.c","native/steam-bridge/helper/gamelib_appstate.h","public/locales/en/gamelib.json","src-tauri/crates/gamelib-steamfiles/src/library.rs","src-tauri/crates/gamelib-steampoll-cli/src/replay.rs","src-tauri/crates/gamelib-steampoll/src/adoption.rs","src-tauri/crates/gamelib-steampoll/src/adoption_evidence.rs","src-tauri/crates/gamelib-steampoll/src/app_state.rs","src-tauri/crates/gamelib-steampoll/src/constants.rs","src-tauri/crates/gamelib-steampoll/src/dispatch.rs","src-tauri/crates/gamelib-steampoll/src/effects.rs","src-tauri/crates/gamelib-steampoll/src/events.rs","src-tauri/crates/gamelib-steampoll/src/hold_migration.rs","src-tauri/crates/gamelib-steampoll/src/host.rs","src-tauri/crates/gamelib-steampoll/src/install_loop.rs","src-tauri/crates/gamelib-steampoll/src/install_once.rs","src-tauri/crates/gamelib-steampoll/src/lib.rs","src-tauri/crates/gamelib-steampoll/src/outbox.rs","src-tauri/crates/gamelib-steampoll/src/registry.rs","src-tauri/crates/gamelib-steampoll/src/running.rs","src-tauri/crates/gamelib-steampoll/src/running_scan.rs","src-tauri/crates/gamelib-steampoll/src/steam_process.rs","src-tauri/crates/gamelib-steampoll/src/testing.rs","src-tauri/crates/gamelib-steampoll/src/uninstall.rs","src-tauri/crates/gamelib-steampoll/tests/adoption.rs","src-tauri/crates/gamelib-steampoll/tests/running_scan.rs","src-tauri/src/ipc_contract.rs","src-tauri/src/main.rs","src-tauri/src/rust_dispatch.rs","src-tauri/src/steampoll_dispatch.rs","src/backend/sidecar/bootstrap.ts","src/backend/sidecar/handlers.ts","src/backend/sidecar/installFlowRegistration.ts","src/backend/sidecar/steamFlowRegistration.ts","src/backend/sidecar/steamPollEventRegistration.ts","src/backend/storeManagers/steam/__tests__/adoptionStatus.test.ts","src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts","src/backend/storeManagers/steam/adoptionStatus.ts","src/backend/storeManagers/steam/adoptionWatch.ts","src/backend/storeManagers/steam/gameInstallDepot.ts","src/backend/storeManagers/steam/gameLaunch.ts","src/backend/storeManagers/steam/gameUninstall.ts","src/backend/storeManagers/steam/games.ts","src/backend/storeManagers/steam/launchDispatch.ts","src/backend/storeManagers/steam/library/index.ts","src/backend/storeManagers/steam/library/installRoot.ts","src/backend/storeManagers/steam/library/refresh.ts","src/backend/storeManagers/steam/library/runningPoll.ts","src/backend/storeManagers/steam/library/rustRefresh.ts","src/backend/storeManagers/steam/macSteamAdoption.ts","src/backend/storeManagers/steam/noticeSeq.ts","src/backend/storeManagers/steam/playAdoption.ts","src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts","src/backend/storeManagers/steam/pollRust/steamPollTypes.ts","src/backend/storeManagers/steam/steamClientProcess.ts","src/backend/storeManagers/steam/steamInstallRuntime.ts","src/backend/testUtils/steamPollStatusFake.ts","src/common/types/ipc/rustInvoke.ts","src/common/types/ipc/sidecarInternal.ts","src/common/types/ipc/steam.ts","src/common/types/sidecarTransport.ts","src/common/types/steam.ts","src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx","src/frontend/screens/Game/GamePage/components/AdoptionNote.scss","src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx","src/frontend/screens/Game/GamePage/index.tsx","src/frontend/state/SteamAdoptionStatus.ts","src/frontend/state/SteamRequestNotice.ts","src/frontend/state/initStateSubscriptions.ts","src/preload/api/steam.ts"]
covered_digest: "v1:sha256:2e72440a189f022d90c619dcc8ed95074c9c34c487b3d13d2c2c37121f4f31e4"
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/15
  gaps_closed:
    - "D-05: with a game running in Steam, Play on a pending game is refused with the in-app notice, Steam is not quit, the record stays (macOS) - quick 261118-uma (41f68fc03, e70d022f3); live UAT item 5 re-run passed with real log lines"
    - "D-02: wherever the page shows 'Restart Steam now', pressing it does something at the 1026 waiting edge - quick 261120-88x (62a27f932); code + unit tests only, live item 12 never run (see truth 5, now behavior-unverified, not failed)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "D-02: at the GameLib 1026 waiting edge, with no pending record, pressing 'Restart Steam now' starts Steam (not running) or runs the graceful restart (running) behind both D-05 guards"
    test: "UAT item 12: produce a GameLib depot install that finalizes at StateFlags 1026 (a library on a filesystem that ignores chmod, for example a loop-mounted FAT image added as a Steam library, is the untested route), so the page shows the 'steam-waiting-for-restart' action alone, then press 'Restart Steam now' once with Steam running and once with Steam not running"
    expected: "Steam running: gamelib.log shows 'fired steam://exit to adopt <id> on restart' then 'Steam relaunched (no pending adoption record)', new Steam pid, no game starts. Steam not running: 'Steam is not running; starting it ... at the 1026 handoff', Steam comes up, no steam://exit. With a game running in Steam: the refusal notice, Steam untouched"
    why_human: "The edge is not reproducible on this machine (acf.rs:185 writes 1026 only on a failed/unverified file or an unappliable file mode; ext4 accepts chmod). The unit tests drive the real runWaitingEdgeRestart but stub requestRustInvoke, openExternal, the process runner and the clock; the status shape they feed matches Rust's InstallStatus serde (checked), but the real poll-to-button-to-press chain at the edge has never run"
  - truth: "The adoption watch never overlaps a slow tick: a slow helper or pgrep probe delays the next tick instead of running two evaluations at once (Phase 80 D-10 poll contract)"
    test: "Add a slow-runner test to tests/adoption.rs (a ProcessRunner whose helper call sleeps longer than ADOPTION_TICK_MS and records max in-flight), mirroring the deleted install_loop test a_slow_tick_delays_the_next_one_instead_of_overlapping"
    expected: "max in-flight helper/pgrep calls stays 1 across several periods; the entry is still evaluated each completed tick"
    why_human: "The guarantee is structural (one spawned task, the tick awaited inside the select arm, MissedTickBehavior::Delay at adoption.rs:379-381), but no test exercises it. Unchanged since the prior report: grep for overlap/slow/in-flight finds nothing in tests/adoption.rs or tests/install_loop.rs. This item is closable by a test, not by a live run"
human_verification:
  - test: "Live gate item 12 (1026 waiting edge, either OS): see behavior_unverified_items first entry"
    expected: "As above"
    why_human: "Edge cannot be produced on the verifying machine; deferred by operator decision 2026-11-20"
  - test: "Adoption watch slow-tick no-overlap (see behavior_unverified_items second entry)"
    expected: "A test proves at most one evaluation in flight"
    why_human: "Ordering invariant not exercised by any test"
  - test: "Linux (X11) 'Open Steam' raises the signed-out sign-in window: sign Steam out, let a GameLib depot install finish so the note reads 'Sign in to Steam to finish setup', press Open Steam"
    expected: "Steam's sign-in window comes to the front (gamelib.log 'shell raised the Steam window: true')"
    why_human: "Added by ec530001e after the Linux live run (an X11 _NET_ACTIVE_WINDOW request in the shell's steam_window.rs, committed unreviewed). UAT item 11 recorded the failure; no live retest of the fix is recorded. Wayland is undecided"
  - test: "macOS: 'Game Uninstalled' notification after Uninstall of an unadopted game (todo 2026-11-18-mac-uninstall-notification-not-seen-dev-build.md)"
    expected: "The macOS notification appears (dev build via tauri-plugin-notification, or confirm it is a dev-build-only limitation in a packaged build)"
    why_human: "gamelib.log shows notify() ran, the operator saw nothing; macOS notification delivery is not verifiable on Linux. Item 9's scored behaviour (direct removal, no hang, no record) passed"
  - test: "macOS: the 1-2 s flash of the restart note and 'Restart Steam now' at install end (todo 2026-11-18-adoption-note-restart-flash-at-install-end.md)"
    expected: "Decide whether to fix or accept; the final state after the flash is correct (item 7 pass)"
    why_human: "Minor UX on macOS (ready: live-gate); not a failed truth"
  - test: "Not yet run live anywhere: item 5's DRM sub-check (notice for a DRM-marked game has no Launch without Steam button) and the Bastion relative-argv case; Linux item 11 retests were operator-reported without Claude-captured log lines (b, e, a, layout); the Windows (e) pid-change-with-record-already-pending limit"
    expected: "Accept as recorded, or re-run when a DRM game / the Windows pid-change setup is to hand"
    why_human: "Live evidence gaps recorded in 81-HUMAN-UAT.md; none contradicts a truth"
---

# Phase 81: Unify the Steam restart hold into restart-on-Play Verification Report

**Phase Goal:** One mechanism, not two, for a GameLib depot install that the running Steam client has not adopted: report the game installed once the ACF says so and let restart-on-Play handle the unadopted case; delete the hold, its persisted store and the boot re-arm; release the pending record on spike 083's evidence with "Sign in to Steam to finish" for a signed-out Steam; keep InstallApp as the preferred macOS path; give the user an in-app action. Windows/Linux get restart-on-Play per spikes 087/088.
**Verified:** 2026-11-19T17:33:26Z (2026-11-20 NZDT)
**Status:** human_needed
**Re-verification:** Yes, after gap closure. Both blockers from the 2026-11-18 report are closed in code. Nothing is FAILED. Two truths remain present-and-wired but not behaviorally proven, so the phase is not `passed`.

No ROADMAP success criteria exist (Requirements: TBD, scope is CONTEXT D-01..D-15), so the must-haves are the same 15 derived from the goal, D-01..D-15 and the 20 plans' `must_haves.truths`, carried unchanged from the prior report.

## Goal Achievement

Evidence tiers used below:

- **Live**: a real run recorded in 81-HUMAN-UAT.md with log or pid evidence.
- **Code+tests**: read in the current tree and covered by tests that pass now; no live run of that exact path.
- **Unverified**: neither.

### Observable Truths

| #  | Truth | Status | Tier | Evidence |
| -- | ----- | ------ | ---- | -------- |
| 1  | The hold, its persisted store and the boot re-arm are gone (D-11, D-13); only the D-12 migration reads `steam_restart_hold.json` | VERIFIED | Code+tests, live (item 6 for the migration) | `hold.rs` and `rearm.rs` do not exist; the store name appears only in `hold_migration.rs`, `lib.rs`, `profile.rs`, `bootstrap.ts` and `steamPollsPortComplete.test.ts` (deletion gate passes) |
| 2  | A native depot install reports Installed as soon as the ACF says so (D-01 badge, D-11) | VERIFIED | Live | UAT item 2 pass; `install_once_complete.rs` 25/25 |
| 3  | Play on an unadopted install quits Steam (`steam://exit`), waits up to 30 s, relaunches with the game, no prompt, `steam-starting` shown (D-04) | VERIFIED | Live on macOS (item 2: pid 25782 to 27614, no install dialog), Windows (10a, `Steam exited after 2560 ms`), Linux (11a, `Steam exited after 3075 ms`; game launched from GameLib after the exec-bit fix) | `macSteamAdoption.ts:444-446`; `playAdoption.test.ts` and `macSteamAdoption.test.ts` pass |
| 4  | Installed + Play + note "Steam will restart once when you press Play." with "Restart Steam now" for a pending installed game (D-01, D-02) | VERIFIED | Live | Items 2, 4, 8 (macOS), 10c (Windows), 11c (Linux). On Linux the action now sits beside Play (`1ae713663`, `c2109b6e1`, operator-confirmed); `AdoptionNote.test.tsx` passes |
| 5  | "Restart Steam now" does something observable wherever the page shows it, including the GameLib 1026 waiting edge (D-02) | PRESENT_BEHAVIOR_UNVERIFIED | Code+tests only; with a record: live (items 4, 10c, 11c) | See Gap 2 reconciliation below. The no-record branch is real and wired; the live press (item 12) was never run |
| 6  | Signed-out Steam: note "Sign in to Steam to finish setup" + Open Steam; Play opens Steam and keeps the record (D-03) | VERIFIED | Live on macOS (item 3, item 7b), Windows (10e), Linux (11e retest: note shown while signed out, stayed 40 s+, cleared within 30 s of sign-in) | `playAdoption.ts`; `adoption_evidence.rs` 28/28 including the Connecting-line scan-back; the Linux "Open Steam" raise is a separate human item |
| 7  | Refused restart (game running / wrap owed / quit timeout) never falls back to a plain launch, shows the notice, with Launch without Steam for eligible games (D-05) | VERIFIED | Game-running: live on macOS (item 5 re-run, real log lines), Windows (10b, real log lines), Linux (11b retest, operator-reported only). Wrap-owed and quit-timeout: code+tests only | See Gap 1 reconciliation below. DRM sub-check never run live. A bridged (bottled) game is not detected on macOS (todo, warning below) |
| 8  | One decision point for the launch-without-Steam setting (D-06) | VERIFIED | Code+tests; live part of item 5 ("Launch without Steam" pressed twice started the game once, record stayed pending) | `launchDispatch.ts`; `launchDispatch.test.ts` passes |
| 9  | Rust adoption watch runs only while records exist, emits a typed `adoptionState` event, the note clears with no reload (D-07) | VERIFIED | Live on macOS (item 3, 7b), Windows (10e/f), Linux (11e); `tests/adoption.rs` 44/44 | `adoption.rs` watch/unwatch; boot `resumeAdoptionWatches` at `bootstrap.ts:2888-2889` |
| 10 | Helper `--steam-appstate` reports BLoggedOn and GetAppInstallState (D-08) | VERIFIED | Live (item 1, three states) | `app_state.rs` 10/10. `steamAppStateHelper.test.ts` is `describe.skip` off darwin (Mach-O compile), so it was skipped here; the live item 1 covers it |
| 11 | InstallApp preferred when on; fires once only after a seen sign-in that did not adopt (D-09) | VERIFIED | Live (item 7a, 7b) | `gameInstallDepot.ts`; `on_macos_install_app_*` adoption tests |
| 12 | Helper unavailable / unreadable state fails safe: record kept, note stays, Play as WR-01 (D-10) | VERIFIED | Code+tests (item 1c live for the `unavailable` reading) | `on_macos_an_unavailable_helper_never_adopts_...`, `a_missing_or_unreadable_manifest_never_adopts_...` |
| 13 | Boot migration turns valid persisted holds into pending records, drops ACF-gone ones, deletes the store (D-12) | VERIFIED | Live (item 6) | `migrateRestartHolds` at `bootstrap.ts:2888`; `hold_migration.rs` 29/29 |
| 14 | Windows and Linux get restart-on-Play with non-helper evidence; a pid change alone is never adoption (D-14) | VERIFIED | Live: Windows item 10 pass (2026-11-19); Linux item 11 pass after retests (2026-11-20) | `adoption_evidence.rs` 28/28, `on_windows_*`/`on_linux_*` adoption tests, `win_live.rs` 23/23. Reservations: the Windows pid-change-with-record-already-pending case was not shown (pid changed before the record was written); Linux retests (b, e, a, layout) are operator-reported plus desk reads of Steam's logs, no session directory kept |
| 15 | The adoption watch never overlaps a slow tick | PRESENT_BEHAVIOR_UNVERIFIED | Code only | Structural (`adoption.rs:379-381`); no test, unchanged since the prior report |

**Score:** 13/15 truths verified (2 present and wired, behavior-unverified; 0 failed; 0 overrides)

### Gap reconciliation

**Prior Gap 1 (D-05 refusal inert on macOS): CLOSED, live-verified.** Evidence checked in the current tree, not in the SUMMARY:

- `src-tauri/crates/gamelib-steampoll/src/running.rs:113-126` `read_running_app_id_or_process_scan`: registry read first, then on Darwin only, when that reads 0, `scan_running_app_id` over `running_scan.rs` (a libproc `proc_listallpids`/`proc_pidpath` scan by executable path under each Steam library's `steamapps/common/<installdir>`, mapped to an appId by ACF). `dispatch.rs:21,495` calls it for the on-demand `steampoll_read_running_app_id` op.
- `macSteamAdoption.ts:354-361` `createRestartDeps.readRunningAppId` goes through `readMacRunningAppId`, which invokes that op (`runningPoll.ts:37-41`). The refusal at `macSteamAdoption.ts:423-429` is therefore reachable on macOS.
- Live: UAT item 5 re-run 2026-11-18: Avadon 112100 running, Play on pending 211820 showed the notice, steam_osx pid 34894 unchanged, `[Steam] not restarting Steam for 211820: game 112100 is running`, no `fired steam://exit`; Restart Steam now also refused; Launch without Steam pressed twice started the game once. This is the real reader against real Steam on the Mac, not a stub, which is exactly what the earlier report said was missing.
- Not covered: the DRM sub-check and the Bastion relative-argv case were not run live. The Darwin `list_process_exe_paths` body is `#[cfg(target_os = "macos")]`, so it did not compile or run in this Linux verification; `tests/running_scan.rs` (14/14) drives the matcher through an injected lister.
- Residual, warning not gap: a bridged (bottled, wine-run) game is invisible to this scan, so Mac Steam can still be restarted under it. Todo `2026-11-18-mac-steam-restart-ignores-running-bottled-game.md` (major, macOS, ready: code, pending). CONTEXT D-05 says "a game is running in Steam"; a bottled game is outside that wording, so this is an extension, tracked.

**Prior Gap 2 (1026-edge "Restart Steam now" no-op): CLOSED IN CODE, NOT LIVE-VERIFIED.** Checked in the current tree:

- `adoptionStatus.ts:261-283` `runRestartNow`: the no-record branch now calls `runWaitingEdgeRestart` (218-251) instead of returning `no-record` unconditionally. That function acts only when `hasGameLibInstallPoll` (156-180) finds a non-delegated poll for the appId in Rust `steampoll_status`; then Steam not running goes to `startSteamForWaitingInstall` (`steam://open/main` only, no `steam://exit`), Steam running goes to `restartSteamForAdoption`. Both D-05 guards (game running, wrap owed) apply on both branches; the quit-timeout guard on the running branch. Status emits are no-ops there because the Rust poll owns the game status. A record path is unchanged and never reads poll status.
- The edge check is consistent with the producer: Rust `install_once.rs` sets `steam-waiting-for-restart` only when `state_flags == 1026 && poll.handoff.is_native_handoff`; `is_native_handoff` is set only by `gameInstallDepot.ts:327,581` (GameLib depot installs), while `delegatedToSteamClient` is set only by `gameInstall.ts:440,475` and `updateNative.ts:123` (Steam's own installs). The two never combine, so "waiting edge" implies "non-delegated poll". The `PollStatus` TS shape (`appId`, `delegatedToSteamClient`, `awaitingUpdate`) matches Rust `InstallStatus` (`rename_all = "camelCase"`, `install_loop.rs:96-102`).
- `adoptionStatus.test.ts`: 53/53 pass now, including the new cases: Steam not running starts with `steam://open/main` alone; Steam running restarts gracefully with no game; darwin and linux variants; game-running, wrap-owed and quit-timeout refusals on both branches; fail closed on another appId's poll, a delegated poll, a rejected `steampoll_status`, a malformed answer; a record present never reads the poll status.
- What the tests are: the logic under test (`runWaitingEdgeRestart`, `restartSteamForAdoption`) is real, but `requestRustInvoke`, `openExternal`, the process runner, the clock and the window push are stubbed. They prove the decision logic and the call shapes. They do not prove that Steam actually comes up from the button at a real 1026 edge. That is item 12, never run (deferred by operator decision; the edge could not be produced on Linux, see the UAT result for what was tried). Hence PRESENT_BEHAVIOR_UNVERIFIED rather than VERIFIED: it asserts a user-visible state transition the page performs.
- Copy follow-up: the 1026-edge refusal notices said "press Play"; fixed by `668afeab4` (all three adoptRestart strings now say "try again"; todo moved to `completed/`). The prior handover note listing it as pending is out of date. Other locales keep their translated copy until retranslated.

### Required Artifacts

Every artifact declared by the 20 plans existed and passed `verify.artifacts` in the prior report; this pass re-checked the changed and central ones in the current tree: `adoption.rs`, `adoption_evidence.rs`, `hold_migration.rs`, `running.rs`, `running_scan.rs`, `adoptionStatus.ts`, `adoptionWatch.ts`, `playAdoption.ts`, `macSteamAdoption.ts`, `runningPoll.ts`, `AdoptionNote.tsx`, `steam_window.rs` (Linux X11 arm present at lines 233-329). All exist, are substantive and are wired. `hold.rs` and `rearm.rs` correctly absent.

### Key Link Verification

Prior report: 32/33 verified (the 33rd, "operator run" to `81-HUMAN-UAT.md`, is not a code link). Re-traced this pass:

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `AdoptionNote.tsx` "Restart Steam now" | `window.api.steamAdoptionRestartNow` | `answerSteamAdoptionRestartNow` to `restartSteamNowForAdoption` to `runRestartNow` | WIRED, both record and no-record branches |
| `runWaitingEdgeRestart` | Rust `steampoll_status` | `invokeSteamPoll(deps, RUST_STEAMPOLL_STATUS)` to `dispatch.rs:531` | WIRED, shape matches |
| `restartSteamForAdoption` guard | Mac running-game scan | `createRestartDeps.readRunningAppId` to `readMacRunningAppId` to `steampoll_read_running_app_id` to `read_running_app_id_or_process_scan` | WIRED (was DISCONNECTED) |
| Install end | pending record + Rust watch | `recordAndWatchPendingAdoption` to `steampoll_adoption_watch` to `adoptionState` event to TS clear to `steamAdoptionStatusChanged` | WIRED (live item 3) |
| Boot | migration then watch resume | `bootstrap.ts:2888-2889` | WIRED |
| Linux "Open Steam" | X11 raise | `openSteamForAdoption` (win32 and linux) to `RUST_STEAM_WINDOW_RAISE` to `steam_window.rs` | WIRED in code, live-unconfirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `AdoptionNote.tsx` | `status` | `steamAdoptionStatus` query + push store, fed by the pending store and the Rust watch's signed-in reading | Yes | FLOWING |
| `restartSteamForAdoption` | `runningAppId` | Rust registry read then Darwin process scan (macOS); reaper scan `AppId=` form (Linux, `8d3906c4c`); HKCU (Windows) | Yes on all three; live on all three | FLOWING (was DISCONNECTED on macOS) |
| `runWaitingEdgeRestart` | poll `installs` | Rust `steampoll_status` | Yes (real registry of active polls) | FLOWING in code; the edge itself unproven live |
| Linux signed-in reading | `connection_log` state | `connection_log_signed_in` scanning past `Connecting` lines (`adoption_evidence.rs:252-271`, `3c01e6d07`) | Yes | FLOWING (live retest) |

### Behavioral Spot-Checks and Test Runs

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| gamelib-steampoll crate | `cargo test -p gamelib-steampoll` (from `src-tauri/`) | 538 passed, 0 failed, 1 ignored (`tests/dispatch.rs`) across 24 test binaries; includes adoption 44, adoption_evidence 28, hold_migration 29, running 28, running_scan 14, contracts 11, install_loop 48, win_live 23; exit 0 | PASS |
| Phase 81 backend and frontend jest | `npx jest --runTestsByPath` on adoptionStatus, adoptionWatch, macSteamAdoption, playAdoption, launchDispatch, steamAppStateHelper, SteamEngineLaunchNotice, AdoptionNote, SteamAdoptionStatus, SteamRequestNotice, steamPollsPortComplete, steamPollChannelParity, steamPollEventRegistration, steamPollStateEventParity | 13 suites passed, 1 skipped (`steamAppStateHelper`, `describe.skip` off darwin: 7 tests), 352 tests passed, 0 failed | PASS |
| 1026-edge no-record press | `npx jest --runTestsByPath .../adoptionStatus.test.ts --verbose` | 53/53 pass, listed cases above | PASS (stubbed boundaries, see Gap 2) |
| Debt markers | grep TBD/FIXME/XXX over the phase's central files | none | PASS |

Not re-run: the full 36-suite jest set of the prior report (only the 14 above were requested and run), the macOS-only `cfg(target_os = "macos")` code, the `src-tauri` shell crate tests (`steam_window.rs` Linux arm), and `pnpm planning-gates`. The pre-existing reds in `deferred-items.md` (storeKinds, NativePortInfo census, acfUpdateReplay oracle, preload-surface inventory) were not re-run.

### Probe Execution

No probes declared by the phase. Not applicable.

### Live Gate (81-HUMAN-UAT.md, status partial, updated 2026-11-20)

| Item | Result | Note |
| ---- | ------ | ---- |
| 1, 2, 3, 4, 6, 7, 8, 9 (macOS) | pass | Sub-issues filed as todos, all closed except the two Mac-only ones below |
| 5 (macOS, D-05) | pass (re-run 2026-11-18 after quick 261118-uma) | DRM sub-check and Bastion relative-argv not run live |
| 10 (Windows 11) | pass 2026-11-19 | (e) "Open Steam" raise fixed and operator-confirmed; pid-change-with-pending-record not shown |
| 11 (Linux) | pass 2026-11-20 after retests | ELF +x (`c3e6d3ae4`, live), reaper marker (`8d3906c4c`, operator-reported), Connecting lines (`3c01e6d07`, operator + log read), button placement (`1ae713663`, `c2109b6e1`, operator-confirmed); Linux Open Steam raise (`ec530001e`) has no recorded live retest |
| 12 (macOS item, 1026 edge) | blocked, deferred by operator decision | Code fix `62a27f932` unit-tested only. The item's own header still says "expected to fail today"; the code has since changed, so the item text is stale |

Reconciliation notes: the UAT's own file `status: partial` is consistent (item 12 unrun). Item 11's `result: pass` rests partly on operator-reported retests with no Claude-captured lines; those are recorded as such in the UAT, and the corresponding truths (7 on Linux, 6 on Linux, 14) are marked VERIFIED on the strength of the Windows and macOS live evidence for the same code plus the Linux unit tests, with the Linux reservation stated.

### Requirements Coverage

No REQUIREMENTS.md IDs (Requirements: TBD). Decision coverage stands in: D-01..D-14 each map to a verified truth above (D-15 simplified hold: not needed, Windows and Linux got the helper-free restart-on-Play per spikes 087/088). D-02 at the 1026 edge is the one decision whose shipped behavior is unproven live.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| Phase central files (`adoptionStatus.ts`, `playAdoption.ts`, `macSteamAdoption.ts`, `running.rs`, `running_scan.rs`, `adoption_evidence.rs`, `AdoptionNote.tsx`) | - | TBD/FIXME/XXX | none found | - |
| `ec530001e` (`steam_window.rs`, plus a repo-wide rustfmt pass across `src-tauri`) | - | committed "unreviewed by the operator's instruction"; formatting hunks "not re-read" | Warning | Process note, not a goal failure; the Linux raise is live-unconfirmed |

No blocker anti-patterns. The prior blocker (`AdoptionNote.tsx` action with no backend target) no longer applies: the no-record press now has a target at the edge, and fails closed to `no-record` (no visible effect, no error) anywhere else.

### Test Quality Audit

| Test File | Linked Truth | Skipped | Circular | Assertion Level | Verdict |
| --------- | ------------ | ------- | -------- | --------------- | ------- |
| `tests/running_scan.rs` (14) | 7, D-05 macOS | 0 | no | Behavioral through an injected lister; real libproc body is macOS-only and unrun here | OK for the matcher; live item 5 covers the real reader |
| `macSteamAdoption.test.ts` seam test (261118-uma) | 7 | 0 | no | Non-zero `steampoll` reply refuses without quitting Steam; this drives the real `createRestartDeps` reader path, not a stubbed `readRunningAppId` | OK, closes the prior "stub hides the blind reader" finding at the unit level |
| `adoptionStatus.test.ts` (53) | 5 | 0 | no | Behavioral on real decision logic; boundaries stubbed | Proves the logic, not the live press (hence behavior-unverified) |
| `tests/adoption.rs` (44), `tests/hold_migration.rs` (29), `tests/adoption_evidence.rs` (28) | 9-14 | 0 | no | Behavioral / value | OK |
| `playAdoption.test.ts`, `AdoptionNote.test.tsx` | 3, 4, 6 | 0 | no | Value/behavioral | OK |
| (none) | 15 | - | - | - | MISSING: no slow-tick test for the adoption watch |

### Todos classified (pending and recently closed, phase-related)

| Todo | Status now | Phase 81 gap? |
| ---- | ---------- | ------------- |
| `2026-11-18-mac-restart-on-play-ignores-running-game-no-runningappid.md` | completed | Was Gap 1; closed |
| 1026-edge "Restart Steam now" (deferred-items.md, no todo) | fixed in code (`62a27f932`), live unrun | Was Gap 2; now truth 5 behavior-unverified |
| `2026-11-20-1026-edge-refusal-notices-tell-the-user-to-press-play.md` | completed (`668afeab4`) | No |
| `2026-11-18-adoption-note-restart-steam-now-button-placement.md`, `2026-11-19-windows-open-steam-...`, `2026-11-19-pending-adoption-log-says-steam-osx-pid-...`, `2026-11-18-depot-install-misses-exec-bit-...`, `2026-11-18-steam-launch-watch-misses-script-...`, the four Linux 2026-11-20 todos | completed | No |
| `2026-11-18-adoption-note-restart-flash-at-install-end.md` | pending, minor, macOS, ready: live-gate | Phase-introduced, warning; final state correct |
| `2026-11-18-mac-uninstall-notification-not-seen-dev-build.md` | pending, minor, macOS, ready: live-gate | Not a gap (item 9 behavior passed); notification delivery unverifiable on Linux |
| `2026-11-18-mac-steam-restart-ignores-running-bottled-game.md` | pending, major, macOS, ready: code | Narrows D-05 on macOS for bridged games; extension beyond "game running in Steam"; warning |

### Human Verification Required

1. **Live gate item 12 (1026 waiting edge).** Reproduce a GameLib depot install that finalizes at 1026 and press "Restart Steam now" with Steam running, with Steam not running, and with a game running. Expected as in `behavior_unverified_items`. Operator deferred it; closes truth 5.
2. **Adoption watch no-overlap.** Add a slow-runner test to `tests/adoption.rs`; expected max in-flight 1. A test, not a live run; closes truth 15.
3. **Linux (X11) "Open Steam" raise.** Sign out, press Open Steam, the sign-in window should come forward. Unconfirmed since `ec530001e`.
4. **macOS notification and install-end flash.** The "Game Uninstalled" notification (todo, Mac dev build) and the 1-2 s note flash (todo). Mac only, cannot be checked on Linux.
5. **Residual live-evidence gaps, recorded not blocking:** item 5 DRM sub-check and Bastion relative-argv; Linux item 11 retests as operator-reported; Windows pid-change-with-record-already-pending.

### Gaps Summary

No truth is failing. Both blockers from the 2026-11-18 report are closed, and their closure is checked in the current code, not taken from the SUMMARY or the handover:

- D-05 on macOS now has a real running-game signal (Darwin libproc scan behind the on-demand Rust op), reachable from the restart guard, and was live-verified on the Mac against a real Steam with real log lines, then also live on Windows and Linux.
- The 1026-edge "Restart Steam now" now has a backend target (Rust `steampoll_status` as the edge check, start-or-restart behind both D-05 guards) with 53 passing unit tests, but its live press was never run, so it is reported as behavior-unverified, not live-verified.

Status is `human_needed`, not `passed`, for two reasons: truth 5 (live item 12, plus the Linux Open Steam raise and the two Mac-only todos, none of which can be done from this machine) and truth 15 (the adoption watch's no-overlap tick guarantee still has no test, which is closable without a live run). No later milestone phase covers any of these, so nothing is deferred.

---

_Verified: 2026-11-19T17:33:26Z_
_Verifier: Claude (gsd-verifier)_
