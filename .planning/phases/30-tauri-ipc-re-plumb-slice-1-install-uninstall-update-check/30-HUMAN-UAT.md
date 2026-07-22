# Phase 30 — Human UAT Results

**Claim level:** this phase's honest claim is **wired and unit-proven**, not "hardware-proven" (a
claim this document explicitly does NOT make about Phase 30). Every automated jest suite for the
QR-login and install-slice channels is green (84 suites / 1759 tests, `src/backend`). Both
`npm start` and `npm run tauri:dev` were human-verified to start clean (30-04 Task 3, see below) —
but the QR login flow itself is now a **known defect**, not merely unproven. What follows is the
actual human-observed result, not a still-pending deferral.

## G-30-01 — Steam QR login logon button unresponsive under Tauri (KNOWN DEFECT)

**Status: FAIL, human-observed 2026-07-22 (30-04 Task 3 checkpoint).** This is a confirmed defect
with a reproduction, not a deferred/unproven item.

### What was observed

The coordinator asked the human tester explicitly which of the four Task 3 conditions they
actually observed, so the following is recorded exactly as reported, split by condition:

1. Window painted a real UI (not blank) — **PASS, human-observed.**
2. Steam login screen renders its QR tab — **FAIL, human-observed.** Verbatim report: *"manage
   accounts show, logon button unresponsive."* The Manage Accounts UI does render, but the logon
   button does not respond to interaction, and the QR tab was never reached/rendered as a result.
3. No `is not a constructor` error in console — **PASS, human-observed** (the 27-05-class
   regression did not reproduce).
4. `UNPORTED_CHANNEL_MARKER` flip — **PASS, human-observed.** `checkSteamInstalled`/`steamStartQR`/
   `listSteamLibraryTargets` no longer warn; a deliberately-unported channel still warns rather
   than crashing.

**Net result: 3 of 4 conditions PASS. The additive/reversible invariant and the no-regression
claim (conditions 1, 3, 4) hold and are human-verified.** The Steam QR login path may **NOT** be
claimed as working end-to-end under Tauri — registering a channel and it staying silent
(condition 4) is not the same as the UI flow that depends on it actually working. Registration
!= working flow.

### Reproduction

1. `npm run tauri:dev` (bundles first — no separate build step exists).
2. Reach the Steam login screen.
3. Observe: Manage Accounts renders. Click the logon button.
4. Observe: the button does not respond; the QR tab is never reached.

### Untested hypothesis for the follow-up debugger (NOT a finding — do not act on this without
### separate investigation)

Because the three ported Steam auth channels (`checkSteamInstalled`/`steamStartQR`/`steamPollQR`)
are confirmed silent — no `UNPORTED_CHANNEL_MARKER` warning fires for any of them (condition 4
above) — the unresponsive logon button likely depends on some **other** channel that is still
unported or erroring, not the QR channels this phase ported. This is a hypothesis for whoever
picks up the debug work next, not a conclusion reached by this plan. This plan does not
investigate further — fixing the button is out of this plan's scope.

### Prerequisite for a future retest — confirm before starting

`enableSteamNativeInstall` must be `true` in the shared config before any install-slice retest is
meaningful. If it is `false` (or unset), `SteamGame.install()` silently takes the legacy
`steam://install` branch instead of the native depot-download branch this phase exists to prove
(30-RESEARCH.md Open Question 2).

### The install/uninstall E2E remains gated on this defect, not independently proven

Every acceptance criterion for the install/uninstall slice (30-02) is reachable only through a
signed-in, populated library. Because the QR login button is broken, **the install/uninstall E2E
was not reached and remains unproven** — this is not a second, separate open item; it is the same
gate D-04's tension note originally named, now resolved from "deferred" to "blocked by a known
defect." A reader must not conclude the install slice was independently hardware-proven — it was
not reachable this session.

**Full tester steps, to be re-run once G-30-01 is fixed:**
1. Confirm `enableSteamNativeInstall` is `true` in the shared config.
2. `npm run tauri:dev`.
3. Sign in via the QR tab (blocked today by G-30-01).
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

### Summary

This phase's honest claim is **wired and unit-proven** for every channel it ports, and the
additive/reversible invariant (no regression to either build) is human-verified. The Steam QR
login flow is **known-broken** at the UI interaction layer under Tauri (**G-30-01**, logon button
unresponsive) — a status strictly worse than "unproven," and the install/uninstall E2E it gates
remains unreached as a direct consequence. Phase 23's G-23-01/G-23-02 remain named for whenever a
retest reaches a real depot run.
