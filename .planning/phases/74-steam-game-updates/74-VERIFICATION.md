---
phase: 74-steam-game-updates
verified: 2026-11-14T17:00:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "Registered Update with Steam closed finishes only at the PICS target (UAT 19/24; updateNative.ts picsSaysNewer && !acfPending uses known.targetBuild; live UAT 24 pass)"
    - "InstallApp retried after Steam start (UAT 25/29; retryInstallApp disarms on sawActivity only; live UAT 29 pass, retry 9 s after click)"
    - "Installed Steam games kept while signed out, update check on sign-in (refresh.ts restoreLocalSteamLibrary at lines 43/69/87; live UAT 26, 27 pass)"
    - "CR-02 unattended auto-update no-loop (live UAT 30 pass; UAT 23 blocked and UAT 28 issue superseded)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification:
  - test: "Decide whether review warnings WR-01 (update poll can stay 'updating' up to MAX_TICKS ~6h after activity seen then ACF settles at fromBuild) and WR-02 (guard inert when hand-off targetBuild == fromBuild; updateNative.ts:92-98 still prefers acfTarget when acfPending) ship as follow-up todos or get a small fix plan"
    expected: "Accept as non-blocking follow-ups (triaged to todos) or schedule /gsd-plan-phase 74 --gaps"
    why_human: "Judgement call on severity; neither path was exercised live and both need an unusual Steam sequence"
---

# Phase 74 re-verification after gap-closure round 4 (74-34, 74-35, 74-36), 2026-11-14

**Status: human_needed (10/10). Goal achieved; only an advisory decision remains.**

## Round-2 blockers: closed (code and live evidence)

| Prior gap | Code check | Live proof |
|---|---|---|
| UAT 19 false finished at stale build | updateNative.ts:88-98: `targetBuild = picsSaysNewer && !acfPending ? known.targetBuild : (acfTarget ?? known.targetBuild)`; updatePollOnce.ts adds `atStaleStart` guard blocking `finished` at fromBuild | UAT 24 pass: no `finished (build 3512046)`, quiet end, badge kept |
| InstallApp never retried (UAT 25) | updatePollOnce.ts retryInstallApp guard is `sawActivity` only (sawPending no longer disarms) | UAT 29 pass: `retry after Steam start` 9 s after click, `finished (build 5820078)`, no false finish |
| Signed out hides installed games (UAT 23) | refresh.ts calls `restoreLocalSteamLibrary` on every not-ready exit; sign-in triggers refresh and update check | UAT 26, 27 pass (apps=44, badge kept, relaunch and in-session sign-in) |
| CR-02 unproven live (UAT 23 blocked, 28 issue) | checkGameUpdates.ts and library/index.ts log off-branch and `auto-update candidates=n` (74-35) | UAT 30 pass: one attempt recorded, `unattended=true update not started`, later checks skip with `already attempted this session`, manual attended update completed |

UAT 28's "issue" was a test-setup error (store/config.json is only a mirror), diagnosed by 74-35 logging and re-run as UAT 30; UAT 23 blocked is superseded by UAT 30. UAT 25 superseded by 29. UAT 19 superseded by 24 (+ code).

Spot-check: `npx jest` on library.updatePollOnce, library.updates, checkGameUpdates: 3 suites, 35 tests pass. No TBD/FIXME/XXX in the changed files. Pre-existing failures (tsc from phase-70 retyping, shimCoverage/shimGenerate, libraryState WIP) are outside phase 74 and not re-run.

## Must-haves (all 10)
Bridge badge/size (UAT 1,2), bridge Rust delta + bridge launch (3,4,5,18,21), pause/resume completes (6), registered hand-off and completion with Steam running, closed, InstallApp on/off (10,11,17,22,24,29, Windows 15), single launch prompt with Esc (20), launch gated during update, bounded offline check (8), auto-update bridge-only without loops (14, 30), content never deleted for DLC depots (18), signed-out visibility (26, 27). All VERIFIED.

## Open minor items (not goal blockers, triage to todos)
WR-03 resume discards downloaded temps (delta.rs); download estimate 3-7x high; Update button/size discoverability; Downloads hero lacks "Planning update..."; part-downloaded prompt wording; badge lost after Play (refresh restores); Update-button flash polish; Linux nav hand-off unverified. UAT totals: 30 items, 21 pass, 6 issue, 2 skipped, 1 blocked; every issue/blocked row except the minor gaps above is superseded by a later passing re-run (7->16/20, 12->17/22, 19->24, 23->26/27/30, 25->29, 28->30).

## Review warnings (round 4, advisory) weighed
- WR-01 (real, introduced by 74-34): after sawActivity and settle at fromBuild the poll can emit `updating` until MAX_TICKS (~6h) since the quiet end requires `!sawActivity`. Needs Steam to start then abandon an update; bounded; does not affect any live-proven path. Not a blocker; recommend a small fix plan (settled-at-stale tick counter).
- WR-02 (real, edge): updateNative.ts:92-95 still prefers the ACF target whenever acfPending, so a pending ACF with TargetBuildID == buildid records target == fromBuild and the stale-finish guard is inert. Live UAT 24/29 captured Steam's real ACF (TargetBuildID = PICS target) so not reproduced. Not a blocker; one-line fix suggested in 74-REVIEW.md.
- WR-03 (low): retry may InstallApp a queued/paused Steam download; InstallApp is idempotent-ish, user-visible effect small. Not a blocker.

## Requirements
STEAM-01 and STEAM-02 (REQUIREMENTS.md lines 39-40, 86-87, `[x]`/Complete) are claimed across plans 74-01..35 (sub-IDs plan-local). Both are now substantively satisfied: STEAM-01 (badge and registered completion incl. closed-Steam and signed-out, UAT 1, 10, 17, 22, 24, 26, 29); STEAM-02 (bridge delta update, UAT 3, 5, 6, 18, 21, 30). Prior recommendation to revert STEAM-01 is withdrawn; keep Complete. No orphaned IDs (STEAM-03 is Phase 75).

---

# Previous report (round 2 and round 1, preserved)

## Re-verification after gap-closure round 2 (plans 74-23..74-29), 2026-11-13

**Status: gaps_found (score 8/10).** Round 2 closed every round-1 must-fix item in code, and the live gate (74-UAT.md: 23 items, 16 pass, 4 issue, 2 skipped, 1 blocked) proved most of them: single native prompt with Esc = Play anyway (UAT 20), registered InstallApp completion clears promptly (UAT 17, 22), DLC/multi-depot update keeps content (UAT 18, Dredmor 98800), no depotJobEvent IPC errors (UAT 21), Steam-closed hand-off starts Steam (UAT 19 first half). Two major gaps remain.

### Closed (code checked, not summary-trusted)
- WR-06: install.ts:292 reports done when abort races a committed delta.
- WR-01: install.ts:200-243 computes retired depots from the branch list and keeps depots on an incomplete list; live-proved.
- WR-05: updateLaunchPrompt.ts:51-75 aborts launch for part-updated, in-flight and queued-running states.
- WR-04b: updateDetection.ts:233-246 wraps connect and read in one withTimeout.
- Stacked prompts: live-proved by UAT 20 (one native box, no Heroic box).
- WR-08, WR-09, CR-02: implemented per 74-24/74-25 summaries, unit-tested; CR-02 not live-proved (UAT 23 blocked).

### Open
1. **BLOCKER, UAT 19 (verified in code):** updateNative.ts:90-93 `targetBuild = acfFields.targetBuildId (if non-'0') ?? known.targetBuild`. With ACF TargetBuildID == buildid (the current-ACF path that line 83-85 explicitly handles), the target-aware poll finishes at the stale build. The fix is to prefer the PICS target when picsSaysNewer.
2. **BLOCKER, UAT 23:** library/refresh.ts:80 returns without listing installed games when signed out; sign-in triggers no update check.
3. Minor/cosmetic (can-defer): WR-03 resume progress, badge lost after Play (UAT 20), Settings autoUpdate toggle display, InstallApp not retried for launch-only games, Update button discoverability, estimate overstatement not re-measured.

### Requirements
STEAM-01 and STEAM-02 are marked `[x]`/Complete in REQUIREMENTS.md (lines 39-40, 86-87). Both IDs are claimed by plans 74-23..28 (74-29 claims none). STEAM-01 is not fully met while open gaps 1 and 2 stand (a registered update can report finished without updating; installed games vanish signed-out). STEAM-02 is now substantively met (live: UAT 3, 5, 6, 14, 18, 21) apart from signed-out visibility. Recommendation: revert STEAM-01 to Pending until gaps 1 and 2 close. No orphaned IDs (STEAM-03 is Phase 75). Sub-IDs STEAM-01a-d/02a-d remain plan-local.

### Human verification required
Re-run UAT 19 (completion at the PICS target) and UAT 23 (CR-02 failing unattended update, once signed-out library is fixed). UAT 15 stays deferred to the Windows todo.

### Pre-existing failures (not phase 74)
legendary epicOfflineMode 6c, tauriShellSource WR-07, gamelibCatalogParity/lintTranslations/x86CallbackWineHarness slot 15, codecheck step 2 (meta/gen_vtables.ts), moduleStateCensus on uncommitted humble/adapter.ts. Not re-run here.

---

## Round-1 report (preserved)

# Phase 74: Steam game updates Verification Report

**Phase Goal:** GameLib can tell when an installed Steam game has an update and can apply it, for both Steam-registered games and bridge (GameLib-installed) games.
**Verified:** 2026-11-13
**Status:** gaps_found
**Re-verification:** Round-1 report; see round-2 section above

## Goal Achievement

The core capability exists and works on real hardware: detection and apply both function end to end. The phase is not complete because the live gate's approval condition (items 1-8 and 10-14 pass) was not met, and the code review found several defects that touch the goal (one potential content-deletion, one launch-override, one lost-follow-up).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bridge stale game shows update badge and size after Refresh | VERIFIED | UAT 1, 2 pass (Mining Mechs). Size is an upper bound (see WR-02). |
| 2 | Bridge game updates via Rust delta, keeps saves, and still launches via the bridge | VERIFIED | UAT 3, 4, 5 pass: outcome `status=completed acf=4`, only changed files rewritten, strict HELLO+GINIT; Manor Lords genuine DLL swapped to `.gamelib-orig`, shim re-placed. |
| 3 | Registered game shows "Steam will update this game" and Update hands off to Steam | VERIFIED | UAT 10, 11 pass (steam://nav, A1 confirmed). |
| 4 | Registered Update with InstallApp ON completes and GameLib reflects it | FAILED | UAT 12 issue; WR-04 (badge stays until 40-tick timeout). |
| 5 | Check on refresh and before launch is bounded and Play shows one working prompt | FAILED | UAT 7 major (stacked prompts, OK-only fallback = Update now); WR-04b (bound is not real). Offline Play itself passed (UAT 8). |
| 6 | Pause/resume through the download queue | PARTIAL (functional, wasteful) | UAT 6: resume completes but restarts at 0% (WR-03); pass-with-gaps. |
| 7 | Auto-update queues bridge games, not registered (D-01/D-02), without unattended auth | PARTIAL | UAT 14 pass on queueing and D-02; WR-08 shows unattended authenticated logon and repeat passes. |
| 8 | Update never destroys content the new build still needs | FAILED | WR-01 (unselected depot treated as retired; confirmed in code at install.ts:200-224: `selected` from `refs.depots` only). Not exercised live (fixtures have one depot). |

**Score:** 3 fully verified of 8 (the must-have count above says 5/8 counting the two PARTIAL items as not verified would be 3/8; frontmatter lists 5/8 as the generous count of truths with a live pass on their core path: 1, 2, 3, 6, 7). Treat as gaps_found either way.

Items confirmed directly in code, not from the review's word: `src-tauri/src/dialogs.rs:151` (`filter(|b| b.len() == 2)`), `updateLaunchPrompt.ts:51-70` (queued returns 'launch'; three buttons passed), `install.ts:200-224` (retired = installed minus selected, `ownerAppId: appId`).

### Requirements Coverage

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| STEAM-01 (Update available on installed Steam game) | 74-04, 05, 08, 11, 12, 13 | PARTIAL | Badge shows for bridge (UAT 1) and registered (UAT 10); completion not reflected (UAT 12); pre-launch bound not real. Stays `[ ]`, correct. |
| STEAM-02 (update a bridge game from GameLib) | 74-01, 02, 06, 07, 10, 13 | PARTIAL | Works live (UAT 3, 5, 6, 14). Blocked from "ready" by WR-01, WR-06, UAT 7. |
| Sub-IDs STEAM-01a/b/c/d, STEAM-02a/b/c/d | plans 01-13 frontmatter | NOT IN REQUIREMENTS.md | Only STEAM-01/02/03 exist in REQUIREMENTS.md (lines 39-41, 86-88). The sub-IDs are plan-local and untracked: no orphan problem, but they cannot be audited against REQUIREMENTS.md. STEAM-03 is Phase 75, not claimed here. |

**Premature completion of STEAM-02:** Plan 74-01 (`74-01-SUMMARY.md:35`, `requirements-completed: [STEAM-02, STEAM-02a]`) delivered only the Rust chunk-level delta core (delta.rs, routing, wire fields); no TS wiring, no user path, no live test existed at that point. Marking STEAM-02 `[x]` (REQUIREMENTS.md:40, traceability line 87 "Complete") after plan 1 of 13 was not justified. Plans 02, 06, 07 and 10 also claim STEAM-02, and 74-13 correctly declared `requirements-completed: []`. Today the live evidence does show a user can update a bridge game from GameLib (UAT 3, 5, 6, 14), so the mark is not contradicted on the narrow words, but the same evidence shows the shipped behaviour is defective (WR-01 content deletion risk, WR-06, UAT 7). Recommendation: revert STEAM-02 to `[ ]` / "Pending" in REQUIREMENTS.md until the must-fix gaps close, then re-mark it. This verifier did not edit REQUIREMENTS.md.

### Anti-Patterns / Probes

No TBD/FIXME/XXX hits in the checked phase files (updateLaunchPrompt.ts, updateBridge.ts, updateDetection.ts, delta.rs). Preflight (cargo tests, clippy ratchet, check:ipc-contract, smoke:sidecar, planning-gates) was reported green by 74-13; not re-run here. Pre-existing test:ci failures (tauriShellSource WR-07, epicOfflineMode 6c, gamelibCatalogParity sl, genI18nGateScope, lintTranslations, x86CallbackWineHarness) are not phase-74 regressions, but the phase added untranslated keys (gap above).

### Review warnings triage

- Must-fix before the phase can close: WR-01, WR-05, WR-06, WR-04 (UAT 12), WR-04b, WR-08 (unattended auth part), UAT 7 stacked prompts.
- Should-fix: WR-02, WR-09, i18n/fork-touched registration, IN-03 (skip retired removals after a rename failure).
- Can-defer: WR-03 (resume keeps temps), WR-07 (hero planning label), WR-08 re-queue churn, WR-10, IN-01, IN-02, item 1 Update button UX, prompt wording for part-downloaded updates, item 15 (Windows hand-off, already a todo).

### Human Verification Required

After gap closure: re-run UAT 7 (prompt choices on a stale Hell Clock or Core Keeper), UAT 12 (InstallApp ON completion), and a multi-depot/DLC bridge game update to prove WR-01 does not delete DLC content. UAT 15 stays deferred to the Windows todo.

### Gaps Summary

Detection and the bridge delta-apply core are real and proven live (Mining Mechs, Manor Lords, Planet Crafter, Core Keeper, All Will Fall). The goal is not yet met cleanly: the Play-time prompt is broken (and can force an update the user declined), a possible content-deletion path exists for multi-depot games, a committed update can skip its follow-ups on an abort race, registered-update completion is not reflected, and the "bounded 3 s" pre-launch check is not bounded. Plan these through `/gsd-plan-phase 74 --gaps`, grouped as: (1) launch gate (UAT 7, WR-05, WR-04b); (2) update correctness (WR-01, WR-06, WR-09, IN-03); (3) registered completion (WR-04); (4) auto-update auth (WR-08); (5) estimate and polish (WR-02, WR-03, WR-07, i18n).

---

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
