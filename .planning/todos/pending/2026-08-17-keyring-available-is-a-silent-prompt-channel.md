---
created: 2026-08-17T00:00:00.000Z
title: "`keyring_available` reads the secret and PROMPTS, but logs only on failure — a successful probe is invisible to the log and to every absence-grep gate"
area: auth
severity: low
needs: code-fix
status: "ACTIVE (unparked 2026-09-05) — Direction item 1 (log the keyring_available success path) is OPEN and re-verified live at 2026-09-05; it is a standalone observability defect that survives every outcome of the Phase 999.1 offline-mode decision. Direction item 2 (widen the absence-grep) remains DEFERRED behind that decision, as recorded below — the file as a whole is no longer parked."
found_by: "Quick task 260817-d61 live gate (Gate A coverage audit)"
source: ".planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md"
files:
  - src-tauri/src/main.rs
  - src/backend/sidecar/keyringTokenStore.ts
---

## UNPARKED 2026-09-05 — re-raised, re-verified live, item 1 is open

Re-raised 2026-09-05 and re-checked against the tree. **The defect is unchanged and live.**

- `keyring_available` still calls `entry.get_password()` — `src-tauri/src/main.rs:5369-5386`
  (the handler moved from 3131; the read is at `:5372`).
- `fetchAvailable()` still logs **only** in its `catch` — `src/backend/sidecar/keyringTokenStore.ts:211-233`
  (moved from 203-221). The success path writes `this.cachedAvailable` and returns, with no log
  line of any kind.

**Direction item 1 is OPEN and is why this file is no longer parked.** It is an observability
defect on its own terms: it makes a real, user-visible Keychain prompt unattributable after the
fact, whether or not any deferral gate exists anywhere in the codebase. It survives every outcome
of the offline-mode decision — and under Phase 999.1, where auth deliberately happens at boot,
being able to attribute each prompt matters MORE, not less.

**Direction item 2 stays DEFERRED, and that is the only thing the 2026-09-04 park still governs.**
Widening `260817-d61`'s absence-grep to count `keyring_available` only has meaning while a "no
keyring prompt at startup" gate exists to widen. Under the Phase 999.1 offline-mode design that
gate's premise is withdrawn (see the sibling todo's park note), so item 2 has nothing left to
measure. It un-defers with the sibling, `2026-08-17-humble-slots-still-prompt-unattended-at-startup.md`.

The same holds for this file's closing suggestion: `keyring_available` maps both `Ok(_)` and
`Err(NoEntry)` to `true`, i.e. it is really asking "is the Keychain backend reachable" — a
question that may be answerable without decrypting an item. A non-prompting probe would remove
the channel entirely and is strictly better than logging it.

## Problem

`keyring_available` is not a cheap capability probe. It is a **full secret read**:

```rust
// src-tauri/src/main.rs:5369  (re-verified 2026-09-05)
"keyring_available" => {
    let account = keyring_account(keyring_slot_arg(args, 0))?;
    match Entry::new(KEYRING_SERVICE, account) {
        Ok(entry) => match entry.get_password() {      // <-- reads the secret; PROMPTS
```

It calls `entry.get_password()`, so on macOS it triggers a Keychain authorization prompt exactly
like `keyring_get` does. But `fetchAvailable()` (`keyringTokenStore.ts:211-233`) logs **only in its
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

Steam is unaffected **today, by luck rather than design**. Census of every non-test
`.isAvailable()` call site, **re-run 2026-09-05** (line numbers refreshed; one new site since
filing):

| Call site | Slot | Prompts? |
|---|---|---|
| `src/backend/humble/user.ts:116` (inside `storeHumbleSecret`, write-path only) | Humble | yes |
| `src/backend/sidecar/humbleSecretStore.ts:76` (`SLOT_STORES.sessionCookie`) | Humble | yes |
| `src/backend/sidecar/steamgridSecretStore.ts:71` (`SidecarSteamGridDbSecretStore.isAvailable()`) | steamgrid-api-key | **no** — the seam declares this member synchronous, so it returns `true` optimistically and never reaches `SidecarKeyringSlotStore.isAvailable()` |

There is still no prompting Steam-slot caller. The steamgrid store is the near miss: it addresses
a non-Humble slot and is named as if it probes, but its synchronous interface is the only reason
it does not. If that member is ever made async and wired to the real probe, it will prompt at
bootstrap, silently, and `260817-d61`'s gate will keep reporting PASS.

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
