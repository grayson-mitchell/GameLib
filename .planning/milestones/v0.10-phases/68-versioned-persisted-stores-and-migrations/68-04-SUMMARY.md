---
phase: 68-versioned-persisted-stores-and-migrations
plan: 04
subsystem: backend-persistence
tags: [store-versioning, read-only, store-notifications, renderer-policy]
requires: [68-02, 68-03]
provides:
  - readOnly getters and silent early returns on TypeCheckedStoreBackend and CacheStore
  - __internal__ hidden from raw_store, CacheStore.entries(), and every renderer snapshot/push/write
  - applyStoreWrite guard (e) refusing writes to read-only stores
affects: [68-07, 68-09]
key-files:
  created:
    - src/backend/__tests__/storeReadOnly.test.ts
  modified:
    - src/backend/typed_store.ts
    - src/backend/cache.ts
    - src/common/types/storePolicy.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src/common/types/__tests__/storePolicy.test.ts
key-decisions:
  - "Hiding lives in isAllowedStoreField (first segment __internal__ -> false), so filterStoreSnapshot, the write guard (c) and pushStoreChanged are all covered by one predicate; this also covers handlers.ts resolveRawStore's cache-store branch (raw conf .store) without touching handlers.ts"
  - "In-memory CacheStore sessions on a read-only store keep working; commit() drops back to the file store without writing or invalidating (D-03: changes lost)"
requirements-completed: [D-03, D-06]
duration: ~25min
completed: 2026-11-08
---

# Phase 68 Plan 04: Read-only silence and version-key hiding Summary

A refused write is now also an unannounced write, and the `__internal__` version key is invisible to every consumer outside the engine.

## Tasks

1. Store classes: `readOnly` getters (`=== true`), early returns in set/delete/clear (typed) and set/delete/clear/commit (cache), reserved-key refusal in `TypeCheckedStoreBackend`, `raw_store` and `entries()` omit `__internal__` - `494ecbfd0`
2. Renderer path: `isAllowedStoreField` rejects the `__internal__` namespace, `applyStoreWrite` guard (e) on `target.readOnly` - `4d1bfa977`

## Coverage of whole-store readers (68-03 flag)

Audited every reader of a whole store object: `typed_store.raw_store` (now strips the key; consumers are `uploader.ts` and `sidecar/handlers.ts resolveRawStore`), the `resolveRawStore` cache-backed branch returning raw `.store` (covered because the result always passes through `filterStoreSnapshot` -> `isAllowedStoreField`), and `CacheStore.entries()`. No other whole-store reader exists in `src/`.

## Verification

storeReadOnly (8), storePolicy (55), cache, storeChangeNotifier, storeBackendVersioning, Humble realstore, storeLayer and skeletonFlows suites pass; `pnpm codecheck` and scoped prettier clean. `logSecretGate` fails only on the known pre-existing `uninstaller.ts` lines (deferred-items.md). smoke:sidecar / tauri:dev not run.

## Deviations from Plan

None - plan executed as written. The renderer-write tests use the recognised cache store `steam_library` (a registered typed store would resolve to whichever instance the file constructed first).

## Notes

`resolveWritableStore`'s cache branch builds a declaration-less `Store`; it relies on the CacheStore declaration having registered the path's engine state earlier in the sidecar process (true for the boot-set caches). Not changed here.

## Known Stubs

None.

## Self-Check: PASSED
