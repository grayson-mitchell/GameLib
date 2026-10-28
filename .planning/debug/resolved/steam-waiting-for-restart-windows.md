---
slug: steam-waiting-for-restart-windows
status: resolved
trigger: "D-UAT-13: on Windows, a Steam native install that completes while the Steam client is running flips straight to Play instead of entering steam-waiting-for-restart / 'Restart Steam to finish'; Play then opens Steam's install dialog because the running client never re-read the StateFlags 4 manifest."
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/completed/2026-10-29-steam-play-shown-before-steam-restart-windows.md
related_uat: .planning/milestones/v0.7-phases/21-steam-native-install/21-UAT.md (section "Windows hardware pass (2026-10-29)", D-UAT-13; D-UAT-07 is blocked on this)
---

# Debug: Play shown instead of "Restart Steam to finish" after a native install with Steam running (Windows)

## Symptoms

Prefilled from the operator's 2026-10-29 Windows UAT run (`/gsd-verify-work 21`); the operator was
not re-asked.

- **Expected:** When GameLib's own depot download finishes and writes `appmanifest_<id>.acf` with
  `StateFlags 4` while the Steam client is already running, GameLib enters the
  `steam-waiting-for-restart` status (21-16), and the GamePage primary button shows the disabled
  "Restart Steam to finish" hint (D-UAT-07 fix `ab0500c6`). Play appears only after Steam restarts and
  adopts the manifest.
- **Actual:** The install poll immediately logs
  `Steam: install polling complete for appId <id> — badge flipped to installed`, and the detail page shows
  **Play**. Clicking Play (`launching appId 262060 via steam://rungameid/262060`) opens Steam's *install*
  dialog. After a full Steam restart Steam shows the game installed and Play works.
- **Error messages:** none; the defect is a wrong state transition.
- **Timeline:** First observed 2026-10-29 on Windows 11, GameLib `main` @ `ffc425321` (`pnpm tauri:dev`).
  On macOS (21-UAT item 1a, 2026-07) the waiting-for-restart hint did appear on the Library tile, which
  is what D-UAT-07 was filed against. Behaviour may have regressed since (e.g. `260822-dkf D-02`
  native-handoff poll upgrade), or may be Windows-specific.
- **Reproduction (twice, Steam running throughout, PID 37364 since 2026-10-28 15:35):**
  1. Darkest Dungeon 262060, *resume* path: cancel with keep files → Resume Install (09:54) → finish
     09:57:15. Log at finalize:
     `Writing StateFlags=4 full-ownership manifest for appId 262060 (sizeOnDisk=2264929176, buildid=25810065)`
     → `Steam: upgrading in-flight install poll for appId 262060 to isNativeHandoff (260822-dkf D-02)`
     → `[DownloadManager]: Finished Installation of 262060`
     → `Steam: install polling complete for appId 262060 — badge flipped to installed`.
     Poll start line: `Steam: starting install polling for appId 262060 (interval 3000ms, source native, isNativeHandoff false, skippedDepots 0, delegatedToSteamClient false)`.
  2. Total War: PHARAOH DYNASTIES 2951630, *first install*: same outcome (Play shown with Steam running).
     A later poll line: `Steam: starting install polling for appId 2951630 (interval 3000ms, source native, isNativeHandoff true, skippedDepots 0, delegatedToSteamClient false)`.
- **Log:** `C:\Users\grays\AppData\Local\GameLib\logs\gamelib.log` (2026-10-29 session).

## Starting pointers (unverified)

- Where `statusContext: 'steam-waiting-for-restart'` is set and cleared in `src/backend/storeManagers/steam/`
  (21-16), and the install-poll completion that logs "badge flipped to installed".
- How "Steam is running" is detected on Windows (process check / registry `ActiveProcess`) vs macOS —
  `HKCU\Software\Valve\Steam` showed an empty `ActiveProcess` value on this box while steam.exe was running.
- `260822-dkf D-02` isNativeHandoff upgrade at finalize.

## Constraints

- Windows-only reproduction: the fix must keep macOS behaviour (1a) intact.
- Spawning child processes from `src/`/`meta/` must use `createFakeHomeProfile()` (gamelib-conventions).

## Current Focus

bug_class: Bohrbug (deterministic state-machine gap; reproduced twice, log shows identical sequence)
hypothesis: "pollInstallOnce() emits the steam-waiting-for-restart context ONLY from its 'downloading' branch, gated on StateFlags===1026. Since Phase 23 (a7d8d8c3d, 2026-07-17) GameLib's finalize writes StateFlags=4 directly (canWriteFullOwnership 'trustworthy 4' fast path), so the very first poll tick lands in the 'installed' branch, which emits gameStatusUpdate{status:'done'} (no context) + pushGameToLibrary{is_installed:true} -> MainButton renders Play (it keys purely on gameInfo.is_installed). The waiting state is therefore unreachable on EVERY platform for any install that earns the fast path; it is NOT Windows-specific."
test: "(a) confirm log shows 'Writing StateFlags=4 full-ownership manifest' (fast path) not 1026 for both repros; (b) confirm 'installed' branch has no waiting-context emit; (c) git history: 54eae3c41 (2026-08-17) added only a one-shot toast to the 'installed' branch for the same gap."
expecting: "all three true -> hypothesis confirmed; fix = hold the poll in 'waiting for restart' for a native handoff when the Steam client that was running at finalize is still the same process, clear it when that process exits/is replaced."
status_note: "CONFIRMED by code read + log + git history (see Evidence). Root cause is platform-independent."
reasoning_checkpoint:
  hypothesis: "pollInstallOnce's 'installed' branch flips the badge to Play and stops the poll for a GameLib native-handoff install even though the Steam client that was running at finalize has never re-read the new StateFlags=4 manifest; the waiting-for-restart context is only ever emitted from the 'downloading' (StateFlags===1026) branch, which the Phase 23 fast path no longer reaches."
  confirming_evidence:
    - "gamelib.log 09:57:15 and 11:01:00: 'Writing StateFlags=4 full-ownership manifest' then 'install polling complete ... badge flipped to installed' within 0-3s, no 'downloading' tick in between (both repros)"
    - "library.ts: the only 'steam-waiting-for-restart' emit is inside `result.state === 'downloading'` gated on stateFlags===1026; 'installed' branch sends pushGameToLibrary{is_installed:true} + gameStatusUpdate{done}"
    - "git: fast path landed a7d8d8c3d 2026-07-17; 54eae3c41 (2026-08-17) already documented 'structurally unreachable on fast path' and added ONLY a toast; macOS 1a (WazHack 1026->4) predates the fast path"
    - "Live: Steam PID 37364 (never restarted) ignored the manifest -> install dialog on Play; a full restart (PID 13712) adopted it (UAT + wazhack session Round 4 on macOS)"
  falsification_test: "If, with Steam running un-restarted, the 'installed' tick is made to hold (status installing + context steam-waiting-for-restart, no is_installed push) and Play STILL appears on the detail page, or the hold persists after Steam is fully exited/relaunched, the hypothesis/fix is wrong. Unit-level: a probe returning the same PID keeps the hold; a probe returning [] / a different PID releases it into the normal installed flow."
  fix_rationale: "Treat 'GameLib finalized a native manifest while a Steam client process was alive' as the waiting state, exactly as the 1026 path did: hold the poll, emit the waiting context each tick, suppress is_installed:true (also in refresh()/refreshInstallState(), which focus-reconcile would otherwise flip to Play), and release into the unchanged installed flow once the recorded Steam PID(s) are gone. Fixes the cause (missing state + missing adoption signal), not the symptom (button label)."
  blind_spots: "Cannot restart Steam or run a real install here (operator checkpoint required). Hold is in-memory: a GameLib restart while Steam is still un-restarted re-derives from ACF (-> Play). Steam adoption itself is inferred from 'old Steam PID gone' (a restart is the only adoption trigger per wazhack Round 3/4), not observed. Linux/Flatpak pgrep name untested."
  candidate_causes:
    - "code: 'installed' branch lacks waiting-state handling for the fast path (CHOSEN, confirmed)"
    - "environment: Windows-only 'Steam running' detection difference (ELIMINATED: library.ts never checks whether Steam runs; ActiveProcess\\pid is populated)"
    - "data: manifest content makes Steam adopt live (ELIMINATED: Steam PID 37364 demonstrably did not; wazhack Round 3/4 shows restart-only adoption)"
  and_gate: "no - a single missing code path explains both repros; the hold-release and refresh-reconcile pieces are parts of one fix, not independent causes"
status: resolved (see frontmatter). Fix committed (128148bf3) and verified end-to-end by the operator on real Windows hardware 2026-10-29.
next_action: "none - session closed. Open edge (not fixed): the hold is in-memory only; see Resolution.open_edge and the pending todo."

## Evidence

- timestamp: 2026-10-29
  checked: gamelib.log lines 334-342 (Darkest Dungeon resume) and 948-956 (Total War first install)
  found: Both runs log `Writing StateFlags=4 full-ownership manifest for appId <id>` (NOT a 1026 write) immediately followed by `install polling complete ... badge flipped to installed` within 0-3s. Total War poll started with isNativeHandoff true; DD's was upgraded (260822-dkf). Neither ever logged a 'downloading' tick after finalize.
  implication: The fast path (StateFlags=4 at finalize) is what both repros took. resume vs first-install is irrelevant (D-UAT-13's "check the resume path" pointer is eliminated).

- timestamp: 2026-10-29
  checked: src/backend/storeManagers/steam/library.ts pollInstallOnce (L2620-2923)
  found: 'steam-waiting-for-restart' context is sent at exactly one site (L2724), inside `result.state === 'downloading'`, gated `result.stateFlags === GAMELIB_HANDOFF_STATE_FLAGS && poll?.isNativeHandoff === true`. The 'installed' branch (L2817) sends pushGameToLibrary{is_installed:true} + gameStatusUpdate{status:'done'} + notify('Installation Finished') + (if isNativeHandoff) a one-shot "Restart Steam to finish installing" TOAST, then stopInstallPolling.
  implication: On the StateFlags=4 fast path the waiting context is structurally unreachable; only a transient toast is shown.

- timestamp: 2026-10-29
  checked: git history
  found: 0dddae268 (2026-07-16) added the poll-time waiting signal (1026 only). a7d8d8c3d (2026-07-17) de-gated finalizeToSteam onto canWriteFullOwnership (fast path writes 4). 54eae3c41 (2026-08-17, debug/wazhack-uninstall-reverts) spotted the same unreachable-on-fast-path gap on macOS and added ONLY the toast. macOS UAT 1a (WazHack, 'adoption 1026->4') predates the fast path, which is why macOS "showed the hint".
  implication: Regression is platform-independent; macOS today has the same defect. The starting hypothesis "Windows-specific / 260822-dkf D-02 regression" is eliminated.

- timestamp: 2026-10-29
  checked: MainButton.tsx L298-328 and DM suppression in downloadqueue.ts L312/L455
  found: Play vs Install block is chosen solely by gameInfo.is_installed. For steam the DownloadManager suppresses its own 'done' status/toast; the ACF poller owns the terminal 'done'. The waiting label (L206-217) only renders in the !is_installed branch while status 'installing' + context 'steam-waiting-for-restart'.
  implication: To show the hint on the fast path the poll must keep status 'installing' + context and must NOT push is_installed:true until Steam has adopted.

- timestamp: 2026-10-29
  checked: read-only registry/process probe on this Windows box
  found: `reg query HKCU\Software\Valve\Steam\ActiveProcess` -> `pid REG_DWORD 0x3590` (=13712); `Get-Process steam` -> Id 13712 StartTime 11:15:23 (the post-restart Steam). So ActiveProcess\pid IS populated and matches the live client (the todo's "empty ActiveProcess value" referred to the key's default value, not `pid`).
  implication: A cheap, spawn-light Windows probe for "which Steam client is running" exists.

- timestamp: 2026-10-29
  checked: refreshInstallState() / refresh() callers (steamFlowRegistration.ts shellWindowFocused -> refreshInstallState; library.ts L1163, L1496) and the poll interval callback (startInstallPolling)
  found: Two second-order traps a naive "just emit the context" fix would hit. (1) refreshInstallState() runs on every window-focus (D-01) and flips is_installed from the ACF alone, so the moment the user alt-tabs back from Steam the held game would become Play again; refresh() has the same ACF-only derivation. (2) The interval callback's "no manifest ever appeared -> user cancelled" grace branch fires after GRACE_TICKS (20 ticks = 60 s) for any poll with seenDownloading=false (the fast path never sets it) and would emit a terminal 'done' and stop the poll, tearing a hold down after a minute.
  implication: The hold must (a) set seenDownloading, (b) be consulted by both ACF-derived install-state readers, (c) have its own release at the MAX_TICKS cap and on manifest-gone so the UI is never stranded.

- timestamp: 2026-10-29
  checked: 1026-handoff lifecycle (GameLib writes 1026 when canWriteFullOwnership fails; user restarts Steam; Steam adopts and rewrites to 4)
  found: Arming the hold on every isNativeHandoff 'installed' tick would ALSO fire on that 1026 -> 4 flip, recording the freshly restarted (already-adopting) Steam as "the client that has not seen the manifest" and making the user restart Steam twice. Caught in review of my own diff before any run; fixed by releasing the hold the moment a 1026-with-isNativeHandoff tick is observed (the ACF expresses the wait there). Regression test pinned and mutation-verified.
  implication: macOS UAT 1a (1026 -> 4 adoption) path is behaviourally unchanged.

- timestamp: 2026-10-29
  checked: real probe on this box: bundled src/backend/storeManagers/steam/steamClientProcess.ts with esbuild and ran listSteamClientPids() against the live Steam
  found: `listSteamClientPids() -> [13712] in 181 ms`, equal to `Get-Process steam` Id 13712 (the post-restart Steam).
  implication: The Windows probe (tasklist /FI "IMAGENAME eq steam.exe" /FO CSV /NH, parsed by image name + PID) works against the real client.

- timestamp: 2026-10-29
  checked: tests. library.test.ts baseline BEFORE change: 257 passed / 5 failed (all pre-existing Windows-path/macOS-binary: pollUninstallOnce dual-install x4, locateMachOBinary x1). AFTER: 18 new D-UAT-13 tests + 15 new steamClientProcess tests, 0 new failures, the same 5 failures. tsc (src + meta) clean; prettier clean on all 4 files; eslint warning count identical to HEAD (library.ts 92, library.test.ts 133; the two I briefly added were refactored away); fakeHomeIsolation gate passes; MainButton.steamWaitingRestart + hasStatus.reconcile pass (17). Wider steam/ dir run: 102 failures in 11 suites, all in macOS/bridge/bottle/DRM/Windows-path suites that never run the real poller (games.test.ts etc. spy startInstallPolling).
  found: Mutation checks (each reverted): hold disabled -> 9 of the new tests fail; seenDownloading line removed -> grace-window, manifest-gone and cap tests fail; cap special-case removed -> cap test fails; refresh filter removed -> focus-reconcile test fails; 1026 no-rearm guard removed -> 1026->4 test fails.
  implication: The new tests are not vacuous; baseline-equal elsewhere.

- timestamp: 2026-10-29
  checked: live human-verify gate on the operator's Windows box. Fresh `pnpm tauri:dev` bundle built 12:03; small game appId 264160, Steam client pid 13712 running throughout. Operator replies (verbatim): "ok, have the restart steam to finish." / "restarted steam, play button showing now" / "game launched, no install dialog". Log read by the session coordinator, `C:\Users\grays\AppData\Local\GameLib\logs\gamelib.log`.
  found: |
    (12:06:04) [Timing] buildDepotPlan: total 1333ms for appId 264160 (1 depot(s))
    (12:06:19) Writing StateFlags=4 full-ownership manifest for appId 264160 (sizeOnDisk=121961217, buildid=9044149)
    (12:06:22) Steam: native install of appId 264160 finalized while the Steam client (pid 13712) is running - holding in steam-waiting-for-restart until it restarts (D-UAT-13)
    (12:07:58) Steam: the Steam client that was running when appId 264160 finalized (pid 13712) has exited - releasing steam-waiting-for-restart (D-UAT-13)
    (12:07:58) Steam: stopped install polling for appId 264160
    (12:07:58) Steam: install polling complete for appId 264160 - badge flipped to installed
    New Steam pid after relaunch: 5608. No 'badge flipped to installed' between finalize (12:06:19) and the release (12:07:58); the release fired 0 s after the logged Steam exit.
  implication: The falsification test in reasoning_checkpoint did not fire. The hold engaged on the StateFlags=4 fast path, persisted for ~96 s while the old Steam lived, released only when that PID exited, and the relaunched Steam (pid 5608) adopted the manifest: Play launched the game with no install dialog. Hypothesis and fix confirmed on real hardware.
  not_observed: "The Library tile hint and the alt-tab-to-Steam-and-back persistence (check 3 'alt-tab') were NOT explicitly reported by the operator (they reported the detail-page 'Restart Steam to finish', the Play button after restart, and a clean launch). Both are unit-tested (tile uses the same statusContext label path; focus-reconcile test mutation-verified) but were not separately observed live."

## Eliminated

- hypothesis: Windows-specific detection of "Steam is running" (registry ActiveProcess empty) makes the state skip on Windows
  evidence: library.ts never consults whether Steam is running at all; the 1026 gate is the only condition. ActiveProcess\pid is in fact populated (13712).
  timestamp: 2026-10-29
- hypothesis: resume path (resumeInterruptedSteamInstall bare poll + 260822-dkf upgrade) skips waiting-for-restart marking that a first install sets
  evidence: Total War first install (isNativeHandoff true from the start) behaves identically; both took the StateFlags=4 fast path.
  timestamp: 2026-10-29

## Resolution

root_cause: "Since Phase 23 (a7d8d8c3d, 2026-07-17) GameLib's native finalize writes the manifest at StateFlags=4 (fast path), so the install poller's first tick is already 'installed'. The 'steam-waiting-for-restart' status was only ever emitted from the poller's 'downloading' branch, gated on StateFlags===1026, and is therefore unreachable. The 'installed' branch pushed is_installed:true + status 'done' (Play) even though the Steam client running at that moment never re-reads manifests until it restarts, so Play (steam://rungameid) opened Steam's install dialog. Platform-independent (macOS has the same defect on the fast path; 54eae3c41 only added a toast). Not Windows-specific and not resume-path-specific. The ACF cannot carry the adoption signal (Steam adopts it verbatim), so a process-level signal is needed."
fix: "New leaf steamClientProcess.ts: listSteamClientPids() (win32 tasklist by image name+PID; darwin pgrep -x steam_osx; linux pgrep -x steam; [] = not running, undefined = unknown -> fail open). library.ts: install polls gain steamHold ('unprobed'|'holding'|'released'), steamPidsAtHandoff, lastSteamProbeMs. In pollInstallOnce's 'installed' branch, for a native-root isNativeHandoff poll, shouldHoldForSteamRestart() probes Steam once; if a Steam client is alive it HOLDS: re-emits gameStatusUpdate{installing, context:'steam-waiting-for-restart'} each tick, fires the restart toast once, pushes no is_installed, no 'Installation Finished', keeps the poll alive. Release (-> the unchanged installed flow) when every recorded PID is gone (re-probed at most every 10 s), when Steam rewrites the manifest to an active download, or at the MAX_TICKS cap; manifest vanishing for MANIFEST_GONE_TICKS ends it with a terminal done. A 1026-with-isNativeHandoff tick releases permanently (the ACF expresses that wait; prevents re-arming on the 1026->4 flip). seenDownloading is set on hold so the 60 s grace branch cannot tear it down. refresh() and refreshInstallState() drop held apps from the ACF-derived installed map so a focus reconcile cannot flip to Play. Shared notifyRestartSteamToFinish() helper for the toast."
verification: |
  target_test: pass - 18 new D-UAT-13 tests in library.test.ts and 15 in steamClientProcess.test.ts. Re-run by the session manager before commit: library.test.ts + steamClientProcess.test.ts = 290 passed / 5 failed; the 5 are the same pre-existing Windows-path / macOS-binary failures as the pre-change baseline (257 passed / 5 failed), 0 new failures.
  mutation_check: pass (hand mutants, each reverted) - hold disabled -> 9 new tests fail; seenDownloading line removed -> grace-window, manifest-gone and cap tests fail; cap special-case removed -> cap test fails; refresh() filter removed -> focus-reconcile test fails; 1026 no-rearm guard removed -> the 1026->4 test fails.
  static: prettier --check clean on all 4 files (re-run before commit); tsc clean for src and meta; ESLint warning counts equal to HEAD; fakeHomeIsolation gate passes; MainButton.steamWaitingRestart + hasStatus.reconcile pass (17).
  real_probe: listSteamClientPids() returned [13712] in 181 ms against the live Steam, equal to Get-Process steam.
  live_gate: PASS on real Windows hardware 2026-10-29 (see Evidence, last entry): hold engaged at finalize (pid 13712), released 0 s after that pid exited, relaunched Steam pid 5608 adopted the manifest, Play launched the game with no install dialog. Operator verbatim: "ok, have the restart steam to finish." / "restarted steam, play button showing now" / "game launched, no install dialog".
  not_observed: Library tile hint and alt-tab persistence were not separately reported by the operator (unit-tested only). Linux/Flatpak `pgrep -x steam` probe and the macOS probe on a real client are untested.
  wider_run_note: whole steam/ directory shows 102 failures in 11 known-noisy macOS/bridge/bottle/DRM/Windows-path suites that spy startInstallPolling and never run the real poller; no pre-change baseline was taken for them.
  commit: "128148bf3 fix(steam): hold \"Restart Steam to finish\" when a native install finalizes under a running Steam client (D-UAT-13)"
why_not_caught: "The waiting state was added in 0dddae268 (2026-07-16) for the StateFlags=1026 handoff only. The Phase 23 fast path (a7d8d8c3d, 2026-07-17) changed finalize to write 4 directly, which made that branch unreachable the next day, and no test crossed the two: poll tests drove the 'downloading'/1026 branch and the 'installed' branch separately, never 'GameLib finalizes at 4 while a Steam client is alive'. 54eae3c41 (2026-08-17) noticed the gap on macOS and added only a one-shot toast, so the symptom was papered over on the one platform where the UAT item had passed (1a was a pre-fast-path 1026 run). No gate existed for 'a UI status that exists in code is still reachable from the current writer'."
recurrence_guard: "library.test.ts D-UAT-13 block (18 tests): hold on first 'installed' tick when a Steam pid is alive; no is_installed/done push while held; release on pid exit or replacement; seenDownloading grace-branch immunity; manifest-gone and MAX_TICKS terminal paths; refresh()/refreshInstallState() filter; 1026 no-rearm. steamClientProcess.test.ts (15): per-platform probe parsing, [] vs undefined fail-open. Runtime guard: the two D-UAT-13 log lines ('holding in steam-waiting-for-restart' / 'has exited - releasing') make the state visible in gamelib.log."
open_edge: "The hold lives in the sidecar's memory only. If GameLib is restarted while the OLD Steam is still running, install state is re-derived from the manifest (StateFlags 4) and Play appears again, so the install dialog returns. Not fixed; filed as a pending todo (.planning/todos/pending/2026-10-29-steam-restart-hold-not-persisted-across-gamelib-restart.md). Related, accepted: a held game reports 'installing', so the frontend keeps the system-sleep assertion until Steam restarts (bounded by the existing ~6 h cap); bottle and bridge roots never hold (their existing 'Restart Steam' toast is unchanged)."
files_changed:
  - src/backend/storeManagers/steam/steamClientProcess.ts (new)
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts (new)
