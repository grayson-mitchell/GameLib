---
created: 2026-11-08
title: "Version the per-bottle gamelib-shared-redists.json ledger with the Phase 68 engine"
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
severity: minor
platform: macos
ready: code
---

**File:** `<bottle>/gamelib-shared-redists.json`, written atomically by `writeLedger` in
`src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts` and read by `readLedger`.

**Holds:** the per-bottle shared-redist ledger: `done`, `timedOut`, `failures`, `rejected`,
`markPending`, `displayDriver` (the Graphics registry value to put back after the null display
driver switch), and `settled`. It already carries a hand-rolled `version: 1`.

**Why it counts as user data:** `displayDriver.prior` and `done` cannot be recomputed once lost,
and an unreadable ledger is silently replaced by an empty one (`readLedger` logs and starts empty).
A future shape change that trips that fallback would drop a pending display-driver restore.

**Reuse:** Phase 68's engine (`src/backend/storeVersioning/`) is the mechanism: `prepareStoreFile`
with a codec. The existing `version: 1` field is the starting point; the engine's stamp should
replace it rather than live beside it.

See `.planning/phases/68-versioned-persisted-stores-and-migrations/68-INVENTORY.md`.

## Resolved by quick 261109-uv4

The ledger is on the store engine: codec and helpers in `src/backend/storeVersioning/sharedRedistLedgerFile.ts`, chain key `steam_bridge/shared-redists` (registered in `STORE_MIGRATIONS`). The top-level `version` is the engine stamp; baseline v1 is the pre-engine `version: 1`.
