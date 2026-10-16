---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
plan: 04
subsystem: infra
tags: [tauri, sidecar, electron-store, store-layer, allow-list, jest]

# Dependency graph
requires:
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 01
    provides: fileStore.ts path-keyed shared data cell (D-14 cellRegistry) — read handlers rely on this so a cache-shaped Store construction shares data with the real CacheStore instance at the same path
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 02
    provides: getRegisteredStore()/getRegisteredStoreOptions()/getRegisteredStoreNames() self-registering instance registry, and the four D-15 thin electronStores.ts extractions (wine/manager, downloadmanager, migration, logger/uploadedLogs)
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 03
    provides: storePolicy.ts (STORE_ALLOWLIST/filterStoreSnapshot/BOOT_SET_STORES/LAZY_STORES/STORE_UNIVERSE) and sidecarTransport.ts's STORE_SNAPSHOT_CHANNEL/STORE_FETCH_CHANNEL constants
provides:
  - storeRegistration.ts — ensureStoresRegistered(), importing every thin store-declaration module for its module-scope construction side effect so every store instance exists in the sidecar process before any read handler runs
  - handlers.ts's generalized sidecar:store-snapshot handler — walks BOOT_SET_STORES, filters every store through filterStoreSnapshot (D-08 single-sourced), replacing the old two-store hardcoded body and its one-field hand-strip
  - handlers.ts's new sidecar:store-fetch handler (D-03 lazy per-store hydrate) — validated storeName (STORE_UNIVERSE membership or a syntactic name pattern), identical filterStoreSnapshot enforcement as the eager path
  - storeLayer.test.ts — walk-every-ValidStoreName round-trip (D-02), D-13 cache-store round-trip (D-11), allow-list proof on both read paths (D-08), boot-set exactness proof (D-03)
affects: [30, 31, 32, storeLayer, tauri-store-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Curated side-effect-import registration module (storeRegistration.ts) mirroring steamFlowRegistration.ts's own pattern — imports every thin store-declaration module for construction side effect, referenced again inside an idempotent entry-point function body to survive bundler tree-shaking"
    - "Single resolveRawStore() resolution function shared by both the eager snapshot and lazy fetch handlers — typed stores via the registry, a small fixed list of cache-backed names via the exact backend/cache.ts construction shape, anything else a name-only stderr diagnostic and {} (never a throw)"

key-files:
  created:
    - src/backend/sidecar/storeRegistration.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
  modified:
    - src/backend/sidecar/handlers.ts

key-decisions:
  - "CACHE_BACKED_STORE_NAMES (handlers.ts) is a local, undeclared-in-storePolicy.ts literal list — kept out of storePolicy.ts's exports to avoid widening that module's surface for this single internal consumer, per D-13's own declared-not-derived, greppable-list philosophy"
  - "wikigameinfo is declared a ValidStoreName in StoreStructure but wiki_game_info/electronStore.ts actually constructs it as a CacheStore, not a TypeCheckedStoreBackend — resolveRawStore() now resolves it through the same cache-shaped construction as the D-13 four (CACHE_BACKED_STORE_NAMES), so a lazy fetch for it serves real data instead of silently returning {}"
  - "zoomSyncStore is a second dead StoreStructure entry (zero construction sites anywhere in the backend), discovered by this plan's own coverage test — documented identically to the already-known fontsStore exclusion, not invented functionality (building real Zoom cloud-save sync is out of scope, Rule 4 territory)"

requirements-completed: [REQ-29-01, REQ-29-02, REQ-29-04]

# Metrics
duration: ~35min
completed: 2026-07-22
---

# Phase 29 Plan 04: Sidecar store layer generalization Summary

**Every ValidStoreName (plus the four D-13 cache stores) now constructs and round-trips in the sidecar process; the eager snapshot serves exactly the declared boot set and a new lazy fetch handler serves the rest, both enforcing the D-08 allow-list through one shared function.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-22T06:07:00Z (approx, first Read call)
- **Completed:** 2026-07-22T06:41:52Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created `storeRegistration.ts`: imports every thin `electronStores.ts` store-declaration module (steam, gog, zoom, nile, sideload, legendary, humble, game_overrides, wiki_game_info, wine/manager, downloadmanager, migration, logger) purely for its module-scope construction side effect, exposed through an idempotent `ensureStoresRegistered()` that references every binding again inside its body (bundler-tree-shaking-safe). Imports zero real-electron, zero heavy host modules (D-15: no `storeManagers/index.ts`, no `downloadqueue.ts`, no `wine/manager/utils.ts`, no `migration/index.ts`).
- Generalized `handlers.ts`'s `sidecar:store-snapshot` handler: now walks `BOOT_SET_STORES` (11 typed stores + 4 D-13 cache stores) and filters every entry through `filterStoreSnapshot` — replacing the old two-store hardcoded body and its single-field `refreshToken` hand-strip. The T-27-09 defense-in-depth property is preserved and generalized (now enforced for every store, not one field of one store).
- Added `sidecar:store-fetch` (D-03 lazy per-store hydrate): validates `storeName` against `STORE_UNIVERSE` or a syntactic name pattern (`/^[A-Za-z0-9_-]{1,64}$/`) before any resolution attempt (T-29-13), then applies the identical `filterStoreSnapshot` as the eager path (T-29-14 closed). A path-traversal string (`'../../etc/passwd'`) is rejected before ever reaching store resolution.
- `resolveRawStore()` (shared by both handlers) resolves a `ValidStoreName` via `getRegisteredStore()`, a cache-backed name via the exact `backend/cache.ts` construction shape (`{cwd:'store_cache', name, clearInvalidConfig:true}` — never a hand-derived path), and anything else yields `{}` plus a name-only stderr diagnostic, never a throw and never a leaked value (T-29-17/T-29-18).
- Created `storeLayer.test.ts`: 31 tests across `round-trip` (18 typed stores + 5 cache-backed stores, it.each), `allow-list` (6 tests — secret exclusion by name on both the eager and lazy paths, path-traversal and unrecognized-name rejection), and `boot set` (2 tests — key-set exactness, lazy-tier absence). Reaches the real registered handlers directly off `electronStub`'s `handlerRegistry`, per the plan's "do not re-implement handler logic" instruction. Opens with the mandatory three-way `os`/`electron`/`electron-store` mock isolation, using a suite-specific tmp home directory distinct from every sibling suite's own.
- Discovered and fixed two gaps not anticipated by 29-RESEARCH (see Deviations below): `zoomSyncStore` has zero construction sites anywhere in the backend (documented as a second dead `StoreStructure` entry, same class as `fontsStore`), and `wikigameinfo` is declared a `ValidStoreName` but is actually built as a `CacheStore` — its resolution now correctly routes through the cache-shaped construction path instead of silently returning `{}` forever.

## Task Commits

Each task was committed atomically:

1. **Task 1: storeRegistration.ts — construct every store in the sidecar process** - `2c1766cb` (feat)
2. **Task 2: Generalize the snapshot handler and add the lazy per-store fetch handler** - `65a6b719` (feat)
3. **Task 3: storeLayer.test.ts — walk every store, round-trip, and prove the allow-list** (also carries the wikigameinfo/zoomSyncStore inline fixes to Tasks 1/2's files) - `9a3d7baa` (test)

**Plan metadata:** (pending — this SUMMARY's commit)

## Files Created/Modified

- `src/backend/sidecar/storeRegistration.ts` - New; side-effect imports of every thin store-declaration module, `ensureStoresRegistered()` entry point, `fontsStore`/`zoomSyncStore` documented as the two permitted dead-entry exclusions
- `src/backend/sidecar/handlers.ts` - Generalized `sidecar:store-snapshot`, added `sidecar:store-fetch`, `resolveRawStore()` shared resolution helper, `CACHE_BACKED_STORE_NAMES` (D-13 four + `wikigameinfo`)
- `src/backend/sidecar/__tests__/storeLayer.test.ts` - New; 31 tests (round-trip, allow-list, boot set), three-way mock isolation with a suite-unique tmp home directory

## Decisions Made

- Kept `CACHE_BACKED_STORE_NAMES` as a local literal in `handlers.ts` rather than exporting it from `storePolicy.ts`, since `storePolicy.ts`'s equivalent list (`BOOT_SET_CACHE_STORE_NAMES`) is intentionally unexported and this is the list's only other consumer — widening a shared module's export surface for one internal caller was judged unnecessary.
- Routed `wikigameinfo` through the cache-shaped resolution path (same mechanism as the D-13 four) rather than treating it as a registration bug to "fix" by wrapping it in a `TypeCheckedStoreBackend` — that would have required changing `wiki_game_info/electronStore.ts`'s established `CacheStore`-based contract, a wider blast radius than this plan's read-path scope justifies. The resolution-layer fix achieves the same correctness (real data reachable through the lazy fetch handler) without touching the store's own declaration.
- Documented `zoomSyncStore` as dead rather than implementing a real Zoom cloud-save-sync feature to satisfy the round-trip test — building that feature is a multi-file, cross-cutting addition (Rule 4 architectural territory), squarely out of scope for a sidecar read-path generalization plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `zoomSyncStore` has zero construction sites anywhere in the backend**
- **Found during:** Task 3, first run of the round-trip `it.each` walk (`expect(instance).toBeDefined()` failed)
- **Issue:** The plan's locked coverage bar assumed every `ValidStoreName` except `fontsStore` has a real construction site. A repo-wide grep for `zoomSyncStore` found it only in type declarations (`StoreStructure`, `storePolicy.ts`, and this suite) — no `new TypeCheckedStoreBackend('zoomSyncStore', ...)` call exists anywhere, unlike its real, constructed sibling `gogSyncStore`.
- **Fix:** Documented `zoomSyncStore` as a second dead `StoreStructure` entry in `storeRegistration.ts`'s comment (mirroring `fontsStore`'s existing treatment) and excluded it from `storeLayer.test.ts`'s round-trip walk with the identical justification pattern. No functionality was invented; nothing that previously worked was removed.
- **Files modified:** `src/backend/sidecar/storeRegistration.ts`, `src/backend/sidecar/__tests__/storeLayer.test.ts`
- **Commit:** `9a3d7baa`

**2. [Rule 1 - Bug] `wikigameinfo` is a `ValidStoreName` but is actually constructed as a `CacheStore`, never appearing in the typed registry**
- **Found during:** Task 3, first run of the round-trip `it.each` walk (`expect(instance).toBeDefined()` failed)
- **Issue:** `wiki_game_info/electronStore.ts` constructs `wikiGameInfoStore` via `new CacheStore<WikiInfo>('wikigameinfo', ...)`, not `TypeCheckedStoreBackend`. Since `getRegisteredStore()` only resolves `TypeCheckedStoreBackend` instances, a lazy fetch for `'wikigameinfo'` (a real `LAZY_STORES` member, reachable via `STORE_FETCH_CHANNEL`) would have silently and permanently returned `{}` in production — undetected until this test caught it.
- **Fix:** Renamed `handlers.ts`'s `D13_CACHE_STORE_NAMES` to `CACHE_BACKED_STORE_NAMES` and added `'wikigameinfo'` as a fifth entry, so `resolveRawStore()` resolves it through the same `{cwd:'store_cache', name, clearInvalidConfig:true}` construction shape as the D-13 four. Updated `storeLayer.test.ts` to round-trip `wikigameinfo` through the cache-backed mechanism instead of expecting a registry hit.
- **Files modified:** `src/backend/sidecar/handlers.ts`, `src/backend/sidecar/__tests__/storeLayer.test.ts`
- **Commit:** `9a3d7baa`

**3. [Rule 1 - Bug] Wording collisions with acceptance-criteria greps in comment prose**
- **Found during:** Task 1, after writing `storeRegistration.ts`'s docstring
- **Issue:** The docstring's prose naming the excluded host modules (`backend/storeManagers/index.ts`, `backend/downloadmanager/downloadqueue.ts`, `backend/wine/manager/utils.ts`, `backend/migration/index.ts`, `logger/uploader.ts`) matched the acceptance criterion's own exclusion grep pattern, which is meant to check CODE, not comments — same class of self-collision 29-01/29-02 hit and documented.
- **Fix:** Reworded the affected comment lines to describe the excluded modules without using their literal matched path substrings (e.g. "the store-manager registry's own aggregation entry point" instead of the literal path), preserving the same explanation.
- **Files modified:** `src/backend/sidecar/storeRegistration.ts`
- **Commit:** `2c1766cb`

## Issues Encountered

- `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts` flaked once (real-disk `LogWriter` archive rename against `~/Library/Logs/GameLib/gamelib.log`) when run as part of the combined `src/backend/sidecar` suite alongside `storeLayer.test.ts`. Confirmed pre-existing and unrelated: the test passes in isolation, doesn't touch any file this plan modified, and the failure mode (real-disk log-file archiving racing across test files in one worker) matches an already-documented class of issue in this codebase (project memory: "Tests clobbering real Steam store"). Re-ran the full `src/backend/sidecar` suite afterward and it passed cleanly (7 suites, 77 tests) — out of scope per the deviation rules' scope boundary, not fixed here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The sidecar's store read path is now generalized: `ensureStoresRegistered()` (29-04) plus `getRegisteredStore()` (29-02) plus `filterStoreSnapshot()` (29-03) together mean Phase 30's install/uninstall slice can read any store's filtered snapshot without hand-extending `sidecar:store-snapshot` — the exact anti-pattern the incremental-port checklist's step 4 flags.
- `npx jest src/backend/sidecar` is green (7 suites, 77 tests). `npx tsc --noEmit -p tsconfig.json` is clean. Full-repo `npx jest --silent` is green (111 suites, 1960 tests).
- `grep -v '^ *[/*]' src/backend/sidecar/handlers.ts | grep -c 'refreshToken'` returns `0` — the code-level hand-strip is fully gone, only comments (filtered out by this grep) reference the concept.
- Two previously-undocumented `StoreStructure` gaps (`zoomSyncStore` dead entry, `wikigameinfo` cache-backed-not-typed) are now correctly handled and documented — future plans touching either name should read `storeRegistration.ts`'s and `handlers.ts`'s comments first rather than rediscovering the same surprise.
- No blockers for the next plan in this wave (29-05, per the phase's wave 2 dependency chain) or for 29-06/29-07.

---
*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: src/backend/sidecar/storeRegistration.ts
- FOUND: src/backend/sidecar/handlers.ts
- FOUND: src/backend/sidecar/__tests__/storeLayer.test.ts
- FOUND: .planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-04-SUMMARY.md
- FOUND: commit 2c1766cb (Task 1)
- FOUND: commit 65a6b719 (Task 2)
- FOUND: commit 9a3d7baa (Task 3)
