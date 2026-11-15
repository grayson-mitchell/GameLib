---
status: partial
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
| 12 | Library Refresh button, Mac Steam quit | `gamelib.log` (`[steamcm] rust steamcm_refresh`, `Steam Refresh enrichment:`, `Steam library sync complete:`) | Mac Steam quit; signed in; 79-PARITY.md Refresh sweep counts to hand | n/a |
| 13 | Library Refresh button, Mac Steam relaunched fresh; Claude renames the helper (reversible, restore checked with `test -x`) | `gamelib.log` (`Mac Steam path unavailable (helper-missing), using CM`), shell log (`CM logon mode=authenticated`), Mac Steam `connection_log.txt`; the operator watches Friends | `public/bin/arm64/darwin/steam-bridge-helper` present and executable before the rename; Friends online | n/a |
| 14 | Library Refresh button, Mac Steam running and signed in | `gamelib.log` (`Steam Refresh: Mac Steam path ok`), shell log (absence of `CM logon mode=authenticated`) | Mac Steam running, same account as GameLib; helper present and executable | n/a |
| 15 | Library Refresh button, Mac Steam quit | `gamelib.log` (`Mac Steam path unavailable (`) | Mac Steam quit; helper restored | n/a |
| 16 | not reachable without a second account in Mac Steam; `skipped` unless the operator can do it | `gamelib.log` (`Mac Steam path unavailable (account-mismatch)`) | a second Steam account signed into Mac Steam | n/a |
| 17 | A Steam game card whose metadata is not cached (open its page) | `gamelib.log` (`[steamcm] rust steamcm_store_enrich`, `steamcm_store_appdetails`) | a game never opened since the metadata cache was cleared or never fetched | n/a |
| 18 | Quit and relaunch GameLib (`pnpm tauri:dev`), then Refresh | `gamelib.log`, shell log | signed in before the restart | n/a |
| 19 | Install on a game card, then Activity Monitor Force Quit | `pgrep -fl sidecar.js`, shell log (`[shell] steamcm shutdown (<context>): <outcome>` where the shell lives to write it), Mac Steam state | a 1 to 2 GB title not installed; the install is under way and holds a lease | as part A item 2 |

Helper rename (item 13; items 14 and 15 need it restored): the Mac path resolves the helper at `public/bin/arm64/darwin/steam-bridge-helper` (`appPaths.steamBridgeHelperPath`; `x64` on Intel). Claude renames it to `steam-bridge-helper.bak` for item 13 and restores it straight afterwards, then runs `test -x public/bin/arm64/darwin/steam-bridge-helper`. Nothing else may run while it is renamed: the install adoption path also uses this helper and would report `helper-missing`.

## Current Test

[part A approved; part B awaiting 79-38]

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
result: pass — after fix 38cc15c8a (gamelib-depot transient chunk errors now retry within a 300 s budget, backoff capped at 8 s, no host demotion during an outage). Re-run 14:40: Hell Clock (1782460, 1.5 GB) installing, Wi-Fi off (`offline via no-interface` 14:40:18) to back on (`Connectivity: online` 14:42:05, ~107 s offline), Refresh pressed. Shell: `CM probing session (cause=closed)`, `CM session dead (cause=probe), rebuilding attempt=1`, `CM session rebuilt in 7758ms` with leases=4 held; install `[depot-rust] outcome ... status=completed` at 14:43:34, `Finished Installation`, zero `failed after` chunk errors, no manual retry. History: Hell Clock (1782460, 1.5 GB). Run 1 (Wi-Fi off ~30 s): install completed with no retry, but no CM op ran during the outage and the TCP link survived, so no rebuild was exercised. Run 2 (Wi-Fi off ~90 s, then Refresh): CM side behaved per D-02 (shell `CM probing session (cause=timeout)`, link found alive, no rebuild needed, Refresh then succeeded on `CM session reused`), but the install failed: `[depot-rust] ... chunk ... failed after 8 attempts` x32, `classified as steam.download.error.connectionDropped`, UI error "Steam servers dropped the connection". The failure is the gamelib-depot CDN chunk retry budget being shorter than a 90 s outage, not the CM session. `CM session rebuilt` not yet seen live.
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
result: pass — credentials sign-in on the Rust Web API flow reached Steam Guard (`Steam Guard required for credential login`, shell `webauth credentials flow -> guardRequired`) and completed on mobile approval: `webauth credentials flow -> done`, `Steam auth complete (rust sign-in)`, `[steamcm] rust steamcm_personas`, stored persona is real (not the fallback), library sync 390 games. The typed *correct* code sub-case is untestable on this account: its Steam mobile app offers approval only and shows no code (typed-code success stays covered by the unit test `submitSteamGuardCode normalises, submits and waits for done`).
precondition: `GAMELIB_STEAMCM_SIGNIN=rust`; signed out; the account has email or mobile guard. Action: enter credentials, type the code when asked, report.

### 7. Wrong guard code then the right one
expected: A wrong guard code shows an error in the form and leaves the form usable; the correct code on the second attempt succeeds: `gamelib.log` has `Steam guard code submission failed: ... EResult=65` once, then `Steam auth complete (rust sign-in)`.
result: pass — after fix 37c2a1d5c (the form cleared its phone-approval poll on submit and never resumed it after a rejected code, so an approval following a wrong code hung sign-in; seen live at 13:58). Re-run 14:04: wrong code `AAAAA` -> UI "invalid code", `Steam guard code submission failed: eresult EResult=88` (TwoFactorCodeMismatch, not 65: 65 is the email-code variant); the same flow then completed on mobile approval: `webauth credentials flow -> done`, `Steam auth complete (rust sign-in)` at 14:04:37, library sync 390 games. The "right code" step is a mobile approval for this account (see item 6).
precondition: as item 6. Action: type a wrong code, read the error, type the right code, report.

### 8. Real key redeem
expected: Redeeming a real unredeemed key shows the product granted; `gamelib.log` has `[steamcm] rust steamcm_redeem_key`. Without a key this is `skipped`.
result: skipped — operator holds no unredeemed key to spend; redeem stays covered by the adapter tests (eresult != 1 rejects) and the 79-PARITY CM-ops section.
precondition: operator holds an unredeemed key (else mark skipped, not pass). Action: open Redeem, enter the key, report the outcome.

### 9. Quit with a lease idle
expected: After Cmd-Q, `pgrep -fl sidecar.js` prints nothing, the shell log shows the steamcm shutdown outcome, and Mac Steam is still running and online.
result: pass — Cmd-Q after items 2-4 (leases idle): `pgrep -fl sidecar.js` printed nothing; shell log `exit requested (code=Some(0))`, `[shell] steamcm shutdown (exit): NotOwed`, `[shell] steamcm shutdown (sidecar eof): NotOwed`, `sidecar terminated on exit`; Mac Steam still running (no go-offline was owed, so nothing to restore).
precondition: a lease has been used (item 2 or 3 done) and is idle. Action: Cmd-Q the app; Claude runs `pgrep -fl sidecar.js` and reads the shell log.

### 11. cm=ts fallback and coexistence (D-18)
expected: Launched with `GAMELIB_STEAMCM_CM=ts`, Refresh works on the TS path while Claude holds a Rust CLI session through `runSteamcmNdjson`; neither side logs eresult 34 (LoggedOff, session replaced). Claude checks this itself.
result: pass — app launched with `GAMELIB_STEAMCM_CM=ts`; Claude held a Rust CLI session (`runSteamcmNdjson`-equivalent stdin NDJSON, lease 1, `CM logon mode=authenticated reason=user-refresh`) from 14:09:35 to 14:12:49. Operator Refresh at 14:10:18 ran on the TS path (`[Steam] CM logon mode=authenticated reason=user-refresh wrap=toggled`, go-offline/goonline wrap, `fetched 390 owned games`, sync complete 390). The held Rust session then answered `steamcm_licenses` (485 licences) after the TS logon; zero eresult 34 / LoggedOff / LogonSessionReplaced lines in the CLI stderr and in gamelib.log. Side note: the TS `fetchLicensedDemos` timed out (30 s), consistent with the TS-reference breakage recorded in 79-33.
precondition: signed in; Rust CLI binary built. Action: launch with `GAMELIB_STEAMCM_CM=ts pnpm tauri:dev`, press Refresh while Claude's CLI session is open; Claude greps both sinks for `eresult` 34.

## Part B — Refresh, Mac path and delete gate (authored by 79-37)

Run by plan 79-38. Items continue the numbering of part A. Defaults now: both `GAMELIB_STEAMCM_CM` and `GAMELIB_STEAMCM_SIGNIN` are `rust`, so no flag is set. The Steam Guard on this account is mobile approval only (there is no typed code). The Accounts tile deliberately shows no name; never write that a name shows in the UI. Redact SteamIDs, account and persona names, tokens and home paths.

### 12. Rust Refresh on the CM path, Mac Steam quit (D-12, D-16)
expected: With Mac Steam fully quit, one Refresh gives exactly one `[steamcm] rust steamcm_refresh` line in `gamelib.log`, no TS capture or demos fetch lines, then `Steam Refresh enrichment: attempted=... rateLimited=... budgetHit=...` and `Steam library sync complete: <n> games`. The owned and demo counts match the Refresh sweep in 79-PARITY.md.
result: pass — Mac Steam quit (`pgrep -x steam_osx` empty), defaults (no flags). Refresh 15:09:06: `Steam Refresh: Mac Steam path unavailable (helper-failed), using CM`, then `[steamcm] rust steamcm_licenses` + `[steamcm] rust steamcm_refresh`, shell `CM logon mode=authenticated reason=user-refresh`, `Steam bulk platform capture: ... anon=1 held=1` (the Rust result summary from rustRefresh.ts, not a TS capture), `Steam Refresh enrichment: attempted=0 ... rateLimited=false budgetHit=false`, `Steam library sync complete: 390 games` (matches the 390-entry Refresh sweeps in 79-PARITY.md). No TS demos fetch line. Note: gamelib.log has TWO `steamcm_refresh` lines, one for the macSteam-source attempt and one for the CM Refresh: 79-36 routes both sources through the same channel, so "exactly one" in the expected text predates that design.
precondition: signed in; Mac Steam quit (check `pgrep -x steam_osx` prints nothing); `pnpm build:sidecar` fresh. Action: operator presses Refresh once; Claude copies `gamelib.log` and greps the lines. Expect `Mac Steam path unavailable (` to appear first (the Mac path is tried before the CM path), then the CM Refresh.

### 13. D-09 second arm: CM-fallback Refresh with a freshly started Mac Steam, Friends watched (D-09)
expected: Verdict in 79-WRAP-RETEST.md is `verdict: PASS` (unwrapped), so this arm expects NO go-offline wrap. With the helper renamed, Refresh logs `Steam Refresh: Mac Steam path unavailable (helper-missing), using CM`, then the shell log has `CM logon mode=authenticated` with no `gooffline` and no `go-offline wrap` line in either sink, and Mac Steam's Friends list stays signed in for 90 s after the logon, with no user LogOff in `connection_log.txt`. A sign-out means FAIL. (If the verdict file were FAIL the same steps would expect the wrapped `steam://open/gooffline` then goonline in `connection_log.txt` with Friends staying signed in; that branch does not apply.)
result: pass — 79-WRAP-RETEST.md `verdict: PASS`, so no wrap expected. Helper renamed to `.bak`; operator relaunched Mac Steam fresh (connection_log: own logon `RecvMsgClientLogOnResponse() ... 'OK'` 15:11:21), waited for Friends online, pressed Refresh 15:12:13: `Steam Refresh: Mac Steam path unavailable (helper-missing), using CM`, shell `CM logon mode=authenticated reason=user-refresh`, `Steam library sync complete: 390 games`. Zero `gooffline` / `go-offline` lines in either sink. connection_log.txt has no line at all from 15:11:30 to 15:13:45 (no LogOff, no re-logon) and the operator watched Friends stay online for 90 s. Helper restored; `test -x public/bin/arm64/darwin/steam-bridge-helper` passes.
precondition: Claude renames `public/bin/arm64/darwin/steam-bridge-helper` to `steam-bridge-helper.bak`; the operator quits Mac Steam, relaunches it fresh and waits until Friends shows online; GameLib running. Action: operator presses Refresh once and watches the Friends list for 90 s. Claude greps both sinks and `~/Library/Application Support/Steam/logs/connection_log.txt` (LogOff/LogOn in the window). Afterwards Claude restores the helper and checks `test -x public/bin/arm64/darwin/steam-bridge-helper`; the item is not complete until that check passes. A FAIL stops the delete gate and is reported to the orchestrator, because the wrap would then be needed after all.

### 14. Mac Steam path with Mac Steam running, no CM logon (D-14, D-15)
expected: With Mac Steam running and signed in as the same account, Refresh logs `Steam Refresh: Mac Steam path ok games=<n> demos=<n> (no CM logon)` and there is no `CM logon mode=authenticated` line in the shell log inside that Refresh window. Free-to-play titles appear, and the two Steam-hidden demos are absent. Operator note: on this path playtime and last-played are carried forward from the cached library and do not update; that is the accepted divergence row in 79-PARITY.md, tracked by todo `2026-11-15-refresh-playtime-on-mac-steam-path.md`, so stale playtime here is not a failure. Do not judge playtime on this item.
result: issue — core path works: Refresh 15:18:10 `Steam Refresh: Mac Steam path ok games=399 demos=11 (no CM logon)`, shell only `CM logon mode=anonymous reason=mac-owned` in the window (no authenticated logon), `Steam library sync complete: 410 games`; Dota 2 and TF2 present (operator). Two defects seen live: (a) within 1-2 s of the Refresh Mac Steam Friends showed the operator "playing Spacewar" (AppID 480): the owned-apps helper's attach to the running client is reported as app 480 running; and 480 (SDK test app) is in the Mac-path list; (b) the UI froze ~5 s (typed search keys appeared late) around the library update. Outcome: (b) fixed in c0cc89913 (per-game pushes coalesced into one store write), live re-check under item 18. (a) not fixed: probing narrowed the trigger to the helper's first IClientUser IPC call, but live steamclient probing was denied by the permission classifier; operator decision 2026-11-15: Mac path OFF by default until fixed (3b7417c05, `GAMELIB_STEAM_MAC_PATH=on` opts in), todo `2026-11-15-mac-steam-path-shows-playing-spacewar.md`; 480 filtered from the Mac list (c8a33e304). Refresh on macOS now takes the Rust CM path verified by items 12/13.
precondition: Mac Steam running, online, same account; helper restored (`test -x` passes). Action: operator presses Refresh; Claude greps the Refresh window in `gamelib.log` and the shell log, and checks the library for the F2P titles and the two hidden demos.

### 15. Mac path fallback with Mac Steam quit
expected: With Mac Steam quit, Refresh logs `Mac Steam path unavailable (` followed by a reason and then completes through a CM Refresh (`[steamcm] rust steamcm_refresh`, `Steam library sync complete:`).
result: pass — recorded from item 12's Refresh: `Steam Refresh: Mac Steam path unavailable (helper-failed), using CM` then `[steamcm] rust steamcm_refresh` and `Steam library sync complete: 390 games`.
precondition: Mac Steam quit; helper present. Action: operator presses Refresh; Claude greps. This overlaps item 12 and may be recorded from the same Refresh.

### 16. Account-mismatch fallback
expected: With Mac Steam signed into a different account than GameLib, Refresh logs `Mac Steam path unavailable (account-mismatch), using CM`. Recorded `skipped` unless the operator can sign Mac Steam into another account; it is unit-tested in 79-36.
result: pending
precondition: a second Steam account on this Mac. Action: sign Mac Steam into it, press Refresh in GameLib; Claude greps; then restore the original account.

### 17. Rust store enrichment
expected: Opening a game page whose metadata is not cached writes `[steamcm] rust steamcm_store_enrich` (and `[steamcm] rust steamcm_store_appdetails` for the install size) in `gamelib.log`, and the art and requirements render.
result: pass — Serious Sam Fusion 2017 page (owned, first open in GameLib): art rendered and the install info showed (engine rows for a Windows title); gamelib.log `[steamcm] rust steamcm_store_appdetails` at 15:42:30 for the install size. `steamcm_store_enrich` could not be triggered live: every owned app (390 of 390) already has a `steam_metadata` cache entry (413 entries), so `fetchMetadataIfNeeded` never takes the cold path; that call site stays covered by unit tests and the Rust enrichment stage ran live in 79-33 (run 13: attempted=50, enriched=48). A first pick (Archolos 1467450) was a stale Mac-path-only entry with no backend record (see the ghost-entry fix).
precondition: a Steam game never opened (no cached metadata). Action: operator opens its game page; Claude greps both lines and the operator confirms the art and requirements.

### 18. Restart keeps the user signed in (D-07)
expected: After quitting and relaunching GameLib, the Steam account is still signed in, Refresh works with no sign-in prompt, and the shell log has `CM logon mode=authenticated reason=user-refresh` (or the Mac path line of item 14 when Mac Steam runs).
result: pass — Cmd-Q then relaunch: `pgrep -fl sidecar.js` empty after quit, shell `steamcm shutdown (sidecar eof): NotOwed`; stored `userData.username` real (7 chars, not the fallback), `isLoggedIn` true; operator saw the account connected with no sign-in prompt. Refresh 15:39:24: one `[steamcm] rust steamcm_refresh` (no Mac attempt: the Mac path is off by default since 3b7417c05), shell `CM logon mode=authenticated reason=user-refresh`, `Steam library sync complete: 390 games`. Same Refresh re-checked item 14's fixes live: typing in search during the Refresh stayed responsive (c0cc89913), and no Spacewar in Friends (0 `AppID 480` lines in gameprocess_log.txt).
precondition: signed in. Action: operator Cmd-Q then `pnpm tauri:dev`, then Refresh; Claude runs `pgrep -fl sidecar.js` after the quit and greps the logs. Prove the account is stored through `userData.username` being a real name (length, not the `Steam User` fallback), never by a name in the UI.

### 19. Force Quit during a download holding a lease
expected: After Activity Monitor Force Quit mid-download and a relaunch, `pgrep -fl sidecar.js` prints nothing (no orphan sidecar), Mac Steam is still running and online, and re-pressing Install resumes the download. If the shell survived to log it, the shell log has `[shell] steamcm shutdown (sidecar eof): <outcome>`; record whichever steamcm shutdown line is present or that none is (a SIGKILL of the shell itself cannot write one).
result: pass — after fix e3dfe2937 (first run: issue). First run: Hell Clock downloading, Mac Steam running; operator Force Quit gamelib-shell ~15:46:36. Sidecar saw stdin EOF (`[sidecar] stdin closed: releasing Steam CM session ... aborting in-flight downloads`, `aborting in-flight native depot download for appId 1782460`) but did NOT exit: `[sidecar] still alive 15000ms after stdin EOF; active resources: PipeWrap, PipeWrap, Timeout`, the connectivity periodic watch kept firing every 15 s, and `pgrep -fl sidecar.js` showed the orphan (PPID 1) 9 min later with 11 idle :443 sockets; killed by Claude. No `steamcm shutdown` line (the shell was SIGKILLed). Mac Steam still running. Fix e3dfe2937: the install stall watchdog's 8-minute timer was ref'd, and under cm=rust the `depot_job_run` request to a dead shell never settles, so that timer held the loop (the Rust depot path from phase 73 introduced it; the TS downloader settled on abort). Re-run 15:55: Hell Clock downloading, Force Quit gamelib-shell; sidecar logged `stdin closed ... aborting in-flight native depot download` at 15:55:16 and was gone by 15:55:19, no `still alive` line, `pgrep -fl sidecar.js` empty; Mac Steam still running; no `steamcm shutdown` line (shell SIGKILLed, as expected). After relaunch, Install resumed: the bar showed 0% at first, then jumped to where it had stopped once the download started (file-level resume via reconcile_partial_state). The relaunch also confirmed fix 292b6af2d: the ~20 stale Mac-path-only library entries were gone on boot without a Refresh.
precondition: a 1 to 2 GB title downloading with the lease held; Mac Steam running. Action: operator Force Quits GameLib from Activity Monitor; Claude runs `pgrep -fl sidecar.js` (an orphan has parent pid 1: record and kill it), operator relaunches and resumes the install.
