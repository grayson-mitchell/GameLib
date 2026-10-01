---
created: 2026-10-01
title: 'The three keyring RPC arms are success-silent and `eprintln!`-based, so a successful Keychain write reaches neither log file'
found_during: closing 2026-10-01-a-failed-steam-qr-login-leaves-no-trace-in-gamelib-log.md (quick 261001-hd0), which carried this as a cross-reference and asserted it was "tracked separately" — it was not
severity: medium
platform: any
ready: code
area: observability
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
