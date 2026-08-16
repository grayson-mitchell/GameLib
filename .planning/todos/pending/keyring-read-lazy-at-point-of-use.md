---
created: 2026-08-14T20:10:00.000Z
title: 'Steam keyring read is issued at bootstrap, not at point-of-use — the Keychain prompt arrives without user context and times out'
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
destroyed. It deliberately did **not** change _when_ the read happens.

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

## Status (2026-08-17)

Quick task `260817-d61` shipped the deferral and the instrumentation this
todo asked for:

- The Steam keyring read is now deferred off `SteamLibraryManager.init()`'s
  `runOnceWhenOnline` background-sync path and off a LOCKED `refresh()`
  (both the mount-time `refreshLibrary` and the startup sync now issue ZERO
  `keyring_get`). The read fires on the first deliberate Steam action instead
  (explicit Refresh, Games nav tab, Redeem Key, Install, Update, Play,
  game-page open, Steam login) — see `src/backend/storeManagers/steam/authTrigger.ts`.
- Every `keyring_get` issue/outcome/memo log line in
  `src/backend/sidecar/keyringTokenStore.ts` now carries `trigger=` (what
  triggered it) and `elapsed=` (how long it took), giving the deferred
  operator session below something to grep.
- All five hard constraints from this todo (raised timeout NOT the fix,
  120s failure memo intact, no env-var fallback, no `configStore` reach,
  three-valued `readTokenOutcome` preserved) hold — see
  `.planning/quick/260817-d61-defer-the-steam-keyring-read-from-startu/260817-d61-SUMMARY.md`.

**This todo stays OPEN.** Nothing above proves the Keychain prompt actually
moved off bootstrap, that it is approved more often, or that the observed
9:1 failure ratio improved — `GAMELIB_DEV_SECRET_VAULT=1` bypasses the
Keychain entirely in every dev/CI run, so this defect class cannot reproduce
or be disproven in a jest suite. What remains is the operator measurement
session on real hardware (`U-34.5-01` / `U-34.5-10`, plan `34.5-58`),
reading the `trigger=`/`elapsed=` lines this quick task now emits — not
further code.
