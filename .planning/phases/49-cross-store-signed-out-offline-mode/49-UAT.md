---
status: pending
phase: 49
source: [49-08-SUMMARY.md, 49-09-SUMMARY.md, 49-10-SUMMARY.md, 49-LIVE-GATE.md]
started: 2026-10-10T00:00:00Z
updated: 2026-10-10T00:00:00Z
---

## Protocol

These eleven items are the blocking macOS live gate for Phase 49. Item N here is item N of
`49-LIVE-GATE.md` (same numbering); the contract holds the procedure, the induction and restore
steps, the required log literals with their sinks, and the PASS / FAIL / FINDING criteria. Each
heading below names its launch ordinal. Launch order is not item order: see the contract's launch
map. Plan 49-12 runs the contract; this file was authored by plan 49-11 and no item has been run.

Items with a human-judgment component carried in from earlier plans: item 10 discharges 49-09's
"a never-connected row reads as information, not an error, across themes" (midnightMirage,
gruvbox_dark, dracula); items 1, 3 and 5 discharge 49-10's "Reconnect button text on the real Epic,
GOG and Amazon tiles"; item 9 discharges 49-08's warm-profile exit timing.

## Tests

### 1. Epic expired latches, shows one row and a Reconnect tile (launch 2)
expected: With an expired Epic credential, gamelib.log shows `[signInProbe] legendary outcome=expired` and `verdict=latched`, the legendary runner log carries `Stored credentials are no longer valid`, the Library shows one "Your Epic Games sign-in expired" row, and the Epic tile reads "Sign-in expired — Reconnect".
result: pending

Evidence: gamelib-launch-2.log, runner-legendary-launch-2.log, flags.log, item1-row.png, item1-tile.png. Assumptions A1, A5.

### 2. Epic network failure yields unknown and latches nothing (launch 4)
expected: With the Epic OAuth host blocked and valid credentials, gamelib.log shows `[signInProbe] legendary outcome=unknown` and `verdict=unchanged`, the runner log carries `HTTP request for login failed`, no Epic row appears and no expired flag is set.
result: pending

Evidence: gamelib-launch-4.log, runner-legendary-launch-4.log, hosts-check.txt, item2-library.png. Assumption A1 negative.

### 3. GOG expired latches, shows one row and a Reconnect tile (launch 2)
expected: With an invalid GOG refresh token and an old loginTime, the gogdl runner log shows a bare `null` and no `Failed to refresh credentials`, gamelib.log shows `[signInProbe] gog outcome=expired` and `verdict=latched`, the Library shows one GOG expired row, and the GOG tile reads "Sign-in expired — Reconnect".
result: pending

Evidence: gamelib-launch-2.log, runner-gog-launch-2.log, flags.log, item3-row.png, item3-tile.png. Assumption A2, decision D-17.

### 4. GOG network failure yields unknown and latches nothing (launch 4)
expected: With auth.gog.com blocked and an expired access token, the gogdl runner log shows `Failed to refresh credentials`, gamelib.log shows `[signInProbe] gog outcome=unknown` and `verdict=unchanged`, and no GOG row appears.
result: pending

Evidence: gamelib-launch-4.log, runner-gog-launch-4.log, hosts-check.txt. Assumption A2.

### 5. Amazon expired records the exact refresh status and latches only on 400, 401 or 403 (launch 2)
expected: With an expired access token and an invalid refresh token, the nile runner log shows `Failed to refresh the token <Response [NNN]>` and the observed NNN is recorded; for NNN in 400, 401, 403 gamelib.log shows `[signInProbe] nile outcome=expired`, the Library shows one Amazon expired row, and the Amazon tile reads "Sign-in expired — Reconnect"; any other NNN is recorded as a finding against A3.
result: pending

Evidence: gamelib-launch-2.log, runner-nile-launch-2.log, flags.log, item5-row.png, item5-tile.png. Assumptions A3, A6. Arm B in launch 5 if no Amazon game is installed.

### 6. Amazon with nothing installed: record whether the probe still attempts a refresh (launch 5)
expected: With installed.json emptied and the Amazon credential induced as in item 5, the observation is unambiguous: either a Failed to refresh the token line with its status and the resulting outcome, or provably no refresh attempt and outcome=healthy, recorded as a finding against A4.
result: pending

Evidence: gamelib-launch-5.log, runner-nile-launch-5.log. Assumption A4.

### 7. Keychain Deny yields unknown for both stores and latches nothing (launch 6)
expected: With the Keychain build and each boot dialog denied, gamelib.log shows for both steam-refresh-token and humble-session an issuing and a failed `keyring_get` line with `trigger=boot-probe`, `[signInProbe] steam outcome=unknown` and `[signInProbe] humble outcome=unknown`, no `verdict=latched`, no Humble row, and a pre-latched Steam row still present.
result: pending

Evidence: gamelib-launch-6.log, terminal.log, flags.log, item7-prompt.png, item7-library.png. Principle P1, decision D-07.

### 8. Ignored Keychain prompts yield unknown at the 45 second bound (launch 7)
expected: With both boot dialogs left unanswered in a fresh process, gamelib.log shows `[signInProbe] steam outcome=unknown` and `[signInProbe] humble outcome=unknown` with elapsed between 44900 and 50000 ms, no `verdict=latched`, and no signInProbe line caused by answering the dialogs late.
result: pending

Evidence: gamelib-launch-7.log, terminal.log, item8-timeline.txt. Decision D-01.

### 9. The sidecar exits within 50 seconds of stdin EOF on the warm profile (launch 8)
expected: Running build/main/sidecar.js directly against the real profile with stdin closed at READY, with `[signInProbe] pass started stores=` naming all five stores, exits with code 0 within 50 seconds of the EOF and leaves no sidecar process.
result: pending

Evidence: gamelib-launch-8.log, sidecar-stdout.txt, item9-timing.txt. Decision D-20, threat T-49-22.

### 10. A never-connected row reads as information, dismisses, and stays dismissed (launches 9 and 10)
expected: A never-connected store's row reads "<Store> is not connected" with a Sign in button and a dismiss control, looks informational and not like an error in midnightMirage, gruvbox_dark and dracula, the dismiss hides it and writes dismissedSignInNotices, and the row is still absent after a relaunch.
result: pending

Evidence: item10-midnightMirage.png, item10-gruvbox_dark.png, item10-dracula.png, config-dismissed.txt, gamelib-launch-9.log, gamelib-launch-10.log. Principle P4.

### 11. Sign in opens exactly one overlay and a completed sign-in leaves no row (launches 9 and 10)
expected: Clicking a row's Sign in opens Manage Accounts with that store's overlay and only that overlay, a Games then Accounts tab round trip and Back do not reopen it, and after a completed sign-in the Library shows no row for that store, in the same launch and after a relaunch.
result: pending

Evidence: item11-overlay.png, item11-after.png, gamelib-launch-9.log, gamelib-launch-10.log. Requirement R6. The Back leg is conditional on a controller or an inspector stand-in; see the contract.
