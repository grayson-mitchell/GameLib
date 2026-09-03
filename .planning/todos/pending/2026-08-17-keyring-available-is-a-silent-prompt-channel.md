---
created: 2026-08-17T00:00:00.000Z
title: "`keyring_available` reads the secret and PROMPTS, but logs only on failure — a successful probe is invisible to the log and to every absence-grep gate"
area: auth
severity: low
needs: code-fix
status: "PARKED 2026-09-04 — Direction item 2 (widen the absence-grep) parks with its sibling todo, because the startup-prompt gate it would widen has had its premise withdrawn by the Phase 999.1 offline-mode design. Direction item 1 (log the keyring_available success path) is NOT parked — it is a standalone observability defect that survives every outcome of that decision. See the PARKED section below."
found_by: "Quick task 260817-d61 live gate (Gate A coverage audit)"
source: ".planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md"
files:
  - src-tauri/src/main.rs
  - src/backend/sidecar/keyringTokenStore.ts
---

## PARKED 2026-09-04 — with one item explicitly NOT parked

Parked alongside its sibling (`2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`)
because **Direction item 2** — widening `260817-d61`'s absence-grep to count `keyring_available`
— only has meaning while a "no keyring prompt at startup" gate exists to widen. Under the
Phase 999.1 offline-mode design that gate's premise is withdrawn (see the sibling's park note),
so item 2 has nothing left to measure.

**Direction item 1 is NOT parked, and must not be buried by this file's status.**
`keyring_available` calls `entry.get_password()` (`src-tauri/src/main.rs`), so it prompts exactly
like `keyring_get` — but `fetchAvailable()` (`keyringTokenStore.ts`) logs only in its `catch`, so
a successful probe leaves no trace in `gamelib.log` at all. That is an observability defect on its
own terms: it makes a real, user-visible Keychain prompt unattributable after the fact, whether or
not any deferral gate exists anywhere in the codebase. It survives every outcome of the
offline-mode decision — and under Phase 999.1, where auth deliberately happens at boot, being able
to attribute each prompt matters MORE, not less.

The same holds for this file's closing suggestion: `keyring_available` maps both `Ok(_)` and
`Err(NoEntry)` to `true`, i.e. it is really asking "is the Keychain backend reachable" — a
question that may be answerable without decrypting an item. A non-prompting probe would remove
the channel entirely and is strictly better than logging it.

**Unpark condition:** item 2 unparks with the sibling. Item 1 was never parked.

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
