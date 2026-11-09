---
spike: 072
name: rust-signin-refresh-token
type: standard
validates: "Given steam-vent (the 071 winner) plus the Steam Web API, when the operator signs in by QR and by password + Steam Guard, then each yields a client refresh token that logs on to the CM with no account name"
verdict: PARTIAL (QR and password + app approval pass; typed Guard codes and the QR token's own logon untested)
related: [071a, 071b, 071c, 046a]
tags: [rust, steam, auth, steam-session, steam-vent, qr, steam-guard, refresh-token, sidecar-retirement, live]
---

# Spike 072: Steam sign-in from Rust

## What This Validates

GameLib signs in today with `steam-session` (`userSignIn.ts`: `new LoginSession(SteamClient)`,
`startWithQR` / `startWithCredentials`). This spike asks whether Rust can do the same and end
with a refresh token that logs on with no account name, the way 071 showed GameLib's existing
token does.

Already answered by 071: **GameLib's existing steam-session token logs on from Rust** (071a raw,
071c steam-vent) with no account name. So existing users would not have to sign in again.

## Research

- steam-vent has password + Steam Guard (`UnAuthenticatedConnection::login` with an
  `AuthConfirmationHandler`), **no QR helper**, and its unauthenticated service-call function is
  `pub(crate)`. So QR can't go over its CM connection without patching the crate.
- `IAuthenticationService` is also served over HTTPS at `api.steampowered.com` (form field
  `input_protobuf_encoded`, protobuf response, `x-eresult` header). steam-session supports the
  same transport. QR therefore needs no CM connection at all: `BeginAuthSessionViaQR` and
  `PollAuthSessionStatus` using steam-vent-proto's generated messages, plus `reqwest`.
- The CM logon after sign-in is the user logon that signs Mac Steam's Friends list out, so it
  runs inside the go-offline wrap (reimplemented in Rust, same rule: no logon unless the LogOff is
  seen within 5 s).

## How to Run

```bash
cargo build --release && ./target/release/spike-072-signin   # then open http://127.0.0.1:7172
```

The page has three cards (QR, Password + Steam Guard, Verify the new token), a results table and
the event log; `out/events.json` mirrors the log. The password and codes go from the browser to
this process only. The token stays in memory; the page shows only its length, `sub`, `aud`, `exp`.
`run1-events.json` is the operator's run (checked: no token, no password).

## Investigation Trail

1. **Self-test before involving the operator:** `BeginAuthSessionViaQR` over the Web API with
   platform `SteamClient` was accepted and returned a challenge URL; the QR rendered.
2. **First QR session expired unscanned** (the operator wasn't at the page yet). The harness kept
   working: the challenge rotated every ~22 s (`new_challenge_url`, QR redrawn), and the poll gave
   up cleanly at 180 s. That is real behaviour GameLib's UI must handle the same way.
3. **Second QR session: PASS.** Scanned 5.3 s after start, approved 5.3 s later. The refresh token
   is 494 chars with `aud = [client, web, renew, derive]`, the same audiences as a
   steam-session `SteamClient` token, and `account_name` was returned. GameLib could start storing
   the account name from here if it ever wanted 071b's crate.
4. **Password + Steam Guard: PASS.** Ran inside the wrap (LogOff seen in 300 ms). Steam offered
   `device code` and `device confirmation`. The page showed the code box; the operator **approved
   in the Steam app** instead, and steam-vent's login completed 16 s later. It polls the auth
   session itself while the handler waits for a code. Logged on with **485 licenses**. The
   harness recorded the guard type as `none` (key `credentials_none`): a harness labelling bug,
   because the type is only written when a code is typed. The event log shows what happened.
5. **Verify the password token: PASS.** A fresh connection logged on with it, no account name,
   485 licenses, inside the wrap.
6. **Not covered:**
   - The **QR token was never logged on by itself.** It was replaced in memory by the password
     token before Verify was clicked. Same `aud` and issuer, and a steam-session `SteamClient`
     token (also from QR) logs on fine (071a/c), so the risk is low.
   - **Typed codes:** the account uses the mobile authenticator, so an email code can't be
     tested on it. The device-code path (typing the 5-character code) was available but not used.
   - Two new authorized devices named "GameLib spike 072" now exist on the account.

## Results

**PARTIAL: the flows GameLib uses work from Rust; two branches are untested.**

| Requirement (2)/(3) | Result |
|---|---|
| QR sign-in → client refresh token | ✓ via the Web API, no CM, no crate patch; account name returned |
| Password + Steam Guard → refresh token | ✓ with app approval (steam-vent `login` + custom handler) |
| Typed mobile code | — offered, not exercised |
| Typed email code | — impossible on this account (mobile authenticator) |
| New token logs on, no account name | ✓ password token; QR token not separately |
| Existing steam-session token logs on | ✓ (071a, 071c) |

Signal for the build:

- **Do QR over the Web API**, not the CM. It works today without touching steam-vent, and it
  keeps sign-in independent of the CM client choice.
- Keep the challenge-rotation handling: Steam rotates the QR about every 22 s while unscanned.
- A confirmation handler should wait for a typed code **and** accept app approval in parallel,
  as steam-vent already does, so the UI can offer both, as GameLib's does now.
- Every sign-in that ends in a CM logon must go through the go-offline wrap on macOS; sign-in
  over the Web API alone does not need it (no user logon happens).
