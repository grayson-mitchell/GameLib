---
created: 2026-08-17T00:00:00.000Z
title: "`keyring_available` reads the secret and PROMPTS, but logs only on failure — a successful probe is invisible to the log and to every absence-grep gate"
area: auth
severity: low
needs: code-fix
status: "OPEN, item 1 DONE — Direction item 1 (log the keyring_available success path) was FIXED 2026-09-05 by quick-260905-jx3 (0fdbdac36). Direction item 2 (widen the absence-grep) remains DEFERRED behind the Phase 999.1 offline-mode decision and is the only thing left in this file. Do NOT close the file on item 1's fix."
found_by: "Quick task 260817-d61 live gate (Gate A coverage audit)"
source: ".planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md"
files:
  - src-tauri/src/main.rs
  - src/backend/sidecar/keyringTokenStore.ts
---

## ITEM 1 FIXED 2026-09-05 (quick-260905-jx3, 0fdbdac36) — item 2 is all that remains

Re-raised 2026-09-05, re-verified live, then fixed. History in one place:

- **2026-08-17** filed. **2026-09-04** parked — but with item 1 explicitly carved out as not
  parked. The carve-out was invisible to every reader that takes the leading token of `status:`
  as the file's whole state, and the item was re-captured verbatim on **2026-09-05** by someone
  who did not know this file existed.
- **2026-09-05, re-verification.** Defect unchanged and live. `keyring_available` still reached
  `entry.get_password()` at `src-tauri/src/main.rs:5372`; `fetchAvailable()` still logged only in
  its `catch` at `src/backend/sidecar/keyringTokenStore.ts:211-233`. All line refs in this file
  were stale by 2 000+ lines; refreshed in `eb1a9dfd3`.
- **2026-09-05, item 1 FIXED** by quick-260905-jx3 (`0fdbdac36`).

**What item 1's fix actually shipped.** `fetchAvailable()` now mirrors `fetchToken()`'s shape:
an INFO `issuing keyring_available (may prompt) trigger=<label>` line **before** the invoke, and
an INFO `keyring_available ok available=<bool> trigger= elapsed=<n>ms` line on success — on both
outcomes, because a successful `false` is D-06's honest unavailable, a completed probe that
already prompted. `trigger=`/`elapsed=` were appended to the existing catch warning after its
pre-existing text, so every grep substring that already targeted that line stays load-bearing
verbatim. `isAvailable()` additionally logs its cache-hit and joined-in-flight early returns at
DEBUG, so a zero-prompt run is attributable to a warm cache rather than ambiguous with "no probe
was issued". An optional `context?: string` trigger label is threaded through both
`TokenStore.isAvailable()` and `HumbleSecretStore.isAvailable()`; no implementer changed arity.
10 tests added, each RED-proven by reverting the exact line it covers (5 mutations).

**The better fix was NOT attempted and is still available.** This file's own closing suggestion —
replace `entry.get_password()` with a non-prompting reachability probe — removes the prompt
channel rather than logging it, and remains strictly superior. It is a Rust behaviour change
needing its own live verification, so it was deliberately left out of a logging task. If someone
takes it up, item 1's logging stays useful (it attributes whatever prompts remain) but its
urgency drops to zero.

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

Two independent fixes.

1. ~~**Log the success path.** Mirror `fetchToken()`'s shape — announce `issuing keyring_available
   (may prompt) trigger=<label>` before the invoke and log the outcome with `elapsed=`.~~
   **DONE 2026-09-05, quick-260905-jx3 (`0fdbdac36`).** See the section at the top of this file.
2. **Widen the absence-grep.** STILL OPEN, deferred behind the Phase 999.1 offline-mode decision. Any gate asserting "no keyring prompt at startup" must count
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
