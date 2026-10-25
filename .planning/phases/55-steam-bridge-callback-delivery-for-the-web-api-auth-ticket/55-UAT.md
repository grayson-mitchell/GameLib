---
status: complete
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
source:
  - 55-LIVE-GATE.md
started: 2026-10-26T00:00:00Z
updated: 2026-10-26T00:00:00Z
---

Authored by plan 55-06, run by 55-07. The plan that authored this contract did not run any item of it.

Done-when being gated (ROADMAP): Abiotic Factor (427410) reaches an interactive main menu and its game log shows an EOS Connect user login.

### 1. Bridge attach (strict-verified)
expected: gamelib-launch-1.log has HELLO `shim attached appid=427410`, the bottle steam_api64.dll size equals the built size, and AbioticFactor-launch-1.log has `LogOnline: STEAM: [AppId: 427410] Client API initialized 1` with no `SteamAPI failed to initialize` line; In-Game never counts
result: pass — launch 1: `grep -n HELLO gamelib-launch-1.log` matched `HELLO  shim attached appid=427410` (12:50:20); bottle `steam_api64.dll` is 500736 bytes, equal to the PC3 built size 500736; `grep -c 'LogOnline: STEAM: \[AppId: 427410\] Client API initialized 1' AbioticFactor-launch-1.log` = 1; `grep -c 'SteamAPI failed to initialize, conditions not met'` = 0 and `grep -c 'Steam API failed to initialize!'` = 0.

### 2. Forward reached
expected: gamelib-launch-1.log contains a CALL line `SteamUser023.GetAuthTicketForWebApi`
result: pass — launch 1: `grep CALL gamelib-launch-1.log` matched `CALL   SteamUser023.GetAuthTicketForWebApi` (12:50:39), directly after `GetAuthSessionTicket`.

### 3. Helper queued callback 168
expected: gamelib-launch-1.log contains `CBQ` `queued iCallback=168 result=1 cub=2572` and an `INIT` `manual dispatch ready` line
result: pass — launch 1: `grep -E 'CBQ|manual dispatch'` matched `INIT   manual dispatch ready` (12:50:17) and `CBQ    queued iCallback=168 result=1 cub=2572` (12:50:41). The game log then shows `FOnlineAsyncEventSteamGetTicketForWebApiResponse Received code 1.` at 23.50.41:013, so the game received callback 168 within about 1.4 s of the forward.

### 4. EOS Connect user login
expected: AbioticFactor-launch-1.log contains a LogEOS line naming Connect and a login success that appears in neither VERBOSE baseline (literal pinned by 55-07 after the first run); ConnectClientAuthTask Success does not count
result: pass — launch 1: operator decision 2026-10-26 pins the literal `LogEOSSDK: Verbose: LogEOSConnect: FConnectClient::CacheExternalAccountInfo - ProductUserId: <id>, AccountType: 1, AccountId: <redacted>` (23.52.02; absent from both verbose baselines, count 0 each; a ProductUserId is only issued after a successful EOS Connect login, AccountType 1 = Steam). Corroborated by a second TokenGrant success and `Successfully connected to Stomp`.

### 5. Retry loop gone
expected: AbioticFactor-launch-1.log has no three consecutive `LogOnlineIdentity: STEAM: Obtained steam authticket` lines with 8 to 12 s gaps
result: pass — launch 1: `grep -n 'Obtained steam authticket' AbioticFactor-launch-1.log` matched one line (933, 23.50.39:609); no run of three, and no repeats in the 2 minutes after.

### 6. Main menu interactive (operator)
expected: the operator confirms the Loading indicator is gone and the main menu buttons take focus and clicks
result: pass — operator-reported (not log-derived): reached the main menu; time to interactive "was pretty instant."; one prompt appeared, "was asked if i want to enable crossplay" (a crossplay opt-in; no account-link prompt reported). The operator did not separately say buttons took focus and clicks; the answered-prompt report is taken as interaction. The crossplay prompt is NOT used as evidence for item 4.

## Gaps

- Item 4: resolved 2026-10-26 by operator decision (see item 4).
