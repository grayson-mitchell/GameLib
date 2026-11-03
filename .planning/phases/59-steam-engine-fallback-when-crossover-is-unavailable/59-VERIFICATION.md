---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
verified: 2026-11-03T05:31:00Z
status: gaps_found
score: 13/13 roadmap truths verified; round-3 plan must-haves 10/11 (G22 early refusal FAILED live)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 13/13
  gaps_closed:
    - "H1 DXSETUP exit 247 on the built-in engine: Wine Mono registered (UAT 29 pass)"
    - "H2 redist display-driver window used CrossOver's wineserver on a built-in bottle (UAT 30 pass)"
    - "H3 false 'Couldn't find all library folders' on pinned wine (UAT 31 pass)"
    - "G20 stale steam-engines/.tmp-* not swept at boot (UAT 32 pass)"
    - "G21 Downloads tab had no engine/bottle stage label (UAT 33 pass)"
    - "WR-02/WR-03 cancel dropped in abort-controller handoff races (UAT 35 pass; bottle-creation leg via UAT 33b)"
    - "WR-01 CEG with persisted mode offered the override (code + engineState tests)"
    - "WR-04 failed per-game write diverged memory/renderer from file (code + tests)"
    - "WR-05 forced-CrossOver broken notice said 'may fail' (catalogue string reworded)"
  gaps_remaining:
    - "G22/G25 offline launch-blocked dialog still ~12 s; early refusal never fires live"
  regressions: []
gaps:
  - truth: "G22 (59-38 must-have): when a launch is certain to be blocked offline, it is refused before the CrossOver demo-status probe and the dialog appears without the probe's wait"
    status: failed
    reason: "Code and unit tests exist, but in live UAT 34 the refusal never fired: (a) isOnline() read 'online' at Play although Steam/GitHub DNS lookups were failing, so the guard at games.ts:4280 was skipped; (b) resolveBridgeLaunchExe (games.ts:4840) runs a reason=launch-target anonymous CM logon that waits ~9 s for DNS to fail before selectLaunchEngine is reached (games.ts:4945), so even a working refusal would be ~9 s late; (c) restoreNeedsAbsentPin (engineSwitch.ts:152-176) returns false whenever the marker's DXVK copy exists, which is correct for a healthy CrossOver but also suppresses the refusal when CrossOver is missing (UAT 34 run 1), where the launch then fails only after a download attempt. Severity minor: the launch is still correctly blocked with the right dialog and nothing starts; only latency is wrong. Not goal-defeating for the roadmap clauses."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "launch-target CM logon (resolveBridgeLaunchExe, :4840) precedes selectLaunchEngine (:4945); early refusal gated only on isOnline() (:4280)"
      - path: "src/backend/online_monitor.ts"
        issue: "status stayed 'online' while DNS for Steam CM and github.com failed; no offline transition logged (cause undiagnosed)"
      - path: "src/backend/storeManagers/steam/engine/engineSwitch.ts"
        issue: "restoreNeedsAbsentPin does not distinguish 'CrossOver missing' (cheap, synchronous) from 'CrossOver health unknown'"
    missing:
      - "Diagnose why the online monitor did not go offline with Wi-Fi off (UAT 34, 18:22 and 18:25 sessions) and fix, or gate the refusal on a cheaper/fresher connectivity signal"
      - "Bound or skip the launch-target CM logon when offline, or move the early refusal ahead of resolveBridgeLaunchExe"
      - "When CrossOver is not installed (resolveCrossoverBinDir null), refuse offline whenever the current pin is absent regardless of the marker's DXVK copy"
      - "Revise UAT 34's expectation: with CrossOver healthy and the marker's DXVK copy present, an offline launch correctly restores and starts on CrossOver; a block needs the DXVK copy gone or CrossOver unhealthy/missing"
deferred: []
follow_ups:
  - id: G23
    severity: medium
    item: "Game-page Play/Settings hidden at mid window heights with the cx-expired warning; todo 2026-11-02-game-page-buttons-hidden-at-mid-window-heights.md (pending)."
  - id: WR-06
    item: "GameConfig.load() tests the global config path instead of this.path (pre-existing, not introduced by phase 59). Not addressed in round 3."
  - id: G24
    item: "Amazon store embed drawn over the Library game page after leaving Stores (re-UAT 3 session). Not phase 59 code; no matching pending todo found among the amazon-store todos. File one."
human_verification:
  - test: "Live no-CrossOver install of a title WITH shared redists (UAT 14 redist half)"
    expected: "Install-time redist lines run the pinned wine and no redist entry fails on a missing CrossOver binary"
    why_human: "Partially exercised by UAT 29 (576770 DirectX on the built-in engine at Play, not install). Decide whether UAT 29 suffices"
  - test: "Install refusal on a rejected stored Steam session (UAT 13, skipped)"
    expected: "No bottle directory appears and no engine download starts"
    why_human: "Unreachable through the UI when signed out; unit-tested only"
  - test: "Untested CrossOver build warning (D-15)"
    expected: "A warning line on a CrossOver version absent from testedCrossoverVersions, launch not blocked"
    why_human: "Never exercised live"
  - test: "Fallback bottle survives a different Wine-Staging build (UAT 11, skipped)"
    expected: "Silent prefix update, game launches, save present"
    why_human: "No second Wine-Staging-macOS build exists; decide whether to accept the skip"
---

# Phase 59: Steam engine fallback when CrossOver is unavailable - Verification Report (re-verification 3)

**Phase Goal:** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, its trial has expired for that bottle, or it is broken. CrossOver stays first choice. One pinned Wine-Staging + DXVK build per release, installed and managed by GameLib, previous build kept. Runs the game's existing bridge bottle with `USER=crossover`. `CX_BOTTLE=<bottle> wine --demo-status` before every CrossOver launch; expired goes to the fallback. CrossOver launches always have a timeout. "N days remaining" notice. Per-game engine override only as an advanced, explicitly unsupported option. Tested CrossOver versions recorded, untested warns without blocking. Out of scope: DRM mode and bottled Steam, GPTK/-DXMT, full census on the fallback.
**Verified:** 2026-11-03 (HEAD 5eaf063bf)
**Status:** gaps_found (one minor gap, G25; no roadmap clause fails)
**Re-verification:** Yes, after gap-closure round 3 (59-31..59-39)

## Basis

Code read at HEAD for every round-3 claim; fresh `npx jest` over the engine/ suites, sharedRedistInstall, sharedRedists, bottle, launcher_wineLibFolders, engineTempSweepBootWire, gameConfigFirstWrite, gameSettingWrite, useSettingsContext.setSetting, engineDownloadLabel, DownloadManager, SteamEngineNotices and games.test: **26 suites, 1305 tests, all pass**. Operator-attended Re-UAT 3 items 29-35 in 59-UAT.md. Pre-existing failures listed in 59-39-SUMMARY.md (steamFlows, skeletonFlows, cargoFeatures, etc.) are not round-3 regressions and were not re-run. No TBD/FIXME/XXX added in any round-3 diff (59-31..59-38 commits). App not run; CrossOver, licence and bottles untouched.

## Round-3 items: code and live evidence

| Item | Code evidence (exists + wired) | Live | Status |
| --- | --- | --- | --- |
| H1 DXSETUP 247 | `bottle.ts:2307` `WINEDLLOVERRIDES: 'mshtml='` (mscoree no longer disabled) for new bottles; `sharedRedistInstall.ts:344 ensureEngineMono` (skips CrossOver, checks `systemRegHasWineMono`, finds `share/wine/mono/wine-mono-*/support/winemono-support.msi`, runs `buildMonoSupportMsiParts` via `runBounded`), called once per run before the first `directx` depot at `:767-775`; helpers in `sharedRedists.ts:549-563` | UAT 29 pass: Mono MSI 12:28:16, DXSETUP done 12:28:41, no 247, ledger settled, next Play no DXSETUP | VERIFIED |
| H2 engine wineserver | `bottle.ts:2057-2080` optional `engineHint.wineserverBin` (absolute + exists) in `endPerGameBridgeBottleSession`; `sharedRedistInstall.ts:329 engineHintFor` passed at `:513` and `:648` | UAT 30 pass | VERIFIED |
| H3 lib-folder log | `launcher.ts:1345` `else if (!(isMac && !lib && !lib32))` | UAT 31 pass (0 lines) | VERIFIED |
| G20 temp sweep | `fallbackEngine.ts:427 sweepStaleEngineTemps` (sync rmSync, contained, skips while installs in flight); `bootstrap.ts:39` import, `:1297-1303` once-guarded, try/catch, before READY | UAT 32 pass, idle quit drains | VERIFIED |
| WR-01 CEG first | `engineState.ts:138` `if (verdict.drm === 'ceg') return true` before the mode check | unit only (engineState tests pass) | VERIFIED |
| WR-05 wording | `public/locales/en/gamelib.json:618` cxBroken now "won't start on CrossOver" | unit only | VERIFIED |
| WR-04 rollback | `game_config.ts:337-354` restore/delete prior value on flush throw; `gameSettingWrite.ts:31` pushes `gameSettingWriteFailed`; `ipc.ts:827`, `preload/api/settings.ts:8`, `useSettingsContext.ts:137` re-fetch | needs ENOSPC/EACCES; unit only | VERIFIED |
| WR-02/WR-03 races | `games.ts:3318` ownership-checked controller delete; `:3163/3165/3193` signal re-check after prior-run wait and before registering | UAT 35 pass (with documented deviation; bottle-creation leg = UAT 33b) | VERIFIED |
| G21 stage labels | `games.ts:2450-2518` `sendCreatingBottle()` before each `provisionBridgeBottle`; `engineDownloadLabel.ts:14` creating-bottle case; `heroModel.ts:92/114` kind `engine`; `DownloadHero/index.tsx:82-83` renders it | UAT 33 a/b pass | VERIFIED |
| G22 early refusal | `games.ts:4268-4305` guard ahead of `decideLaunchEngine`; `engineSwitch.ts:152 restoreNeedsAbsentPin`, `readBottleEngineMarkerKind` | UAT 34 issue: never fired (both runs) | **FAILED (G25)** |

## Observable Truths (roadmap)

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | CrossOver stays first choice when healthy (D-07) | VERIFIED | UAT 1, 25; UAT 34 run 2 restored to CrossOver and launched |
| 2  | No-CrossOver launch runs on pinned Wine-Staging + DXVK in the existing bottle, USER=crossover (D-04/D-11) | VERIFIED | UAT 3, 5, 21b; UAT 29 Play on built-in |
| 3  | Expired trial detected by `--demo-status` pre-launch, routed to fallback (D-09/D-12) | VERIFIED | UAT 7, 27 |
| 4  | CrossOver launches bounded by a timeout (D-10) | VERIFIED | UAT 8 |
| 5  | "N days remaining" at 7 days or fewer (D-13) | VERIFIED | UAT 6 |
| 6  | Shared bottle; DXVK removed on return; failed return never launches on CrossOver (D-03) | VERIFIED | UAT 4, 5, 20, 25, 34 run 2 |
| 7  | No-CrossOver install: built-in bottle, engine on first need, progress shown (D-01/D-02/D-05) | VERIFIED | UAT 14, 23, 33 (now in Downloads too); shared redists now complete on the engine (UAT 29) |
| 8  | Previous pinned build kept (D-08) | VERIFIED | UAT 9 |
| 9  | Override advanced, unsupported for non-CrossOver, savable, logged (D-14) | VERIFIED | UAT 9, 17, 22; WR-01 closes CEG eligibility |
| 10 | Tested CrossOver versions recorded; untested warns without blocking (D-15) | VERIFIED in code; not live | human item |
| 11 | DRM mode CrossOver-only (boundary) | VERIFIED | UAT 10, 28 |
| 12 | Expired/unhealthy CrossOver never hangs on the nag | VERIFIED | UAT 16, 27 |
| 13 | Install flow cancellable, routing intact, exit contract holds | VERIFIED | UAT 23, 24, 26, 32, 33b, 35 |

**Score:** 13/13 roadmap truths. Round-3 plan must-haves: 10/11 (G22 failed live).

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Round-3 unit suites | `npx jest <26 suites listed above>` | 26/26 suites, 1305/1305 tests | PASS |
| Debt markers in round-3 diffs | `git show <59-31..59-38 commits> -- src \| grep '^+.*(TBD\|FIXME\|XXX)'` | no match | PASS |

## Anti-Patterns

None blocking. `ensureEngineMono` is best effort by design (never throws, logs and proceeds to DXSETUP). The boot sweep is synchronous by design (exit contract); measured ~95 ms for a 264 MB tree (59-33).

## Gaps Summary

One gap, minor: **G25** (the G22 deliverable from 59-38). The early offline refusal is present, wired and unit-tested but never fires in practice, because (a) the online monitor still reported online with DNS failing, (b) the launch-target CM logon in `resolveBridgeLaunchExe` costs ~9 s before engine selection, and (c) the refusal predicate cannot use the cheap "CrossOver missing" fact. The launch is still correctly blocked with the right dialog, so no roadmap clause fails; the status is gaps_found only because a planned must-have did not hold live. If the operator accepts offline-block latency as out of scope for phase 59, add an override for the G22 truth and the status becomes human_needed (four human items unchanged from round 2).

Not phase 59: G24 (Amazon store embed over the game page) needs its own todo. Carried follow-ups: G23 (pending todo), WR-06 (pre-existing).

### Override option

```yaml
overrides:
  - must_have: "G22 (59-38 must-have): when a launch is certain to be blocked offline, it is refused before the CrossOver demo-status probe and the dialog appears without the probe's wait"
    reason: "Offline launch is still correctly blocked with the right dialog; only latency is affected. Tracked as G25 follow-up todo."
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

## History

Round 2 (2026-11-02, HEAD 4706a0307, status human_needed, 13/13): gaps A-G closed with live UAT 20-28; follow-ups G20, G21, G22, G23, WR-01..WR-06 recorded. Round 3 closed G20, G21, WR-01..WR-05 and the H1-H3 human-UAT findings; G22 remains open as G25.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
