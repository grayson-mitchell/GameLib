---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
verified: 2026-07-23T02:50:00Z
status: human_needed
score: 22/26 must-haves verified (2 require a live-Tauri human retest of the 30-07 gap-closure fix)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "17/24 (2026-07-23T13:00:00Z automated verification)"
  intervening_evidence: "A live human retest (recorded in 30-HUMAN-UAT.md 'Retest cycle') ran 7 checks against npm run tauri:dev after this VERIFICATION.md's previous pass: 5 PASSED live (Settings render, native folder picker, both-builds smoke, CR-03/04 timeout removal, Electron sync recovery), 1 FAILED live (install-spinner hang, filed as new gap G-30-02), 1 BLOCKED (Install->Uninstall E2E, same root cause as G-30-02). Gap-closure plan 30-07 (this session) was executed to fix G-30-02 by bounding every pre-download steam-user CM call in a 25s withTimeout wrapper."
  gaps_closed:
    - "Settings screen renders under Tauri (live-confirmed, was human_needed)"
    - "Native folder picker opens and returns correct path shape (live-confirmed, was human_needed)"
    - "Both npm start and npm run tauri:dev still work after all fixes (live-confirmed, was human_needed)"
    - "CR-03/CR-04 long-running-channel timeout removal holds under real load (live-confirmed, was human_needed)"
    - "Electron Steam sync recovers after re-sign-in (live-confirmed, was human_needed)"
  gaps_remaining:
    - "SUPERSEDED 2026-07-24 — see gaps_closed_later. Both bullets below described G-30-02 and the E2E it blocked; Phase 33's D-13 gate closed G-30-02 on hardware and proved the install half of the E2E. Retained for history, not current state."
    - "(historical) Install badge clears instead of spinning forever (G-30-02) — 30-07's fix is code/jest/tsc-proven only; the debug session is still status:diagnosed, never re-marked resolved after a live retest"
    - "(historical) Full Install -> Uninstall E2E — blocked by the same unresolved-live item; 30-HUMAN-UAT.md's Gaps section still lists both as open (status: failed / blocked)"
  gaps_closed_later:
    - gap: "G-30-02 — install badge hangs forever under Tauri"
      closed_by: "Phase 33 plans 33-01 (handler badge-clear + failure dialog + watchdog) and 33-02 (ensureConnected canary + relog CM revalidation)"
      proven_by: "33-05 D-13 live gate — outcome PASS, human-verified on real hardware 2026-07-24 under `npm run tauri:dev`, sidecar rebuilt from tree"
      evidence: "appId 257350 (Baldur's Gate II: EE): badge reaches terminal state, install starts and completes. '(11:37:52) [DownloadManager]: Baldur's Gate II: Enhanced Edition was added to the download queue.' 33-05-SUMMARY.md:87 — 'G-30-02 (parked since Phase 30) is resolved and hardware-proven.'"
      note: "30-07's pre-download timeout wrapping was NOT what fixed it — that approach failed live twice. The handler-level watchdog + socket revalidation did."
    - gap: "Install half of the Install -> Uninstall E2E"
      closed_by: "same 33-05 D-13 gate — download starts, progresses, completes"
  regressions: []
gaps: []
human_verification:
  # Reduced 2026-08-13 from 2 entries to 1. The former entry 1 (live retest of the G-30-02 fix) is
  # CLOSED — see gaps_closed_later above. The former entry 2 asked for the whole E2E; its install
  # half is now hardware-proven, so only the uninstall clause survives, and it is merged with the
  # update-check item that was blocked behind the same install flow.
  - test: "Uninstall reverts button state (30-UAT test 6)"
    expected: "With a game installed via the now-working install flow, clicking Uninstall on a Steam title removes it and the library button transitions back to Install."
    why_human: "Recorded as blocked behind the G-30-02 install hang, which Phase 33's D-13 gate closed 2026-07-24 — so it is now reachable and no longer blocked. Never exercised: uninstall appears in NO Phase 33 artifact; the D-13 gate ran install only. This is the surviving clause of the phase's headline Install -> Uninstall E2E claim, whose install half is now hardware-proven."
  - test: "Update check reports real results — WR-04 / WR-05 (30-UAT test 7)"
    expected: "The update check runs across runners without one failing runner killing the whole check (WR-05), and triggering an update on a game reports the actual outcome — a failed update surfaces as a failure, not a false 'success' (WR-04)."
    why_human: "Originally skipped for 'no installed game available' — a premise voided by the D-13 gate, since installs now work. Never exercised live. NOTE: the WR-04/WR-05 identifiers appearing in Phase 34 artifacts are DIFFERENT findings (packaging CSP / withGlobalTauri) and are not evidence for this item."
---

# Phase 30: Tauri IPC re-plumb slice 1 (install/uninstall/update-check) Verification Report

**Phase Goal:** Port the first user-facing domain slice of the ~217 unported IPC endpoints onto
the sidecar, following SEAM.md's incremental-port checklist: a curated
`<domain>FlowRegistration.ts` importing only the real backend code the flow needs, real behavior
in `electronStub.ts` bound to real Tauri commands for any newly-required Electron API, and the
slice proven E2E in the Tauri build. Slice = install/uninstall/update-check.

**Verified:** 2026-07-23T02:50:00Z
**Status:** human_needed
**Re-verification:** Yes — this VERIFICATION.md supersedes the earlier automated pass (2026-07-23T13:00:00Z,
score 17/24, also human_needed). Between the two, a live human retest against `npm run tauri:dev`
closed 5 of that pass's 7 human-verification items and reopened one as a new live-observed defect,
G-30-02 (recorded in `30-HUMAN-UAT.md`'s "Retest cycle" section, not a prior `30-VERIFICATION.md`
`gaps:` block, which is why this run re-derived must-haves rather than following the strict
re-verification-mode shortcut). This session's only code change is gap-closure plan 30-07, which
closes G-30-02 at the code level.

## Goal Achievement

### Observable Truths

Must-haves are the union of the original 6 plans' frontmatter (30-01..30-06) plus 30-07's
gap-closure frontmatter. Statuses below reflect BOTH the original automated evidence AND the
intervening live-retest evidence in `30-HUMAN-UAT.md`.

| # | Truth (source plan) | Status | Evidence |
|---|---|---|---|
| 1 | Sidecar answers `checkSteamInstalled`/`steamStartQR`/`steamPollQR` with real `SteamUser` impls (30-01) | VERIFIED | `steamAuthFlowRegistration.ts` registers all three; `steamAuthFlows.test.ts` green |
| 2 | Successful QR poll writes refresh token via keyring, only `isLoggedIn`/`userData` onto configStore (30-01) | VERIFIED | `steamAuthFlows.test.ts` assertions |
| 3 | No `refreshToken` ever appears in a served store snapshot (30-01) | VERIFIED | Regression test + `tauriTransport.test.ts` |
| 4 | Channels not ported this plan still reject non-fatally with the marker (30-01) | VERIFIED | Invariant B test in `steamAuthFlows.test.ts` |
| 5 | Tauri Install button reaches the sidecar E2E: `listSteamLibraryTargets` resolves, then `install` fires `SteamGame.install()` (30-02) | **HUMAN_NEEDED** | Wiring is jest-proven; live E2E still `blocked` per `30-HUMAN-UAT.md` retest-cycle Test 4 — the install button never leaves 'installing' state to complete this path live |
| 6 | `install` exercises only the native depot-download branch; bottle/bridge stay unported/non-fatal (30-02) | VERIFIED | Code read confirms branch dispatch and import scope unchanged |
| 7 | `uninstall` runs the unmodified runner-generic `uninstallGameCallback` (30-02) | VERIFIED | `installFlowRegistration.ts` direct passthrough, jest-proven |
| 8 | `checkGameUpdates` runs the same runner-generic logic Electron runs, from one shared source (30-02) | VERIFIED | `checkGameUpdates.ts` shared, `main.ts` delegates |
| 9 | `install`/`uninstall`/`updateGame` emit `gameStatusUpdate` transitions to the renderer, observed live (30-02) | **HUMAN_NEEDED** | Emission mechanism jest-proven; live queued→installing→done transition still unobserved — blocked by the same live install hang |
| 10 | A folder picker opens **natively** in the Tauri build (30-03) | **VERIFIED (live)** | `30-HUMAN-UAT.md` retest-cycle Test 3: "Folder-picker mode exercised live and behaved as expected" — result: pass |
| 11 | Picked path returns in Electron's exact `{canceled, filePaths}` shape (30-03) | VERIFIED | `dialogStub.test.ts` + live retest Test 3 confirms shape |
| 12 | `notify()` logs when it skips (30-03) | VERIFIED | `dialog.ts:71-79` `logInfo` branch, code-read confirmed |
| 13 | `rustInvoke` allowlist and Rust's `dispatch_rust_channel` match arm name the same channel string (30-03) | VERIFIED | `'dialog_open'` byte-identical both sides |
| 14 | A reader of SEAM.md can see exactly which channels are ported vs deferred (30-04) | VERIFIED | SEAM.md + `30-PORTED-CHANNELS.md` |
| 15 | D-05a bypass / D-05b reuse decisions recorded with reasons (30-04) | VERIFIED | SEAM.md "Accepted Constraints" |
| 16 | Two-token divergence is an Accepted Constraint (30-04) | VERIFIED | SEAM.md D-03 entry |
| 17 | Deferred UAT item names live QR scan AND install E2E it gates in ONE entry (30-04) | VERIFIED | `30-HUMAN-UAT.md` |
| 18 | Both `npm start` and `npm run tauri:dev` still work after the phase (30-04, REQ-30-09) | **VERIFIED (live)** | `30-HUMAN-UAT.md` retest-cycle Test 5: "Both Electron and Tauri boot clean on current HEAD" — result: pass |
| 19 | Install badge clears instead of spinning forever on a returned/thrown error (30-05, then G-30-02, then 30-07) | **HUMAN_NEEDED** | Live-retest Test 1 previously FAILED this exact truth ("spinner remains spinning once clicked"). Gap-closure plan 30-07 (this session) bounds every pre-download CM call in a 25s `withTimeout`, proven at the jest level (`depot.test.ts`, `games.test.ts`, `installFlows.test.ts` G-30-02 blocks, 293/293 green) and by code review (0 blockers). NOT yet re-tested live — debug session still `status: diagnosed` |
| 20 | A returned `{status:'error'}` emits a terminal `gameStatusUpdate('done')` (30-05) | VERIFIED | `installFlowRegistration.ts`'s `hadError` finally guard unmodified and still jest-proven; 30-07 routes timeout-origin errors through this exact path (`installFlows.test.ts` new assertion) |
| 21 | Genuine depot failure surfaces a visible error; client-setup case has no duplicate dialog (30-05) | **HUMAN_NEEDED** | Logic jest-proven; on-screen dialog appearance for a live timeout-triggered failure still unobserved (same blocker as truth 19) |
| 22 | Settings screen renders under Tauri instead of a permanent loading spinner (30-06) | **VERIFIED (live)** | `30-HUMAN-UAT.md` retest-cycle Test 2: result: pass |
| 23 | `requestAppSettings`/`requestGameSettings` resolve real config on the sidecar, no marker (30-06) | VERIFIED | `settingsFlowRegistration.ts` + `settingsFlows.test.ts`, also live-confirmed via Test 2 |
| 24 | A failed/unported config load degrades gracefully (30-06) | VERIFIED | `shouldWithholdContext` unit tests |
| 25 | Under Tauri, a stale-CM-socket Install reaches a terminal state within a bounded time instead of hanging forever (30-07 must-have) | **HUMAN_NEEDED** | Mechanism proven by unit test + code review; this is the EXACT live symptom from Test 1 and has not been re-observed live since the fix landed |
| 26 | Every known pre-download CM primitive (`getProductInfo` x4 call sites, `getDepotDecryptionKey`, `getRawManifest`, `getContentServers`) is bounded; streaming download phase is never bounded (30-07 must-have) | VERIFIED | Direct code read: 7 `withTimeout(` call sites in `depot.ts` (lines 416,439,461,548,563,2108) + 1 in `installLocation.ts` (165) + 1 in `games.ts` (1201) = every listed primitive; `downloadDepotFiles`/`downloadSteamDepots` streaming call (games.ts:1227, depot.ts:1390) confirmed NOT wrapped |

**Score:** 22/26 truths VERIFIED (including 5 newly closed by the intervening live retest); 4
remain HUMAN_NEEDED (truths 5, 9, 19/25 collapse to the same live-retest blocker, plus truth 21).
No truth was found structurally FAILED at the code level in this session — the code evidence for
30-07 is clean, but the specific defect it targets was previously live-observed and its fix is not
yet live-confirmed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/backend/storeManagers/steam/withTimeout.ts` | Reusable Promise.race timeout wrapper | VERIFIED | Exists, `withTimeout<T>()` + `STEAM_PICS_TIMEOUT_MS=25000`, `finally`-cleared timer, read in full |
| `src/backend/storeManagers/steam/__tests__/withTimeout.test.ts` | Happy-path + timeout + no-dangling-timer coverage | VERIFIED | Exists, part of green 4-suite/293-test run |
| `src/backend/storeManagers/steam/installLocation.ts` | `fetchInstalldir`'s `getProductInfo` bounded | VERIFIED | Line 165, read in full, matches must-have |
| `src/backend/storeManagers/steam/depot.ts` | 6 pre-download CM calls bounded | VERIFIED | Lines 416/439/461/548/563/2108, 3 read in full (`getOwnedSets`/`fetchAppInfo`/`fetchDlcInfos`/`fetchDepotPlanEntry`) |
| `src/backend/storeManagers/steam/games.ts` | `resolveSteamInstallTarget` phase watchdog returns `{status:'error'}` on stall | VERIFIED | Line 1201-1215, read in full, catch converts to `{status:'error'}`, never propagates as unhandled throw |
| `src/backend/sidecar/installFlowRegistration.ts` | 30-05's `hadError`/finally/catch terminal-clear machinery | VERIFIED (unmodified) | Lines 163/195/219/225/232 present exactly as prior verification found them — 30-07 feeds this path, does not duplicate it |
| Prior-plan artifacts (steamAuthFlowRegistration.ts, settingsFlowRegistration.ts, dialogFlowRegistration.ts, checkGameUpdates.ts, SEAM.md, 30-PORTED-CHANNELS.md) | Unchanged from prior pass | VERIFIED (regression) | Re-confirmed present via full `src/backend src/frontend src/preload src/common` jest sweep (114 suites / 2028 tests green, up from 113/2019 — growth = 30-07's new tests) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `depot.ts` (`getOwnedSets`/`fetchAppInfo`/`fetchDlcInfos`) | `withTimeout` | direct wrap of `client.getProductInfo(...)` | WIRED | Read in full, matches must-have pattern |
| `depot.ts` (`fetchDepotPlanEntry`) | `withTimeout` | wraps `getDepotDecryptionKey`/`getRawManifest` callback-Promises | WIRED | Read in full |
| `depot.ts` (`getContentServerHosts`) | `withTimeout` | wraps `getContentServers` | WIRED | Confirmed via grep line 2108, consistent with pattern at other sites |
| `installLocation.ts` (`fetchInstalldir`) | `withTimeout` | wraps `getProductInfo` | WIRED | Read in full |
| `games.ts` (`runNativeDepotDownload`) | `withTimeout` | wraps `resolveSteamInstallTarget`, catch converts to `{status:'error'}` | WIRED | Read in full |
| `games.ts` timeout-origin `{status:'error'}` | `installFlowRegistration.ts`'s existing `finally(hadError)`/`catch` | unmodified 30-05 guard | WIRED | Code-read confirms guard untouched; `installFlows.test.ts` asserts the sequence for the timeout-origin error explicitly |
| `withTimeout`'s outer wrap (games.ts) | `fetchInstalldir`'s inner wrap + no-hard-fail catch (installLocation.ts) | same 25s bound, outer armed first | **WIRED but LAYERING DEFECT (WR-01)** | Confirmed by direct read: outer race always wins because it is armed before the inner timer starts, so a transient stale-socket hang that would have recovered via the inner catch's graceful fallback instead hard-fails the install. Advisory per code review, not a goal blocker (see Anti-Patterns) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| 30-07's new/modified test suites green | `npx jest src/backend/storeManagers/steam/__tests__/withTimeout.test.ts .../depot.test.ts .../games.test.ts src/backend/sidecar/__tests__/installFlows.test.ts` | 4 suites / 293 tests passed | PASS |
| Full backend+frontend+preload+common regression sweep | `npx jest src/backend src/frontend src/preload src/common` | 114 suites / 2028 tests passed (pre-existing unrelated `library.ts` leaked-timer worker-exit warning, documented separately, does not fail any test) | PASS |
| TypeScript project-wide typecheck | `npx tsc --noEmit -p tsconfig.json` | Clean, no errors | PASS |
| Streaming download phase confirmed NOT wrapped | grep `withTimeout` in `games.ts`/`depot.ts` vs. `downloadSteamDepots`/`downloadDepotFiles` call sites | Only pre-download calls wrapped (games.ts:1201, depot.ts:416/439/461/548/563/2108); `downloadSteamDepots` call (games.ts:1227) and `downloadDepotFiles` definition (depot.ts:1390) unwrapped | PASS |
| Commits claimed in SUMMARY exist | `git show --stat 0aeb4205 3d3a5887` | Both commits exist, diffs match claimed scope (withTimeout.ts + 6 call sites + tests) | PASS |
| Debug session re-marked resolved? | `grep status: .planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md` | `status: diagnosed` (unchanged) | **FAIL (expected — confirms live retest still outstanding)** |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` artifacts for this phase; jest + `tsc --noEmit`
substitute per Step 7b/7c.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| REQ-30-01 | 30-01 | QR login channel ported, token round-trips through keyring | SATISFIED | Truths 1-4 |
| REQ-30-02 | 30-01, 30-04 | Two-token divergence recorded | SATISFIED | Truth 16 |
| REQ-30-03 | 30-04 | Claim-discipline: honest deferred UAT entry | SATISFIED | Truth 17; `30-HUMAN-UAT.md` explicitly disclaims hardware-proven status where still true |
| REQ-30-04 | 30-02, 30-05, 30-07 | install/uninstall/updateGame on native depot branch; badge never hangs | PARTIALLY SATISFIED — **NEEDS HUMAN** for live install-hang retest | Truths 5,6,7,8,19,20,21,25,26 — code/jest fully green, live confirmation of the fix still pending |
| REQ-30-05 | 30-02, 30-05, 30-07 | Status-push relay, zero `src-tauri` changes, badge always terminates | PARTIALLY SATISFIED — **NEEDS HUMAN** | Truths 9, 20, 25 |
| REQ-30-06 | 30-01, 30-02 | Curated modules registered, no `electron` import under sidecar | SATISFIED | Truths 1, 6-8 + grep confirms no electron import (regression-checked, unchanged) |
| REQ-30-07 | 30-03 | Real dialog behavior + logged `notify()` no-op | SATISFIED | Truths 10 (now live-verified), 11, 12, 13 |
| REQ-30-08 | 30-02, 30-04, 30-06 | Enumerated minimum-read channel set declared | SATISFIED | Truths 14, 15, 23 |
| REQ-30-09 | 30-04, 30-05, 30-06, 30-07 | Additive/reversible invariant holds, both builds work | SATISFIED (both-builds) / **NEEDS HUMAN** (install-hang fix) | Truth 18 now live-verified for both-builds; the install-badge sub-claim under this requirement (truth 19/25) remains open |

No orphaned requirements: REQ-30-01..09 all declared across the plans' `requirements:` frontmatter
(30-07 declares `[REQ-30-04, REQ-30-05]`), and REQUIREMENTS.md marks all nine `[x]`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/backend/storeManagers/steam/games.ts` / `installLocation.ts` | games.ts:1201-1215 vs installLocation.ts:139-188 | WR-01 (30-REVIEW.md): nested `withTimeout` at an EQUAL 25s bound, outer armed first, overrides `fetchInstalldir`'s explicit no-hard-fail contract — a transient CM hang that would have recovered via the inner catch's graceful `undefined` fallback is instead converted into a hard `{status:'error'}` install failure | WARNING | Confirmed present by direct code read in this verification session; advisory tuning issue per context, not a goal blocker, but is a real behavior change vs. the pre-30-07 code on this narrow edge case |
| `src/backend/storeManagers/steam/withTimeout.ts` (interacting with `depot.ts` retry logic, `user.ts` `ensureConnected`) | withTimeout.ts:14-25 | WR-02: timeout errors carry no `eresult`, are classified retryable, and `ensureConnected`'s fast-path is a no-op against a stale-but-present socket — real worst-case bound is ~3×25s (~75s) per plan-build step, not the documented 25s | WARNING | Confirmed by code read; badge still eventually clears (goal-relevant behavior preserved), only the documented-vs-actual bound diverges |
| `src/backend/storeManagers/steam/withTimeout.ts` applied at `depot.ts:416-420` | withTimeout.ts:14-25 | WR-03: 25s bound may false-trip a healthy-but-slow large-library `getOwnedSets` fetch, contradicting CLAUDE.md's own noted node-steam-user issue #144 | WARNING | Confirmed via code read of `getOwnedSets` (iterates every package license); advisory, no test coverage disproves or proves this in either direction |
| `src/backend/storeManagers/steam/installLocation.ts`, `depot.ts`, `games.ts` | `[Timing]` logInfo calls throughout | IN-01 (30-REVIEW.md): temporary diagnostic instrumentation (including a full content-server directory `JSON.stringify` dump) still present, marked "remove once root cause confirmed" — root cause IS now confirmed/fixed by 30-07 | INFO | Pre-existing, not introduced by 30-07, but now stale per its own removal condition; not a debt-marker-gate violation (no TBD/FIXME/XXX, just a comment convention) |
| `.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md` | `status:` field | Still `diagnosed`, not `resolved` | INFO (tracking signal) | Directly confirms this phase's remaining human-verification gap; not a code anti-pattern |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by plan 30-07. The three WARNINGs
above are exactly the three from `30-REVIEW.md`'s focused re-review of this session's delta (0
blockers) — independently re-confirmed by direct source read in this verification, not merely
carried over from the SUMMARY's narrative.

### Human Verification Required

See YAML frontmatter `human_verification:` for the structured list.

1. **Live Tauri retest of 30-07's G-30-02 fix** — confirm the install badge now clears (or shows
   an ERROR dialog) within the documented bound on a genuinely stale CM socket, matching the exact
   symptom that failed in the prior live retest (`30-HUMAN-UAT.md` Test 1: "spinner remains
   spinning once clicked"). The debug session this fix targets is still `status: diagnosed`.
2. **Full Install -> Uninstall E2E** — the phase's headline user-facing claim, blocked by the same
   root cause and never observed succeeding end-to-end on hardware (`30-HUMAN-UAT.md` Test 4:
   `blocked_by: prior-phase`).

### Gaps Summary

No must-have was found structurally FAILED at the code level in this session. Gap-closure plan
30-07 is a clean, well-scoped fix: `withTimeout.ts` is sound (transparent pass-through on the happy
path, always-cleared timer, no unhandled-rejection escape — independently re-derived from source in
this session, not taken from the SUMMARY), every listed pre-download CM primitive is genuinely
bounded (7 call sites read/grepped and matched against the plan's own enumeration), the streaming
download phase is genuinely left unbounded (confirmed by absence of `withTimeout` around
`downloadSteamDepots`/`downloadDepotFiles`), and the fix feeds 30-05's existing terminal-clear
machinery without duplicating it (installFlowRegistration.ts's `hadError`/`finally`/`catch` block
is byte-identical to the prior verification's read). The full regression sweep (114 suites / 2028
tests, `tsc --noEmit` clean) shows no signs of a regression to either build.

However, this is precisely the kind of fix that a prior automated pass on this phase already got
wrong once: 30-05 was code/jest-proven and looked complete, but a live retest found it did NOT
close the actual live defect (a never-settling await is a failure mode jest's synchronous mocks
cannot reproduce). 30-07 targets that exact gap and is more thorough (it covers 7 CM call sites,
not just the one originally diagnosed), and the code review found 0 blockers — but per this
project's own established discipline (REQ-30-03's "wired and unit-proven, never hardware-proven"),
a fix for a LIVE-ONLY defect cannot be marked `passed` on code evidence alone. The debug session
`.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md` remains `status: diagnosed`
precisely because no post-fix live retest has occurred yet.

Separately, three advisory WARNINGs from `30-REVIEW.md`'s focused review of 30-07 (WR-01 nested-
timeout layering defeating an inner graceful-fallback contract, WR-02 real bound ~3x the documented
25s, WR-03 possible false-trip on large libraries) were independently re-confirmed by direct source
read in this session. Per this verification's task instructions, these are treated as advisory
tuning concerns and do NOT block phase completion — but WR-01 in particular is a genuine, if
narrow, behavior regression (a transient recoverable CM hiccup during install-location lookup that
previously degraded gracefully now hard-fails the install) and should be tracked for a future
tightening pass, not silently forgotten.

**Recommendation:** Run the two remaining human-verification items above against
`npm run tauri:dev` with a genuinely stale/rehydrated CM session. If both pass, flip this
VERIFICATION.md's status to `passed` and mark the debug session `resolved`. If Test 1 still fails
live, the mechanism (bare, unbounded CM awaits) is now well-understood and bounded, but some
additional path may remain uncovered (e.g., WR-02's retry-amplification masking a different failure
mode) — file as a new gap cycle rather than re-diagnosing from scratch.

---

_Verified: 2026-07-23T02:50:00Z_
_Verifier: Claude (gsd-verifier)_
