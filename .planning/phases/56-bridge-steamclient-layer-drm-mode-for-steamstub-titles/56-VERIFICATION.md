---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
verified: 2026-10-29T18:00:00Z
status: passed
score: "2/2 roadmap done-when conditions verified on the scored launch (menu on launch 1 run 1: VERIFIED; strict-verified: VERIFIED); 7/7 prior gaps closed or reduced to advisory"
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "1/2 (56-25 gate, Verdict FAIL at item 3)"
  gaps_closed:
    - "Gap 1: Grim Dawn first Play on a fresh bottle (56-33 live gate Verdict PASS; stage retry mechanism proven live by forced timeout R1; natural wedge not reproduced)"
    - "Gap 2: stale redist card status after DRM-setup failure (main path closed; narrower path WR-01 remains, advisory)"
    - "Gap 3: hung reg add not killed on timeout (stage ends the session and retries once; R1 live)"
    - "Gap 4: CR-01 symlinked Bottles dir (closed); symlinked steamapps/common library remains, see advisory WR-03"
    - "Gap 5: CR-02 single-exe DRM signals (closed for the stated case)"
    - "Gap 6: CR-03 wine-log retention (closed, id-grouped regex at games.ts:1001)"
    - "Gap 7: test failures (7 suites): 5 of 7 now green; the remaining lintTranslations failures (2) are the user-ruled out-of-phase ji2 keys"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory:
  - id: WR-01
    note: "terminal done gated on drm.progressSent; a failed DRM launch after fireBridgeWineLaunch's own winetricks/redist status (downloads cached, DRM-only return false exits at games.ts ~4393/~4456) leaves the card on a stale status"
  - id: WR-02
    note: "execFile child.unref() in the stage process listing does not release the event loop (timeout timer and stdio stay ref'd); bounded at 3 s, only affects sidecar exit speed after a timed-out stage"
  - id: WR-03
    note: "containment policy differs between bootstrap exe (no check) and Shipping exe (realpath-contained); a symlinked steamapps/common library drops DRM routing for UE titles"
---

# Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles - Verification Report (re-verification after gap-closure round 3)

**Phase Goal:** A SteamStub-wrapped title launches through the native Mac Steam bridge with no Windows Steam client, via a second bridge mode (genuine Valve steamclient fetched from CDN, trampolined to lsteamclient, cloned/patched CrossOver runner, x86_64 Mac steamclient.dylib host). Done when (live gate): Grim Dawn reaches its menu through this mode with only Mac Steam running, and it meets the strict bridge-verified criterion.
**Verified:** 2026-10-29
**Status:** passed
**Re-verification:** Yes. Previous status gaps_found (56-25 gate FAIL at item 3). Round 3 plans 56-27..56-34 ran.

Requirement IDs: N/A (null; .planning/REQUIREMENTS.md does not exist). ROADMAP has no `success_criteria` array; the done-when line is the contract. The goal was derived and scored against it.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Grim Dawn reaches its menu in DRM mode with only Mac Steam running on the scored launch (launch 1, first Play on a freshly reinstalled bottle) | VERIFIED | `56-33-LIVE-GATE.md` items 3, 4: run 1 (14:28:42, game pid 89531) reached the interactive menu; stage ran once on the fresh bottle (`registry not staged:` x1, four successful `reg add`s, no `timed out after`, no notice). Operator quit from the menu. Caveat recorded honestly: the operator then re-clicked Play (run 1b) to capture the process snapshot, so the procs clause (no steamwebhelper.exe / steamservice.exe) is evidenced by run 1b; run 1 itself relies on PC2 (clean before install) and a wine log with no steamwebhelper/steamservice text. |
| 2 | Strict bridge-verified (D-15/D-16) | VERIFIED | Item 5: `role=game create-interface SteamClient017` (pid 356 run 1, pid 240 run 1b), no `role=helper` line. Item 6: census row 219990 `verified`, `game call ISteamUser_SteamUser017_GetSteamID`; 40-41 role=game names; In-Game and helper calls not counted. Matches the memory criterion extension for D-15/D-16. |
| 3 | Component fetched from the published release (D-18) | VERIFIED | Item 1: COMPDIR moved aside (PC8), re-fetched; six names, lsteamclient.so sha256 equals the pin, unsigned. |
| 4 | Fresh-bottle first stage no longer fatal when a stage `reg add` wedges (previous blocking gap) | VERIFIED (mechanism); natural wedge not reproduced | R1 (item 18): forced 300 ms first attempt on a reset Ranch bottle, order `forced timeout -> timed out after 300 ms; ending the stage session and retrying -> bottle processes at timeout -> stage retry passed on attempt` verified by the contract awk (`ORDER-OK`). Code present: `stageDrmBottle.ts:988` retry-passed line; `stageWineLog` writes the stage wine log (S1 pass). Launch 1 with the PowerA pad connected (the wedge trigger) did NOT wedge (W1), so the natural-failure absorption is proven only by the forced path. The root cause (winebus IOHID on that pad) is user-ruled out of phase 56 (todo winebus-iohid-wedges-on-powera-switch2-pad, still pending). |
| 5 | Repeat launches pass (G9) | VERIFIED | Item 14: launch 2, one new anchor, no bottle-stage failure, no notice, 209 s of play. Window reconstructed (script delta misaligned); `procs-launch-2` missing, recorded, not a G9 clause. |
| 6 | Install settles with Play enabled, no restart (G3) | VERIFIED | Item 13: dev pid unchanged, Play enabled, click reached backend within seconds. |
| 7 | No Windows Steam InstallPath keys (D-21) | VERIFIED | Item 7: count 0. 7b unscored (no sink). |
| 8 | Raft 648800, Ranch 1119730 (non-blocking) | VERIFIED | Items 8, 9, 16: both verified in census and reached menu; Ranch DRM-routed via UE Shipping exe `.bind`. Raft hangs on exit after quitting (todo filed, non-blocking). |
| 9 | Card settles after a DRM-setup failure (C1) | VERIFIED on unit evidence only; narrower path open | No live failure occurred (C1 skipped). `drmLaunchSetup.ts:352` and `games.ts:3953` send the terminal `done`. See WR-01. |

**Score:** 2/2 done-when conditions verified on the scored launch.

### Prior gaps (56-VERIFICATION of the previous round)

| Gap | Closed this round? | Evidence |
|-----|-------------------|----------|
| 1 Grim Dawn menu on first Play of a fresh bottle (blocking) | Yes (with caveat) | 56-33 gate Verdict PASS: run 1 menu on the first Play. Retry mechanism proven live by R1 (forced). The natural wedge did not occur, so W1 neither confirms nor refutes absorption of the real hang. Root cause is out of phase by user ruling. |
| 2 IN-01 stale redist card status | Yes for the stated path; narrower residual (WR-01) | `drmLaunchSetup.ts:352`, `games.ts:3946-3953`; unit test for progressSent=true. Residual below. |
| 3 IN-02 hung reg add not killed | Yes | Timeout ends the stage session, lists bottle processes, retries once (R1 live, S1 stage wine log written). |
| 4 CR-01 symlink containment | Partly: symlinked Bottles dir fixed; symlinked library dir not (WR-03) | `drmScanExe.ts:40-72` realpaths both sides, returns lexical `drmExe`, logs rejections. Advisory. |
| 5 CR-02 single-exe DRM signals | Yes | `shimGenerate.ts:489-490` reads CEG from `launchWrapper?.drmExe`. Residual IN-01 (CEG on a Shipping exe with no `.bind`) is rare Info. |
| 6 CR-03 wine-log retention | Yes | `games.ts:1001` `^<appId>-([0-9]{1,16})(\.wine)?\.log$`, id-grouped. |
| 7 Failing tests | Yes within phase scope | Re-run today: drm dir plus installFlows, runnerSliceRegistration, testContainment, isIntelMacRemoved, genI18nGateScope all PASS (16 suites). Only `lintTranslations` (REQ-41-02 live tree, R13 baseline) fails, 2 tests: the `steam.adoptRestart.*` keys from quick-261029-ji2, user-ruled out of phase. |

### Code review warnings (56-REVIEW.md): goal-backward disposition

0 critical. None of the warnings blocks the done-when: Grim Dawn launch 1 reached the menu with them present.

- **WR-01** (advisory): a genuine but narrow residual of Gap 2. It needs a DRM-only failure exit after `fireBridgeWineLaunch` already sent `winetricks`/`redist`. Cosmetic stale card status on a failure path; recoverable. File as a follow-up todo; not a phase gap.
- **WR-02** (advisory): sidecar exit-contract slip, bounded to 3 s and only after a timed-out stage. Does not affect reaching the menu. Worth fixing under the conventions skill (the fix block in the review is concrete), but not a goal blocker.
- **WR-03** (advisory): affects UE titles reached through a symlinked `steamapps/common` library; Grim Dawn (non-UE) and the Raft/Ranch targets are not affected, as the live gate shows. The policy inconsistency is a hardening item.

### Required Artifacts / Wiring

| Artifact | Status | Details |
|----------|--------|---------|
| `bridge/drm/stageDrmBottle.ts` | VERIFIED | retry-passed line present; live R1 |
| `bridge/drm/stageWineLog.ts` | VERIFIED | stage wine log written live (S1); tests pass |
| `bridge/drm/drmLaunchSetup.ts` | VERIFIED | terminal done at :352 |
| `bridge/drm/drmScanExe.ts` | VERIFIED (advisory WR-03) | |
| `bridge/shimGenerate.ts` | VERIFIED | drm source = drmExe |
| `games.ts` | VERIFIED (advisory WR-01) | retention :1001, terminal done :3946 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test suites plus formerly failing suites | `npx jest` on drm dir + 6 formerly failing suites | 16 suites passed, 1 failed (lintTranslations, 2 tests, out-of-phase ji2 keys); 529 passed | PASS (scoped) |
| Live gate | `56-33-LIVE-GATE.md` run by 56-34 | Verdict: PASS (items 1-7, G3, G9, S1, R1) | PASS |

Out of scope per orchestrator/user ruling, not attributed to phase 56: lintTranslations x2 (ji2), findDeadcode 7 exports (ji2, gow, j6x), dxvkInstallRemove ENOTEMPTY flake. The one in-phase finding (unused `StageWineLog` export) was fixed in fd600ca8a.

### Probe Execution

None declared. Skipped.

### Requirements Coverage

N/A: no requirement IDs and no REQUIREMENTS.md.

### Anti-Patterns Found

No unreferenced TBD/FIXME/XXX introduced by the round in the reviewed files per 56-REVIEW.md. Nothing found blocking.

### Honest caveats on the PASS

1. Launch 1 contains two game runs (run 1 scored, run 1b a manual re-click for the procs snapshot). Run 1 reached the menu without any retry or restart; the gate scored items 3 and 13 on run 1's sub-window only.
2. Launch 2's window was reconstructed and its procs snapshot is missing; neither is a blocking clause.
3. The real winebus wedge did not recur with the pad connected, so absorption of the natural failure rests on the forced-timeout test of the same code path. If the PowerA todo is later fixed, that removes the trigger; if not, the retry is the only protection and its live evidence is the forced run.
4. C1 (stale card after live failure) and 7b were not exercised live.

### Human Verification Required

None outstanding; the live gate was operator-run and recorded.

### Gaps Summary

No blocking gaps. Phase 56's done-when is met: Grim Dawn, reinstalled onto a fresh bottle, reached its menu on the first Play in DRM mode with only Mac Steam running and meets the strict D-15/D-16 criterion. Advisory follow-ups: WR-01, WR-02, WR-03, IN-01..04 of 56-REVIEW.md; new pending todos (Raft exit hang, premature Play state, hardcoded-string gate widening) and the pending PowerA winebus todo are tracked outside the phase.

---

_Verified: 2026-10-29_
_Verifier: Claude (gsd-verifier)_
