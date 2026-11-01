---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
verified: 2026-11-02T00:00:00Z
status: gaps_found
score: 9/12 truths verified
overrides_applied: 0
gaps:
  - truth: "A Windows Steam title on the built-in engine still launches and keeps running (never killed by the launch deadline)"
    status: failed
    reason: "CR-01. The deadline arms whenever installRoot is truthy, but startBottleProcessMonitor can return null (non-macOS, or install root outside the bottle's drive_c). Nothing can then call onFirstMatch or onUnavailable, so after 180 s onBridgeLaunchDeadline kills the wineserver under a running game. Same outcome as UAT G3 through a path the G3 fix did not close. Confirmed in games.ts ~4735-4750 (arm) and ~4921-4940 (monitor start, null handle not handled)."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "armLaunchDeadline is not conditioned on a non-null monitor handle"
    missing:
      - "Arm the deadline only after startBottleProcessMonitor returns a handle, or cancel('monitor-unavailable') when it returns null"
      - "Regression test for the null-handle case"
  - truth: "A fallback-made bottle is cleanly returned to CrossOver (DXVK removed, marker accurate)"
    status: failed
    reason: "CR-03 (confirmed in engineSwitch.ts ~272-302) and WR-01. When current_dxvk-macOS exists but the current pin is missing or has no dxvk, the code logs 'leaving DXVK in place' and still writes the crossover marker, so later launches skip the restore for good. A pin bump pruning older builds, or a licensed user who never downloaded the pin, reaches this. WR-01: DXVK.installRemove('restore') returns true despite failed reg delete / wineboot / rmSync steps, so the G7 'surviving marker' check cannot catch real failures. WR-09: a dxvk-failed switch to the built-in engine leaves the marker on crossover."
    artifacts:
      - path: "src/backend/storeManagers/steam/engine/engineSwitch.ts"
        issue: "missing DXVK source falls through to writeMarker; dxvk-failed path writes no marker"
      - path: "src/backend/tools/index.ts"
        issue: "restore ignores wine step exit codes, removes version file first and asynchronously"
    missing:
      - "Return ok:false (dxvk-failed) when no DXVK source exists; do not write the crossover marker"
      - "Record installed DXVK dir/version in .gamelib-engine.json and restore from pinById(marker.id), downloading it if absent"
      - "installRemove restore: check each runWineCommand code and rmSync, remove the version file last and synchronously"
      - "On dxvk-failed switch to built-in, write a marker with dxvk:'failed' so the reverse switch still cleans up"
  - truth: "Install on the built-in engine / expired-or-broken CrossOver runs entirely on the chosen engine (D-01, D-04, D-09)"
    status: failed
    reason: "CR-02 and WR-02. installSteamBridgeSharedRedists runs with stock CrossOver settings right after bottle creation, so a no-CrossOver install records failures in the redist ledger (backoff then defers redists on first launch) and an expired-trial install runs CrossOver against a fallback-made bottle behind the Expired Bottle dialog. A cxbottle --create that fails without timeout has no errorCode, so a broken CrossOver fails the install instead of falling back."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "~2553 redist step uses getBridgeBottleSettings (stock CrossOver) at install time; ~2255 fallback only on TIMEOUT/MISSING"
      - path: "src/backend/storeManagers/steam/bottle.ts"
        issue: "~2324-2348 create failure has no errorCode; partial bottle dir left behind"
    missing:
      - "Carry the creation decision through install: pass buildFallbackGameSettings(bottle, engine) (or setEngineSelection for the install) to the redist step"
      - "Add CROSSOVER_CREATE_FAILED, include it in the fallback condition, and remove the created bottle dir"
  - truth: "Engine download progress and the engine choice are visible to the user (D-06, D-05)"
    status: failed
    reason: "G1 (label stuck at 'Downloading built-in engine (0%)', verify/extract/setup phases unlabeled; IN-05 stale 100% through the ~40 s switch), G6 (toast only a system notification, unverifiable in dev, badge text omits the reason), WR-08 (download failure at launch and setEngineSelection rejection reported only by notify or not at all). Open per UAT; item 2 recorded as an issue."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "ensureBuiltInEngineForInstall / launch-time download progress and failure reporting"
      - path: "src/frontend/screens/Game/GamePage/components/EngineBadge.tsx"
        issue: "reason only in hover tooltip"
    missing:
      - "Phase labels (downloading / verifying / extracting / setting up) and find the cause of the dropped percent updates"
      - "In-app engine notice and in-app dialogs (showEngineDialog) for hard failures"
  - truth: "Per-game override is advanced and unsupported only for non-CrossOver engines; CrossOver override is supported (operator decision G9)"
    status: failed
    reason: "G9 open: an explicit CrossOver override still shows the red Unsupported warning and badge. WR-05: a stored override no longer offered shows as Automatic and cannot be cleared. G12: badge waits on the CrossOver preflight; the select shows Automatic until options load, so choosing Automatic can be a no-op. WR-04: engine state, no-CrossOver note and override select appear on every Steam title on macOS, including native games."
    artifacts:
      - path: "src/frontend/screens/Settings/components/SteamEngineOverride.tsx"
        issue: "CrossOver override treated as unsupported; stored-but-unavailable id maps to Automatic; options-loading window"
      - path: "src/backend/storeManagers/steam/engine/engineState.ts"
        issue: "no bridge-install eligibility gate; override state awaits the preflight"
    missing:
      - "CrossOver override: no warning, no badge, known fixes apply"
      - "Show stored value (disabled 'not installed' entry) so Automatic is a real change; load options on mount"
      - "getSteamEngineState returns null without a bridge install; gate the override select on the same flag; compute the override state without the preflight"
  - truth: "Expired-trial bottles reach the fallback without hanging on CrossOver's nag dialog, including during the engine switch"
    status: failed
    reason: "G10: the pinned->crossover restore runs wine commands through CrossOver on an expired bottle, each step blocking on the Expired Bottle dialog (45 s on the first). WR-03: the creation decision probes bottle index 0's trial clock, not an unrelated new bottle's. WR-06: a switch on the legacy shared bottle can wineserver -k another title's running game. WR-07: the display-only page preflight can wineserver -k a live game after a probe timeout."
    artifacts:
      - path: "src/backend/storeManagers/steam/engine/engineSwitch.ts"
        issue: "restore uses CrossOver when preflight is unhealthy; guard checks only the launching title"
      - path: "src/backend/storeManagers/steam/engine/engineDecision.ts"
        issue: "decideCreationEngine probes listReadyBridgeBottleNames()[0]; preflightCrossover kills on timeout even from the page read"
    missing:
      - "Run the restore on the built-in engine (or defer) when the CrossOver preflight is not healthy"
      - "Drop the cross-bottle trial probe; use presence plus create cap"
      - "Refuse switches off the title's own per-game bottle; add killOnTimeout:false for the page preflight and skip the kill when a monitor is active"
  - truth: "Sidecar exits on event-loop drain at stdin EOF, with no unbounded in-flight work (project exit contract)"
    status: failed
    reason: "WR-11. ensureBuiltInEngineForInstall calls ensurePinnedEngine without an AbortSignal and download sockets are not unref'd; quitting during the ~228 MB download keeps the sidecar alive, and the install then goes on to run wineboot after the app is gone. UAT item 12 measured exit only with nothing running, so it does not clear this. WR-10: second concurrent caller loses progress/signal, interrupted downloads leak .tmp-* dirs."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "ensureBuiltInEngineForInstall passes no signal"
      - path: "src/backend/storeManagers/steam/engine/fallbackEngine.ts"
        issue: "downloadFile sockets not unref'd; shared promise drops per-caller onProgress/signal; prune skips .tmp-*"
    missing:
      - "AbortSignal wired to sidecar shutdown / install cancel; abort stops before bottle creation"
      - "Per-pin listener fan-out; abort only when all callers abort; prune stale .tmp-* when no download is running"
deferred: []
human_verification: []
---

# Phase 59: Steam engine fallback when CrossOver is unavailable - Verification Report

**Phase Goal:** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, expired or broken. CrossOver stays first choice. One pinned Wine-Staging + DXVK build per release, installed and managed by GameLib, with the previous build kept. Runs the existing bridge bottle with `USER=crossover`. Pre-launch `--demo-status` check, expired bottles go to the fallback. CrossOver launches always have a timeout. "N days remaining" notice. Per-game override only as advanced, unsupported option. Tested-CrossOver-versions record with non-blocking warning.
**Verified:** 2026-11-02
**Status:** gaps_found
**Re-verification:** No, initial verification

Human checks were not re-run. `59-UAT.md` (operator-attended, 2026-11-02: 10 pass, 1 issue, 1 skipped) is the record of live behaviour. Code claims below were spot-checked against the tree (games.ts, engineSwitch.ts); the remaining review findings were taken from `59-REVIEW.md` and not independently re-traced, apart from the cross-check against the UAT gap list.

## Observable Truths

| #  | Truth (roadmap goal clause / decision) | Status | Evidence |
| -- | -------------------------------------- | ------ | -------- |
| 1  | CrossOver stays first-choice when healthy (D-07) | VERIFIED | UAT 1: `engine=crossover ... reason=cx-healthy`, no badge or download |
| 2  | No-CrossOver launch runs on pinned Wine-Staging + DXVK in the existing bottle and keeps running (D-04/D-11) | VERIFIED (with CR-01 caveat) | UAT 3, 5: `engine=pinned reason=cx-missing`, game ran 851 s after G3/G4/G5/G8 fixes. CR-01 leaves a null-monitor path that still kills a running game, see gap 1 |
| 3  | Expired trial detected by `--demo-status` before launch and routed to the fallback (D-09/D-12) | VERIFIED | UAT 7: `status=expired`, `engine=pinned reason=cx-expired`, game ran |
| 4  | CrossOver launches always bounded by a timeout; "Game didn't start" dialog, no stray wine process (D-10/D-11) | VERIFIED | UAT 8: deadline fired at 180002 ms, dialog confirmed, no bridge-failed mark |
| 5  | "N days remaining" notice at 7 days or fewer, none at 10 (D-13) | VERIFIED | UAT 6 |
| 6  | Same bottle, shared Windows profile; CrossOver adopts fallback-made bottle (D-03) | VERIFIED (with CR-03 caveat) | UAT 4, 5: Timestamp/Version added, DXVK removed after G7 fix. CR-03/WR-01/WR-09 leave paths where DXVK stays and the marker says crossover, see gap 2 |
| 7  | Installs with no CrossOver create the bottle themselves and download the engine on first need (D-01/D-02/D-05) | FAILED | UAT 2 issue (G1, G2); CR-02, WR-02, WR-11, see gaps 3, 4, 7. Bottle contents were correct in UAT |
| 8  | Previous pinned build kept; rollback is a release lever only, no user toggle (D-08) | VERIFIED | UAT 9 (no rollback toggle); `ENGINE_PINS.current/previous` and `pruneUnpinnedEngines` in engine/ |
| 9  | Override exists only as advanced, collapsed, unsupported option; launch log records engine and version (D-14) | FAILED (partial) | UAT 9 pass after G11, but G9 (CrossOver override flagged unsupported, supersedes roadmap wording per operator), G12, WR-04, WR-05 open, see gap 5 |
| 10 | Tested-CrossOver versions recorded; untested warns without blocking (D-15) | VERIFIED | `engine/testedCrossoverVersions.ts` present; UAT 1 shows no untested line on tested build. Untested-build notice itself was not exercised in UAT |
| 11 | DRM mode is CrossOver-only: clear message, never hangs (out-of-scope boundary, D-09 discretion) | VERIFIED | UAT 10 |
| 12 | Expired/unhealthy CrossOver never hangs on the nag dialog anywhere in the flow | FAILED | G10, WR-03, WR-06, WR-07, see gap 6. Launch itself is bounded; the engine switch is not |

Sidecar exit contract: UAT 12 passes for the idle case, but WR-11 breaks it during an engine download (gap 7).

**Score:** 9/12 truths verified (3 failed; truths 2, 6 carry caveats tracked under gaps 1 and 2).

## Required Artifacts

All of `engine/` (adoptBottle, demoStatus, engineDecision, engineIds, enginePins, engineRegistry, engineState, engineSwitch, engineTypes, fallbackEngine, launchDeadline, testedCrossoverVersions) exist and are substantive and wired into games.ts; `src/backend/storeManagers/steam/engine/__tests__` exists. Frontend: EngineBadge, SteamEngineNotices, SteamEngineOverride exist and are wired. Defects are behavioural (see gaps), not missing files.

## Requirements Coverage

No requirement IDs: ROADMAP says "Requirements: TBD" and `.planning/REQUIREMENTS.md` does not exist in this tree. Traceability gap noted, not a failure. Verified against the goal, plan must_haves and CONTEXT D-01..D-15 instead. D-01..D-15 are honored in intent; D-14 is superseded in part by operator decision G9 (CrossOver override is supported).

## Review Blockers and Warnings Assessment

| Item | Defeats a goal truth? |
| ---- | --------------------- |
| CR-01 | Yes: can kill a running built-in-engine game ("still launches") |
| CR-02 | Yes: install on built-in engine runs CrossOver redists (D-01/D-04) |
| CR-03 | Yes: silent stale DXVK under CrossOver, undetectable later |
| WR-11 | Yes: breaks the sidecar exit contract during download |
| WR-01, WR-09, WR-02 | Yes: weaken CR-03 detection / D-09 broken-CrossOver routing |
| WR-03, WR-06, WR-07 | Yes: wrong-bottle probe, or killing another live game |
| WR-04, WR-05, WR-08, WR-10 | UX/robustness defects against D-06/D-14, not goal-defeating alone |
| IN-01..IN-06 | Cleanup only |

## Regression Gate

Full jest: 11 failing suites, none caused by phase 59 per the orchestrator (ten pre-existing or from other work; `dxvkInstallRemove.test` is a load flake that passes alone). Not re-run here.

## Anti-Patterns

IN-01 constant `STAGING_MONITOR_MATCH = true` with a dead branch citing superseded measurement (info). No TBD/FIXME/XXX check was run over phase files; none surfaced in the review.

## Human Verification Required

None new. Open UAT items (G6 toast under packaged build, UAT 11 other-build survival) were skipped or unverifiable in dev; re-test G6 in a packaged build after the in-app notice fix.

## Gaps Summary

The decision layer and the main happy paths work and were exercised live: healthy CrossOver, no-CrossOver launch, expired-trial routing, the 180 s bounded launch, the trial notice, adoption and DRM refusal. What remains are failure-path and state-consistency defects that undercut the goal in specific cases: a running game can be killed (CR-01), a bottle can be left with DXVK while marked CrossOver (CR-03/WR-01/WR-09), install-time steps ignore the chosen engine (CR-02/WR-02), the expired dialog still blocks the engine switch (G10), the sidecar can outlive a quit (WR-11), and the progress and override UX has open gaps (G1, G2, G6, G9, G12). Close with `/gsd-plan-phase 59 --gaps`; group the work by the seven gap entries above. G2 (move the Steam auth check before the download and bottle creation) belongs with gap 4's install-ordering fix.

---

_Verified: 2026-11-02_
_Verifier: Claude (gsd-verifier)_
