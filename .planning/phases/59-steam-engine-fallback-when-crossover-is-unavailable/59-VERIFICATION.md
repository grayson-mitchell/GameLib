---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
verified: 2026-11-02T00:00:00Z
status: gaps_found
score: 10/13 truths verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/12
  gaps_closed:
    - "Prior gap 1: running game killed by launch deadline when monitor is unavailable (bindDeadlineToMonitor wired at games.ts:4910; UAT 21b ran past 3 min)"
    - "Prior gap 3: install redists/creation decision on stock CrossOver (resolveInstallEngineSettings games.ts:2421/2693; CROSSOVER_CREATE_FAILED bottle.ts:98/2348/2360 and fallback at games.ts:2367). Live redist-on-engine NOT exercised (UAT 14 Dinkum has no shared redists), covered by unit tests only"
    - "Prior gap 4: engine progress and engine choice visible (UAT 14 progress pass, UAT 15 in-app notice and visible reason pass)"
    - "Prior gap 6: expired bottle blocks on nag during engine switch (UAT 16 pass: restore ran on built-in engine, no Expired dialog before launch)"
  gaps_remaining:
    - "Prior gap 2: fallback-made bottle returned to CrossOver. Strict restore, marker with DXVK record and pin download are in place and UAT 4/5/20 pass, but a failed restore still launches on CrossOver and a partly done restore leaves a wrong marker (review CR-03). Re-expressed as gap A below"
    - "Prior gap 5: per-game override. G9 and WR-05 closed (UAT 17 pass, stored value reads back), but changing the override to Automatic or CrossOver does not save (UAT 18, G17). Re-expressed as gap B below"
    - "Prior gap 7: sidecar exit contract. Quit during the engine download now aborts cleanly (UAT 21a pass), but an abort during verify/unpack is ignored and provisioning goes on to wineboot (review WR-03). Re-expressed as gap E below"
  regressions: []
gaps:
  - truth: "A fallback-made bottle is cleanly and reliably returned to CrossOver; a failed return never leaves the game running on CrossOver over DXVK-macOS DLLs (D-03, D-07)"
    status: failed
    reason: "Review CR-03, confirmed at games.ts:4152-4160: on prep.reason === 'dxvk-failed' for a CrossOver selection the code only logs 'the restore is retried on the next launch' and the launch proceeds on CrossOver with DXVK still installed (the G7 end state). Reachable by a licensed user who never had the pin and goes offline, or any pin download failure. Also a restore that fails at wineboot -u has already deleted overrides and DLLs but leaves current_dxvk-macOS and a pinned marker with dxvk record, so a later same-engine launch reports changed:false and runs Wine-Staging with no DXVK; the backup path short-circuits on currentVersion === globalVersion. UAT 4/5/20 prove the success path only."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "dxvk-failed on a CrossOver selection is a warning, not a launch blocker (~4152-4160)"
      - path: "src/backend/storeManagers/steam/engine/engineSwitch.ts"
        issue: "partial restore failure does not rewrite marker with dxvk:'failed' (~390-441)"
      - path: "src/backend/tools/index.ts"
        issue: "installRemove('backup') skips recopy when currentVersion === globalVersion even with an explicit source (~338-421)"
    missing:
      - "Treat dxvk-failed on a CrossOver selection as a launch blocker: clearEngineSelection, showEngineDialog, return ok:false"
      - "On a strict restore failure rewrite the previous marker with dxvk:'failed'"
      - "installRemove('backup', source): bypass the already-installed short-circuit when a source/force flag is passed"
      - "Regression tests for the offline licensed-user restore and the wineboot -u failure"
  - truth: "Per-game engine override can be set and cleared: choosing Automatic or CrossOver saves, survives a restart, and a stored override can always be cleared (D-14, G9, G12)"
    status: failed
    reason: "UAT 18 / G17: changes to Automatic or CrossOver never write (no 'Setting steamEngineOverride' line, GamesConfig unchanged) on two titles, by click and by change-then-close; changes to a pinned build do save. A user who picks the pinned build can therefore not return to Automatic through the UI, and UAT 16 had to hand-edit GamesConfig. Review traced the save path (SteamEngineOverride onChange -> useSetting -> setSetting IPC -> GameConfig.setSetting) and found no value filter in the backend (re-checked: game_config.ts:319 and settingsFlowRegistration.ts setSetting write any value), so the cause is renderer-side before window.api.setSetting fires (MUI Select/MenuItem in SteamEngineOverrideView, or currentConfig/noChange comparison in useSettingsContext). NOT root-caused; needs a renderer probe."
    artifacts:
      - path: "src/frontend/screens/Settings/components/SteamEngineOverride.tsx"
        issue: "onChange for automatic/crossover does not reach setSetting; cause undetermined"
      - path: "src/frontend/hooks/useSettingsContext.ts"
        issue: "setSetting no-change guard (JSON equality against currentConfig, which getSettings merges from the title's own override) is a candidate"
    missing:
      - "Log in onChange and in setSetting to find where the automatic/crossover change is dropped; fix and add a component test that selects Automatic from a stored pinned value and asserts window.api.setSetting is called"
      - "Re-run UAT 18 including the wine-manager:0.0-missing sub-check (never run)"
  - truth: "Cancelling an install during engine/bottle provisioning stops the install; no depot download runs without a queue entry (install flow D-01/D-05)"
    status: failed
    reason: "Review CR-01 / UAT G13 (major), confirmed at games.ts:2288-2309: the provisioning abort controller is deleted in the finally and installBridgeGameLeased is called with no signal.aborted check; runNativeDepotDownload registers a fresh un-aborted controller (3014). Bottle creation takes no signal and an installed engine never reads it. Live evidence: Batman 200260 cancelled 17:22:34, depot stream continued to 15% with the tile stuck on downloading. G14 (no Uninstall, only Resume) is downstream. G15 (per-game bottle survives a cancel) is an open design call."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "no aborted check after provisionBridgeBottleForInstall; provisionBridgeBottle gets no signal"
      - path: "src/backend/storeManagers/steam/engine/fallbackEngine.ts"
        issue: "installArtifact checks the signal only around downloadFile"
    missing:
      - "if (signal?.aborted) return { status: 'abort' } (with a 'done' status update) after provisioning and between provisioning steps"
      - "Thread the signal into provisionBridgeBottle/createFallbackBridgeBottle; remove the partly created bottle on abort (also resolves G15 for this path)"
      - "Review WR-01: map an aborted engine download to status 'abort', not an install error"
      - "Test: abort during provisioning never reaches installBridgeGameLeased"
  - truth: "A cancelled bridge install does not poison the session: a reinstall routes to the bridge, not to bottled Steam (D-09 route integrity; UAT G16)"
    status: failed
    reason: "Review CR-02, confirmed at games.ts:2485-2488: any non-done depot result, including a user abort (3290-3297 returns { status: 'abort' }), calls markBridgeFailedThisSession, which feeds resolveBridgeRoute. UAT G16: reinstall of Batman after the cancel stopped with 'CrossOver is required to install Windows games on macOS' (bottled-Steam precondition). One-line fix. This path may pre-date phase 59, but the phase's no-CrossOver install flow is what surfaces it and it breaks the goal's reinstall for a user who cancelled."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "abort treated as bridge failure (~2485)"
    missing:
      - "if (downloadResult.status === 'abort') return downloadResult before markBridgeFailedThisSession"
      - "Test: abort does not flip resolveBridgeRoute"
  - truth: "Sidecar exits on event-loop drain at stdin EOF with no in-flight work started after quit (project exit contract)"
    status: failed
    reason: "Review WR-03. Download is now registered for the stdin-EOF abort and UAT 21a passed for a quit during 'downloading wine', but fallbackEngine.installArtifact checks the signal only around downloadFile; an abort during SHA-256 or tar extract completes, renames into place and returns ok, and provisionBridgeBottleForInstall then spawns wineboot after the shell is gone. Partial closure of prior gap 7."
    artifacts:
      - path: "src/backend/storeManagers/steam/engine/fallbackEngine.ts"
        issue: "no aborted check after sha256OfFile / extractFiles (~222-257)"
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "no signal check before each provisionBridgeBottle (~2343-2358)"
    missing:
      - "StageError('aborted') after sha256OfFile and extractFiles, before renameSync"
      - "signal.aborted check before each provisioning step (shared with the CR-01 fix)"
  - truth: "Engine state shown to the user is truthful (D-06)"
    status: partial
    reason: "WR-02: a single inconclusive page-read timeout renders 'Built-in engine, CrossOver isn't working' for a healthy CrossOver (engineState.ts compute maps any non-healthy preflight to cx-broken; recordLaunchDecision caches inconclusive results for 60 s). WR-06 / G18: a forced CrossOver override on an expired bottle shows a plain CrossOver badge with no warning of the nag. Warning-level, not goal-defeating alone."
    artifacts:
      - path: "src/backend/storeManagers/steam/engine/engineState.ts"
        issue: "inconclusive preflight reported as broken; override preflight result not carried to the page"
    missing:
      - "preflight = null when inconclusive; apply the same guard to the recordLaunchDecision cache write"
      - "overrideWarning flag (cx-expired | cx-broken) rendered on the game page for a forced CrossOver override"
  - truth: "Restore and create paths leave no orphan processes or wrong-eligibility UI"
    status: partial
    reason: "Warning-level review items still open: WR-04 (CROSSOVER_CREATE_FAILED branches delete the bottle dir without killBottleWineServer), WR-05 (restore calls killPrevious with a possibly absent wineserver before resolving/downloading the pin, no progress/cancel on that download; this is G19), WR-07 (DRM-mode bridge installs from before 59-15 have verdict undefined and are offered the override), IN-06 (half-installed pin, DXVK dir only, makes the unhealthy restore fail forever)."
    artifacts:
      - path: "src/backend/storeManagers/steam/bottle.ts"
        issue: "~2331-2361 no wineserver stop before removeCreatedBottleDir in two branches"
      - path: "src/backend/storeManagers/steam/engine/engineSwitch.ts"
        issue: "killPrevious before resolveRestoreSource (~386-393); half pin (~269-283, 409-415)"
      - path: "src/backend/storeManagers/steam/engine/engineState.ts"
        issue: "overrideEligible treats undefined mode as eligible (~111-114, 221)"
    missing:
      - "killBottleWineServer before removeCreatedBottleDir in both new branches"
      - "Resolve restore source before killPrevious; skip kill when prev.wineserverBin is absent; pass onProgress to ensurePinEngine"
      - "Resolve BridgeMode lazily when the verdict is absent; fall through to ensurePinEngine when the source has no wineBin"
deferred: []
human_verification:
  - test: "Live no-CrossOver install of a title WITH shared redists (UAT 14 redist half)"
    expected: "Install-time redist lines run the pinned wine (path under the engine root) and no redist entry fails on a missing CrossOver binary"
    why_human: "Dinkum (1062520) has no shared redists, so the claim is covered by unit tests only; needs a title that has them under no-crossover.sb"
  - test: "Install refusal on a rejected stored Steam session (UAT 13, skipped)"
    expected: "No bottle directory appears and no engine download starts"
    why_human: "Unreachable through the UI when signed out; the rejected-session path is unit-tested only. Decide whether a live check is wanted"
  - test: "Untested CrossOver build warning (D-15)"
    expected: "A warning line on a CrossOver version absent from testedCrossoverVersions, launch not blocked"
    why_human: "Never exercised live (UAT 1 only shows absence of the line on a tested build); needs a build or fixture not in the tested list"
  - test: "Fallback bottle survives a different Wine-Staging build (UAT 11, skipped)"
    expected: "Silent prefix update, game launches, save present"
    why_human: "No second Wine-Staging-macOS build exists (Wine Manager latest is also 11.20); skipped with reason, decide whether to accept"
---

# Phase 59: Steam engine fallback when CrossOver is unavailable - Verification Report (re-verification)

**Phase Goal:** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, its trial has expired for that bottle, or it is broken. CrossOver stays first choice. One pinned Wine-Staging + DXVK build per release, installed and managed by GameLib, previous build kept. Runs the game's existing bridge bottle with `USER=crossover`. `CX_BOTTLE=<bottle> wine --demo-status` before every CrossOver launch; expired goes to the fallback. CrossOver launches always have a timeout. "N days remaining" notice. Per-game engine override only as an advanced, explicitly unsupported option (known-fixes/census do not apply, launch log records exact engine and version). Tested CrossOver versions recorded, untested warns without blocking. Out of scope: DRM mode and bottled Steam, GPTK/-DXMT, full census on the fallback.
**Verified:** 2026-11-02
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure round 59-14..59-23

Basis: live behaviour comes from the operator's attended 59-UAT.md (items 1-12 first round, 13-21 re-UAT, 2026-11-02). Code claims were re-checked in the tree at HEAD f19a7d0b3: the three review blockers (games.ts 2288-2309, 2485-2488, 4152-4160) are present as described; `bindDeadlineToMonitor`, `resolveInstallEngineSettings` and `CROSSOVER_CREATE_FAILED` exist and are wired; `npx jest src/backend/storeManagers/steam/engine` passes 10 suites / 180 tests. Review warnings WR-01..07 and IN items were taken from 59-REVIEW.md and not independently re-traced beyond the spot-checks stated. The orchestrator's baseline (failing suites equal those at 546af6c1d apart from the unrelated translation.json churn; codecheck, smoke:sidecar, planning-gates pass; lint fails only on pre-existing meta/gen_vtables.ts) was accepted, not re-run.

## Previous gaps 1-7: closure status

| Prior gap | Subject | Now | Evidence |
| --- | --- | --- | --- |
| 1 | Deadline kills a running game when the monitor cannot run | CLOSED | `bindDeadlineToMonitor` (launchDeadline.ts, wired games.ts:4910); UAT 21b ran past 3 min; UAT 3 ran 851 s |
| 2 | Fallback-made bottle returned cleanly to CrossOver | PARTIALLY CLOSED | Success path proven live (UAT 4, 5, 20: DXVK removed, marker accurate, pin downloaded when absent). Failure path still launches on CrossOver (CR-03). Gap A |
| 3 | Install runs entirely on the chosen engine; create failure falls back | CLOSED in code, live half unproven | Creation engine carried to redists (games.ts:2421, 2693); create failure falls back (bottle.ts:2348/2360, games.ts:2367); UAT 14 bottle created by built-in engine. Redist-on-engine not exercised live (human item) |
| 4 | Download progress and engine choice visible | CLOSED | UAT 14 (N% passes 0, then Verifying, Unpacking, Setting up, install; button disabled), UAT 15 (in-app notice, reason visible without hover) |
| 5 | Override advanced/unsupported only for non-CrossOver; shows stored value | PARTIALLY CLOSED | G9: UAT 17 pass. WR-05/G12 read-back: UAT 18 first half pass. Saving Automatic/CrossOver broken (G17). Gap B |
| 6 | Expired bottle never blocks on the nag during the switch | CLOSED | UAT 16: restore ran on the built-in engine, no Expired dialog before launch, marker crossover. The residual (WR-04/05 below) is hygiene |
| 7 | Sidecar exit contract during engine download | PARTIALLY CLOSED | UAT 21a: quit mid-download aborts in 2 s, no stray process/bottle/.tmp-*. Abort during verify/unpack still runs on to wineboot (WR-03). Gap E |

## Observable Truths

| #  | Truth (roadmap clause / decision) | Status | Evidence |
| -- | --------------------------------- | ------ | -------- |
| 1  | CrossOver stays first choice when healthy (D-07) | VERIFIED | UAT 1 `engine=crossover reason=cx-healthy`, no badge/download |
| 2  | No-CrossOver launch runs on pinned Wine-Staging + DXVK in the existing bottle with `USER=crossover` and keeps running (D-04/D-11) | VERIFIED | UAT 3, 5, 21b; deadline bound to monitor |
| 3  | Expired trial detected by `--demo-status` pre-launch and routed to the fallback (D-09/D-12) | VERIFIED | UAT 7 `status=expired`, `reason=cx-expired` |
| 4  | CrossOver launches always bounded by a timeout; no hang on nag (D-10/D-11) | VERIFIED | UAT 8: deadline at 180002 ms, dialog, no stray wine, no bridge-failed mark |
| 5  | "N days remaining" at 7 days or fewer (D-13) | VERIFIED | UAT 6 |
| 6  | Same bottle shared profile; CrossOver adopts fallback-made bottle and DXVK is removed on return (D-03) | VERIFIED for the success path; failure path FAILED | UAT 4, 5, 20; CR-03 (gap A) |
| 7  | No-CrossOver install creates the bottle with the built-in engine, downloads engine on first need, shows progress (D-01/D-02/D-05) | VERIFIED (redist half human-pending) | UAT 14 (Dinkum, Dredmor), bottle by built-in engine |
| 8  | Previous pinned build kept; rollback is a release lever only (D-08) | VERIFIED | UAT 9; `ENGINE_PINS.current/previous`, `pruneUnpinnedEngines` |
| 9  | Per-game override advanced, collapsed, non-CrossOver unsupported; launch log records engine and version (D-14) | FAILED (partial) | UAT 9, 17 pass; UAT 18 / G17: Automatic and CrossOver changes do not save (gap B) |
| 10 | Tested CrossOver versions recorded; untested warns without blocking (D-15) | VERIFIED in code, notice not exercised live | `testedCrossoverVersions.ts` + test; human item |
| 11 | DRM mode is CrossOver-only with a clear message, never hangs (boundary) | VERIFIED | UAT 10 |
| 12 | Expired/unhealthy CrossOver never hangs on the nag anywhere in the flow | VERIFIED | UAT 16 closes the switch case; residual forced-CrossOver nag is the user's explicit choice (G18 warning only) |
| 13 | Install flow is cancellable and does not corrupt later routing; exit contract holds (supporting the install requirements) | FAILED | CR-01, CR-02, WR-03 (gaps C, D, E); UAT 21a covers only a quit during the download proper |

**Score:** 10/13 truths verified (truths 6 and 9 carry the failing portions in gaps A and B; truth 13 is new this round because the gap-closure round added the cancellable provisioning flow).

## Decision coverage (no REQUIREMENTS.md; D-IDs accounted against 59-CONTEXT.md)

D-01/D-02/D-04/D-05 satisfied (UAT 2, 14, 3). D-03 satisfied on success, failing on the failed-restore path (gap A). D-06 satisfied (UAT 15) with truthfulness warnings (gap F). D-07 satisfied. D-08 satisfied. D-09/D-10/D-11/D-12 satisfied (UAT 3, 7, 8, 16). D-13 satisfied. D-14 partial (gap B). D-15 satisfied in code, notice unexercised live.

## Required Artifacts

All `engine/` modules exist, are substantive and wired (10 suites / 180 tests pass); frontend EngineBadge, SteamEngineNotices, SteamEngineLaunchNotice, SteamEngineOverride, `engineDownloadLabel.ts` exist and are wired per UAT 14/15/17/19. Defects are behavioural, not missing files.

## Gap classification

In-scope goal failures (feed `/gsd-plan-phase 59 --gaps`):
- A (CR-03, blocker), B (G17, blocker), C (CR-01 / G13 / G14 / G15, blocker), D (CR-02 / G16, blocker), E (WR-03, project exit contract, warning-level but a stated phase constraint).
- F, G (WR-01 mapping folded into C; WR-02, WR-06/G18, WR-04, WR-05/G19, WR-07, IN-06): warnings, non-blocking individually.

Out of scope (already filed as todos, not gaps): native Steam downloads missing from the Downloads screen; black button spinner.

Not gaps: G19's three `Couldn't find all library folders` errors during restore (non-blocking, logged); the UAT 21 unconfirmed quit-during-Batman note (not a defect finding, no evidence).

## Anti-Patterns

No TBD/FIXME/XXX in `engine/` or SteamEngineOverride.tsx (grep). Review IN-01..IN-06 are cleanups (listener leak in downloads, counter before try, stale controller reuse, label during finishing, duplicate bin-dir resolution).

## Human Verification Required

See frontmatter `human_verification` (4 items). They do not change the status: gaps_found takes precedence.

## Gaps Summary

The first round's seven gaps are mostly closed and UAT items 13-21 pass on the main fallback story: no-CrossOver install, launch, expiry routing, return to CrossOver, in-app notice, progress labels, quit-during-download. What remains is concentrated at the edges of the new install-cancel and restore-failure handling, plus one broken UI save:

1. A failed return to CrossOver still launches the game on CrossOver over DXVK-macOS (CR-03).
2. The engine override cannot be changed back to Automatic or CrossOver (G17, undiagnosed in the renderer).
3. Cancelling during provisioning is dropped and the depot download runs headless (CR-01 / G13), and a cancelled depot download makes the next reinstall route to bottled Steam (CR-02 / G16).
4. The exit contract still has a verify/unpack hole (WR-03).

C, D and E share a fix surface (signal checks in `installBridgeGame` and `fallbackEngine.installArtifact`, plus the one-line abort exemption), so they plan together. A and B are independent. B needs a diagnosis step before a fix.

---

_Verified: 2026-11-02_
_Verifier: Claude (gsd-verifier)_
