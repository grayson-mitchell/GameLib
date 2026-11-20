---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 24
subsystem: steam-cm
tags: [parity, tier-2, steam-vent, personas, pics]
requires: [79-16, 79-19, 79-20, 79-21, 79-22, 79-23]
provides:
  - Tier 2 CM-ops parity sweep (`pnpm steamcm-parity-sweep`, steam-user vs Rust CLI)
  - 79-PARITY.md divergence register, operator-decided (Status APPROVED (CM ops))
affects: [gamelib-steamcm, meta/steamcmParitySweep.ts]
tech-stack:
  added: []
  patterns: [per-connection PersonaCache, resend-within-bound request]
key-files:
  created:
    - .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-PARITY.md
    - meta/steamcmParitySweep.ts
    - meta/__tests__/steamcmParitySweep.test.ts
  modified:
    - package.json
    - src-tauri/crates/gamelib-steamcm/src/backend.rs
    - src-tauri/crates/gamelib-steamcm/src/vent.rs
    - src-tauri/crates/gamelib-steamcm/src/ops/pics.rs
metrics:
  completed: 2026-11-15
---

# Phase 79 Plan 24: Tier 2 CM-ops parity sweep Summary

A read-only sweep that logs on through steam-user and the Rust CLI with the same stored token and compares licences, owned apps, PICS, depot keys, request codes, content servers and own-persona presence; it found and fixed two Rust defects, and the operator decided all nine divergences.

## Outcome

- Sweep (commits 895af57f9, f2f068c35): redacted output only, exit 0 all equal or explained, 1 unexplained, 3 precondition failure. Rust logs on with the unchanged steam-session token and no account name (D-07, CF-03).
- Final sweep: licences 485/485, licence app ids 1,144/1,144 (CF-05), owned 390/390, PICS 25/25, depot keys 3/3, request codes 3/3, content servers equal, persona equal.
- 79-PARITY.md Status: APPROVED (CM ops).

## Operator decision (verbatim)

"Reject DV-09 only": DV-79-01 through DV-79-08 accepted (2026-11-15); DV-79-09 rejected (2026-11-15) and resolved by the fix below.

## Deviations from Plan

**1. [Rule 1 - Bug] Package PICS parse (commit 77c1cad60).** The first sweep returned `packageinfo: null` for all 485 packages. `packageinfo_to_json` read the package id from the 4-byte buffer header, but real Steam sends `01 00 00 00` there; the id is the root key. Rust now looks the root key up by the requested package id. The 79-08 fixture had assumed the header was the id; it now carries the real header. After the fix 485/485 parse.

**2. [Rule 2 - Missing parity] Licence-token fallback (same commit).** With `inclTokens`, a package uses its licence's non-zero access token ahead of the PICS-supplied one, as steam-user `apps.js` 215-223 does. Unit-tested. Did not change the live result by itself.

**3. [Operator-driven fix] DV-79-09 persona cache (commits 01e01a3cc, 3fac51c13).**
- `PersonaCache` in `backend.rs`: per connection (so scoped to one logon; dropped on logout, rebuild or replace), keyed by SteamID, name-bearing entries only, full-hit lookups only. `vent.rs` subscribes to `CMsgClientPersonaState` before logon and absorbs every push; the `personas` op answers from the cache first, else asks the CM. Result shape unchanged; names and SteamIDs never logged.
- Finding: live diagnostics showed Steam does not push own persona at logon on a steam-vent session (cache lookup was a miss every run), and the CM answers a single friend-data request only intermittently. So the cache alone did not fix it (a sweep after commit 1 still reported `persona-unsupported`). Commit 2 requests steam-user's flag set (0x7fff) and resends the request every 1.25 s inside the unchanged 5 s bound; this removed the empty result. The cache still absorbs the replies for later calls.
- Tests: `PersonaCache` unit tests in `backend.rs` (hit needs every id and a name; clones share; a new logon starts empty). The FakeBackend has no push channel, so the vent subscription and resend loop are covered by the live sweep only (no fake.rs extension made). `cargo test -p gamelib-steamcm --lib` 267 passed, clippy `--all-targets -D warnings` clean, `cargo fmt --check` clean.
- Re-sweep: persona equal in 5 of 5 completed sweeps on the final code (5 of 5 more on the same logic with scratch diagnostics). Before the fix: `persona-unsupported` in 2 of 4. Three sweeps aborted before any comparison with `sweep error: Request timed out` (exit 3): that is steam-user's own `getPersonas` 10 s timeout, a steam-user-side intermittence, not a Rust divergence.

## Auth gates

None. Read-only ops only; no redeem, no credential sign-in.

## Known Stubs

None.

## Self-Check: PASSED

79-PARITY.md and this file exist; commits 895af57f9, f2f068c35, 77c1cad60, bda6892aa, a278092a4, 01e01a3cc, 3fac51c13 exist in `git log`.
