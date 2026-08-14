---
created: 2026-08-14T19:30:00.000Z
title: "Steam under Tauri: a keyring_get TIMEOUT is reported as 'no stored refresh token' — false logged-out state and credential churn"
area: auth
needs: code-fix
status: RESOLVED
resolved: 2026-08-14T19:56:00.000Z
resolved_by: quick-260814-r2d
severity: major
files:
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/storeManagers/steam/user.ts
  - src-tauri/src/main.rs
---

## Problem

Under the Tauri build, Steam presents as logged out even though a valid refresh token was
successfully written to the Keychain. The user re-logs-in, it works, it is lost again on the next
launch. Reported as "I don't see how it wouldn't have logged in MANY times" — and they had; the
logins were real and the writes succeeded.

**A `keyring_get` timeout is being surfaced as "no token stored".** The two states are
indistinguishable downstream, so a transient read failure reads as "never logged in".

## Evidence — observed read outcomes for the `steam-refresh-token` slot

Across `~/Library/Logs/GameLib/gamelib.log*`:

```
7  getToken(): keyring_get failed: keyring:timeout
2  getToken(): keyring_get failed: keyring:unavailable:Platform secure storage failure...
1  getToken(): keyring_get ok present=true len=497
```

**9 failures to 1 success.** The failure is the normal case, not the edge case.

## Timeline, 2026-08-14 — the token was written, read once, then lost

```
19:03:01  keyring arm      getToken(): keyring_get ok present=true len=497   <- worked
19:06:45  clearToken(): keyring_delete ok
19:06:56  clearToken(): keyring_delete ok
19:09:36  setToken(): keyring_set ok len=497                                 <- written fine
19:10:36  getToken(): issuing keyring_get (may prompt)
19:11:21  keyring_get failed: keyring:timeout
19:11:21  keyring failure memoized slot=steam-refresh-token class=timeout ms=120000
19:11:21  WARNING  Steam: logged in but no stored refresh token — cannot reconnect
19:14:25  clearToken(): keyring_delete ok                                    <- token gone
21:23:55  keyring arm      -> 21:24:40 same timeout, same "cannot reconnect"
21:42:53  DevVaultTokenStore (vault is empty {}) -> "cannot reconnect"
22:34:19  DevVaultTokenStore
```

The Keychain now holds `humble-session` and `humble-csrf` but **no `steam-refresh-token`** — the
slot name is real (`keyringTokenStore.ts:22`, `KEYRING_SLOT_STEAM_REFRESH_TOKEN`), it is simply
empty.

## Three compounding faults

1. **Timeout is conflated with absence.** `getToken()` returns `''` on timeout, and
   `user.ts` logs "logged in but no stored refresh token — cannot reconnect". Nothing distinguishes
   *could not read* from *nothing to read*. This is the root fault.
2. **The failure memo makes it sticky.** `KEYRING_FAILURE_MEMO_MS = 120_000` suppresses retries
   for two minutes after a failure, so the first slow Keychain prompt poisons the whole session
   rather than being retried once the user approves.
3. **The credential then gets destroyed.** The natural user response to a false logged-out state is
   to log out and back in, which issues `clearToken()`. That is how the token present at 19:03
   ended up deleted at 19:14. Whether or not the delete is app- or user-initiated, the *cause* is
   fault 1.

## Why the existing note undersells it

The known project note frames keyring timeouts as a **dev-build pestering artifact** ("keyring
timeout races Keychain approval; keep Keychain in production"). That is true but incomplete: the
consequence is not just prompt noise, it is **false logged-out state and credential loss**. The
9:1 ratio means the token is more likely to be lost than read.

Note also that raising the Rust-side read bound to 45s (done by an earlier plan) did **not** fix
it — 7 timeouts postdate that change. Raising the bound is not the fix.

## Fix direction

1. **Make the three states distinct in the type, not just the log**: `present` / `absent` /
   `unreadable`. `getToken(): Promise<string>` cannot express this — `''` is doing double duty.
   Return a discriminated result and make callers handle `unreadable` explicitly.
2. **Never treat `unreadable` as logged-out.** Keep the session's logged-in state and surface a
   retry, rather than telling the user they are not logged in.
3. **Never `clearToken()` on the back of a failed read**, and audit whether any code path does so
   transitively via a logout triggered by the false state.
4. **Do not memoize a timeout as authoritative.** A timeout means "unknown", so the memo should at
   most rate-limit the prompt, not answer subsequent reads.
5. Consider whether the read should be lazy — issued when Steam is actually used rather than at
   bootstrap, so the Keychain prompt arrives with user context and is far likelier to be approved.

## Also observed

`keyring:unavailable:Platform secure storage failure` (×2) is the Keychain **Deny** path
(PlatformFailure(-128)). Same conflation applies: a denial is not an absent token.

## Resolution — 2026-08-14, quick task `260814-r2d`

Commits `904dbd867`, `7020c22a9`, `8dc617b4b`. Fix directions **1–4 are done; 5 is NOT** — see below.

- **1. Three states distinct in the type — DONE.** `TokenReadOutcome = present | absent | unreadable`
  (`tokenStore.ts:54-57`), added as an OPTIONAL seam member (`readToken?()`) plus a shared
  `readTokenOutcome()` fallback, so Humble's `getSecret()` and `ElectronTokenStore` keep their `''`
  semantics and compile unchanged. `getToken()`'s `''` contract is byte-identical by design.
- **2. Never treat `unreadable` as logged-out — DONE.** `ensureConnected()` branches on the outcome
  and keeps the signed-in session (`user.ts:177-189`), logging a message that deliberately does not
  contain "no stored refresh token".
- **3. Never `clearToken()` on a failed read — DONE, and audited.** The transitive audit the todo
  asked for was performed by grep over `clearToken(`/`clearSecrets(`/`SteamUser.logout`. Finding:
  the sole caller clearing the Steam refresh token is `SteamUser.logout()` (`user.ts:276`), reachable
  only from the user-facing sign-out action via the `logoutSteam` channel — registered in **two**
  places (`main.ts:920` Electron, `steamAuthFlowRegistration.ts:184` Tauri sidecar; the second was a
  correction to the plan's own reading). **No code path clears the token as a consequence of a failed
  read.** The 19:14:25 delete in the timeline above was the user reacting to the false logged-out
  state, i.e. downstream of fault 1, now fixed.
- **4. Do not memoize a timeout as authoritative — DONE.** A memo hit answers
  `unreadable/<original reason>`, never `absent` (`keyringTokenStore.ts:283`). The memo still
  rate-limits the Keychain prompt — its original purpose, `F-34.5-G6-06` — because a memo hit issues
  zero `keyring_get`. Only the answer served changed, not the window (still 120s) or the suppression.
- **5. Lazy read at point-of-use — NOT DONE.** Carried forward as its own todo
  (`keyring-read-lazy-at-point-of-use.md`). This one attacks *why* the prompt times out rather than
  how the failure is reported, so the 9:1 failure ratio may well persist until it is addressed. What
  this fix guarantees is that a failure no longer costs the user their token.

No env-var/in-memory/plaintext fallback was introduced — an unreadable read fails closed (D-08 /
`REQ-28-07` upheld), and `keyringTokenStore.ts` still imports no `configStore`/`TOKEN_STORE_KEY`
(`REQ-28-02`). `src-tauri/src/main.rs` was NOT touched: the 45s `KEYRING_READ_TIMEOUT` stands, per
this todo's own finding that raising the bound is not the fix.

Full suite 249/249 suites, 4859 passed, `tsc --noEmit` clean. Independently re-verified after the
fact: the three touched suites re-run 142/142 PASS.

## Reference

Discovered 2026-08-14 while investigating why no `steam-refresh-token` existed in the Keychain,
during a `/gsd-verify-work 34.1` session. Also removed in that session: a hand-created
`steam-refresh-token-selfcheck` Keychain item (a Phase 28 gate artifact — not written by the app,
since `keyring_account()`'s allowlist admits only the three real slots).
