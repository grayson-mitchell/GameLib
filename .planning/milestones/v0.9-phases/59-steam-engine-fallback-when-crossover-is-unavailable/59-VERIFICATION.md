---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
verified: 2026-11-03T23:45:00Z
status: passed
score: 13/13 roadmap truths verified; round-4/5/6 gaps CR-01 (connectivity), G25..G30, CR-01 (picker), WR-01 closed in code and live or by unit test; 5/5 human verification items resolved in 59-HUMAN-UAT.md (4 pass, 1 skip accepted as override)
overrides_applied: 1
overrides:
  - item: "Fallback bottle survives a different Wine-Staging build (UAT 11)"
    decision: "Skip accepted by the operator 2026-11-02: no second Wine-Staging-macOS build exists. Revisit when the pin is bumped (D-08 release lever)."
    source: 59-HUMAN-UAT.md item 4
re_verification:
  previous_status: gaps_found
  previous_score: 13/13 roadmap truths; round-4 plan must-haves 15/19
  gaps_closed:
    - "CR-01 (round 4): checkConnectivityNow treated monitor status check-online as offline (closed by 59-44; UAT 40: two offline Plays both did a fresh check, no 'via monitor' line)"
    - "G26: no in-flight guard for concurrent same-appId bridge launches (59-46 guard at games.ts:4843-4872, join log at :4852; UAT 41 could not reach the join path, the UI disables Play on the first click, so it rests on unit tests)"
    - "G27: offline demo-status latency (decided accept, D-09 unchanged, 59-47; UAT 42 pass, accept branch)"
    - "G28: later engine notices display=unconfirmed (59-45 dialogKey remount; UAT 43 two dialogs confirmed; queued case rests on unit tests)"
    - "G29: one transient --demo-status failure demoted a healthy CrossOver to cx-broken (59-50 retry once after wineserver stop, stdout in the detail; UAT 45 three quick re-Plays stayed on CrossOver, transient not reproduced so the retry rests on unit tests)"
    - "G30: pinned -> CrossOver DXVK restore took about 20 s (59-51 resolveOnExit strict restore plus one wineserver stop; UAT 44 switch about 6 s, wineserver stop logged once)"
    - "CR-01 (round 5 review): launch-option picker countdown queued stale live copies (59-49 dialogId in-place update; UAT 46 skipped, no title with two launch options, so it rests on dialogQueue.test.ts and launchOptionPicker.test.ts)"
    - "WR-01 (round 5 review): double close dropped a promoted dialog (59-49 targeted close; UAT 47a pass, 47b not run, dropped-promotion case rests on unit tests)"
    - "WR-02 (round 5 review): switches raced per bottle (59-51 per-bottle inFlightSwitches chain, engineSwitch.ts:367-391)"
    - "IN-02, IN-03 (59-52): empty probe-host list fails open; refusal log names its arm"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
follow_ups:
  - id: WR-01-round6
    severity: low
    item: "tools/index.ts:359-373 strict DXVK restore reads the 'unable to find' tolerance from captured output that resolveOnExit may have cut 250 ms after exit; a retried restore can be recorded as failed (marker dxvk 'failed'), forcing one more repair on the next launch. Fails in the safe direction (a false failure, never a false success; the 'failed return never launches on CrossOver' truth holds). Filed as .planning/todos/pending/2026-11-03-strict-dxvk-restore-tolerance-reads-truncated-output.md (minor, macos, code): fix by checking user.reg / the registry value instead of captured text."
  - id: WR-02-round6
    item: "Carried old WR-03: joined second Play re-runs the launcher-level pre/post-launch sequence; filed as .planning/todos/pending/2026-11-03-launch-single-flight-at-ipc-entry.md (with IN-04, a launch()-level G26 test)."
  - id: G30-followups
    item: "Drop wineboot -u / batch the deletes; filed as .planning/todos/pending/2026-11-03-dxvk-restore-drop-wineboot-and-batch-deletes.md (ready: live-gate)."
  - id: IN-round6
    item: "59-REVIEW.md IN-01 (picker resolves done before the chosen launch result; pre-existing) and IN-02 (mixed-kind retry detail text names only the second reason). Diagnostic only."
  - id: jest-baseline
    item: "Ten jest suites fail identically on the pre-round-6 base 75d82bee3; filed by operator decision as .planning/todos/pending/2026-11-03-fix-ten-pre-existing-jest-failures.md. Not attributable to phase 59."
  - id: G23
    severity: medium
    item: "Game-page Play/Settings hidden at mid window heights with the cx-expired warning; todo 2026-11-02-game-page-buttons-hidden-at-mid-window-heights.md (pending)."
  - id: WR-06
    item: "GameConfig.load() tests the global config path instead of this.path (pre-existing, not introduced by phase 59)."
  - id: G24
    item: "Amazon store embed drawn over the Library game page after leaving Stores (not phase 59 code). Filed as .planning/todos/pending/2026-11-04-amazon-store-embed-stays-drawn-over-library-game-page.md."
human_verification:
  - test: "Live no-CrossOver install of a title WITH shared redists (UAT 14 redist half)"
    expected: "Install-time redist lines run the pinned wine and no redist entry fails on a missing CrossOver binary"
    why_human: "Partially exercised by UAT 29 (576770 DirectX on the built-in engine at Play, not install). Decide whether UAT 29 suffices"
    result: "pass — live 2026-11-02, Low Magic Age (576770) under no-crossover.sb; every redist ran the pinned wine, none failed on a missing CrossOver binary (59-HUMAN-UAT.md item 1)"
  - test: "Install refusal on a rejected stored Steam session (UAT 13, skipped)"
    expected: "No bottle directory appears and no engine download starts"
    why_human: "Unreachable through the UI when signed out; unit-tested only"
    result: "pass — accepted on unit-test coverage by the operator 2026-11-02 (59-HUMAN-UAT.md item 2)"
  - test: "Untested CrossOver build warning (D-15)"
    expected: "A warning line on a CrossOver version absent from testedCrossoverVersions, launch not blocked"
    why_human: "Passed live 2026-11-02 (59-HUMAN-UAT.md item 3, fake tested-version entry, reverted)"
    result: "pass — live 2026-11-02, notice shown, launch not blocked (59-HUMAN-UAT.md item 3)"
  - test: "Fallback bottle survives a different Wine-Staging build (UAT 11, skipped)"
    expected: "Silent prefix update, game launches, save present"
    why_human: "No second Wine-Staging-macOS build exists; decide whether to accept the skip"
    result: "skipped — accepted by the operator 2026-11-02 and recorded under overrides; revisit when the pin is bumped (59-HUMAN-UAT.md item 4)"
  - test: "Round-6 paths not exercised live: G29 transient retry (UAT 45), launch-option picker launches once (UAT 46), offline-warning button closes (UAT 47b)"
    expected: "Retry: after a nonzero-exit probe, a stdout= line, an 'inconclusive, retrying once' warning and a following outcome=ok; picker: one dialogId, one launch at a pick or the 10 s auto-select; offline warning OK / Play Anyway each close once"
    why_human: "No transient could be provoked and no installed title has two launch options; they rest on demoStatus/engineDecision/dialogQueue/launchOptionPicker unit tests (all passing). Decide whether to accept the unit-test evidence or re-test when a multi-option title exists"
    result: "pass — accepted on unit-test coverage by the operator 2026-11-03 (59-HUMAN-UAT.md item 5)"
---

# Phase 59: Steam engine fallback when CrossOver is unavailable - Verification Report (re-verification 6)

**Phase Goal:** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, its trial has expired for that bottle, or it is broken. CrossOver stays first choice; one pinned Wine-Staging + DXVK build per release, previous kept; demo-status check before every CrossOver launch; timeouts; "N days remaining" notice; override advanced and unsupported; tested versions recorded. Out of scope: DRM mode and bottled Steam, GPTK/-DXMT, full census on the fallback.
**Verified:** 2026-11-03 (HEAD 6f1484ebb)
**Status:** passed (human verification resolved 2026-11-03 in 59-HUMAN-UAT.md; status updated 2026-11-04)
**Re-verification:** Yes, after gap-closure round 6 (59-49..59-53). This file also absorbs round 5 (59-44..59-48), whose verification report was never written; round 4's table is superseded below.

## Basis

Code read at HEAD for each round-5 and round-6 claim: connectivityNow.ts (status read, `st === 'offline'` short-circuit only, hook gated on `st === 'online'` and wrapped in try/catch, empty-host fail-open), tools/index.ts strict restore (`wait: !strict`, `resolveOnExit: strict`, "unable to find" tolerance), engineSwitch.ts (killWith after restore, `inFlightSwitches` per-bottle chain), engineDecision.ts (two-attempt probe, "inconclusive, retrying once" at :306, killCrossoverWineserver before retry), demoStatus.ts (`stdout=` at :145), games.ts (G26 join at :4843-4872), dialogQueue.ts and library.ts (`dialogId` in-place update, targeted close). `git status --short src` is clean. Fresh `npx jest` over src/frontend/state, launchOptionPicker, steam/engine, dxvkInstallRemove and connectivityNow: 40 suites, 592 tests pass. Summary-reported `pnpm codecheck`, `pnpm lint` and `pnpm smoke:sidecar` passes were not re-run by the verifier. The ten failing suites in the full jest run are identical on the pre-round-6 base and are tracked in a pending todo; none is a phase-59 round-6 file. No TBD/FIXME/XXX in the files modified by rounds 4-6 (grep over the main touched files returned none). REQUIREMENTS.md does not exist and no phase requirement IDs are mapped (ROADMAP says `Requirements: TBD`); plans declare gap labels (G25..G30, CR-01, WR-01..03, IN-02..04) as their `requirements` values, which are not REQUIREMENTS.md IDs. App not run by the verifier; live evidence is the operator-attended re-UAT 4, 5 and 6 (59-UAT.md items 36-47, status complete).

## Observable truths (roadmap)

All 13 roadmap truths hold; none is defeated by rounds 4-6, and the pieces rounds 4-6 touched have since been re-tested live.

| Area | Evidence at HEAD | Status |
| --- | --- | --- |
| CrossOver first choice, healthy launch stays on CrossOver (truth 1) | UAT 1; UAT 44/45 `engine=crossover ... reason=cx-healthy` on every Play, including three quick re-Plays | VERIFIED |
| Per-launch `--demo-status` check, timeout, no demotion on a transient (truths 2, 3) | engineDecision.ts two-attempt probe with wineserver stop between attempts (G29); UAT 45 probes `outcome=ok` (5.2-5.3 s); retry path on unit tests only | VERIFIED (retry on unit tests; accepted by the operator, 59-HUMAN-UAT.md item 5) |
| CrossOver missing / expired / broken falls back to pinned Wine-Staging + DXVK, "N days remaining" notice, advanced unsupported override, tested-version record (truths 4-9) | Rounds 1-3 live UAT 1-35 unchanged; round-6 changes do not touch these paths | VERIFIED (D-15 untested-build warning never live, human item) |
| Shared bottle, failed return never launches on CrossOver (truth 6) | Strict restore still fails closed on a nonzero code (tools/index.ts:359-373); WR-02 serialisation prevents interleaved switches; UAT 44 clean restore and `dxvk` marker not failed | VERIFIED (WR-01-round6 can only produce a false failure) |
| No-CrossOver install and first-run fallback (truth 7) | CR-01 (connectivity) closed: check-online no longer read as offline (UAT 40); offline refusal only for crossover-missing and restore-needs-pin (UAT 36, 37, 43) | VERIFIED |
| Offline behaviour: prompt, correct refusal, no CM logon (truths 10-11) | UAT 36/37/43 refusals within tens of ms; UAT 42 offline restore and launch on CrossOver; probe latency about 9-12 s accepted (D-09 unchanged, 59-47) | VERIFIED (G27 accepted) |
| Engine notices always visible (truth 12) | dialogKey remount (59-45) and in-place `dialogId` update (59-49); UAT 43 `display=confirmed` for both notices | VERIFIED (queued case on unit tests) |
| One launch per appId and per bottle switch (truth 13) | games.ts G26 join, engineSwitch.ts `inFlightSwitches`; UAT 41 one launch, one switch | VERIFIED (join path on unit tests: UI absorbs a double click) |

**Score:** 13/13 roadmap truths verified. The SUCCESS CRITERIA labels above group the 13 truths by area; each was confirmed in rounds 1-3 and regression-checked by the live items cited.

## Round-5 and round-6 must-haves

| Plan | Must-have | Status | Evidence |
| --- | --- | --- | --- |
| 59-44 | Status-based offline short-circuit; only `offline` refuses; hook gated and isolated; two-host DNS | VERIFIED | connectivityNow.ts read; connectivityNow tests pass; UAT 40 |
| 59-45 | Each dialog remounts by key so a promoted queued dialog is visible | VERIFIED | UAT 43 (`key=1`, `key=2`, both confirmed); queued case on unit tests |
| 59-46 | One bridge launch per appId; second Play joins | VERIFIED (unit tests) | games.ts:4843-4872; UAT 41 single launch. WR-02-round6 (launcher-level sequence reruns for a joined Play) deferred to a pending todo |
| 59-47 | G27 decision recorded, D-09 unchanged | VERIFIED | 59-47-SUMMARY; UAT 42 |
| 59-48 | Re-UAT 5 items 40-43 with verdicts | VERIFIED | all four recorded, pass |
| 59-49 | Picker updates in place by `dialogId`; targeted close; redundant button closes removed | VERIFIED (unit tests; live partial) | dialogQueue.ts:39-67, library.ts:344-410; dialogQueue / launchOptionPicker tests pass; UAT 47a live pass, UAT 46 skipped |
| 59-50 | Transient nonzero-exit / spawn-error retried once after wineserver stop; two probes total; stdout in the detail; D-09 amendment recorded | VERIFIED (unit tests) | engineDecision.ts:242, :306; demoStatus.ts:145; UAT 45 transient not reproduced |
| 59-51 | Strict restore settles on exit (`wait: !strict`, `resolveOnExit: strict`), deletes before `wineboot -u`, one CrossOver wineserver stop after, Heroic toggle unchanged; per-bottle switch serialisation | VERIFIED | tools/index.ts:359-373; engineSwitch.ts:285-313, :367-391; dxvkInstallRemove and engineSwitch tests pass; UAT 44: switch about 6 s, stop logged once, no `DXVK restore failed` |
| 59-52 | IN-02 fail-open, IN-03 per-arm log; WR-03/IN-04 and G30 follow-ups filed as todos | VERIFIED | connectivityNow.ts empty-host branch; both todos exist under .planning/todos/pending |
| 59-53 | Gate battery green; re-UAT 6 items 44-47 with verdicts; items 1-43 untouched | VERIFIED | UAT 44 pass, 45 pass (retry unexercised), 46 skipped, 47 pass (a) |

## Decision on the round-6 review findings

- **WR-01 (strict restore tolerance can miss after `resolveOnExit`):** does not block a must-have. The only effect of a miss is a false "restore failed": the marker records `dxvk: 'failed'` and the next launch repairs it. The launch is not run on a broken bottle, so the "failed return never launches on CrossOver" truth is not weakened, and the window requires a retried restore with output flushed after the 250 ms grace. UAT 44 ran the strict restore live without it. Follow-up: add a todo (low severity), fix by checking the registry value or `user.reg` instead of captured text, plus a test where stderr arrives after `exit`.
- **WR-02 (launcher-level sequence reruns for a joined Play):** already filed as `.planning/todos/pending/2026-11-03-launch-single-flight-at-ipc-entry.md`; the bridge-body guard prevents the bottle-level damage G26 recorded.
- **IN-01, IN-02:** diagnostic or pre-existing; no must-have affected.

## Behavioral spot-checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Round-4/5/6 unit suites | `npx jest src/frontend/state src/frontend/helpers/__tests__/launchOptionPicker src/backend/storeManagers/steam/engine src/backend/tools/__tests__/dxvkInstallRemove src/backend/__tests__/connectivityNow` | 40 suites, 592 tests pass | PASS |
| Planning gates | `pnpm planning-gates` | Before this edit: 59-VERIFICATION.md frontmatter failed at 79:94 (`...accept the skip"---`, missing newline before the closing fence). Fixed here; rerun: 12/12 gates pass | PASS |

## Anti-patterns

None blocking. Carried warnings are listed under `follow_ups` (WR-01-round6 low, WR-02-round6 and G30 follow-ups filed). The frontmatter defect flagged by `pnpm planning-gates` was the only blocker on this file and is fixed.

## Human verification (resolved)

1. **Live no-CrossOver install with shared redists (UAT 14 redist half).** Expected: redist lines run the pinned wine; none fails on a missing CrossOver binary. Why human: UAT 29 covered Play, not install. **Result: pass**: live install of Low Magic Age under no-crossover.sb, 2026-11-02.
2. **Install refusal on a rejected stored Steam session (UAT 13).** Expected: no bottle, no engine download. Why human: unreachable via UI when signed out; unit-tested. **Result: pass**: accepted on unit tests by the operator, 2026-11-02.
3. **Untested CrossOver build warning (D-15).** Expected: warning line, launch not blocked. Why human: never live at verification time. **Result: pass**: live 2026-11-02, the notice was shown and the launch was not blocked.
4. **Fallback bottle survives a different Wine-Staging build (UAT 11).** Expected: silent prefix update, game launches. Why human: no second build exists. **Result: skipped**: the operator accepted the skip on 2026-11-02 (recorded as an override); revisit when the pin is bumped.
5. **Round-6 paths resting on unit tests only (G29 retry, picker, UAT 47b).** Decide to accept the unit evidence or re-test when a multi-option title is available. **Result: pass**: accepted on unit tests by the operator, 2026-11-03.

## Gaps summary

No failed must-have remains. Rounds 4, 5 and 6 closed CR-01 (connectivity), G25-G30, the picker CR-01, WR-01 and WR-02, with live confirmation for connectivity, switch serialisation, the DXVK restore speed and dialog behaviour, and unit-test confirmation for the G26 join, the G29 retry and the picker. The new round-6 review warning (WR-01, restore tolerance) is a low-severity follow-up, not a gap. All five human verification items were resolved in 59-HUMAN-UAT.md (status complete, 2026-11-03): four pass and one skip that the operator accepted, recorded under `overrides`. Status is therefore passed.

---

_Verified: 2026-11-03T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
