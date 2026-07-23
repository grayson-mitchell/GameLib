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
result: [pending]

### 2. Live Tauri Settings retest (Gap 2 / 30-06 fix)
expected: The Settings screen renders real config under `npm run tauri:dev` instead of a permanent UpdateComponent spinner, for both a fresh load and a load that fails/rejects.
result: [pending]

### 3. Native folder-picker dialog (dialog_open / tauri-plugin-dialog)
expected: A real openDialog call site (CustomWineProton binary picker, SideloadDialog, PathSelectionBox) opens an actual native macOS picker, honors openFile vs openDirectory (WR-01), and returns the picked path in Electron's exact `{canceled, filePaths}` shape.
result: [pending]

### 4. Full Install → Uninstall E2E on real Steam depot content
expected: With a signed-in populated library, Install starts a real depot download, the button transitions queued → installing → done via gameStatusUpdate, and Uninstall reverts the button to Install.
result: [pending]

### 5. Both-builds smoke re-confirmation after 30-05/30-06
expected: `npm start` and `npm run tauri:dev` both still launch clean with no new console errors after the two gap-closure fixes (re-runs the 30-04 Task 3 checkpoint against current HEAD).
result: [pending]

### 6. CR-03/CR-04 long-running-channel timeout removal
expected: A Steam depot install running >60s under Tauri does not hit `sidecar invoke timed out`; a folder picker left open >60s still honors the eventual selection.
result: [pending]

### 7. Electron Steam sync recovery (Test 9 disambiguation)
expected: Under `npm start`, after re-signing in to Steam (refreshing the OSCrypt token), Steam library sync succeeds again — confirming the Test 9 failure was the diagnosed token-divergence issue, not a Phase 30 regression.
result: [pending]

## Retest Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

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
