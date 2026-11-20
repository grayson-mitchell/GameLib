# Phase 79: Rust CM client replacing steam-user and steam-session - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 79-rust-cm-client-replacing-steam-user-and-steam-session
**Areas discussed:** Session lifetime, Sign-in paths & tokens, macOS go-offline wrap, Scope edges

Gate noted at the start: spike 085 Run C (3 h hold) had no log, and Results was a placeholder.
Discussion went ahead, and planning stays blocked.

Todo cross-reference: `2026-11-07-spike-refresh-via-running-steam-client.md`. The operator chose
"Fold into Phase 79".

---

## Session lifetime

| Option | Description | Selected |
|--------|-------------|----------|
| Keep lease + idle close | Today's on-demand lease, 60 s idle close | |
| App-lifetime session | One logon held; GameLib owns long-hold liveness | |
| You decide | Claude picks in planning | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Detect + reconnect, retry once | Probe, new connection + token logon with backoff, retry once; 34 = stop | ✓ |
| Detect + fail the call | Mark dead, fail in-flight, next lease reconnects | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust owns the whole session | Connection, liveness, reconnect, leases, idle close in the crate | ✓ |
| Rust connection, TS rules | Phase 75 D-01 shape; user.ts keeps policy | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Separate anonymous session, idle close | Today's shape | ✓ |
| Reuse the signed-in session when open | One fewer socket, two code paths | |
| You decide | | |

---

## Sign-in paths & tokens

Before answering, the operator asked how the Web API and steam-vent CM login options for
credentials compare. Claude's summary:

- The Web API is today's behaviour. It has no CM logon or wrap, causes no `logonID` collision
  during the fallback window, uses one flow shape with QR, and keeps the EResult mapping. It
  means more hand-written code (RSA, guard states).
- steam-vent's login is less code. But it makes sign-in a wrapped CM logon with two flow shapes,
  and nobody has verified that it returns a `SteamClient` refresh token.

Claude recommended the Web API.

| Option | Description | Selected |
|--------|-------------|----------|
| Web API, like QR | steam-session parity; no CM at sign-in | ✓ |
| steam-vent CM login | Less code; wrapped CM logon | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep today's one wrapped logon | Persona read bounded 5 s; account-name fallback | ✓ |
| Defer to the next lease | No logon at sign-in | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parity: reuse, no renewal | Existing tokens log on unchanged; expiry → credentialsMissing | ✓ |
| Add token renewal | Renew near expiry; adds scope | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, parity | Nothing persisted | ✓ |
| Persist in the keyring | Skip email code next time | |

---

## macOS go-offline wrap

| Option | Description | Selected |
|--------|-------------|----------|
| Retest in-phase, then decide | Unwrapped full-Refresh live gate item; delete if Friends survives | ✓ |
| Keep it unconditionally | Port as is | |
| Drop it now | Trust 074/081 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port to Rust | Whole wrap incl. owed-goonline record moves to the crate | ✓ |
| Rust calls back into TS | New Rust→TS callback channel | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reconnect goes through the wrap | Never a silent logon; refusal → guided-offline error | ✓ |
| Fail the call instead on macOS | No reconnect on macOS with Mac Steam running | |

---

## Scope edges

| Option | Description | Selected |
|--------|-------------|----------|
| CM calls only; HTTP enrichment stays TS | Smaller; enrichment later | |
| Move all of Refresh to Rust | reqwest replaces axios for Steam Refresh | ✓ |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Primary on macOS, CM fallback | GetSubscribedApps filtered to games; F2P shown | ✓ |
| Demo correction only | CM stays primary | |
| Primary, but exclude F2P | Needs per-app lookup | |

| Option | Description | Selected |
|--------|-------------|----------|
| Later slice | Polling stays TS | ✓ |
| Move them here | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two flags: sign-in, CM session | 75 D-08 shape; non-zero logonID on steam-user meanwhile | ✓ |
| One flag for everything | | |
| Per surface | | |

Follow-ups after the Refresh scope grew:

| Option | Description | Selected |
|--------|-------------|----------|
| One phase, sequenced | CM+sign-in → Rust Refresh → Mac Steam path → delete gate | ✓ |
| Split off 79.1 | Refresh touched twice | |

| Option | Description | Selected |
|--------|-------------|----------|
| Finished library, CM path | Diff the assembled library; Mac Steam path checked vs 084 | ✓ |
| Per call only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Out-of-process helper | Bridge helper or sibling binary | ✓ |
| In the Tauri process | dlopen steamclient.dylib in the shell | |
| You decide | | |

---

## Claude's Discretion

- Session model: lease + idle close vs app-lifetime, decided against 085's final results.
- Crate placement, channel names and result shapes, liveness probe and backoff, rustls provider,
  runtime coexistence with gamelib-depot, Jest boundary strategy.

## Deferred Ideas

- Refresh-token renewal
- Persisting Steam Guard machine tokens
- Polling state machines to Rust
- F2P exclusion on the Mac Steam path
