---
created: 2026-10-01
title: 'A failed Steam QR login is undiagnosable from gamelib.log — no line records an attempt was even made'
found_during: closing debug/steam-token-survives-keychain (2026-10-01), filed by quick 261001-90h
severity: medium
platform: any
ready: code
area: observability
files:
  - src/backend/storeManagers/steam/user.ts
  - src-tauri/src/main.rs
---

## Measured

The operator's first QR login attempt on 2026-10-01 failed. `gamelib.log` holds no error, no
warning, and no trace of any kind between the boot line at 06:10:24 and the Steam logout line at
06:12:10. The subsequent, successful attempt shows a dev-vault write line for the Steam
refresh-token slot at 06:14:24, a Steam client logged-on line at 06:14:31, and a library refresh
at 06:14:33. Timestamps and line shapes only — no raw log line carrying credential material is
reproduced here.

## Correction to the original briefing — do not repeat the refuted claim

The investigation that led to this todo was originally briefed on the premise that the QR error
paths updated internal state on failure without producing any corresponding log output. **That
premise is false at HEAD.** Verified in `startQRLogin()`
(`src/backend/storeManagers/steam/user.ts:492-568`):

- `:545-548` warns when the background CM connect fails, through `logWarning`.
- `:551` logs the auth-finalization failure, through `logError`.
- `:557` logs the session timeout (`'Steam QR session timed out'`), through `logWarning`.
- `:562` logs the session error, through `logError`.
- `:568` logs a `startQRLogin` throw, through `logError`.

All five branches log. This todo's subject is a narrower, real gap, not the one originally
briefed.

## What is and is not instrumented

Since the five error branches above all log, and since the dev-vault's own lines prove
`logWarning` reaches `gamelib.log` in this very run (see the sibling todo cross-referenced below),
the 2026-10-01 failed attempt cannot have traversed any of those five branches — had it, there
would be a line. What is genuinely un-instrumented is everything else:

- `startQRLogin()` emits nothing on entry, and nothing on its success return at `:566`. There is
  no line anywhere in the function saying a QR login was attempted or that a challenge URL was
  issued.
- `pollQRLogin()` (`:575-590`) emits nothing at any status, including when it returns the `error`
  status to the caller.
- An attempt abandoned client-side, or one still sitting in the `waiting` state when the operator
  gives up, therefore leaves no trace at all in `gamelib.log`.

The arithmetic that makes the 2026-10-01 silence explicable without asserting a cause:
`session.loginTimeout` is set to `120000` ms at `:506`, while the failed attempt's window is
bounded above by the 06:10:24 boot line and the 06:12:10 logout — 106 seconds. That window is
shorter than the 120-second timeout, so the `:557` timeout-log line could not yet have fired when
the operator gave up. This explains the silence; it is explicitly **not** a root cause.

## Root cause: UNKNOWN

The root cause of the specific 2026-10-01 failed attempt is UNKNOWN. It is not guessed at here,
and no candidate cause is listed as though it were a finding. This todo's subject is the
observability gap — the fact that a failed attempt leaves nothing to read — not the one incident
itself. A later reader should not close this file by explaining that one attempt; closing it
requires instrumenting the un-instrumented paths above.

## Consequence

A user-reported Steam login failure cannot be diagnosed from `gamelib.log` at all today. The
first trace of any QR login anywhere in the log is the dev-vault write line, and that line is
itself ambiguous between a store and a wipe — see
`.planning/todos/pending/2026-10-01-dev-secret-vault-write-log-line-cannot-tell-a-store-from-a-wipe.md`.
The two gaps compound: a failed attempt is invisible, and a successful attempt's first trace
cannot be told apart from a logout.

## Thematically related: the keyring RPC arms are failure-only too

One short section, verified before asserting; kept to a cross-reference and not expanded here. In
`src-tauri/src/main.rs`, the three keyring RPC arms log only on their error branches: the read arm
(`keyring_get`, `:6471-6488`), the set arm (`keyring_set`, `:6489-6509`), and the delete arm
(`keyring_delete`, `:6510-6526`). Each success path returns without emitting anything. All three
use a bare `eprintln!` rather than the `shell_diag()` helper — verified at those exact lines. Per
`.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`'s
established rule, a bare `eprintln!` in `main.rs` reaches stderr only, so it appears in neither
`gamelib.log` nor `gamelib-shell.log`, and a packaged build discards stderr entirely. This is why
the macOS unified log was the only instrument that could observe a Keychain write during the same
investigation.

## Why medium

An entire failure class — a QR login that never completes — is invisible in the primary log, and
a workaround exists today: instrument the path, or fall back to the macOS unified log. Medium
rather than major because no shipped behaviour is broken and no measurement is silently
contaminated; what is lost is the ability to diagnose after the fact.

## Why `ready: code`

The gap is closable at the desk: the missing lines are ordinary `logInfo`/`logWarning` calls to
add inside `startQRLogin` and `pollQRLogin`. Reproducing the original 2026-10-01 failure is
explicitly NOT what this todo asks for — that is why it is not `ready: live-gate`.

## Direction, not decision

Whatever instrumentation is added must not log the challenge URL, the refresh token, or any other
session material — slot/state names only, matching the discipline the sibling dev-vault todo
already applies. The shape of the fix (entry/exit logging in `startQRLogin`, status-transition
logging in `pollQRLogin`, or both) is left open.
