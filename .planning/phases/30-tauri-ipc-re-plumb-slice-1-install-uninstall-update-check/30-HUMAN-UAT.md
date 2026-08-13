# Phase 30 — Human UAT Results

**Claim level:** this phase's honest claim is **wired and unit-proven**, not "hardware-proven" (a
claim this document explicitly does NOT make about Phase 30). Every automated jest suite for the
QR-login and install-slice channels is green (84 suites / 1759 tests, `src/backend`). Both
`npm start` and `npm run tauri:dev` were human-verified to start clean (30-04 Task 3, see below) —
but the QR login flow itself is now a **known defect**, not merely unproven. What follows is the
actual human-observed result, not a still-pending deferral.

## G-30-01 — Steam tile "logon button unresponsive" — CORRECTED 2026-07-23, was a misdiagnosis

**Original status (2026-07-22): FAIL, filed as "Steam QR login logon button unresponsive under
Tauri."** Follow-up debugging (`.planning/debug/resolved/steam-logon-button-tauri.md`) found the
original framing below was a **misread of which control the tester actually clicked** — not a QR
login-flow defect. Corrected description follows; the original bullets are preserved struck
through for the record.

### What was actually happening

The Tauri build reads Steam sign-in state from the same on-disk `steamConfigStore.userData` the
Electron build already populated in this profile (377 owned games) — a real, already-authenticated
session, not stale/corrupted state. The Steam tile therefore correctly rendered its **Logout**-style
control, not the Login control the original report assumed. The tester clicked **Logout**, not a
QR "logon" button — the QR tab was never reached because it is unreachable by design while already
signed in, not because it is broken.

The real defect: `logoutSteam` is a fire-and-forget IPC `send` (`makeListenerCaller`, mirroring
`ipcRenderer.send`), and Phase 30 D-02 explicitly scoped Steam sign-out **out of scope** for this
slice — `steamAuthFlowRegistration.ts` deliberately registers no sidecar listener for it. Under
Tauri, the click reaches `sidecarRpc.ts`'s `dispatchSend`, finds zero registered listeners, and
returns having done nothing — silently and "successfully" (a `send` has no response protocol, so
there is nothing to reject, unlike an unported `invoke` channel, which at least rejects with
`UNPORTED_CHANNEL_MARKER`). `GlobalState.tsx`'s `steamLogout()` then optimistically clears local
React state and calls `window.location.reload()` regardless — masking the no-op by reloading the
page, after which the untouched `steamConfigStore.userData` rehydrates the same signed-in identity
and the tile reverts to "Logout" again. Net effect: click Logout, page silently reloads, nothing
actually changes, presenting as an unresponsive button. `Runner/index.tsx`'s `handleLogout` also
had no `try/catch`, so any future genuine rejection would have latched the button in "Logging
out..." forever.

~~1. Window painted a real UI (not blank) — **PASS, human-observed.**~~ (still accurate, unaffected
by this correction)
~~2. Steam login screen renders its QR tab — **FAIL, human-observed.** Verbatim report: "manage
accounts show, logon button unresponsive." The Manage Accounts UI does render, but the logon
button does not respond to interaction, and the QR tab was never reached/rendered as a result.~~
**Corrected:** the tile was rendering its already-authenticated Logout control, not a Login
control; the tester's "logon button unresponsive" report was Logout, not a QR-flow logon button,
and the QR tab was never expected to be reached in this session.
~~3. No `is not a constructor` error in console — **PASS, human-observed** (the 27-05-class
regression did not reproduce).~~ (still accurate, unaffected)
~~4. `UNPORTED_CHANNEL_MARKER` flip — **PASS, human-observed.** `checkSteamInstalled`/`steamStartQR`/
`listSteamLibraryTargets` no longer warn; a deliberately-unported channel still warns rather than
crashing.~~ (still accurate, unaffected — and now confirmed genuinely irrelevant to this defect,
since the actual bug is in `logoutSteam`'s `send`/listener path, not the three QR `invoke`
channels this condition covers)

**Net result: the QR login channels (`checkSteamInstalled`/`steamStartQR`/`steamPollQR`) were never
implicated.** The actual defect is Steam sign-out silently no-op'ing under Tauri (D-02 scoped this
out deliberately) with no error surfaced to the user. Fix: `GlobalState.tsx`'s `steamLogout()` now
detects `isTauri()` and shows an honest "Sign out unavailable in this build" dialog instead of
pretending logout worked; `Runner/index.tsx`'s `handleLogout` now wraps `logoutAction()` in
try/catch/finally so the button can never latch regardless of cause.

**RESOLVED 2026-07-23 — human re-verification PASSED.** Verbatim: "yes, both get expected
behaviors" — confirming (a) under Tauri, clicking Logout now shows the honest "sign-out isn't
available in this build" dialog, with no page reload and no latch/glitch (tile still correctly
reads Logout), and (b) under Electron (`npm start`), Steam Logout is unaffected and still genuinely
signs out and reloads as before. G-30-01 is closed. See
`.planning/debug/resolved/steam-logon-button-tauri.md` for the full investigation record.

### Reproduction (corrected)

1. `npm run tauri:dev` against a profile already signed in to Steam (e.g. one that previously
   signed in under the Electron build, sharing the same on-disk config store).
2. Reach the Steam login screen — the tile renders its Logout control (this is correct, expected
   behavior for an already-authenticated session, not a bug).
3. Click **Logout**.
4. Before the fix: the page silently reloads and the tile still shows Logout — no visible
   feedback, indistinguishable from "did nothing." After the fix: a dialog explains sign-out isn't
   available in this build yet, and the button never optimistically wipes local state or reloads.

### Original "untested hypothesis" section — RESOLVED, superseded by the above

The original report speculated the unresponsive button "likely depends on some other channel that
is still unported or erroring, not the QR channels this phase ported." This is now confirmed: the
other channel is `logoutSteam`, and the QR channels this phase ported were never reached or
implicated in this session at all — the tester was already authenticated and never needed them.

### Prerequisite for a future retest — confirm before starting

`enableSteamNativeInstall` must be `true` in the shared config before any install-slice retest is
meaningful. If it is `false` (or unset), `SteamGame.install()` silently takes the legacy
`steam://install` branch instead of the native depot-download branch this phase exists to prove
(30-RESEARCH.md Open Question 2).

### The install/uninstall E2E remains unreached this session — corrected reason

Every acceptance criterion for the install/uninstall slice (30-02) is reachable only through a
signed-in, populated library. **Corrected:** this was NOT blocked by a broken QR login flow — the
tester's session was already signed in (377 owned games, carried over from the same on-disk
`steamConfigStore` the Electron build populated) and never needed the QR tab at all. The E2E
simply was not attempted this session because the tester's next action was clicking Logout (see
G-30-01 above), not navigating to the library. A future retest does not need to "fix G-30-01" as a
precondition — it can skip sign-in entirely (the session is already authenticated) and proceed
directly to the library/install steps below. A reader must not conclude the install slice was
independently hardware-proven — it was not reachable this session, but for a much narrower reason
than originally recorded.

**Full tester steps, to be re-run (sign-in may already be satisfied — confirm the tile shows
Logout before skipping step 3):**
1. Confirm `enableSteamNativeInstall` is `true` in the shared config.
2. `npm run tauri:dev`.
3. If the tile shows a Login control, sign in via the QR tab. If it already shows Logout, the
   session is already authenticated — do not click Logout, proceed to step 4.
4. Confirm the library populates with the account's owned Steam titles.
5. Click **Install** on a Steam title.
6. Confirm the native folder picker opens (the `dialog_open` path backed by
   `tauri-plugin-dialog`).
7. Confirm the depot download starts and the library button state transitions correctly
   (queued -> installing -> done, via the `gameStatusUpdate` push).
8. Click **Uninstall** and confirm the button state transitions back.

### Pre-existing conditions (NOT Phase 30 regressions)

Any real depot install exercised by a future retest runs on top of two still-OPEN Phase 23 gaps.
Hitting either is expected pre-existing behavior, not something this phase's IPC port introduced
or is responsible for fixing:

- **G-23-01** — A `Blocked` depot key aborts the whole install. If the test title has a blocked
  depot key, the install will fail outright; this is a Phase 23 gap, not a Tauri porting bug.
- **G-23-02** — Native install applies no execute bits. A launch after install may require a
  manual `chmod +x` on the installed binary; this is a Phase 23 gap, not a Tauri porting bug.

If either gap is hit during a future retest, record it as confirmation the pre-existing condition
is still open — do not file it as a new Phase 30 defect.

---

## Retest cycle — post 30-05 / 30-06 gap closure (2026-07-23)

**Source:** `30-VERIFICATION.md` (status: human_needed). The two gap-closure plans landed
(30-05 install-badge spinner fix, 30-06 settings-unreachable fix) and closed their root causes at
the code level (jest + `tsc` + `cargo check` all green, 2019/2019 `src/` tests). None of the
headline user-facing claims below have been witnessed on a live Tauri build *since* these fixes,
so they are held `pending`. Run against `npm run tauri:dev` with `enableSteamNativeInstall: true`.

### 1. Live Tauri install retest (Gap 1 / 30-05 fix)
expected: Clicking Install on a Steam title that can't proceed headless (or genuinely fails) clears the "installing" badge back to Install; a visible ERROR dialog appears for a genuine failure, and no dialog (badge still clears) for the client-not-ready case.
result: issue
reported: "no, spinner remains spinning once clicked"
severity: major
note: 30-05 fix did NOT resolve the spinner hang on a live Tauri build — badge never leaves 'installing'. Same user-visible symptom as original UAT Test 4.

### 2. Live Tauri Settings retest (Gap 2 / 30-06 fix)
expected: The Settings screen renders real config under `npm run tauri:dev` instead of a permanent UpdateComponent spinner, for both a fresh load and a load that fails/rejects.
result: pass

### 3. Native folder-picker dialog (dialog_open / tauri-plugin-dialog)
expected: A real openDialog call site (CustomWineProton binary picker, SideloadDialog, PathSelectionBox) opens an actual native macOS picker, honors openFile vs openDirectory (WR-01), and returns the picked path in Electron's exact `{canceled, filePaths}` shape.
result: pass
note: Folder-picker mode exercised live and behaved as expected. File-mode (openFile) path not separately exercised this session, but folder path confirms dialog_open wiring + path return shape.

### 4. Full Install → Uninstall E2E on real Steam depot content
expected: With a signed-in populated library, Install starts a real depot download, the button transitions queued → installing → done via gameStatusUpdate, and Uninstall reverts the button to Install.
result: partial
reason: |
  ORIGINAL (2026-07-23): "blocked by the install hang, same as test 1 — install never leaves
  'installing', so download start / done transition / uninstall cannot be reached."

  SUPERSEDED. G-30-02 was closed on live hardware by Phase 33 plan 33-05 (gate D-13, outcome PASS,
  human-verified 2026-07-24). The INSTALL half of this test is proven: badge reaches a terminal
  state, download starts and completes (appId 257350; log line quoted in 33-05-SUMMARY.md).
  The UNINSTALL half remains unobserved — no Phase 33 artifact exercises uninstall.
canonical_record: "30-UAT.md test 6 (Uninstall Reverts Button State) — this entry is a duplicate restatement, not an independent item"

### 5. Both-builds smoke re-confirmation after 30-05/30-06
expected: `npm start` and `npm run tauri:dev` both still launch clean with no new console errors after the two gap-closure fixes (re-runs the 30-04 Task 3 checkpoint against current HEAD).
result: pass
note: Both Electron (`npm start`) and Tauri (`npm run tauri:dev`) boot clean on current HEAD — additive/reversible invariant holds after 30-05/30-06.

### 6. CR-03/CR-04 long-running-channel timeout removal
expected: A Steam depot install running >60s under Tauri does not hit `sidecar invoke timed out`; a folder picker left open >60s still honors the eventual selection.
result: pass
note: No 60s `sidecar invoke timed out` observed; folder picker left open >60s still accepted the late selection. CR-03/CR-04 timeout removal confirmed live.

### 7. Electron Steam sync recovery (Test 9 disambiguation)
expected: Under `npm start`, after re-signing in to Steam (refreshing the OSCrypt token), Steam library sync succeeds again — confirming the Test 9 failure was the diagnosed token-divergence issue, not a Phase 30 regression.
result: pass
note: After re-sign-in under Electron, Steam library sync recovered and listed owned titles. Confirms original UAT Test 9 was environmental token-divergence, NOT a Phase 30 regression — closed as not-a-defect.

## Retest Summary

total: 7
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 1

**Result (2026-07-23 live retest):** Gap 2 (Settings, 30-06) CLOSED live. dialog_open picker, both-builds smoke, CR-03/CR-04 timeout removal, and Electron sync recovery all PASS live. **Gap 1 (install spinner, 30-05) did NOT hold — the "installing" badge still hangs forever on a live Tauri build (Test 1), which also blocks the Install→Uninstall E2E (Test 4).** New gap G-30-02 opened for re-diagnosis; the 30-05 code fix cleared the returned-`{status:'error'}` case in jest but the live build still hangs, so the real live trigger is a path 30-05 did not cover.

## Gaps (retest cycle)

<!-- YAML for plan-phase --gaps consumption -->
- truth: "Clicking Install on a Steam title under Tauri always reaches a terminal state — the 'installing' badge clears (client-not-ready) or an ERROR dialog appears (genuine failure); it never hangs forever."
  status: resolved
  resolved_by: "Phase 33 — 33-01 (badge-clear + watchdog) + 33-02 (ensureConnected canary + relog CM revalidation), proven live by 33-05's D-13 gate, human-verified 2026-07-24"
  resolved_evidence: "33-05-SUMMARY.md — gate D-13 PASS on live hardware; appId 257350 install reaches terminal state and completes; '[DownloadManager]: Baldur's Gate II: Enhanced Edition was added to the download queue.' 33-05-SUMMARY.md:87 states G-30-02 resolved and hardware-proven."
  historical_reason: "User reported (live retest Test 1): no, spinner remains spinning once clicked. Also blocked Install→Uninstall E2E (Test 4)."
  severity: major
  test: 1
  gap_id: G-30-02
  root_cause: "Outcome (b) — a never-settling await inside SteamGame.install(). The native pre-download phase makes bare, un-timed steam-user getProductInfo() PICS calls (first fetchInstalldir via resolveSteamInstallTarget, then fetchAppInfo/getOwnedSets/fetchDlcInfos in buildDepotPlan). steam-user's getProductInfo neither times out nor rejects when the CM socket is present-but-unresponsive; it queues the job and the Promise never settles. Under Tauri the client is rehydrated from the persisted store (377-game library) and ensureConnected's fast-path returns true on any truthy client.steamID without revalidating the socket, so a click-time getProductInfo can park forever. install() therefore never returns AND never throws → the sidecar handler's await never settles → neither its finally (30-05's hadError) nor its catch runs → no terminal 'done' is ever pushed → spinner stuck on 'installing'."
  why_30_05_missed_it: "30-05 only added terminal handling for the two ways install() can SETTLE — a returned {status:'error'} (finally hadError) and a thrown error (catch). A never-settling await is a third outcome where install() doesn't settle at all, so neither guard can fire. 30-05's jest tests stay green because they mock the depot/steam-user layer and resolve install() instantly."
  artifacts:
    - path: "src/backend/storeManagers/steam/installLocation.ts"
      issue: "lines 147-179, 220-243 — fetchInstalldir's `await client.getProductInfo(...)` is the FIRST un-timed PICS await on the path; its try/catch is powerless against a never-settling promise"
    - path: "src/backend/storeManagers/steam/depot.ts"
      issue: "lines 412/430/447 (getOwnedSets/fetchAppInfo/fetchDlcInfos via withPlanBuildRetry) — additional un-timed PICS awaits; withPlanBuildRetry only retries on throw, never on a hung await"
    - path: "src/backend/storeManagers/steam/games.ts"
      issue: "lines 1157-1265 — runNativeDepotDownload has no overall deadline; parks before any return, so its finally cleanup and status never run"
    - path: "src/backend/sidecar/installFlowRegistration.ts"
      issue: "lines 168-234 — handler awaits install(); terminal 'done' fires only after that await settles; 30-05's hadError/catch cannot fire for a non-settling await"
    - path: "src/backend/storeManagers/steam/user.ts"
      issue: "lines 70-143 — ensureConnected fast-path returns true on truthy client.steamID without socket revalidation — the enabling condition for a stale-connection getProductInfo hang"
  missing:
    - "Bound the pre-download steam-user PICS/manifest awaits (getProductInfo, getContentServers) — or runNativeDepotDownload / installDepotDownload as a whole — in a Promise.race timeout that REJECTS (mirroring ensureConnected's own 15s/20s bounds), converting a never-answered CM job into a RETURNED {status:'error'} or throw that 30-05's existing finally/catch already clears"
    - "Belt-and-suspenders: add a watchdog/timeout around the handler's `await install()` in installFlowRegistration.ts that pushes a terminal 'done' + ERROR dialog if install() hasn't settled within a bound — guarantees the badge can never hang regardless of any future un-timed downstream await"
    - "Harden ensureConnected to revalidate a live socket before the fast-path returns, so a stale sidecar connection triggers a real reconnect instead of a silent hang"
  debug_session: .planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md

- truth: "Install→Uninstall E2E completes (queued→installing→done, then Uninstall reverts to Install)."
  status: partial
  reason: |
    Install half PROVEN on hardware by Phase 33's D-13 gate (33-05, 2026-07-24): download starts,
    progresses, completes. Uninstall half still unobserved — uninstall is exercised by no Phase 33
    artifact. The original blocker (G-30-02) is resolved, so this is testable, not blocked.
  historical_reason: "Blocked by G-30-02 — install never leaves 'installing', so the E2E cannot be reached. Not separately diagnosed; will re-run once G-30-02 is fixed."
  severity: major
  test: 4
  canonical_record: "30-UAT.md test 6"

---

## Retest cycle — post 30-07 gap closure (G-30-02) (2026-07-23)

**Source:** `30-VERIFICATION.md` (status: human_needed, 22/26 must-haves). Gap-closure plan 30-07
landed and closes G-30-02 **at the code level**: a new `withTimeout.ts` Promise.race wrapper (25s
bound) now wraps all 7 pre-download Steam CM call sites across `depot.ts`, `installLocation.ts`, and
`games.ts`, converting a never-settling `getProductInfo`/`getDepotDecryptionKey`/`getRawManifest`/
`getContentServers`/`resolveSteamInstallTarget` await into a REJECT that flows through 30-05's
existing `hadError`/`finally`/`catch` machinery to a terminal `done`. The streaming download phase is
confirmed NOT wrapped (CR-03/CR-04 long-install invariant preserved). Full regression: 114 suites /
2028 tests pass, `tsc --noEmit` clean. **Because G-30-02 is a live-only defect (a never-settling
promise against a real stale CM socket — a class jest mocks cannot reproduce), the fix is
mechanism-proven but NOT yet live-proven.** Run against `npm run tauri:dev` with
`enableSteamNativeInstall: true`.

### 1. Live Tauri install retest (G-30-02 / 30-07 fix)
expected: Clicking Install on a Steam title whose CM socket is present-but-unresponsive reaches a terminal state within the bound — the "installing" badge clears and an ERROR dialog surfaces — instead of spinning on "installing" forever. A healthy, fast-resolving install is unaffected.
result: issue
reported: "4. fails" — live Tauri retest 2026-07-23, install spinner STILL hangs forever after the 30-07 timeout fix + WR-01/02/03 bound tuning.
severity: major
gap_id: G-30-02
disposition: PARKED to Phase 33 (user directive 2026-07-23) — PARK HONORED, RESOLVED 2026-07-24
resolved_by: "Phase 33 plans 33-01 (badge-clear + failure dialog + watchdog) and 33-02 (ensureConnected canary + relog CM revalidation), proven live by 33-05's D-13 gate"
resolution: |
  RESOLVED 2026-07-24. Phase 33's D-13 gate (33-05, outcome PASS, human-verified on live hardware
  under `npm run tauri:dev` with the sidecar rebuilt from the current tree) proved the hang is
  gone: clicking Install on Baldur's Gate II: Enhanced Edition (appId 257350) reaches a terminal
  state and the install starts and completes —
    (11:37:52) [DownloadManager]: Baldur's Gate II: Enhanced Edition was added to the download queue.
  33-05-SUMMARY.md:87: "G-30-02 (parked since Phase 30) is resolved and hardware-proven."

  What actually fixed it was NOT more pre-download timeout wrapping (30-07's approach, which
  failed live twice). It was 33-01's handler-level badge-clear/watchdog plus 33-02's
  ensureConnected socket revalidation — i.e. the "belt-and-suspenders" branch this file's own
  `missing:` list had named third.

  Three separate blockers surfaced DURING that gate and were fixed there — a missing
  `notification:allow-is-permission-granted` capability, `initOnlineMonitor()` never being wired
  into the headless sidecar (so `isOnline()` was false forever and installs bailed with "App
  offline"), and an unguarded `navigator.windowControlsOverlay` read. None were G-30-02 itself.
note: 30-07 implemented the diagnosed remedy (bound every pre-download CM await + resolveSteamInstallTarget) and is unit-proven (1004 tests), but the live badge still never cleared. The real live trigger was on a path the pre-download withTimeout wrapping does not reach — see `.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md`, now marked resolved.

### 2. Full Install → Uninstall E2E on real Steam depot content (Test 4)
expected: With a signed-in populated library, Install starts a real depot download, the button transitions queued → installing → done via gameStatusUpdate, and Uninstall reverts the button to Install.
result: partial
disposition: PARKED to Phase 33 — PARK HONORED; install half proven, uninstall half still open
reason: |
  ORIGINAL (2026-07-23): "Blocked by the install hang (item 1); cannot be reached until G-30-02 is
  fixed. Phase's headline claim has never been observed succeeding end-to-end on hardware. Parked
  with G-30-02."

  SUPERSEDED 2026-07-24. G-30-02 was fixed and hardware-proven by Phase 33's D-13 gate (33-05).
  The install half of the headline claim HAS now been observed on hardware — download starts,
  progresses, completes. The uninstall half has not: no Phase 33 artifact exercises uninstall.
canonical_record: "30-UAT.md test 6 — this and cycle-1 test 4 are duplicate restatements of the same open question"

### Retest Summary (post 30-07)

total: 2
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 1

**Result (2026-07-23 post-30-07 live retest):** G-30-02 REOPENED again — the install spinner still
hangs forever on a live Tauri build despite the 30-07 pre-download timeout fix and its WR-01/02/03
tuning. Per user directive, **G-30-02 (and the Test 4 E2E it blocks) is PARKED to Phase 33.** Phase
30 remains NOT hardware-proven for the Steam install slice under Tauri; its honest claim stays
"wired and unit-proven," not "install works live." All other Phase 30 items (QR channels, Settings,
dialog picker, both-builds smoke, CR-03/04, Electron sync) passed their live retests earlier.

**Advisory follow-ups from 30-07 code review — RESOLVED 2026-07-23 (commits `8894e10e`, `aa5aba43`,
`all_fixed`, see `30-REVIEW-FIX.md`):** WR-01/WR-02/WR-03 were applied as one coherent bound-design
change — `withTimeout` now stamps timeout errors `{isTimeout:true}` so `withPlanBuildRetry` fails
FAST (single bound, not ~3×); bulk/many-appid PICS fetches (`getOwnedSets`/`fetchDlcInfos`) get a
dedicated `STEAM_PICS_BULK_TIMEOUT_MS = 90000` for the #144 legitimately-slow case while single-app
paths keep 25s; and the outer `resolveSteamInstallTarget` bound is now `STEAM_PICS_TIMEOUT_MS * 2`
(50s), strictly larger than the inner `fetchInstalldir` bound so the inner no-hard-fail fallback
always wins its own race. 37 suites / 1004 tests pass, `tsc --noEmit` clean.
**Live-retest note:** the new bound values (50s outer, 90s bulk) are tuning judgments — during the
live retest, sanity-check them against a genuinely large owned library (377 games in this profile)
to confirm no false-trip on a healthy-but-slow PICS fetch. IN-01 (leftover `[Timing]` diagnostics +
per-install `JSON.stringify(servers)` dump) was left in place — Info-level, out of scope for this
fix pass.

### Summary

This phase's honest claim is **wired and unit-proven** for every channel it ports, and the
additive/reversible invariant (no regression to either build) is human-verified. The Steam **QR
login flow itself was never actually exercised or found broken this session** — the tester was
already authenticated (session carried over from the Electron build's on-disk store) and the tile
correctly rendered its Logout control. **G-30-01, corrected 2026-07-23, RESOLVED 2026-07-23:** the
real defect was `logoutSteam` silently no-op'ing under Tauri (deliberately unported per D-02) with
no error surfaced to the user, not a QR-flow regression — see the corrected G-30-01 entry above and
`.planning/debug/resolved/steam-logon-button-tauri.md`. The fix (`GlobalState.tsx`,
`Runner/index.tsx`) is applied and human-verified live (both the Tauri honest-dialog path and the
unaffected Electron path confirmed working as expected). The install/uninstall E2E remains
unreached this session, but for the narrower reason that the tester clicked Logout rather than
proceeding to the library — not because sign-in was broken. Phase 23's G-23-01/G-23-02 remain named
for whenever a retest reaches a real depot run.
