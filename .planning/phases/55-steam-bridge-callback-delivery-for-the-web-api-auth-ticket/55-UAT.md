---
status: partial
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
result: issue — launch 1: no line names Connect AND states a login success. Connect-naming lines in the launch log: `LogEOSConnect: ConnectClientAuthTask Success` (excluded, in baseline), two `GetProductUserExternalAccountIdPrivate - TargetUserId not found in ExternalAccountInfoCache` lines (not a success), and one `FConnectClient::CacheExternalAccountInfo - ProductUserId: ..., AccountType: 1, AccountId: <SteamID64>` (23.52.02), which is absent from both verbose baselines (count 0 in each). Adjacent non-Connect evidence of a logged-in EOS user: a second `TokenGrant` HTTP success at 23.50.41:608, then `LogEOSMessaging: Successfully connected to Stomp. LocalUserId=[000...121]`. Whether CacheExternalAccountInfo (or the Stomp line) counts as the contract's login-success literal is a judgement the contract did not anticipate; recorded for the orchestrator, not waived. Candidate pinned in 55-LIVE-GATE.md.

### 5. Retry loop gone
expected: AbioticFactor-launch-1.log has no three consecutive `LogOnlineIdentity: STEAM: Obtained steam authticket` lines with 8 to 12 s gaps
result: pass — launch 1: `grep -n 'Obtained steam authticket' AbioticFactor-launch-1.log` matched one line (933, 23.50.39:609); no run of three, and no repeats in the 2 minutes after.

### 6. Main menu interactive (operator)
expected: the operator confirms the Loading indicator is gone and the main menu buttons take focus and clicks
result: pass — operator-reported (not log-derived): reached the main menu; time to interactive "was pretty instant."; one prompt appeared, "was asked if i want to enable crossplay" (a crossplay opt-in; no account-link prompt reported). The operator did not separately say buttons took focus and clicks; the answered-prompt report is taken as interaction. The crossplay prompt is NOT used as evidence for item 4.

## Gaps

- Item 4 (issue): the contract expected a Connect-named login-success line; the game log has none. Closest Connect-named line absent from both verbose baselines is `CacheExternalAccountInfo` (see item 4). Needs an orchestrator decision on whether it, or the Stomp connected line, is the pinned literal.
