---
created: 2026-08-17T00:00:00.000Z
title: "`keyring_available` reads the secret and PROMPTS, but logs only on failure — a successful probe is invisible to the log and to every absence-grep gate"
area: auth
severity: low
needs: code-fix
status: "CLOSED 2026-09-05 — both Direction items done. Item 1 (log the success path) by quick-260905-jx3 (0fdbdac36); item 2 (widen the absence-grep) by quick-260905-kd0. Item 2 was PARKED 2026-09-04 behind Phase 999.1 and that deferral was deliberately OVERRIDDEN: 999.1 is a BACKLOG phase (ROADMAP.md:5010), unscheduled and unplanned. NOT closed by this: the non-prompting reachability probe, still the strictly better fix, and the missing pre-invoke announcements on keyring_set/keyring_delete — both recorded in the ledger and in kd0's SUMMARY."
found_by: "Quick task 260817-d61 live gate (Gate A coverage audit)"
source: ".planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-LIVE-GATE.md"
files:
  - src-tauri/src/main.rs
  - src/backend/sidecar/keyringTokenStore.ts
---

## CLOSED 2026-09-05 — item 1 by quick-260905-jx3 (0fdbdac36), item 2 by quick-260905-kd0

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
2. ~~**Widen the absence-grep.**~~ **DONE 2026-09-05, quick-260905-kd0.** The 2026-09-04 deferral
   behind Phase 999.1 was overridden: 999.1 is a BACKLOG phase (`ROADMAP.md:5010`), unscheduled and
   unplanned, and a deferral resting on an item that may never land is not a reason to leave a
   known-blind gate blind. **Item 1 was a hard prerequisite, not merely a predecessor** — before
   `0fdbdac36` a successful `keyring_available` emitted nothing, so an absence-assertion over it
   would have been vacuously true by construction: a false green.

   The widening found this very remedy **too narrow**. The prompt surface is **four** channels, not
   two: `setToken()`'s and `clearToken()`'s own source comments state that a write and a delete are
   each "a real Keychain round trip" that "can prompt", and `clearToken()`'s records a 2026-08-14
   session observing two prompts during a single Steam sign-out. Gate A's pattern now covers all
   four, calibrated against two specimens (the real 2026-08-17 pre-fix log, and one generated from
   the code rather than retyped). A CI-visible ledger test in
   `src/backend/sidecar/__tests__/keyringTokenStore.test.ts` fails if a fifth is ever added, so the
   rule no longer depends on anyone re-reading a quick-task markdown file from August. Any gate asserting "no keyring prompt at startup" must count
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

## Still open elsewhere — deliberately NOT absorbed into this todo's closure

1. ~~**A non-prompting reachability probe.**~~ **DONE 2026-09-05, quick-260905-l8g (`8eba75f9c`).**
   The channel no longer prompts at all. `keyring_available` now probes a
   deliberately-never-written account — no item, therefore no ACL, therefore no dialog — measured
   live at 16.28 / 15.12 / 16.75 / 18.08 ms with `Err(NoEntry)` every time, against 48.87 s /
   291.08 s for the old present-account read. Since a Keychain dialog blocks until it is answered,
   a probe returning in milliseconds provably did not raise one. Three guards keep the probe
   account absent; two of them were silently excluded by `cargo test keyring`'s substring filter
   until renamed. This makes items 1 and 2 above mitigations of a defect that no longer exists —
   they are kept because they still make a boot-time round trip visible, and because they are what
   would show this channel regressing to the prompting path.
2. **`keyring_set` / `keyring_delete` have no pre-invoke `(may prompt)` announcement.** Both can
   prompt and both log only after the round trip. That is sufficient for an ABSENCE gate — a
   completed round trip always leaves a line — but it cannot attribute a prompt the user is
   looking at right now, which was the whole argument for item 1. Recorded in the ledger.
3. **Gate A has not been re-run live** against the widened pattern. It is an operator procedure
   needing a real Keychain and a logged-in Steam account. This work makes the gate correct; it
   does not claim to have re-executed it.
