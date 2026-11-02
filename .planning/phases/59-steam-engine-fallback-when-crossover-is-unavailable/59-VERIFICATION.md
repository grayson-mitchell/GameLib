---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
verified: 2026-11-02T23:00:00Z
status: human_needed
score: 13/13 truths verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/13
  gaps_closed:
    - "Gap A (CR-03): failed return to CrossOver now blocks the launch (games.ts:4242 dxvk-failed on a crossover selection, engine-restore-failed notice); UAT 25 pass, UAT 20 pass"
    - "Gap B (G17): override Automatic/CrossOver saves; root cause was the async GameConfig load race, fixed by 8e7f931f8; UAT 22 pass incl. wine-manager:0.0-missing sub-check"
    - "Gap C (CR-01/G13/G14/G15): provisioning is signal-checked (games.ts:2329, 2387, 2399, 2435, 2543); UAT 23 rounds a and b pass, tile returns to Install, bottle discarded"
    - "Gap D (CR-02/G16): abort returned before markBridgeFailedThisSession (games.ts:2568); UAT 24 pass"
    - "Gap E (WR-03): quit during unpack leaves no sidecar/wineboot/bottle (UAT 26); the leftover .tmp-wine-* is carried as G20 (follow-up, below)"
    - "Gap F (engine state truthfulness, G18): cx-expired warning shown for forced CrossOver override, cleared by Automatic; UAT 27 pass"
    - "Gap G (restore hygiene, WR-07, G19): no killBottleWineServerWith failure line in the offline restore (UAT 25); pre-59-15 DRM titles (Grim Dawn, Raft) not offered the override (UAT 28)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
follow_ups:
  - id: G20
    severity: minor
    item: "Interrupted engine unpack leaves steam-engines/.tmp-wine-* (268 MB) that no boot path sweeps (pruneUnpinnedEngines runs only after a successful install, fallbackEngine.ts:392/404). Fix: bounded synchronous sweep at sidecar boot."
  - id: WR-01
    item: "CEG titles with persisted mode 'tcp' are still offered the override (engineState.ts:137 checks mode before drm==='ceg'). Override has no effect on CEG launches (refused), so cosmetic/UX, not goal-defeating. One-line reorder plus test."
  - id: WR-02/WR-03
    item: "Cancel dropped in two abort-controller handoff races (reinstall immediately after a cancel while the prior depot run tears down; cancel while waiting on a prior run). Edge races; the main cancel paths pass live (UAT 23, 24). Ownership-checked deleteAbortController and a signal re-check after the await."
  - id: WR-04
    item: "Failed per-game settings write (both attempts) leaves renderer and memory diverged from file; log line only. Requires disk-full or read-only volume. Roll back in-memory value / notify renderer."
  - id: WR-05
    item: "cx-broken notice for a forced CrossOver override says 'may fail' while decideLaunchEngine refuses the launch. Wording only."
  - id: WR-06
    item: "GameConfig.load() tests the global config path instead of this.path (pre-existing data-loss risk when config.json is missing; test order-dependent). Inherited, not introduced by phase 59; fix in a follow-up."
  - id: G21-G23
    item: "G21 Downloads tab shows no stage label during engine/bottle setup; G22 offline launch-blocked dialog ~10 s late (demo-status probe timeout); G23 (medium) game-page Play/Settings hidden at mid window heights with the cx-expired warning, filed as todo 2026-11-02-game-page-buttons-hidden-at-mid-window-heights.md."
human_verification:
  - test: "Live no-CrossOver install of a title WITH shared redists (UAT 14 redist half)"
    expected: "Install-time redist lines run the pinned wine (path under the engine root) and no redist entry fails on a missing CrossOver binary"
    why_human: "Dinkum (1062520) has no shared redists, so the claim is covered by unit tests only"
  - test: "Install refusal on a rejected stored Steam session (UAT 13, skipped)"
    expected: "No bottle directory appears and no engine download starts"
    why_human: "Unreachable through the UI when signed out; unit-tested only. Decide whether a live check is wanted"
  - test: "Untested CrossOver build warning (D-15)"
    expected: "A warning line on a CrossOver version absent from testedCrossoverVersions, launch not blocked"
    why_human: "Never exercised live; needs a build or fixture not in the tested list"
  - test: "Fallback bottle survives a different Wine-Staging build (UAT 11, skipped)"
    expected: "Silent prefix update, game launches, save present"
    why_human: "No second Wine-Staging-macOS build exists; decide whether to accept the skip"
---

# Phase 59: Steam engine fallback when CrossOver is unavailable - Verification Report (re-verification)

**Phase Goal:** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, its trial has expired for that bottle, or it is broken. CrossOver stays first choice. One pinned Wine-Staging + DXVK build per release, installed and managed by GameLib, previous build kept. Runs the game's existing bridge bottle with `USER=crossover`. `CX_BOTTLE=<bottle> wine --demo-status` before every CrossOver launch; expired goes to the fallback. CrossOver launches always have a timeout. "N days remaining" notice. Per-game engine override only as an advanced, explicitly unsupported option (known-fixes/census do not apply, launch log records exact engine and version). Tested CrossOver versions recorded, untested warns without blocking. Out of scope: DRM mode and bottled Steam, GPTK/-DXMT, full census on the fallback.
**Verified:** 2026-11-02 (re-verification 2, HEAD 4706a0307)
**Status:** human_needed
**Re-verification:** Yes, after gap-closure round 2 (59-24..59-30)


## Round 2 re-verification (gaps A-G, plans 59-24..59-30)

Basis: operator-attended Re-UAT 2 items 22-28 in 59-UAT.md (22, 23, 24, 25, 27, 28 pass; 26 issue = G20 only), code re-checked at HEAD 4706a0307, and a fresh run of `npx jest` over the engine/, gameConfigFirstWrite, gameSettingWrite, SteamEngineOverride.save, SteamEngineNotices and dxvkInstallRemove suites: 15 suites / 228 tests pass. Gate battery (codecheck, smoke:sidecar, planning-gates exit 0; jest failures equal the pre-round baseline at 4cf305b51 or are out-of-scope phase-60/56-58 and unrelated translation.json churn; testContainment and gameDetailsImportGate regressions fixed in f63afb1f3) accepted from the orchestrator, not re-run. REQUIREMENTS.md still does not exist; no `requirements:` IDs, so coverage is by D-IDs from 59-CONTEXT.md.

| Gap | Subject | Now | Evidence |
| --- | --- | --- | --- |
| A | Failed return to CrossOver launched on CrossOver over DXVK-macOS | CLOSED | games.ts:4242-4261 blocks on `dxvk-failed` for a crossover selection with `engine-restore-failed` notice; engineSwitch.ts rewrites the marker on partial failure; dxvkInstallRemove test passes. UAT 25 offline: dialog, no launch, marker pinned, DXVK present; online retry: restore, marker crossover, DXVK gone. UAT 20 pass |
| B | Override Automatic/CrossOver did not save | CLOSED | Root cause (async GameConfig load race) fixed in 8e7f931f8; gameConfigFirstWrite and SteamEngineOverride.save tests pass. UAT 22 first-click saves automatic, crossover, pinned; `wine-manager:0.0-missing` renders and saves to Automatic |
| C | Cancel during provisioning ignored | CLOSED | `signal?.aborted` checks at games.ts:2329/2387/2399/2435/2543. UAT 23 a/b: no depot lines, no bottle dir, no wineserver, Install offered |
| D | Cancel poisoned bridge route | CLOSED | games.ts:2568 `if (downloadResult.status === 'abort') return downloadResult`. UAT 24: reinstall took the bridge route |
| E | Exit contract hole in verify/unpack | CLOSED for process exit; G20 follow-up | UAT 26: no sidecar, wineboot, wineserver, bottle or pin dir after Cmd-Q on Unpacking. Leftover `.tmp-wine-*` not swept at boot is a disk-hygiene minor, not a hang or in-flight work |
| F | Engine state truthfulness | CLOSED | UAT 27 cx-expired warning for forced CrossOver on a backdated bottle, cleared by Automatic. WR-02 (old) inconclusive-preflight guard addressed in the round; no live regression |
| G | Restore/create hygiene, DRM-mode eligibility | CLOSED for the observed cases | UAT 25 no killBottleWineServerWith failure; UAT 28 Grim Dawn/Raft not offered override. WR-01 (new) leaves the CEG-with-mode case open, see below |

## Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | CrossOver stays first choice when healthy (D-07) | VERIFIED | UAT 1, 25 online retry (reason=cx-healthy) |
| 2  | No-CrossOver launch runs on pinned Wine-Staging + DXVK in the existing bottle, USER=crossover, keeps running (D-04/D-11) | VERIFIED | UAT 3, 5, 21b |
| 3  | Expired trial detected by `--demo-status` pre-launch, routed to fallback (D-09/D-12) | VERIFIED | UAT 7 |
| 4  | CrossOver launches bounded by a timeout (D-10) | VERIFIED | UAT 8 |
| 5  | "N days remaining" at 7 days or fewer (D-13) | VERIFIED | UAT 6 |
| 6  | Shared bottle; CrossOver adopts it and DXVK removed on return; failed return never launches on CrossOver (D-03) | VERIFIED | UAT 4, 5, 20, 25 |
| 7  | No-CrossOver install: built-in bottle creation, engine downloaded on first need, progress shown (D-01/D-02/D-05) | VERIFIED (redist half human-pending) | UAT 14, 23 |
| 8  | Previous pinned build kept; rollback is a release lever (D-08) | VERIFIED | UAT 9 |
| 9  | Override advanced, collapsed, non-CrossOver unsupported, savable and clearable; log records engine and version (D-14) | VERIFIED | UAT 9, 17, 22 |
| 10 | Tested CrossOver versions recorded; untested warns without blocking (D-15) | VERIFIED in code; not live | testedCrossoverVersions test; human item |
| 11 | DRM mode CrossOver-only with clear message (boundary) | VERIFIED | UAT 10, 28 |
| 12 | Expired/unhealthy CrossOver never hangs on the nag | VERIFIED | UAT 16, 27 |
| 13 | Install flow cancellable, does not corrupt routing; exit contract holds | VERIFIED (G20 minor residue) | UAT 23, 24, 26, 21a |

**Score:** 13/13.

## Review warnings (round 2): block or follow-up

None of the six warnings defeats a roadmap clause; zero criticals. All are follow-ups.
- WR-01 (CEG offered the override): override is inert on CEG launches (refused) and CEG/DRM stays out of scope; UX inconsistency only. Follow-up, trivial fix.
- WR-02/WR-03 (cancel dropped in handoff races): only reachable on reinstall-right-after-cancel while a prior depot run is still tearing down, or a cancel while waiting on one. The primary cancel flows pass live. Worth fixing soon since it echoes G13, but not goal-blocking.
- WR-04 (failed write diverges): needs ENOSPC/EACCES; log line exists. Follow-up.
- WR-05 (wording): copy fix.
- WR-06 (load() checks global config path): pre-existing data-loss bug not introduced by this phase; follow-up, higher priority than the others on severity grounds.

## Anti-Patterns

No TBD/FIXME/XXX introduced in engine/ or SteamEngineOverride.tsx. Review IN-01..IN-10 are cleanups.

## Human Verification Required

See frontmatter (4 items, unchanged from the previous round; none was reachable in Re-UAT 2). They set status to human_needed; no automated gap remains.

## Gaps Summary

Gaps A-G are closed with live operator evidence plus passing unit suites. No must-have fails. Remaining: four human-only checks (redist on engine, rejected-session refusal, untested-CrossOver warning, second Wine-Staging build) and the follow-up list above (G20-G23, WR-01..06). Suggest a short gap-free follow-up plan for G20, WR-01..03 and WR-06, and the G23 todo, none gating phase close.

---

_Verified: 2026-11-02_
_Verifier: Claude (gsd-verifier)_
