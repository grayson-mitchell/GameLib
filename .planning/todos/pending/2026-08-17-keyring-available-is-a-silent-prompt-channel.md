---
created: 2026-08-17T00:00:00.000Z
title: "`keyring_available` reads the secret and PROMPTS, but logs only on failure — a successful probe is invisible to the log and to every absence-grep gate"
area: auth
severity: low
needs: code-fix
status: OPEN
found_by: "Quick task 260817-d61 live gate (Gate A coverage audit)"
source: ".planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md"
files:
  - src-tauri/src/main.rs
  - src/backend/sidecar/keyringTokenStore.ts
---

## Problem

`keyring_available` is not a cheap capability probe. It is a **full secret read**:

```rust
// src-tauri/src/main.rs:3131
"keyring_available" => {
    let account = keyring_account(keyring_slot_arg(args, 0))?;
    match Entry::new(KEYRING_SERVICE, account) {
        Ok(entry) => match entry.get_password() {      // <-- reads the secret; PROMPTS
```

It calls `entry.get_password()`, so on macOS it triggers a Keychain authorization prompt exactly
like `keyring_get` does. But `fetchAvailable()` (`keyringTokenStore.ts:203-221`) logs **only in its
`catch`**:

```ts
const result = await requestRustInvoke(RUST_KEYRING_AVAILABLE, [this.slot])
const value = result === true
this.cachedAvailable = { value }
return value                       // <-- no log line on the SUCCESS path
```

So a successful `keyring_available` prompts the user and leaves **no trace whatsoever** in
`gamelib.log`. Contrast `fetchToken()`, which announces itself at INFO before the invoke
(`issuing keyring_get (may prompt)`) precisely so a prompt can be attributed after the fact.

## Why it matters — this defeats a gate, not just an audit

Quick task `260817-d61` deferred the Steam keyring read off startup and proved it with an
absence-grep on `issuing keyring_get`. **That gate cannot see an `isAvailable()`-driven prompt at
all.** It is a correctly-computed, RED-proven, non-vacuous gate that measures a property narrower
than the one it appears to guard — the same failure shape already recorded in
`gate-can-be-nonvacuous-and-measure-wrong-property`.

Steam is unaffected **today, by luck rather than design**. Audited every non-test `.isAvailable()`
call site at the time of filing:

| Call site | Slot |
|---|---|
| `src/backend/humble/user.ts:115` (inside `storeHumbleSecret`, write-path only) | Humble |
| `src/backend/sidecar/humbleSecretStore.ts:73` (`SLOT_STORES.sessionCookie`) | Humble |

There is no Steam-slot caller. But nothing prevents one being added, and if one is, it will prompt
at bootstrap, silently, and `260817-d61`'s gate will keep reporting PASS.

## Direction

Two independent fixes; do both:

1. **Log the success path.** Mirror `fetchToken()`'s shape — announce `issuing keyring_available
   (may prompt) trigger=<label>` before the invoke and log the outcome with `elapsed=`. This makes
   every prompt in the process attributable, which is the whole point of `260817-d61`'s
   instrumentation.
2. **Widen the absence-grep.** Any gate asserting "no keyring prompt at startup" must count
   `keyring_available` as well as `keyring_get`. Update `260817-d61-LIVE-GATE.md`'s Gate A grep
   accordingly, and RED-prove the widened pattern against a specimen containing an
   `isAvailable()` line.

Consider also whether `keyring_available` needs to read the secret at all. Its own comment says
"Backend works, whether or not a token is currently stored" and it maps both `Ok(_)` and
`Err(NoEntry)` to `true` — it is asking "is the Keychain backend reachable", a question that may be
answerable without decrypting an item and thus without a prompt. If a non-prompting probe exists in
the `keyring` crate, that is the better fix and removes the channel entirely.

## Related

- `260817-d61` live gate: `.planning/quick/260817-d61-.../260817-d61-LIVE-GATE.md` (Finding 1)
- Memory `keyring-timeout-races-keychain-approval` — read this BEFORE investigating any Keychain
  prompt in this project; the dev-ACL cause is already diagnosed there.
- Sibling todo: `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`
