# Phase 30 — Deferred Human UAT

**Claim level:** this phase's honest claim is **wired and unit-proven**, not "hardware-proven" (a
claim this document explicitly does NOT make about Phase 30). Every automated jest suite for the
QR-login and install-slice channels is green (84 suites / 1759 tests, `src/backend`), and both
`npm start` and `npm run tauri:dev` were smoke-verified to start clean (30-04 Task 3). What has
**not** been proven is a real human completing the flow against a live Steam account.

## G-30-01 — Live QR login scan gating the install/uninstall E2E

### Why deferred (D-04)

Sign-off for this phase is automated tests, not a live scan. Verifying the QR login requires a
phone with the Steam mobile app installed and a real Steam account signed in on that phone —
neither is available to the automated test suite, and this is the same class of gate the Phase 21
pattern already established for hardware-dependent proof.

### Why this is ONE item, not two

Every acceptance criterion for the install/uninstall slice (30-02) is reachable only through a
signed-in, populated library — the QR login channel this same tension note first raised in
30-CONTEXT.md (D-04's Known-tension note). Deferring the live QR scan therefore *also* defers the
install slice's own hardware proof. A reader must not conclude the install slice was independently
hardware-proven when the QR login was deferred — the two are one gated proof, not two separable
ones.

### Prerequisite — confirm before starting

`enableSteamNativeInstall` must be `true` in the shared config before this test is meaningful. If
it is `false` (or unset), `SteamGame.install()` silently takes the legacy `steam://install` branch
instead of the native depot-download branch this phase exists to prove (30-RESEARCH.md Open
Question 2) — the tester would appear to complete the flow while never exercising the code this
phase ported.

### Tester steps

1. Confirm `enableSteamNativeInstall` is `true` in the shared config (see Prerequisite above).
2. `npm run tauri:dev` (bundles first — no separate build step exists).
3. Sign in via the QR tab: scan the on-screen QR code with the Steam mobile app on a phone signed
   into a real Steam account.
4. Confirm the library populates with the account's owned Steam titles.
5. Click **Install** on a Steam title.
6. Confirm the native folder picker opens (the new `dialog_open` path backed by
   `tauri-plugin-dialog`).
7. Confirm the depot download starts and the library button state transitions correctly
   (queued -> installing -> done, via the `gameStatusUpdate` push).
8. Click **Uninstall** and confirm the button state transitions back.

### Expected outcome

All eight steps complete without error, using only the channels this phase ported
(`checkSteamInstalled`/`steamStartQR`/`steamPollQR`/`install`/`uninstall`/`updateGame`/
`checkGameUpdates`/`listSteamLibraryTargets`/`gameStatusUpdate`/`dialog_open`).

### Pre-existing conditions (NOT Phase 30 regressions)

Any real depot install exercised by this test runs on top of two still-OPEN Phase 23 gaps.
Hitting either is expected pre-existing behavior, not something this phase's IPC port introduced
or is responsible for fixing:

- **G-23-01** — A `Blocked` depot key aborts the whole install. If the test title has a blocked
  depot key, the install will fail outright; this is a Phase 23 gap, not a Tauri porting bug.
- **G-23-02** — Native install applies no execute bits. A launch after install may require a
  manual `chmod +x` on the installed binary; this is a Phase 23 gap, not a Tauri porting bug.

If either gap is hit during this test, record it as confirmation the pre-existing condition is
still open — do not file it as a new Phase 30 defect.

### Summary

This phase's honest claim is **wired and unit-proven** for every channel it ports. The live QR
scan and the install/uninstall E2E it gates are deferred as this single item (G-30-01), and Phase
23's G-23-01/G-23-02 are named up front so a real depot run's failure is attributed correctly.
