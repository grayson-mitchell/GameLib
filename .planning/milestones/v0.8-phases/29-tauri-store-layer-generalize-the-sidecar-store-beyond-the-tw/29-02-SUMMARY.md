---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
plan: 02
subsystem: infra
tags: [tauri, sidecar, electron-store, store-registry, d-15]

# Dependency graph
requires:
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 01
    provides: fileStore.ts hardening (path-keyed cell, atomic persist) — unrelated file, no direct coupling but same wave/phase
provides:
  - Four thin electronStores.ts modules (wine/manager, downloadmanager, migration, logger) that export only their TypeCheckedStoreBackend singleton
  - storeRegistry / getRegisteredStore() / getRegisteredStoreOptions() / getRegisteredStoreNames() in src/backend/electron_store.ts
  - Every constructed store is now reachable by ValidStoreName without re-deriving cwd/name from the string (Pitfall 4)
affects: [29-04, 29-05, storeLayer, tauri-store-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-15: heavy host-module store declarations extracted into dedicated electronStores.ts thin modules importing only TypeCheckedStoreBackend, so a sidecar registration step can import the store without the host module's import-time side effects"
    - "Self-registering instance registry: TypeCheckedStoreBackend's constructor writes itself + its construction options into a module-level Map keyed by ValidStoreName, exposed via read-only accessor functions"

key-files:
  created:
    - src/backend/wine/manager/electronStores.ts
    - src/backend/downloadmanager/electronStores.ts
    - src/backend/migration/electronStores.ts
    - src/backend/logger/electronStores.ts
  modified:
    - src/backend/wine/manager/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/migration/index.ts
    - src/backend/logger/uploader.ts
    - src/backend/electron_store.ts

key-decisions:
  - "wineDownloaderInfoStore is re-exported from wine/manager/utils.ts (not just imported) because grep found real external importers (backend/config.ts, backend/utils.ts, backend/tools/dxmt.ts, and three frontend files) resolving it from that module path"
  - "downloadManager and uploadedLogFileStore were module-private at their old locations (no external importer found by grep), so the hosts import the extracted singleton without re-exporting it"
  - "uploadedLogs extracted as a fourth D-15-style store (beyond the plan's original three) per the plan's explicit instruction, so storeRegistration.ts (29-04) imports zero host modules and D-02's locked coverage bar needs no exclusion"
  - "storeRegistry stores {instance, options} pairs (not just the instance) so a later coverage test can assert on-disk identity without re-deriving cwd/name from the ValidStoreName string (Pitfall 4)"

requirements-completed: [REQ-29-01, REQ-29-07]

# Metrics
duration: ~15min
completed: 2026-07-22
---

# Phase 29 Plan 02: Store registry + D-15 extractions Summary

**Extracted wineDownloaderInfoStore/downloadManager/migrationsStore/uploadedLogFileStore into dedicated thin modules and added a self-registering ValidStoreName-keyed instance registry to TypeCheckedStoreBackend.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-22
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- Extracted the three D-15 declaration sites (`wineDownloaderInfoStore`, `downloadManager`, `migrationsStore`) out of their heavy host modules (`wine/manager/utils.ts`, `downloadmanager/downloadqueue.ts`, `migration/index.ts`) into dedicated `electronStores.ts` thin modules, each importing only `TypeCheckedStoreBackend`.
- Extended D-15 to a fourth store, `uploadedLogFileStore`, moved out of `logger/uploader.ts` (which pulls in Electron's `app`, `sendFrontendMessage`, and the logger) so `storeRegistration.ts` (29-04) will import zero host modules.
- Rewired all four hosts mechanically: `wine/manager/utils.ts` re-exports `wineDownloaderInfoStore` (external importers depend on that path); `downloadqueue.ts` and `uploader.ts` import the module-private singleton with no re-export needed; `migration/index.ts`'s constructor now assigns the imported singleton instead of constructing a new instance, preserving its `TypeCheckedStore<'migrationsStore'>` field type.
- Added a module-level `storeRegistry: Map<string, RegisteredStore>` to `src/backend/electron_store.ts`. `TypeCheckedStoreBackend`'s constructor self-registers `{instance, options}` after `new Store(options)`, additively — no existing method signature changed.
- Exposed three read-only accessors: `getRegisteredStore(name)`, `getRegisteredStoreOptions(name)`, `getRegisteredStoreNames()`.
- Documented Pitfall 4 verbatim in substance directly above the registry: `ValidStoreName` is not the on-disk filename; any name-keyed dispatch must resolve through the registry and never reconstruct a path from the name string.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the four store declarations into thin modules** - `a94189f8` (feat)
2. **Task 2: Self-registering store instance registry in electron_store.ts** - `76fd0ee9` (feat)

**Plan metadata:** (pending — this SUMMARY's commit)

## Files Created/Modified

- `src/backend/wine/manager/electronStores.ts` - New; exports `wineDownloaderInfoStore`
- `src/backend/downloadmanager/electronStores.ts` - New; exports `downloadManager`
- `src/backend/migration/electronStores.ts` - New; exports `migrationsStore`, constructed at module scope (was previously constructed lazily inside `MigrationSystem`'s constructor)
- `src/backend/logger/electronStores.ts` - New; exports `uploadedLogFileStore` with all three original option keys preserved verbatim (`accessPropertiesByDotNotation: false` included)
- `src/backend/wine/manager/utils.ts` - Inline declaration removed; imports + re-exports `wineDownloaderInfoStore`
- `src/backend/downloadmanager/downloadqueue.ts` - Inline declaration removed; imports `downloadManager` (module-private, no re-export)
- `src/backend/migration/index.ts` - Inline declaration removed from constructor; assigns imported `migrationsStore` singleton; dropped now-unused `TypeCheckedStoreBackend` import
- `src/backend/logger/uploader.ts` - Inline declaration removed; imports `uploadedLogFileStore` (module-private, no re-export)
- `src/backend/electron_store.ts` - Added `storeRegistry` Map, `RegisteredStore` interface, `getRegisteredStore()`/`getRegisteredStoreOptions()`/`getRegisteredStoreNames()` accessors, Pitfall-4 documentation comment; constructor now self-registers after `new Store(options)`

## Decisions Made

- Kept `wineDownloaderInfoStore` re-exported from `wine/manager/utils.ts` because live grep found six external importers resolving it from that path (`backend/config.ts`, `backend/utils.ts`, `backend/tools/dxmt.ts`, `common/types/electron_store.ts`, and two frontend files) — deleting the re-export would have broken all of them.
- `downloadManager` and `uploadedLogFileStore` were confirmed module-private at their old locations before dropping the re-export, per the plan's explicit instruction to only add a re-export if grep shows an existing importer.
- `RegisteredStore` stores the full construction `options` object alongside the `instance`, per the plan's explicit instruction, so a later coverage test (D-02 in a subsequent plan) can assert on-disk identity without re-deriving `cwd`/`name` from the `ValidStoreName` string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Acceptance-criterion grep initially matched prose, not just code**
- **Found during:** Task 1, after writing `src/backend/logger/electronStores.ts`
- **Issue:** The acceptance criterion `grep -cE "from 'electron'|backend/ipc|from '\.\./ipc'|from '\.\./logger'" src/backend/logger/electronStores.ts` returned 1 because the header comment's prose ("backend/ipc's `sendFrontendMessage`") contained the literal substring `backend/ipc`, even though the file has zero actual imports of those modules.
- **Fix:** Reworded the comment to say "Electron's `app`" and "the IPC layer's `sendFrontendMessage`" instead, dropping the literal matched substrings while keeping the same explanation.
- **Files modified:** `src/backend/logger/electronStores.ts`
- **Commit:** `a94189f8`

None else — plan executed exactly as written otherwise.

## Issues Encountered

None beyond the grep-wording fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Four stores are now declared in dedicated thin modules, each importable without their host module's import-time side effects — the prerequisite for plan 29-04's `storeRegistration.ts`.
- `getRegisteredStore()`/`getRegisteredStoreOptions()`/`getRegisteredStoreNames()` are available for a generic name-keyed store lookup (plan 29-05's `storeSet`/`storeGet` handlers) without ever re-deriving a path from the store name.
- `npx tsc --noEmit -p tsconfig.json` is clean; `npx jest src/backend/wine src/backend/downloadmanager src/backend/migration src/backend/logger --passWithNoTests` (42 tests, 6 suites) and `npx jest src/backend/sidecar` (46 tests, 6 suites) both pass, plus a spot-check of `src/backend/config src/backend/utils src/backend/tools` (19 tests, 4 suites) confirming no regression to `wineDownloaderInfoStore` consumers.
- No blockers for 29-03/29-04 (next plans in the phase).

---
*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: src/backend/wine/manager/electronStores.ts
- FOUND: src/backend/downloadmanager/electronStores.ts
- FOUND: src/backend/migration/electronStores.ts
- FOUND: src/backend/logger/electronStores.ts
- FOUND: src/backend/electron_store.ts
- FOUND: commit a94189f8 (Task 1)
- FOUND: commit 76fd0ee9 (Task 2)
