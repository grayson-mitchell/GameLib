---
created: 2026-08-14T20:10:00.000Z
title: "Steam keyring read is issued at bootstrap, not at point-of-use — the Keychain prompt arrives without user context and times out"
area: auth
needs: design-then-code-fix
status: OPEN
severity: minor
files:
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/storeManagers/steam/user.ts
---

## Problem

Carried forward from `keyring-read-timeout-reported-as-no-token.md` (fix direction 5), which was
RESOLVED by quick task `260814-r2d` on its other four points. That fix made a failed keyring read
**honest** — `unreadable` is no longer reported as `absent`, the session survives, and no token is
destroyed. It deliberately did **not** change *when* the read happens.

The underlying read-failure rate is therefore untouched. The observed ratio was **9 failed reads to
1 success** on the real `steam-refresh-token` slot:

```
7  getToken(): keyring_get failed: keyring:timeout
2  getToken(): keyring_get failed: keyring:unavailable:Platform secure storage failure
1  getToken(): keyring_get ok present=true len=497
```

## Hypothesis

The read is issued during bootstrap, so the macOS Keychain prompt appears with no user-visible
context explaining what is asking or why. A prompt like that is easy to ignore or dismiss, and
dismissal/inaction is what produces `keyring:timeout` and the Deny path
(`keyring:unavailable:Platform secure storage failure`, `PlatformFailure(-128)`).

If the read were instead issued when the user actually does something Steam-related, the prompt
would arrive with obvious context and be far likelier to be approved promptly.

**This is a hypothesis, not a diagnosis.** It should be measured before it is built — the prompt
timing may not be the dominant factor.

## Constraints carried from the resolved todo

- Raising the Rust-side read bound is **not** the fix. It was already raised to 45s
  (`src-tauri/src/main.rs`, `KEYRING_READ_TIMEOUT`) and 7 of the 9 timeouts postdate that change.
- The 120s failure memo (`KEYRING_FAILURE_MEMO_MS`) must keep suppressing the second Keychain
  prompt — that is `F-34.5-G6-06`, and a memo hit must continue to issue zero `keyring_get`.
- No env-var/in-memory/plaintext fallback (D-08 / `REQ-28-07`). An unreadable read fails closed.
- `keyringTokenStore.ts` must keep importing no `configStore`/`TOKEN_STORE_KEY` (`REQ-28-02`).

## Related

- Resolved parent: `.planning/todos/completed/keyring-read-timeout-reported-as-no-token.md`
- Quick task: `.planning/quick/260814-r2d-fix-keyring-read-timeout-treated-as-no-t/`
- Phase 34.5 ledger rows `U-34.5-01` / `U-34.5-10` (the keyring-arm session that would measure
  prompt behaviour); plan `34.5-58` prescribes the operator session.
