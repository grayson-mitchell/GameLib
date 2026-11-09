---
spike: 053
name: web-api-library-no-cm
type: standard
validates: "Given GameLib's stored SteamClient refresh token, when a web access token is minted over HTTPS (no authenticated CM logon) and used against the Web API and store endpoints, then the library (owned games + demos) is fetched without disturbing Mac Steam's Friends"
verdict: INVALIDATED
related: [052, 046b]
tags: [steam, steam-session, web-api, access-token, library, friends, macos, live]
---

# Spike 053: web-api-library-no-cm

## What This Validates

Could GameLib's library Refresh skip the authenticated CM logon, and with it the go-offline wrap
(046b), by minting a web access token from the stored refresh token and calling Steam's HTTPS
endpoints instead? Follows 052, which showed the licenses path still needs the authenticated CM
session.

## Research

- GameLib signs in with `LoginSession(EAuthTokenPlatformType.SteamClient)`
  (`src/backend/storeManagers/steam/user.ts:1152`).
- steam-session 1.9.4: for SteamClient tokens, `getWebCookies()` only calls `refreshAccessToken()`
  (`IAuthenticationService.GenerateAccessTokenForApp`, `renewal_type None`) and builds
  `steamLoginSecure = steamid||accessToken`. No `finalizelogin`. The default transport for
  SteamClient is `WebSocketCMTransport` (an unauthenticated CM socket, not a user logon).
- Stored token claims (decoded, redacted): `aud ["client","web","renew","derive"]`, valid until
  2027-05-22, `per 1`, issued 2026-10-22. `derive` is the audience normally needed to mint access
  tokens, so the token looked eligible.

## How to Run

Preconditions: Mac Steam signed in with Friends signed in. GameLib may be open or closed.

```bash
node .planning/spikes/053-web-api-library-no-cm/probe.mjs [subjectAppId=3205720]
```

Approve the Keychain prompt (Allow, not Always Allow). The library oracles (Web API
`GetOwnedGames`, store `dynamicstore/userdata`, `account/licenses`) only run once a token is
minted.

## Observability

`run-1-cm-websocket-denied.log` and `run.log` hold the event streams. `result.json` holds the mint
attempts. Mac Steam's `connection_log.txt` is tailed for the whole run as the Friends oracle.

## Investigation Trail

1. **Run 1 (23:33 UTC):** `LoginSession(SteamClient).refreshAccessToken()` over the default CM
   websocket transport failed with `AccessDenied` (EResult 15). The probe stopped before any
   library call.
2. **Token check:** the claims include `derive` and the token is valid, so the cause is not
   expiry or a missing audience.
3. **Run 2 (23:34 UTC):** first the same transport (AccessDenied again), then the same RPC as a
   plain HTTPS form POST to
   `api.steampowered.com/IAuthenticationService/GenerateAccessTokenForApp/v1` with
   `renewal_type 0`. The answer was HTTP 200 with `{"response":{}}` and `x-eresult 63`
   (AccountLogonDenied).
4. **Friends oracle:** no `connection_log.txt` line during either run. Mac Steam was not
   touched.

## Results

**INVALIDATED** for GameLib's current token type. GameLib's SteamClient refresh token cannot be
turned into a web access token without the authenticated CM session, by either transport, when
renewal is disabled. So the web-API route cannot replace the CM logon as things stand. The library
endpoints (A/B/C) were never reached.

Not tried, deliberately:

- **`renewal_type Allow`.** This would rotate the refresh token. Whether the old token stays valid
  is unverified, so it could sign GameLib out. It needs the operator's go-ahead and a way to
  restore the token.
- **A separate WebBrowser-platform refresh token.** This would be minted at sign-in alongside the
  client token, would mint access tokens and cookies through `finalizelogin`, and would never touch
  the CM. It is the standard steam-session web flow, but it means a second sign-in step (or a
  second QR scan) and storing a second token. Whether it can then list demos (store
  `dynamicstore/userdata`) is still the open question.
- **Why `AccessDenied`/`AccountLogonDenied`.** Possibilities: Valve restricting
  `GenerateAccessTokenForApp` for SteamClient tokens unless renewal is allowed, or the `per 1`
  persistence class. Unproven.
