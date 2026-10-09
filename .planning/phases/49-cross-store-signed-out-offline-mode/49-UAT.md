---
status: complete
phase: 49
source: [49-08-SUMMARY.md, 49-09-SUMMARY.md, 49-10-SUMMARY.md, 49-LIVE-GATE.md]
started: 2026-10-10T00:00:00Z
updated: 2026-10-09T21:30:00Z
---

## Protocol

These eleven items are the blocking macOS live gate for Phase 49. Item N here is item N of
`49-LIVE-GATE.md` (same numbering); the contract holds the procedure, the induction and restore
steps, the required log literals with their sinks, and the PASS / FAIL / FINDING criteria. Each
heading below names its launch ordinal. Launch order is not item order: see the contract's launch
map. Plan 49-12 ran the contract on 2026-10-09 (UTC); results below, full record in `49-LIVE-GATE.md` `## Run 1`.

Items with a human-judgment component carried in from earlier plans: item 10 discharges 49-09's
"a never-connected row reads as information, not an error, across themes" (midnightMirage,
gruvbox_dark, dracula); items 1, 3 and 5 discharge 49-10's "Reconnect button text on the real Epic,
GOG and Amazon tiles"; item 9 discharges 49-08's warm-profile exit timing.

## Tests

### 1. Epic expired latches, shows one row and a Reconnect tile (launch 2)
expected: With an expired Epic credential, gamelib.log shows `[signInProbe] legendary outcome=expired` and `verdict=latched`, the legendary runner log carries `Stored credentials are no longer valid`, the Library shows one "Your Epic Games sign-in expired" row, and the Epic tile reads "Sign-in expired — Reconnect".
result: pass — launch 2, gamelib-launch-2.log `legendary outcome=expired` / `verdict=latched`, runner-legendary-launch-2.log `Stored credentials are no longer valid`, flags.log legendary `expired: true`; row and tile copy operator-attested (screenshots missed). FINDING F-49-R1-1: legendary deleted user.json on the rejected refresh token; see 49-LIVE-GATE.md Run 1.

Evidence: gamelib-launch-2.log, runner-legendary-launch-2.log, flags.log, item1-row.png, item1-tile.png. Assumptions A1, A5.

### 2. Epic network failure yields unknown and latches nothing (launch 4)
expected: With the Epic OAuth host blocked and valid credentials, gamelib.log shows `[signInProbe] legendary outcome=unknown` and `verdict=unchanged`, the runner log carries `HTTP request for login failed`, no Epic row appears and no expired flag is set.
result: pass — launch 4, gamelib-launch-4.log `legendary outcome=unknown` / `verdict=unchanged`, runner-legendary-launch-4.log `HTTP request for login failed: ConnectionError`, hosts-check.txt curl exit=7 then http=404 after restore, no expired row (Library showed the not-connected row from F-49-R1-1), flags.log unchanged.

Evidence: gamelib-launch-4.log, runner-legendary-launch-4.log, hosts-check.txt, item2-library.png. Assumption A1 negative.

### 3. GOG expired latches, shows one row and a Reconnect tile (launch 2)
expected: With an invalid GOG refresh token and an old loginTime, the gogdl runner log shows a bare `null` and no `Failed to refresh credentials`, gamelib.log shows `[signInProbe] gog outcome=expired` and `verdict=latched`, the Library shows one GOG expired row, and the GOG tile reads "Sign-in expired — Reconnect".
result: pass — launch 2, runner-gog-launch-2.log bare `null` ×3 and no `Failed to refresh credentials`, gamelib-launch-2.log `gog outcome=expired` / `verdict=latched`, flags.log gog `expired: true`; row and tile copy operator-attested; auth.json not rewritten by gogdl.

Evidence: gamelib-launch-2.log, runner-gog-launch-2.log, flags.log, item3-row.png, item3-tile.png. Assumption A2, decision D-17.

### 4. GOG network failure yields unknown and latches nothing (launch 4)
expected: With auth.gog.com blocked and an expired access token, the gogdl runner log shows `Failed to refresh credentials`, gamelib.log shows `[signInProbe] gog outcome=unknown` and `verdict=unchanged`, and no GOG row appears.
result: pass — launch 4, runner-gog-launch-4.log `[AUTH] ERROR: Failed to refresh credentials` then `null`, gamelib-launch-4.log `gog outcome=unknown` / `verdict=unchanged`, no GOG row, no gog flag.

Evidence: gamelib-launch-4.log, runner-gog-launch-4.log, hosts-check.txt. Assumption A2.

### 5. Amazon expired records the exact refresh status and latches only on 400, 401 or 403 (launch 2)
expected: With an expired access token and an invalid refresh token, the nile runner log shows `Failed to refresh the token <Response [NNN]>` and the observed NNN is recorded; for NNN in 400, 401, 403 gamelib.log shows `[signInProbe] nile outcome=expired`, the Library shows one Amazon expired row, and the Amazon tile reads "Sign-in expired — Reconnect"; any other NNN is recorded as a finding against A3.
result: skipped — not scorable: nile v1.2.0 keeps its tokens in an encrypted `*.enc` blob; current_user.json has only `name`/`user_id`, so the induction has nothing to edit (review R34 fired). Operator declined server-side device deregistration. A3/A6 untested; todo filed `ready: live-gate`. DEFERRED by operator decision 2026-10-09 to deferred-items.md; the phase does not block on it.

Evidence: gamelib-launch-2.log, runner-nile-launch-2.log, flags.log, item5-row.png, item5-tile.png. Assumptions A3, A6. Arm B in launch 5 if no Amazon game is installed.

### 6. Amazon with nothing installed: record whether the probe still attempts a refresh (launch 5)
expected: With installed.json emptied and the Amazon credential induced as in item 5, the observation is unambiguous: either a Failed to refresh the token line with its status and the resulting outcome, or provably no refresh attempt and outcome=healthy, recorded as a finding against A4.
result: issue — FINDING A4 from launches 1-4 (launch 5 skipped as redundant, installed count already 0): runner-nile logs show `[]` + `ERROR [CLI]: No games installed` before any auth call, outcome=healthy; a user with nothing installed is never told their Amazon sign-in expired. Also F-49-R1-5: the same output classified `unknown` in launches 6-7.

Evidence: gamelib-launch-5.log, runner-nile-launch-5.log. Assumption A4.

### 7. Keychain Deny yields unknown for both stores and latches nothing (launch 6)
expected: With the Keychain build and each boot dialog denied, gamelib.log shows for both steam-refresh-token and humble-session an issuing and a failed `keyring_get` line with `trigger=boot-probe`, `[signInProbe] steam outcome=unknown` and `[signInProbe] humble outcome=unknown`, no `verdict=latched`, no Humble row, and a pre-latched Steam row still present.
result: pass — launch 6, gamelib-launch-6.log steam-refresh-token `issuing keyring_get … trigger=boot-probe`, `keyring_get failed: keyring:unavailable:… User canceled`, `memoized … class=unavailable ms=120000`, `steam outcome=unknown` / `verdict=unchanged`, `humble outcome=unknown` / `verdict=unchanged`, no latched, no Humble row, Steam row still present (7c). Humble slot read `ok present=false` with no prompt (session lives in the dev vault, not the Keychain), recorded per review Test 2, not a Deny.

Evidence: gamelib-launch-6.log, terminal.log, flags.log, item7-prompt.png, item7-library.png. Principle P1, decision D-07.

### 8. Ignored Keychain prompts yield unknown at the 45 second bound (launch 7)
expected: With both boot dialogs left unanswered in a fresh process, gamelib.log shows `[signInProbe] steam outcome=unknown` and `[signInProbe] humble outcome=unknown` with elapsed between 44900 and 50000 ms, no `verdict=latched`, and no signInProbe line caused by answering the dialogs late.
result: pass — launch 7, gamelib-launch-7.log `steam bound reached`, `steam outcome=unknown elapsed=45009ms`, `humble outcome=unknown elapsed=4ms` (absent, no prompt), no latched; Rust `keyring:timeout` 6 ms after the bound; late Deny produced no [signInProbe] line. item8-timeline.txt.

Evidence: gamelib-launch-7.log, terminal.log, item8-timeline.txt. Decision D-01.

### 9. The sidecar exits within 50 seconds of stdin EOF on the warm profile (launch 8)
expected: Running build/main/sidecar.js directly against the real profile with stdin closed at READY, with `[signInProbe] pass started stores=` naming all five stores, exits with code 0 within 50 seconds of the EOF and leaves no sidecar process.
result: pass — launch 8, item9-timing.txt `EXIT_CODE 0`, elapsed 2.437 s from EOF, pgrep empty; gamelib-launch-8.log `pass started stores=legendary,gog,nile,humble,steam`; sidecar-stdout.txt `__GAMELIB_SIDECAR_READY__`.

Evidence: gamelib-launch-8.log, sidecar-stdout.txt, item9-timing.txt. Decision D-20, threat T-49-22.

### 10. A never-connected row reads as information, dismisses, and stays dismissed (launches 9 and 10)
expected: A never-connected store's row reads "<Store> is not connected" with a Sign in button and a dismiss control, looks informational and not like an error in midnightMirage, gruvbox_dark and dracula, the dismiss hides it and writes dismissedSignInNotices, and the row is still absent after a relaunch.
result: pass — launch 9 (10a/10b/10c) and a post-fix live check on 2026-10-09 for 10d: after `aea939456` (mount hydrates `dismissedSignInNotices` from app settings) the operator signed out of Humble, dismissed the row, relaunched, row absent. Run 1 had scored 10d FAIL (F-49-R1-3, record kept verbatim in 49-LIVE-GATE.md); 10b FINDING nord_light black text on a dark banner (todo filed, not a gate failure).

Evidence: item10-midnightMirage.png, item10-gruvbox_dark.png, item10-dracula.png, config-dismissed.txt, gamelib-launch-9.log, gamelib-launch-10.log. Principle P4.

### 11. Sign in opens exactly one overlay and a completed sign-in leaves no row (launches 9 and 10)
expected: Clicking a row's Sign in opens Manage Accounts with that store's overlay and only that overlay, a Games then Accounts tab round trip and Back do not reopen it, and after a completed sign-in the Library shows no row for that store, in the same launch and after a relaunch.
result: pass — launch 9, gamelib-launch-9.log shows exactly two `oauthLoginCapture runner=gog` windows: `loginwin-2 … cancelled reason=window-closed` (11a: one overlay, login form shown, closed unsigned) and `loginwin-3 … captured` (11d: real sign-in); no third window, so 11b tab round-trip and 11c inspector `history.back()` stand-in did not reopen. Launch 10: `gog outcome=healthy`, no GOG row. item11-shot-{1,2}.png.

Evidence: item11-overlay.png, item11-after.png, gamelib-launch-9.log, gamelib-launch-10.log. Requirement R6. The Back leg is conditional on a controller or an inspector stand-in; see the contract.
