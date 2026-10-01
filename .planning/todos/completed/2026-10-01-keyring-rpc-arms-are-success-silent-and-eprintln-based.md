---
created: 2026-10-01
title: 'The three keyring RPC arms are success-silent and `eprintln!`-based, so a successful Keychain write reaches neither log file'
found_during: closing 2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md (quick 261001-hd0), which carried this as a cross-reference and asserted it was "tracked separately" — it was not
severity: medium
platform: any
ready: code
area: observability
status: RESOLVED
resolved: 2026-10-01
files:
  - src-tauri/src/main.rs
---

## Measured

Verified at `5485e0200` while closing the QR-login observability todo, and reproduced in that
todo's own "Thematically related" section. In `src-tauri/src/main.rs` the three keyring RPC arms
log **only** on their error branches:

- the read arm, `keyring_get` (`:6471-6488`)
- the set arm, `keyring_set` (`:6489-6509`)
- the delete arm, `keyring_delete` (`:6510-6526`)

Each success path returns without emitting anything. All three use a bare `eprintln!` rather than
the `shell_diag()` helper.

## Why that is worse than an ordinary missing log line

Per the rule established in
`.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`, a bare
`eprintln!` in `main.rs` reaches stderr only. It therefore appears in **neither** `gamelib.log`
**nor** `gamelib-shell.log`, and a packaged build discards stderr entirely. So even the existing
error lines are unreadable in the shipped product; the success paths emit nothing anywhere.

This is why the macOS unified log (`/usr/bin/log`) was the only instrument that could observe a
Keychain write during the 2026-10-01 `debug/steam-token-survives-keychain` investigation. The
absence of a GameLib log line proved nothing about whether a write happened — a measured trap, not
a hypothetical one.

## Consequence

A credential-persistence failure cannot be told apart from a credential-persistence success by
reading either GameLib log file. The operator must reach for `/usr/bin/log` and correlate by pid
and timestamp.

## Direction, not decision

Two choices are open and neither is made here: (a) route these arms through `shell_diag()` so they
reach a log file at all, and (b) add success-path emission. Both are desk-closable. Whatever is
added must name the slot only — never the secret, never the retrieved value — matching the
discipline already applied to `devSecretVault.ts`'s `op=store`/`op=wipe` token (`afb0fe744`) and to
the Steam QR lines added in `261001-hd0`.

## Scope note

This is deliberately NOT a re-opening of the QR-login todo, which is closed and whose title was
fully satisfied: `src-tauri/src/main.rs` was out of scope there by locked operator decision. This
file exists so that todo's "tracked separately" claim is true rather than aspirational.

## Resolution (quick 261001-p0s, 2026-10-01)

Both halves named in "Direction, not decision" are taken. All four keyring RPC dispatch arms —
`keyring_get`, `keyring_set`, `keyring_delete`, and `keyring_available` — now route every
diagnostic through `shell_diag()` instead of a bare `eprintln!`, so they persist to
`gamelib-shell.log` instead of a packaged build silently discarding them. `keyring_get`,
`keyring_set`, and `keyring_delete` each additionally gained a success-path emission line naming
the channel, the allowlisted account, and a closed-set `outcome=` token (`found`/`absent` for
`keyring_get`, `stored` for `keyring_set`, `deleted`/`absent` for `keyring_delete`) — never the
secret, never the retrieved value, matching the `devSecretVault.ts` `op=store`/`op=wipe`
discipline this todo's own "Direction, not decision" section named as precedent.

**Scope extension, named explicitly rather than left as a silent widening:** `keyring_available`
was not one of this todo's three originally-measured arms, but was brought into the same
`shell_diag()` routing because it shared the identical bare-`eprintln!` defect. It deliberately
stops at the routing conversion and carries **no** success-token emission — its probe account is
never a real slot-scoped outcome worth a `KeyringOutcome` token, and its existing `Ok(_)` WARNING
branch is already the one event there worth reading. This asymmetry is itself pinned by the new
jest gate (see below), so a future edit cannot silently widen it to look like the other three arms
without a test failing first.

**Measured, not assumed, at every gate:** the keyring arm region (comment-stripped,
`"keyring_get" => {` through `"dialog_open" => {`) now carries exactly 0 bare `eprintln!`, 14
`shell_diag(` call sites, and 5 `keyring_outcome_message(` call sites — verified against the
pre-change source too (`bb567faf3` measures 9 bare `eprintln!`, 0
`shell_diag(`, 0 `keyring_outcome_message(` over the same region, confirming the new gate is
non-vacuous rather than trivially satisfied). `cargo fmt --check`'s pre-existing 76-hunk baseline
and `cargo clippy`'s pre-existing 15-warning baseline are both unchanged by this change, and
`cargo test`'s `274 filtered out` count is unchanged despite 6 new `keyring_`-prefixed tests
joining the 29-test `keyring_` population (0 failed, 2 ignored, both pre-existing).

**New CI-visible gate:** `src/backend/__tests__/keyringDiagPersistence.test.ts`, modeled on
`shellDiagPersistence.test.ts`'s structure (this project's CI runs no cargo step at all, so this
file is the part that actually runs on every push), pins the exact counts above, the
`keyring_available` asymmetry, byte-stable failure/warning literals, a leak-shape scan that no
`shell_diag(` call site carries `secret` or `get_password`, and signature pins on `KeyringOutcome`
and its two pure helpers (`keyring_outcome_message`, `keyring_get_outcome`).

**Five honest limits, named rather than implied:**

1. Verification here is entirely desk-level — pure-function unit tests plus static,
   comment-stripped source-shape assertions. No live run against a packaged build confirmed the
   new success lines actually land in `gamelib-shell.log` during a real Keychain read or write;
   that would be a `live-gate` item, not this `ready: code` fix.
2. The new jest gate is a textual/shape gate over comment-stripped `main.rs`, not a runtime gate.
   It cannot detect a rewrite that preserves the exact 0/14/5 counts while swapping which outcome
   token attaches to which branch (e.g. `keyring_get`'s Found/Absent arms silently reversed) — the
   counts would still read as green.
3. `keyring_available`'s scope extension stops at the `shell_diag()` conversion by design (see
   above); if a future need arises to log that probe's own outcome more precisely than its
   existing WARNING branch, that is still an open gap, not one this todo closes.
4. This project's CI runs no cargo step at all (the same fact `shellDiagPersistence.test.ts`
   already records) — `cargo fmt`/`cargo clippy`/`cargo test` correctness here was verified
   manually by the implementer during this change, not continuously enforced by a CI gate.
5. The root cause of the specific 2026-10-01 failed Steam QR login attempt that originally
   surfaced this gap (via the cross-referenced, now-closed QR-login observability todo) remains
   UNKNOWN, and whether a keyring success/failure line would have helped diagnose that particular
   incident is unverified. This todo closes the general observability gap across all four arms,
   not that one incident.

## Correction to the sha cited above (orchestrator, 2026-10-01)

`bb567faf3` is **not** the pre-Task-1 parent — it is an older ancestor, the fix commit of quick
`260930-q11`. The true parent of this task's first commit is `f90ed6f73`.

The RED-proof still holds, and it was re-measured rather than argued: the extracted keyring region
(`"keyring_get" => {` to `"dialog_open"`, whole-line `//` comments stripped) is **byte-identical at
both shas** — 3523 chars, 9 bare `eprintln!`, 0 `shell_diag(`, 0 `keyring_outcome_message(` at each
— against 4929 chars and 0 / 14 / 5 at HEAD. So the gate is non-vacuous either way; only the
commit's description of which sha it measured was wrong.

Recorded as a correction rather than silently edited, because a measurement attributed to the wrong
commit is a failure mode this repo has paid for repeatedly.
