---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 17
subsystem: steam-cm
tags: [steam, rust-cm, adapter, typescript]
requires: [79-15]
provides:
  - SteamCmClient interface (steam-user subset production calls)
  - createRustCmClient / createRustAnonClient adapters
  - invokeSteamCm typed rustInvoke helper
affects: [79-18, 79-19]
key-files:
  created:
    - src/backend/storeManagers/steam/cm/steamCmTypes.ts
    - src/backend/storeManagers/steam/cm/rustSteamCm.ts
    - src/backend/storeManagers/steam/cm/SteamCmClient.ts
    - src/backend/storeManagers/steam/cm/RustCmClient.ts
    - src/backend/storeManagers/steam/cm/RustAnonClient.ts
    - src/backend/storeManagers/steam/cm/__tests__/RustCmClient.test.ts
decisions:
  - Redeem adapter rejects when eresult != 1, with purchaseResultDetails and packageList on the error
  - getUserOwnedApps maps to includeAppinfo true, skipUnvettedApps true, includeFreeSub defaulting false
metrics:
  tasks: 2
  files: 6
completed: 2026-11-15
---

# Phase 79 Plan 17: SteamCmClient seam and Rust adapters Summary

One `SteamCmClient` interface that both the steam-user client and a Rust-lease-backed client satisfy, so callers swap the client object and nothing else (D-03, D-18).

## Tasks

1. `eebc8dc2a` - steamCmTypes.ts, rustSteamCm.ts (`invokeSteamCm`, channel-only debug line), SteamCmClient.ts. Members: steamID, licenses, getProductInfo, getDepotDecryptionKey, getContentServers, getManifestRequestCode, getUserOwnedApps, getPersonas, redeemKey. No call site needed an extra member. A compile-time `_SteamUserFits` check shows `SteamUserDepotClient` is assignable with no narrowing or casts.
2. RustCmClient.ts and RustAnonClient.ts with 9 replay tests (20 cm/ tests pass in total). `toSteamCmError` builds `Error("steamcm <channel> failed: <kind>")` with `.eresult` and `.steamcmKind`. The anon client sends no leaseId. The tests use inline fixtures, to be swapped for the 79-21 goldens.

## Deviations from Plan

None in behavior. Channel names use the `RUST_STEAMCM_*` constants. `SteamCmArgsFor` is derived from the zod schema via `RustInvokeArgsOf`; only the result map is hand-written.

## Notes

- `pnpm tsc --noEmit` and prettier are clean. `eslint` reports `import-x/no-unresolved` for `backend/logger` in rustSteamCm.ts, the same resolver quirk the copied rustSteamFiles.ts has (not investigated).
- Callback-style methods (`getDepotDecryptionKey`, `getContentServers`) log only an error name if the caller's callback throws.

## Known Stubs

None.

## Self-Check: PASSED
