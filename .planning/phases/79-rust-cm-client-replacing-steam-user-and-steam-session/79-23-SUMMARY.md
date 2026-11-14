---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 23
subsystem: steam-auth
tags: [redeem, ambiguous, lease-policy, SteamCmClient]
requires: [79-18]
provides:
  - redeemKey verifies an `ambiguous` CM result by licence diff, never resends
  - Rule M in steamAuthSessionPolicy (steam/cm/ adapters never acquire)
  - createTestSteamCmClient typed double
key-files:
  modified:
    - src/backend/storeManagers/steam/userRedeem.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - src/backend/testUtils/testSteamUser.ts
  created:
    - src/backend/storeManagers/steam/__tests__/userRedeem.rustEngine.test.ts
metrics:
  completed: 2026-11-15
---

# Phase 79 Plan 23: Redeem on the Rust lease Summary

redeemKey snapshots package ids before the call; on a `steamcmKind === 'ambiguous'` rejection it releases the lease, takes a fresh `acquireAuthenticated({reason:'redeem'})`, and reports success naming any new package ids, else today's `redeem-failed` error. The redeem is never resent.

## Commits
- 05094db44: feat(79-23) redeem ambiguity resolution + rust-engine test (6 cases: success, eresult map, ambiguous new package, ambiguous no change, verification lease refused, key never logged)
- second commit: test(79-23) Rule M policy scan of steam/cm/, `createTestSteamCmClient` double annotated with `SteamCmClient`

## Deviations
- steamAuthSessionPolicy needed no type-specific change (it scans call sites by regex, and leases were already typed SteamCmClient); added Rule M for steam/cm/ instead.
- The test fake had no client double, so `createTestSteamCmClient` was added to testSteamUser.ts.

## Verification
tsc clean; prettier clean; steam jest project green except pre-existing failures (shimCoverage, shimGenerate, libraryReplay). No real key was redeemed; fakes only.

## Self-Check: PASSED
