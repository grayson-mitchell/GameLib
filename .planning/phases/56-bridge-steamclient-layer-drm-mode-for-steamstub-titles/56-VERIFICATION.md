---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
verified: 2026-10-29T12:00:00Z
status: gaps_found
score: "1/2 roadmap done-when conditions verified on the scored launch (menu on launch 1: FAILED; strict-verified: VERIFIED on evidence-only launches only)"
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "1/2 (56-16 gate, Verdict FAIL at item 4)"
  gaps_closed:
    - "Grim Dawn crash c0000005 after ISteamController_SteamController008_GetActionSetHandle (Gap 7): launches 1b, 2, 3 reached the menu; the trace lists GetActionSetHandle and later controller calls with no crash"
    - "Repeat DRM launches hang at bottle-stage (Gap 9): 0 of 4 repeat launches hung (Grim Dawn 2, 3; Raft 5, 6)"
    - "Install leaves Play disabled (Gap 3): Play enabled after reinstall with no dev restart (gate G3 pass)"
    - "Install route notice stale for DRM titles (Gap 2): zero route-notice lines (gate G2 pass)"
    - "Notice dialog display unconfirmed (Gap 10): display=confirmed 46 ms and 44 ms (gate G15 pass)"
    - "Ranch routed to the ordinary bridge path (Gap 11 routing): Ranch is now DRM-routed (pre-stage SteamStub .bind line, reason=drm-bottle-stage not stubbed:)"
    - "Contract defects Gaps 1, 5, 12: gate re-authored by 56-25; items 7 and 11 amended"
  gaps_remaining:
    - "Grim Dawn menu on the FIRST Play of a fresh bottle (new blocking gap: winebus/IOHID first-stage hang)"
    - "Ranch Simulator first launch (same first-stage hang; non-blocking target)"
  regressions:
    - "Stale 'installing redistributables' card status after a DRM-setup failure survives reload and Refresh (was Gap 3 on the install path, now reappears on the DRM-failure path)"
    - "11 failing tests in 7 jest suites (see gap 7)"
gaps:
  - truth: "Grim Dawn 219990 reaches its interactive menu through DRM mode with only Mac Steam running, on the first Play after a fresh install (the scored launch)"
    status: failed
    reason: "56-25-LIVE-GATE.md Verdict: FAIL, item 3. Launch 1 (fresh bottle after reinstall): drm setup stopped at bottle-stage, 'reg add SteamClientDll64 timed out after 15000 ms', bottle processes at timeout wineserver and winewrapper.exe; anchor delta 0; notice reason=drm-bottle-stage; no game started, so items 4, 5, 6 are issue on launch 1. Ranch launch 7 hung the same way (2 of 2 first stages hung). A 3 s sample of the spinning winedevice.exe shows the main thread in -[IOHIDDeviceClass valueAvailableCallback:] (20 of 20 samples). Retry 1b (after a dev restart, an undocumented-in-contract deviation, on a bottle the failed stage had left partly staged) reached the menu in DRM mode: pid 208 role=game create-interface SteamClient017, no role=helper, census 219990 verified via 'game call ISteamUser_SteamUser017_GetSteamID', 41 role=game events. HONEST JUDGMENT: 1b shows the DRM stack works end to end for Grim Dawn (that is what closed the Gap 7 crash), but it does not meet the done-when as contracted. The operator-approved contract scores launch 1, and a user's first Play on a freshly installed game is the normal path, not an edge case; it fails and needs a dev restart plus a retry to recover. The 1b pass is evidence-only (post-FAIL) and cannot flip the verdict."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts"
        issue: "The bottle-stage reg add runs under a wine session whose wineboot --init spawns winedevice.exe; on a fresh bottle winebus enumerates macOS IOHID devices and the IOHID callback spins, so reg add never returns. No mitigation exists (no HID/winebus disable for the stage session, no kill-and-retry)"
      - path: "src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts"
        issue: "The stage failure is final; there is no automatic retry or session reset, although a second attempt on the same bottle succeeded in 17 s"
    missing:
      - "Stop winebus/gamecontroller enumeration from hanging the stage session on a fresh bottle: e.g. run the stage with winebus disabled (WINEDLLOVERRIDES winebus.sys=d or the equivalent HKLM Services\\winebus Start=4 pre-seeded in the bottle) or pre-create the bottle registry values before any wine session starts, so no reg add is needed under a live wineboot"
      - "Alternatively or additionally: on 'timeout', kill the bottle's wineserver and retry the stage once (see IN-02 gap); 1b proves a second attempt passes"
      - "A wine log for the stage session (todo: stage session has no wine log) so a future hang leaves a trace"
      - "Re-run the live gate on a FRESH bottle with the scored launch being launch 1; a green unit suite does not close this (unit tests mock the bottle)"
    todo: ".planning/todos/pending/2026-10-29-drm-stage-session-can-hit-winebus-gamecontroller-abort-spin.md"
    blocking: true
  - truth: "A failed or aborted DRM setup leaves the game card in a settled state (no stale 'installing redistributables' status) -- review IN-01"
    status: failed
    reason: "After the launch-1 failure the card kept an 'installing redistributables' label that survived webview reload, navigation and a library Refresh and cleared only on a dev restart (blocked the first 1b attempt). Confirmed in code: drmLaunchSetup.ts progress() sends status 'redist' (line ~232, progressSent=true) and fail() never sends a terminal status; games.ts relies on 'the launcher's own done after launch() returns false' (~3738-3742), which the live run shows never arrives. Intermittent: not seen after the Ranch failure."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts"
        issue: "fail() (~228-259) does not send a terminal status when progressSent is true"
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "drm.status === 'error' branch (~3738-3742) does not send done; assumes the launcher will"
    missing:
      - "Send status 'done' (or the prior status) from fail() / the drm.status==='error' branch whenever progressSent is true, as e2592448f did for install"
      - "A test that exercises a failing stage after progress() was sent and asserts a terminal status frame"
    todo: ".planning/todos/pending/2026-10-29-stale-redist-card-status-after-drm-setup-failure.md"
    blocking: false
  - truth: "A timed-out bottle-stage reg add does not leave a hung wine child running in the bottle (review IN-02)"
    status: failed
    reason: "stageDrmBottle.ts ~541-545: on 'timeout' runRegArgv returns the error string and does not kill the reg add child or its wineboot/winedevice. The process listing records the spin but nothing ends it, so each retry adds another hung session to the same bottle. Still present in the tree (code unchanged since review)."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts"
        issue: "No kill on timeout; wineserver -k with CX_BOTTLE alone did not stop the earlier hang (Gap 9 record)"
    missing:
      - "Capture the spawned child via onSpawn and kill it on timeout; also terminate the bottle's wineserver for the DRM runner (not the stock one) and unref the ps child (WR-03)"
  - truth: "SteamStub UE titles in a symlinked CrossOver bottle or library are still DRM-routed (review CR-01)"
    status: failed
    reason: "drmScanExe.ts:49-57 realpaths the Shipping exe candidate and tests it with isContainedWithin(bottleDir, real) against a bottleDir that is never realpathed. A symlinked Bottles dir or symlinked steamapps/common causes a silent 'continue', the resolver returns own ('none'), and the title is routed to the TCP bridge with drmWrapper:none stamped. Code verified unchanged. Realpathing only the root would then break stageDrmBottle's extraExeDirs containment, because drmExe is returned as a realpath (drmScanExe.ts:55) -- the fix must return the lexical path."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts"
        issue: "lines 49-57: realpath vs unresolved root; no log on rejection"
    missing:
      - "Realpath both sides for the containment check, return resolve(candidate) as drmExe, log a warning per rejected candidate (review CR-01 fix block)"
      - "Test with a symlinked bottle root and a symlinked steamapps/common"
  - truth: "All DRM signals (drmWrapper, ceg, exeArch) for a title come from the same exe (review CR-02)"
    status: failed
    reason: "shimGenerate.ts:476 `const drm = detectExeSteamDrm(appId, resolve(gameExePath))` still reads the CEG signal from the bootstrap exe while drmWrapper (lines ~479-487) comes from the resolver's Shipping exe. For a UE title with .bind and CEG on the Shipping exe, resolveBridgeMode (which reads CEG from drmExe) falls through to TCP while placeShimForGame sees drm=null and calls writeBridgeDrmVerdict(appId, undefined), clearing a stored ceg verdict and skipping the CEG dead-end dialog; the install path (games.ts ~2335) misses it too. exeArch (IN-06) is also bootstrap-sourced."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimGenerate.ts"
        issue: "line 476 detects CEG on gameExePath not launchWrapper.drmExe"
    missing:
      - "Compute launchWrapper first and use launchWrapper?.drmExe ?? resolve(gameExePath) for detectExeSteamDrm; source exeArch consistently or document the split"
  - truth: "DRM wine logs are bounded for every launch, including launches that write no trace (review CR-03)"
    status: failed
    reason: "games.ts:986-1003: retention matches only ^<appId>-<id>\\.log$ and removes a .wine.log only as a side effect of deleting its paired trace. createDrmWineLogAppender creates the .wine.log on every DRM launch, but lsteamclient creates the trace only from the game process; a launch that dies before Steam init (the failure cases the log exists for) leaves an orphan .wine.log (cap 8 MiB each) that is never pruned. Code verified unchanged."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "lines 986-1003 retention ignores .wine.log files"
    missing:
      - "Match (\\.wine)?\\.log, group by id, keep the newest DRM_TRACE_KEEP_PER_APP-1 ids and remove both files for older ids (review CR-03 fix block)"
  - truth: "The full jest suite is green; phase work introduced no regressions"
    status: failed
    reason: "11 failures in 7 suites (reproduced by this verification: 'Tests: 11 failed, 1 skipped, 375 passed' over exactly those seven files). Attribution checked with git: (a) meta/lintTranslations REQ-41-02 and runnerSliceRegistration-adjacent presence baseline (lintTranslations R13 comparePresenceBaseline, pluralCategoriesFor x3 in the same run) fail on 48 'library.stopTile' locale entries: key added by 78f657b58 (fix(library): STOP label), not a phase 56 plan; CONFIRMED. (b) meta/isIntelMacRemoved: only src match for 'isIntelMac' is a comment at src/backend/storeManagers/steam/macArchKnownFix.ts:31 added by a029f1f15 (quick-261027-bqe), not a phase 56 plan; CONFIRMED. (c) sidecar runnerSliceRegistration (+ testContainment): channel-count and set-equality tripwires; 509bcb01b added the dialogDisplayed channel and test files (displayAck.test etc.), consistent with the 67->68 attribution; the 509bcb01b commit is a debug fix to phase 56 notice display but outside the plan set; CONFIRMED plausible, not individually bisected. (d) meta/genI18nGateScope A-17 (committed i18nForkTouchedFiles.json vs live git derivation from the upstream merge-base): not obviously caused by any of the three named commits; UNCONFIRMED (possibly the same locale/file churn). (e) sidecar installFlows Test 1b (listSteamLibraryTargets, response.ok false): cause UNKNOWN; none of the three commits touch it directly. The Steam suite itself passes (89 suites, 3399 tests per the orchestrator)."
    artifacts:
      - path: "meta/__tests__/lintTranslations.test.ts"
        issue: "48 library.stopTile entries unlocalised and not in the presence baseline (78f657b58)"
      - path: "meta/__tests__/isIntelMacRemoved.test.ts"
        issue: "comment at src/backend/storeManagers/steam/macArchKnownFix.ts:31 contains the literal isIntelMac (a029f1f15)"
      - path: "src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts"
        issue: "handle-kind count / containment pin out of date after the dialogDisplayed channel (509bcb01b)"
      - path: "src/backend/sidecar/__tests__/testContainment.test.ts"
        issue: "Block C classification tripwire: a test file in the directory is unclassified (likely a new sidecar test from 509bcb01b)"
      - path: "src/backend/sidecar/__tests__/installFlows.test.ts"
        issue: "Test 1b: listSteamLibraryTargets returns ok:false; cause unknown, needs bisect"
      - path: "meta/__tests__/genI18nGateScope.test.ts"
        issue: "A-17 anti-rot: i18nForkTouchedFiles.json differs from the live derivation; cause not established"
    missing:
      - "Regenerate the presence baseline / fill the stopTile key (pnpm run the i18n tools) or record the baseline; fix pluralCategoriesFor failures if they are the same cause"
      - "Reword the macArchKnownFix.ts:31 comment to avoid the literal isIntelMac"
      - "Update the channel counts (67->68) and classify the new test files in runnerSliceRegistration/testContainment"
      - "Bisect installFlows Test 1b and genI18nGateScope A-17 (git bisect on the two test files)"
    blocking: false
deferred: []
---

# Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles - Verification Report (re-verification)

**Phase Goal:** A SteamStub-wrapped title launches through the native Mac Steam bridge with no Windows Steam client, via a second bridge mode (genuine Valve steamclient fetched from CDN, trampolined to lsteamclient, cloned/patched CrossOver runner, x86_64 Mac steamclient.dylib host). Done when (live gate): Grim Dawn reaches its menu through this mode with only Mac Steam running, and it meets the strict bridge-verified criterion.
**Verified:** 2026-10-29
**Status:** gaps_found
**Re-verification:** Yes. Previous status gaps_found (56-16 gate, FAIL at item 4: Grim Dawn crash). Gap closure plans 56-17..26 ran; 56-22..24 closed as superseded by debug fixes 98837f09b and 5ff2dbd8c (operator ruling, accepted here: the live gate, not the plans, is the evidence, and it exercised those fixes).

## Goal Achievement

ROADMAP has no `success_criteria` array; the done-when line is the contract. Requirement IDs: none tracked (no REQUIREMENTS.md); the D-xx decisions in 56-CONTEXT.md were used (D-11, D-12, D-13, D-15, D-16, D-17, D-18, D-21 touched by gate items).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Grim Dawn reaches its menu in DRM mode with only Mac Steam running, on the scored launch (launch 1, fresh bottle) | FAILED | Gate Verdict FAIL at item 3. Launch 1 hung at bottle-stage (reg add timeout 15000 ms), no game ran. |
| 1a | Same, on any launch (evidence-only) | VERIFIED (not scored) | 1b, 2, 3: operator "menu reached"; procs file shows only GameLib helper steam.exe + winewrapper.exe + steam_osx, no steamwebhelper.exe/steamservice.exe. |
| 2 | Strict bridge-verified (D-15/D-16): HELLO + clean game-process attach, game-originated call | VERIFIED (evidence-only launches) | 1b: single `role=game create-interface SteamClient017` (pid 208), zero role=helper, census 219990 `verified`, `game call ISteamUser_SteamUser017_GetSteamID`. Counting names exclude ISteamClient_* and SetMinidumpSteamID per the memory criterion; In-Game not used. Launch 1 has no census row. Satisfies the criterion as to quality; not as to the scored launch. |
| 3 | Component fetched from the published release (D-18) | VERIFIED | Item 1 pass: six names, sha256 dd488...167d matches pin, unsigned; `downloaded and verified` logged (literal `component=download` could not print, contract wording gap). |
| 4 | Reinstall through the bridge settles with Play enabled, no restart (Gap 3) | VERIFIED | G3 pass, dev pid unchanged 62821. |
| 5 | DRM mode works on repeat launches (Gap 9) | VERIFIED | G14: GD 2, 3 and Raft 5, 6, one anchor, zero bottle-stage failures. Caveat: staged bottles only. |
| 6 | First launch on a fresh/unstaged bottle works | FAILED | Tally 0 of 2 (Grim Dawn launch 1, Ranch launch 7). This is the blocking defect. |
| 7 | No Steam InstallPath keys in the bottle (D-21) | VERIFIED | Item 7: 7a count 0 for launch 1 and 1b. 7b unscored (no sink). |
| 8 | Raft 648800 (non-blocking) | VERIFIED (launch 4, evidence-only; bottle pre-staged) | Menu, census verified, one anchor, no notices. |
| 9 | Ranch 1119730 (non-blocking) | FAILED | Launch 7 first-stage hang. Routing now correct (DRM). |
| 10 | Notice display confirmed; no route-notice for DRM titles | VERIFIED | G10, G2 pass. |
| 11 | Card status settles after a DRM-setup failure | FAILED | See gap 2. |

**Score:** 1 of 2 done-when conditions verified on the scored launch (strict-verified yes on later launches, menu no on launch 1). Phase goal not achieved as contracted.

### Honest judgment on retry 1b

The operator-approved contract scores the phase on launch 1; 1b is a documented deviation after a dev restart, on a bottle the failed stage had half staged, and the contract has no retry rule. Taken alone, 1b is real evidence that DRM mode itself works: the crash from the previous round is gone (GetActionSetHandle now returns and the game goes on to menu), D-15/D-16 are met, and only Mac Steam runs. But the done-when says Grim Dawn "reaches its menu through this mode"; a user installing the game and pressing Play gets a failure dialog and a stuck card on the first attempt, then must restart the app. I do not read that as achieved. This is a narrow, well-characterised defect (one hung wine session), so the phase is close, not far.

### Required Artifacts / Wiring

| Artifact | Status | Details |
|----------|--------|---------|
| `bridge/drm/stageDrmBottle.ts` | EXISTS, SUBSTANTIVE, WIRED; fails live on fresh bottle | See gap 1, gap 3 |
| `bridge/drm/drmLaunchSetup.ts` | WIRED; terminal status missing on failure | gap 2 |
| `bridge/drm/drmScanExe.ts` | WIRED; containment defect | gap 4 (CR-01) |
| `bridge/shimGenerate.ts` | WIRED; mixed-exe stamping | gap 5 (CR-02) |
| `games.ts` | WIRED; wine-log retention hole | gap 6 (CR-03) |

### Behavioral Spot-Checks / Tests

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Steam suite (orchestrator) | jest steam | 89 suites, 3399 tests | PASS (does not close the live gate) |
| Seven failing suites | `npx jest <7 files>` | 11 failed, 375 passed | FAIL (gap 7) |
| Live gate | 56-25-LIVE-GATE.md executed by 56-26 | Verdict FAIL - item 3 | FAILED |

### Probe Execution

No probes declared for this phase. Step 7c skipped.

### Anti-Patterns Found

No unreferenced TBD/FIXME markers relevant to the verdict in the reviewed files. The review's 3 critical findings were re-checked against the tree and all three are still present (code unchanged since review); WR-01..07 and IN-03..06 are non-blocking and were not re-verified individually (WR-03 unref and WR-07 import placement are folded into the gaps above where relevant).

### Human Verification Required

None can substitute for the failed live gate. After a fix, a human must re-run the gate on a fresh bottle where launch 1 is scored.

### Gaps Summary

The only blocking gap is the first-stage winebus/IOHID hang on a fresh bottle: it fails the scored launch on both Grim Dawn and Ranch (2 of 2) and passes 0 of 4 repeats only because those bottles were already staged. Everything else the phase set out to do (fetch, clone, trampoline, trace, census, crash fix, repeat launches, install status, notices, routing) is live-verified. Non-blocking gaps for `/gsd-plan-phase 56 --gaps`: stale redist card status after DRM-setup failure (IN-01), hung reg-add child not killed (IN-02), review CR-01 (symlink containment), CR-02 (mixed-exe DRM signals), CR-03 (wine-log retention), and 11 test failures in 7 suites attributed (mostly confirmed) to commits outside the phase plans. Suggested order: winebus stage fix with IN-02 kill-and-retry, IN-01, CR-02, CR-01, CR-03, tests, then re-run the live gate with launch 1 on a fresh bottle.

---

_Verified: 2026-10-29_
_Verifier: Claude (gsd-verifier)_
