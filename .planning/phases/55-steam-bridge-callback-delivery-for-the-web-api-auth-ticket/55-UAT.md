---
status: testing
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
result: pending

### 2. Forward reached
expected: gamelib-launch-1.log contains a CALL line `SteamUser023.GetAuthTicketForWebApi`
result: pending

### 3. Helper queued callback 168
expected: gamelib-launch-1.log contains `CBQ` `queued iCallback=168 result=1 cub=2572` and an `INIT` `manual dispatch ready` line
result: pending

### 4. EOS Connect user login
expected: AbioticFactor-launch-1.log contains a LogEOS line naming Connect and a login success that appears in neither VERBOSE baseline (literal pinned by 55-07 after the first run); ConnectClientAuthTask Success does not count
result: pending

### 5. Retry loop gone
expected: AbioticFactor-launch-1.log has no three consecutive `LogOnlineIdentity: STEAM: Obtained steam authticket` lines with 8 to 12 s gaps
result: pending

### 6. Main menu interactive (operator)
expected: the operator confirms the Loading indicator is gone and the main menu buttons take focus and clicks
result: pending

## Gaps
