---
spike: 053b
name: renewal-mint
type: standard
validates: "Given GameLib's SteamClient refresh token, when GenerateAccessTokenForApp is called with renewal ALLOWED (no authenticated CM logon), then a web access token (and possibly a rotated refresh token) is issued"
verdict: INVALIDATED
related: [053, 052]
tags: [steam, steam-session, access-token, renewal, web-api, live]
---

# Spike 053b: renewal-mint

## What This Validates

053 showed that GameLib's SteamClient refresh token cannot mint a web access token with
`renewal_type None`. The token's `aud` includes `renew`, so this tests whether Steam only allows
the mint on the renewal path (`renewal_type Allow`), still with no authenticated CM logon.

## Research

- `steam-session` 1.9.4 `renewRefreshToken()` calls
  `generateAccessTokenForApp(refreshToken, true)`. That sets `renewal_type Allow` and returns
  `true` only when Steam sends a new refresh token.
- The probe also offers a "one login, two tokens" route: a single refresh token minting a
  web-scoped access token with no CM client logon.

## How to Run

Preconditions: GameLib fully quit, Mac Steam signed in with Friends signed in.

```bash
node .planning/spikes/053b-renewal-mint/probe.mjs [subjectAppId=3205720]
```

Safety:

- The current refresh token is backed up to `~/.gamelib-spike053b-refresh-token.bak` (0600)
  before any call.
- A newly issued refresh token is written to the GameLib Keychain entry and read back to check it.
- The restore command is in the probe header.
- The library oracles from 053 run only if a token is minted.

## Investigation Trail

1. **Run (23:50 UTC, 2026-10-30):**
   - `LoginSession(SteamClient).renewRefreshToken()` over the default CM websocket transport
     returned `AccessDenied` (15).
   - The HTTPS form POST to `IAuthenticationService/GenerateAccessTokenForApp/v1` with
     `renewal_type 1` returned HTTP 200, `{"response":{}}`, `x-eresult 15`.
   - No new refresh token was issued.
2. **Cleanup:** the Keychain token was compared with the backup, found unchanged, and the backup
   was deleted. GameLib's sign-in is untouched.
3. **Friends oracle:** no `connection_log.txt` line during the run.

## Results

**INVALIDATED.** With or without renewal, and over either transport, Steam refuses to mint an
access token from GameLib's SteamClient refresh token outside an authenticated CM session.

Across 053 and 053b:

- **Minting is closed off.** A SteamClient refresh token is only usable from inside an
  authenticated client logon, which is what signs out Mac Steam's Friends. A "one login, two
  tokens" flow driven from this token is not available.
- **Not tested:** a WebBrowser-platform login (a separate token type, minted through
  `finalizelogin`), and an already signed-in store web session (`steamLoginSecure` cookie). Both
  avoid the CM by construction. The next spike tests the store-cookie route.
