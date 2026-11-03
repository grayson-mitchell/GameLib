---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
verified: 2026-11-03T21:00:00Z
status: gaps_found
score: 13/13 roadmap truths verified; round-4 plan must-haves 15/19 (G25(a) CR-01 and the G26/G27 live results open)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/13 roadmap truths; round-3 must-haves 10/11
  gaps_closed:
    - "G25(b): launch-target CM logon skipped offline (UAT 36/37: stored target, no CM logon)"
    - "G25(c): offline refusal fires for crossover-missing and restore-needs-pin regardless of the marker DXVK copy (UAT 36 and 37 pass, refusal in 9 ms and 58 ms)"
    - "G25(a) partly: a fresh OS-level check at Play finds Wi-Fi-off in 2-3 ms (no-interface); monitor recovery to online verified (UAT 39)"
  gaps_remaining:
    - "CR-01: checkConnectivityNow treats monitor status check-online as offline"
    - "G26: no in-flight guard for concurrent same-appId bridge launches"
    - "G27: offline demo-status probe ~12 s on the CrossOver-healthy restore path"
    - "G28: later engine notices display=unconfirmed"
  regressions: []
gaps:
  - truth: "G25(a) 59-40: a fresh connectivity check at the moment of an action reports offline only when offline, and a status that is not definitely offline (unknown) never causes a refusal"
    status: failed
    reason: "CR-01 (59-REVIEW.md, confirmed here at connectivityNow.ts:80-81). defaultDeps.isOnline is online_monitor.isOnline = (status === 'online'), so `if (!d.isOnline())` returns offline:true/source 'monitor' for status 'check-online' too, without asking the OS. 'check-online' is the unknown state: set at every boot until the first probe answers (up to 10 s, longer when probes fail, 5 s backoff steps) and, new in round 4, set by recheckConnectivity after any fresh offline finding until the next backoff tick or the webview online event. In those windows a Play on a machine with no CrossOver, override automatic and the current pin not installed returns crossover-missing and shows the 'couldn't download its built-in engine (offline)' dialog while actually online; resolveBridgeLaunchExe also skips PICS and uses a possibly stale target. This breaks the module's own 'unknown never refuses' rule and gates the first-run no-CrossOver fallback path that phase 59 exists for. Live evidence is consistent: UAT 38 launch B and later clicks logged 'offline via monitor' (19:31:44, 19:32:09, 19:32:10) while recovery to online only came at 19:32:26. connectivityNow.test.ts:62-68 encodes the behaviour and no test covers check-online."
    artifacts:
      - path: "src/backend/connectivityNow.ts"
        issue: "line 80: !d.isOnline() maps check-online to offline/monitor; header contract says unknown must not refuse"
      - path: "src/backend/online_monitor.ts"
        issue: "exports only isOnline() (boolean); no accessor for the three-state status"
      - path: "src/backend/__tests__/connectivityNow.test.ts"
        issue: "test at :62-68 asserts isOnline:false => offline; no check-online case"
    missing:
      - "Export a status accessor from online_monitor.ts (e.g. getConnectivityStatus) and use it in connectivityNow.ts: short-circuit to offline only for 'offline'; for 'check-online' and 'online' run the interface and DNS checks"
      - "Call onFreshOffline/recheckConnectivity only when status is 'online' (it already no-ops otherwise)"
      - "Tests: check-online + routable interface + resolving lookup => offline:false (dns-ok); check-online + no interface => offline:true; keep the existing offline case"
      - "WR-03 hardening in the same edit: assign result before calling onFreshOffline, and call it in its own try/catch so a throwing hook cannot turn a definite offline into 'error'/online"
  - truth: "G26 (UAT 38): a second Play of the same appId during bridge launch pre-flight cannot run a concurrent engine switch in the same bottle"
    status: failed
    reason: "launchBridgeGame() (games.ts ~:4835) has no per-appId in-flight guard. Round 4 widens the pre-flight window (awaits checkConnectivityNow up to the 1500 ms DNS cap at :4851, then isCrossoverMissing, then a demo-status probe that was 12 s in UAT 38). In UAT 38 launch B switched the bottle while launch A's probe was still running; DXVK removal failed (reg delete d3d10core/d3d11, wineboot -u code 1), leaving the marker dxvk:'failed' and the bottle half-switched. Recovered only by the next online launch. Severity major (bottle corruption risk), though recovery worked. Whether B was a double click is unconfirmed; the code allows it either way."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "no in-flight guard around launchBridgeGame/launchBridgeGameBody before engine selection"
    missing:
      - "Per-appId in-flight guard at the top of launchBridgeGame (reject or coalesce a second launch while one is in pre-flight/engine switch; release in finally), with a test that two concurrent launches run one body"
      - "Decide whether the second click shows an 'already launching' notice or is silently ignored"
  - truth: "G27 (UAT 38) minor: with CrossOver healthy and the DXVK copy present, an offline launch restores and starts promptly"
    status: partial
    reason: "The restore and launch work (UAT 34 run 2; UAT 38 after recovery) but the offline demo-status probe took 12454 ms in UAT 38, so latency on this path is unchanged from the original G22. The CM-logon part of the delay is gone. Not a roadmap-clause failure; the roadmap requires a timeout, which holds (D-10)."
    artifacts:
      - path: "src/backend/storeManagers/steam/engine/engineDecision.ts"
        issue: "demo-status probe not shortened or skipped when fresh connectivity says offline"
    missing:
      - "Decide: accept the latency (override) or bound/skip the probe when offline and the marker is non-crossover with a present DXVK copy"
  - truth: "G28 (UAT 38) minor: every engine refusal or failure notice is shown to the operator"
    status: partial
    reason: "After the confirmed engine-restore-failed dialog at 19:31:45, three later notices (19:31:48 restore-failed, 19:32:09 and 19:32:10 download-failed) logged display=unconfirmed and the operator saw nothing. Cause not diagnosed (possible dedupe/ack interaction in the notice dispatch, or window focus); unrelated to round-4 logic but observed during its UAT."
    artifacts: []
    missing:
      - "Diagnose why engine notices after the first dispatch resolve unconfirmed; fix or file as a todo with severity/platform/ready frontmatter"
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
    why_human: "No second Wine-Staging-macOS build exists; decide whether to accept the skip"---

# Phase 59: Steam engine fallback when CrossOver is unavailable - Verification Report (re-verification 4)

**Phase Goal:** A Windows Steam title on the macOS native bridge still launches when CrossOver is missing, its trial has expired for that bottle, or it is broken. CrossOver stays first choice; one pinned Wine-Staging + DXVK build per release, previous kept; demo-status check before every CrossOver launch; timeouts; "N days remaining" notice; override advanced and unsupported; tested versions recorded. Out of scope: DRM mode and bottled Steam, GPTK/-DXMT, full census on the fallback.
**Verified:** 2026-11-03 (HEAD 203e48a4c)
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure round 4 (59-40..59-43, closing G25)

## Basis

Code read at HEAD for every round-4 claim (connectivityNow.ts, online_monitor.ts recheckConnectivity, launchTarget.ts offline option, offlineRefusal.ts, engineDecision.ts isCrossoverMissing, games.ts wiring at :4276-4300 and :4851-4852). Fresh `npx jest` over connectivityNow, onlineMonitor, launchTarget, engine/__tests__ (14 suites, 286 tests pass) and, separately, games.test.ts (633 tests pass; the combined count in one run was 633 for games alone). `git diff --stat -- src` was empty at verification time, so the other session's uncommitted `activate: false` hunk in games.ts was not present in the working tree and the 12 SteamGame.install() failures did not occur; no exclusion or stash was needed (no files were touched). REQUIREMENTS.md does not exist and no phase requirement IDs are mapped; round-4 plans declare `requirements: [G25]` only. Operator-attended Re-UAT 4 items 36-39 in 59-UAT.md (G26-G28 recorded there). App not run by the verifier. No TBD/FIXME/XXX introduced in the reviewed round-4 files.

## Round-4 must-haves

| Plan | Must-have | Status | Evidence |
| --- | --- | --- | --- |
| 59-40 | Diagnosis recorded in SUMMARY (nothing re-probes while 'online'; webview DOM event only) | VERIFIED | 59-40-SUMMARY; UAT 39: no 'from renderer' line in any Wi-Fi-off window |
| 59-40 | Fresh check offline within 50 ms with no routable interface, within DNS cap on lookup failure | VERIFIED | connectivityNow.ts:83-110; live 2-3 ms no-interface (UAT 36/37/38) |
| 59-40 | DNS timeout reported as not offline | VERIFIED | connectivityNow.ts:111-112; unit tests |
| 59-40 | Fresh offline moves monitor to check-online and it self-recovers; non-'online' status left alone | VERIFIED | online_monitor.ts:277-280; UAT 39 recovery 19:26:41, 19:30:02, 19:32:26 |
| 59-40 | Exit contract: cap timer unref'd and cleared; never throws | VERIFIED (with WR-03 caveat) | unref + finally clearTimeout; a throwing onFreshOffline is caught but downgrades the finding to 'error'/online |
| 59-40 | A status that is not offline (unknown) never causes a refusal (module contract) | **FAILED** | CR-01: check-online treated as offline at :80-81 |
| 59-41 | Predicate blocks CrossOver-missing regardless of marker/DXVK copy; present CrossOver keeps 59-38 semantics; online/installed pin/pinned override never blocked; isCrossoverMissing has no probe | VERIFIED | offlineRefusal.ts, engineDecision.ts, unit tests pass; UAT 36 and 37. WR-02 (override crossover with a non-current absent pin and current pin installed is not refused) is a missed refusal only, not a wrong block |
| 59-42 | Offline + stored target: no CM connect/PICS, returns stored path; other callers unchanged | VERIFIED | launchTarget.ts:170-190; games.ts:2665, 5868, 6132 call without opts; UAT 36-38 show no launch-target logon |
| 59-42 | One checkConnectivityNow before resolveBridgeLaunchExe, shared with selectLaunchEngine | VERIFIED | games.ts:4851-4852 |
| 59-42 | Early refusal ahead of decideLaunchEngine with engine-download-failed offline dialog | VERIFIED | games.ts:4276-4300; UAT 36 (9 ms), 37 (58 ms) |
| 59-42 | CrossOver present + DXVK copy still probes, restores and launches (D-07/D-09/D-10) | VERIFIED functionally, latency open | UAT 34 run 2, UAT 39 online path; offline probe 12.4 s = G27 |
| 59-43 | Gate battery, items 36-39 each with verdict, item 39 renderer evidence, no rewrite of 1-35, licence untouched | VERIFIED | 59-UAT.md items 36-39 with results; item 38 recorded as issue, G26-G28 appended |

## Observable truths (roadmap)

All 13 roadmap truths from round 3 hold; none is defeated by round 4. Truth 7 (no-CrossOver install and first-run fallback) is the one CR-01 can degrade in a narrow window (Play while the monitor reads check-online on a machine with no CrossOver and no installed pin shows an offline refusal although online; the install/download path itself is unaffected and a retry after the monitor recovers works). Truth 6 (shared bottle, failed return never launches on CrossOver) held in UAT 38 (the failed switch refused to launch), but G26 shows the bottle can be left half-switched by concurrent launches; recovered by the next online launch.

**Score:** 13/13 roadmap truths; round-4 plan must-haves 15/19 listed above counting CR-01, G26, G27, G28 as the open items.

## Behavioral spot-checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Round-4 unit suites | `npx jest connectivityNow onlineMonitor launchTarget engine/__tests__` | 14/14 suites, 286 tests | PASS |
| games.test.ts | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | 633 tests pass at HEAD with a clean src tree | PASS |
| CR-01 reproduction by reading | `isOnline = () => status === 'online'` (online_monitor.ts:270) used as `!d.isOnline()` => offline | confirmed | FAIL (gap) |

## Anti-patterns

CR-01 (blocker, above). Warnings from 59-REVIEW.md carried as non-blocking: WR-01 (one-host DNS failure counts as definite offline with app-wide banner side effect), WR-02 (predicate misses a certain refusal under a crossover override), WR-03 (throwing onFreshOffline discards the finding). Include WR-03 in the CR-01 fix.

## Gaps summary

Round 4 delivered its core: Wi-Fi-off at Play is detected in milliseconds, the launch-target CM logon is skipped offline, and both certain-block cases (CrossOver missing, restore needs absent pin) refuse in under 100 ms live (UAT 36, 37), with recovery verified (UAT 39). Four items remain: CR-01 (check-online counted as offline; blocker for the no-CrossOver fallback path in specific windows), G26 (no concurrent-launch guard; major, caused a half-switched bottle live), G27 and G28 (minor). Status is gaps_found; close CR-01 and G26 with a small round-5 plan, and either fix or override G27/G28.

Not phase 59: G23 (pending todo), WR-06 (pre-existing), G24 (Amazon embed; still needs its own todo).

## History

Round 3 (2026-11-03, HEAD 5eaf063bf, gaps_found, 13/13 truths, 10/11 plan must-haves): closed H1-H3, G20, G21, WR-01..WR-05; G22 early refusal failed live and became G25.

Round 2 (2026-11-02, HEAD 4706a0307, status human_needed, 13/13): gaps A-G closed with live UAT 20-28; follow-ups G20, G21, G22, G23, WR-01..WR-06 recorded. Round 3 closed G20, G21, WR-01..WR-05 and the H1-H3 human-UAT findings; G22 remains open as G25.

Round 4 (2026-11-03, HEAD 203e48a4c, gaps_found): G25(b)/(c) closed live; G25(a) closed in effect for the Wi-Fi-off case but CR-01 remains; G26-G28 opened from UAT 38.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
