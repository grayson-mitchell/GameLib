---
status: pending
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
source: [79-25-PLAN.md]
started: 2026-11-15
updated: 2026-11-15
---

# Phase 79 UAT: live gate for the Rust CM client (session and sign-in)

Authored by plan 79-25 and run by plan 79-26. The author never runs the gate (standing rule, the 63/73/75 pattern).
Record only the status word, the proving log excerpt and a short note. Leave out tokens, account ids, refresh tokens, guard codes and full home paths.

Since 79-25 the `cm` flag defaults to `rust`; the `signin` flag stays `ts` until the sign-in items below pass (D-18: each flag flips on its own parity). An item run on the wrong implementation proves nothing.

## Ground rules (read before every item)

- **Build first.** Run `pnpm build:sidecar` and check that `build/main/sidecar.js` is newer than the newest `src/backend` change. `tauri dev` does not rebuild the sidecar; restart dev after any backend change.
- **Dev launch is `pnpm tauri:dev`**, never tauri:dev:run (that one skips the dev-vault flag and prompts the Keychain on every launch).
- **Flags.** `GAMELIB_STEAMCM_CM` is unset, so the rust default applies (check `env | grep GAMELIB_STEAMCM` and `launchctl getenv GAMELIB_STEAMCM_CM`; both print nothing). Sign-in items 5 to 7 add `GAMELIB_STEAMCM_SIGNIN=rust` to the launch env: `GAMELIB_STEAMCM_SIGNIN=rust pnpm tauri:dev`.
- **Sinks.** App log `~/Library/Logs/GameLib/gamelib.log` carries `[steamcm] rust <channel>` DEBUG lines (written by the Rust client wrapper). The crate's diagnostic lines (`CM logon mode=...`, `CM session rebuilt`, `CM sleep gap`) go to the shell sink: `~/Library/Logs/GameLib/gamelib-shell.log` and the `tauri dev` terminal. Every launch rotates `gamelib.log`; copy it before relaunching.
- **Operator does UI actions only.** Claude does the greps. If a step needs the network off, turn it off only for the action (off -> act -> on -> report), because the operator needs the network to talk to Claude.
- **After every quit** of `tauri dev`, run `pgrep -fl sidecar.js` and record the output. An orphaned `sidecar.js` (parent pid 1) is the known defect in todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`; record it there and kill it.
- **Preconditions shared by all items:** a signed-in Steam account in GameLib that owns a small unfavoured native title not installed (DREDGE, 1562430, about 0.8 GB, suggested) and one 1 to 2 GB title for items 3 and 4; Mac Steam running and online.
- **Known-fix pre-emption:** a title routed by a known-fix layer never reaches the path under test. Check the chosen titles against `public/fixes` and the user fixes dir; a known-fix route makes the item `blocked`.

## Structural Reachability Review

| Item | UI control exists | Sink carries the proof | External-state preflight | Known-fix pre-emption |
|------|-------------------|------------------------|--------------------------|-----------------------|
| 1 | Library Refresh button | `gamelib.log` (`steamcm_session_acquire`), shell log (`CM logon mode=authenticated reason=user-refresh`) | signed in; session left over from the TS build | n/a |
| 2 | Install on a Steam game card (native depot download) | `gamelib.log` | title not installed; enough disk | check against fixes tables |
| 3 | Install, plus the Wi-Fi switch (operator, off about 20 s only) | shell log (`CM session rebuilt`), install progress in the UI | 1 to 2 GB title not installed | as item 2 |
| 4 | Install, plus Apple menu Sleep | shell log (`CM sleep gap`) | as item 3; power adapter connected | as item 2 |
| 5 | Sign out then QR sign-in in the Steam login surface | `gamelib.log` (`Steam QR poll: status`, `Steam auth complete (rust sign-in)`) | `GAMELIB_STEAMCM_SIGNIN=rust` in the launch env; Steam mobile app available | n/a |
| 6 | Sign out then credentials form with a Steam Guard field | `gamelib.log` (`Steam auth complete (rust sign-in)`) | as item 5; account has email or mobile-authenticator guard | n/a |
| 7 | Same form, guard field | UI error text, `gamelib.log` | as item 6 | n/a |
| 8 | Redeem key dialog | `gamelib.log` (`steamcm_redeem_key`) | operator holds an unredeemed key; otherwise `skipped` | n/a |
| 9 | Quit (Cmd-Q) with a lease idle | `pgrep -fl sidecar.js`, shell log `[shell] steamcm shutdown (<context>): <outcome>` | item 2 or 3 done so a lease existed | n/a |
| 10 | not applicable: 79-WRAP-RETEST.md verdict is PASS, so no wrapped-logon item is needed | n/a | n/a | n/a |
| 11 | none for the operator beyond launching with `GAMELIB_STEAMCM_CM=ts` and pressing Refresh; Claude runs the Rust CLI session itself | `gamelib.log` and the CLI stdout | `pnpm steamcm-cli:build`-equivalent binary built under `src-tauri/target/debug` | n/a |

## Current Test

[awaiting 79-26]

## Tests

## Part A — session and sign-in (run by 79-26)

### 1. Existing signed-in user survives the switch (D-07)
expected: Pressing Refresh with no re-sign-in works: `gamelib.log` has `[steamcm] rust steamcm_session_acquire`, the shell log has `CM logon mode=authenticated reason=user-refresh`, and the library is populated (owned count matches the pre-switch count).
result: pass — Refresh with no re-sign-in; shell log `CM logon mode=authenticated reason=user-refresh`, gamelib.log `[steamcm] rust steamcm_licenses` + `steamcm_refresh` (the lease acquire is not routed through the `[steamcm] rust` logger, so no `steamcm_session_acquire` line exists); owned count 401 before and after. Session closed on idle with leases=0.
precondition: signed in from the TS build; flags unset. Action: launch with `pnpm tauri:dev`, note the owned count, press Refresh, grep both sinks, compare the count.

### 2. Rust-fed depot install of a small owned game
expected: `gamelib.log` has `[steamcm] rust steamcm_manifest_request_code` (and `steamcm_depot_key`) during the install; the install completes, the card flips to installed and `appmanifest_<id>.acf` exists.
result: pass — DREDGE (1562430) installed in ~50 s: shell `CM logon mode=authenticated reason=user-install`; gamelib.log `[steamcm] rust steamcm_licenses`, `steamcm_product_info`, `steamcm_depot_key`, `steamcm_content_servers`, `[depot-rust] outcome ... status=completed`; Steam adopted via InstallApp, badge flipped to installed, `appmanifest_1562430.acf` present. No `steamcm_manifest_request_code` line: the crate asks for a request code only on demand (requestCodeRefresher) and this run did not need one.
precondition: DREDGE (or another small owned native title) not installed. Action: press Install, wait for completion, grep the log.

### 3. Mid-lease reconnect after network off/on (D-02, D-11)
expected: During a 1 to 2 GB install, Wi-Fi off for about 20 s then back on: the shell log has `CM session rebuilt in <ms>ms` and the download resumes and completes with no manual retry.
result: issue — Hell Clock (1782460, 1.5 GB). Run 1 (Wi-Fi off ~30 s): install completed with no retry, but no CM op ran during the outage and the TCP link survived, so no rebuild was exercised. Run 2 (Wi-Fi off ~90 s, then Refresh): CM side behaved per D-02 (shell `CM probing session (cause=timeout)`, link found alive, no rebuild needed, Refresh then succeeded on `CM session reused`), but the install failed: `[depot-rust] ... chunk ... failed after 8 attempts` x32, `classified as steam.download.error.connectionDropped`, UI error "Steam servers dropped the connection". The failure is the gamelib-depot CDN chunk retry budget being shorter than a 90 s outage, not the CM session. `CM session rebuilt` not yet seen live.
precondition: 1 to 2 GB owned title not installed; install already downloading. Action: Wi-Fi off about 20 s, on, report; Claude greps the shell log and checks completion.

### 4. Sleep/wake during a held lease
expected: After Apple menu Sleep for about 60 s and wake, the shell log has `CM sleep gap <n>s detected` (n near 60) and the install completes.
result: pass — Hell Clock re-install (restarted from 0%: the failed item-3 job left no resumable chunks), Apple menu Sleep 13:31:10 to wake 13:32:09. Shell: `CM sleep gap 56s detected`, `CM probing session (cause=sleep)`, `CM session dead (cause=probe), rebuilding attempt=1`, `CM session rebuilt in 11365ms` with leases=2 held; install `status=completed` with no manual retry. This also gives the live `CM session rebuilt` proof item 3 lacked. Note: the anonymous connection logged `Failed to send heartbeat message` until its idle close ~30 s later (it is not probed on sleep).
precondition: an install is downloading. Action: Apple menu -> Sleep, wait about 60 s, wake the Mac, report; Claude greps and checks completion.

### 5. QR sign-in (D-06)
expected: With `GAMELIB_STEAMCM_SIGNIN=rust`, after sign-out the QR sign-in shows a code; waiting past one rotation (about 22 s) before scanning shows the QR redraw; scanning in the Steam mobile app signs in. `gamelib.log` has `Steam QR poll: status` transitions and `Steam auth complete (rust sign-in)` (sign-in calls rustInvoke directly, so no `[steamcm] rust` channel line is written); the persona name or account name shows in the UI and the library populates.
result: pass — after fixes 20cdb6de1 (no-arg ops rejected `[]`: QR spinner never resolved, Rust logout failed) and b7c9931d5 (an overlapping poll read `unknownFlow` after done and restarted the flow). Run on 20cdb6de1: QR shown, scanned, `Steam auth complete (rust sign-in)`, `[steamcm] rust steamcm_personas`, shell `webauth qr flow -> done`, `CM logon mode=authenticated reason=login`; stored `userData.username` is a real persona (not the `Steam User` fallback; the Accounts tile deliberately shows no name, by operator design); library sync 390 games. The redraw seen was the race's restart (`Steam QR session error: unknownFlow`), not a challenge rotation; Re-check on b7c9931d5: sign-out clean (no `Rust CM logout failed`), QR waited 34 s with one visible rotation redraw (operator), `Steam QR poll: status waiting -> done`, `Steam auth complete (rust sign-in)`, no `unknownFlow`, no restarted flow.
precondition: launch env `GAMELIB_STEAMCM_SIGNIN=rust`; signed out. Action: choose QR sign-in, wait about 30 s without scanning, watch the redraw, scan, report the name shown.

### 6. Credentials with a typed Steam Guard code (D-05, D-08)
expected: Signing in with password and a typed email or mobile-authenticator code succeeds; `gamelib.log` has `Steam Guard required for credential login` then `Steam auth complete (rust sign-in)`; persona name shows and the library populates.
result: pending
precondition: `GAMELIB_STEAMCM_SIGNIN=rust`; signed out; the account has email or mobile guard. Action: enter credentials, type the code when asked, report.

### 7. Wrong guard code then the right one
expected: A wrong guard code shows an error in the form and leaves the form usable; the correct code on the second attempt succeeds: `gamelib.log` has `Steam guard code submission failed: ... EResult=65` once, then `Steam auth complete (rust sign-in)`.
result: pending
precondition: as item 6. Action: type a wrong code, read the error, type the right code, report.

### 8. Real key redeem
expected: Redeeming a real unredeemed key shows the product granted; `gamelib.log` has `[steamcm] rust steamcm_redeem_key`. Without a key this is `skipped`.
result: pending
precondition: operator holds an unredeemed key (else mark skipped, not pass). Action: open Redeem, enter the key, report the outcome.

### 9. Quit with a lease idle
expected: After Cmd-Q, `pgrep -fl sidecar.js` prints nothing, the shell log shows the steamcm shutdown outcome, and Mac Steam is still running and online.
result: pass — Cmd-Q after items 2-4 (leases idle): `pgrep -fl sidecar.js` printed nothing; shell log `exit requested (code=Some(0))`, `[shell] steamcm shutdown (exit): NotOwed`, `[shell] steamcm shutdown (sidecar eof): NotOwed`, `sidecar terminated on exit`; Mac Steam still running (no go-offline was owed, so nothing to restore).
precondition: a lease has been used (item 2 or 3 done) and is idle. Action: Cmd-Q the app; Claude runs `pgrep -fl sidecar.js` and reads the shell log.

### 11. cm=ts fallback and coexistence (D-18)
expected: Launched with `GAMELIB_STEAMCM_CM=ts`, Refresh works on the TS path while Claude holds a Rust CLI session through `runSteamcmNdjson`; neither side logs eresult 34 (LoggedOff, session replaced). Claude checks this itself.
result: pending
precondition: signed in; Rust CLI binary built. Action: launch with `GAMELIB_STEAMCM_CM=ts pnpm tauri:dev`, press Refresh while Claude's CLI session is open; Claude greps both sinks for `eresult` 34.

## Part B — Refresh, Mac path and delete gate (authored by 79-37)

Placeholder; 79-37 appends the Refresh, Mac-path and delete-gate items here.
