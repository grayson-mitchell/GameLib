---
phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
plan: 03
subsystem: infra
tags: [tauri, sidecar, store-policy, allow-list, security]

# Dependency graph
requires:
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 01
    provides: fileStore.ts hardening — unrelated file, same wave/phase
  - phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
    plan: 02
    provides: storeRegistry / getRegisteredStore() — not directly consumed here, but the next
      wave's storeRegistration.ts imports both this plan's storePolicy.ts and 29-02's registry
provides:
  - storePolicy.ts — STORE_ALLOWLIST, isAllowedStoreField(), filterStoreSnapshot(),
    BOOT_SET_STORES, LAZY_STORES, STORE_UNIVERSE, DENIED_CACHE_STORES (D-08/D-09/D-13)
  - sidecarTransport.ts — STORE_SET_CHANNEL/STORE_DELETE_CHANNEL/STORE_NEW_CHANNEL/
    STORE_FETCH_CHANNEL/STORE_SNAPSHOT_CHANNEL/STORE_CHANGED_CHANNEL/STORE_LAZY_MISS_MARKER
    + StoreChangedPayload (D-12)
  - First jest project for src/common (src/common/jest.config.js), registered in root
    jest.config.js
affects: [29-04, 29-05, 29-06, storeLayer, tauri-store-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-08: single fail-closed ALLOW-list (not deny-list) for the Tauri store-read policy,
      replacing three hand-duplicated deny-lists (tauriTransport.ts, misc.ts, handlers.ts)"
    - "D-09/D-13: declared (not derived) boot/lazy store tier partition, anti-drift-guarded
      by a hardcoded-reference-list test rather than a runtime computation"

key-files:
  created:
    - src/common/types/storePolicy.ts
    - src/common/types/__tests__/storePolicy.test.ts
    - src/common/jest.config.js
  modified:
    - src/common/types/sidecarTransport.ts
    - jest.config.js

key-decisions:
  - "D-08 divergence documented at both sites: misc.ts's Electron-branch SECRET_STORE_KEYS
    deny-list is deliberately left untouched and byte-identical until Phase 35's Electron
    cutover (Phase 28 D-11 precedent) — this plan's allow-list governs the Tauri path only"
  - "STORE_ALLOWLIST enumerates all 21 StoreStructure top-level field lists explicitly rather
    than deriving them via reflection/keyof, so the five omitted secrets (refreshToken,
    sessionCookie, csrfToken, gogConfigStore.credentials, zoomConfigStore.credentials) are
    each a visible, individually-commented line rather than an implicit gap"
  - "BOOT_SET_STORES/LAZY_STORES are declared as plain readonly string[] (not typed against
    ValidStoreName) because BOOT_SET_STORES also carries the four non-ValidStoreName D-13
    cache-store names in the same list"

requirements-completed: [REQ-29-04, REQ-29-02, REQ-29-03]

# Metrics
duration: ~20min
completed: 2026-07-22
---

# Phase 29 Plan 03: storePolicy allow-list + channel constants Summary

**Single fail-closed allow-list module (storePolicy.ts) replacing three duplicated deny-lists, plus the seven D-12 store-channel wire constants — the source of truth every subsequent 29-04/05/06 store handler must import.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-22
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Created `src/common/types/storePolicy.ts`: `STORE_ALLOWLIST` enumerates all 21 `StoreStructure` top-level field lists, omitting exactly the five secret/main-process-only fields (`steamConfigStore.refreshToken`, `humbleConfigStore.sessionCookie`, `humbleConfigStore.csrfToken`, `gogConfigStore.credentials`, `zoomConfigStore.credentials`), each with an inline comment naming the field and citing `StoreStructure`'s own documentation.
- `isAllowedStoreField()` is fail-closed by construction: unknown store name → `false`, unknown field on a known non-wildcard store → `false`, dot-notation subpath of a secret (`refreshToken.x`) → `false` (matches on `key.split('.')[0]`, preserving the old deny-list's `startsWith` semantics).
- `filterStoreSnapshot()` is the single function every snapshot/fetch/write path in plans 29-04/05/06 must call — the policy is enforced once, not re-implemented per call site.
- `DENIED_CACHE_STORES` wholesale-excludes `humble_library` (29-RESEARCH Open Question 4) — its `revealedKeyValue`/`keyindex` internal fields would otherwise bypass `getKeys()`'s projection via a raw snapshot read.
- `BOOT_SET_STORES`/`LAZY_STORES`/`STORE_UNIVERSE` declare the D-09/D-13 eager/lazy tier partition as literal, greppable lists — 11 typed boot stores + the four D-13 cache-store names (`legendary_library`, `gog_library`, `nile_library`, `zoom_library`), with the remaining 10 `ValidStoreName`s as lazy.
- Added the seven D-12 store-channel constants (`STORE_SET_CHANNEL`, `STORE_DELETE_CHANNEL`, `STORE_NEW_CHANNEL`, `STORE_FETCH_CHANNEL`, `STORE_SNAPSHOT_CHANNEL`, `STORE_CHANGED_CHANNEL`, `STORE_LAZY_MISS_MARKER`) plus `StoreChangedPayload` to `sidecarTransport.ts`, purely additively — no existing export changed. The three `send`-kind literals (`'storeSet'`/`'storeDelete'`/`'storeNew'`) are pinned to the exact strings `tauriTransport.ts` already emits.
- Wrote `storePolicy.test.ts`: 11 `allow-list` tests (each secret excluded by name including `csrfToken`, subpath block, legitimate-neighbour pass-through, fail-closed unknown store/field, `filterStoreSnapshot` key-stripping, `humble_library` denial) + 5 `tier partition` tests (disjointness, union-equals-universe, a hardcoded 21-name reference list as the anti-drift guard, universe-to-allowlist resolution, D-13 cache names in boot set). 16/16 passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: storePolicy.ts — fail-closed allow-list + declared tier partition** - `2a4c7514` (feat)
2. **Task 2: New store channel constants in sidecarTransport.ts (D-12)** - `289aef73` (feat)
3. **Task 3: storePolicy test — secret exclusion by name + partition totality** - `118b62a3` (test)

**Plan metadata:** (pending — this SUMMARY's commit)

## Files Created/Modified

- `src/common/types/storePolicy.ts` - New; `STORE_ALLOWLIST`, `CACHE_STORE_POLICY`, `DENIED_CACHE_STORES`, `isAllowedStoreField()`, `filterStoreSnapshot()`, `BOOT_SET_STORES`, `LAZY_STORES`, `STORE_UNIVERSE`. Type-only import from `electron_store.ts`, zero Electron/fs/path imports, zero side effects.
- `src/common/types/sidecarTransport.ts` - Added seven store-channel constants + `StoreChangedPayload` interface; no existing export touched.
- `src/common/types/__tests__/storePolicy.test.ts` - New; 16 tests across `allow-list` and `tier partition` `describe` blocks. No store construction, no `os`/`electron`/`electron-store` mock needed (documented in header).
- `src/common/jest.config.js` - New (deviation, see below).
- `jest.config.js` - Added `<rootDir>/src/common` to the root `projects` array (deviation, see below).

## Decisions Made

- Enumerated `STORE_ALLOWLIST` field lists by hand from `StoreStructure` rather than any reflective/derived approach, so each of the five secret omissions is a visible, individually-commented decision point instead of an implicit gap a reviewer would have to infer.
- `steamBottleConfigStore`'s four fields (`bottleName`, `wineVersion`, `wineCrossoverBottle`, `provisioned`) were verified against `src/common/types/steam.ts:39` directly — confirmed no secret fields exist there (bottled-Steam auth is opaque per D-04/WR-02, 17-17), so nothing needed omitting.
- Kept `BOOT_SET_STORES`/`LAZY_STORES` typed as plain `readonly string[]` rather than `readonly ValidStoreName[]`, since `BOOT_SET_STORES` must also carry the four non-`ValidStoreName` D-13 cache-store names in the same array — a stricter type would have forced splitting the boot set into two lists, contradicting the plan's single-declared-list intent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] No jest project covered `src/common`**
- **Found during:** Task 3, running the plan's own stated verification command
- **Issue:** The root `jest.config.js`'s `projects` array only listed `src/backend`, `src/frontend`, `src/preload`, and `meta`. `storePolicy.test.ts` is the first unit suite ever placed under `src/common` — running `npx jest src/common/types/__tests__/storePolicy.test.ts` reported "0 matches" / "No tests found", which would have failed the plan's own acceptance criterion (`npx jest src/common/types/__tests__/storePolicy.test.ts` exits 0).
- **Fix:** Created `src/common/jest.config.js`, mirroring the existing `src/backend`/`src/preload` project config exactly (node test environment, `resetMocks: true`, `ts-jest` transform, `roots: ['<rootDir>/src/common']`), and added `'<rootDir>/src/common'` to the root `jest.config.js`'s `projects` array.
- **Files modified:** `src/common/jest.config.js` (new), `jest.config.js`
- **Commit:** `118b62a3`

None else — plan executed exactly as written otherwise.

## Issues Encountered

- One acceptance-criterion self-collision, self-caught before commit: the header comment's prose "has zero imports of 'electron', ..." matched the acceptance grep `electron'` (looking for a literal unquoted-Electron-import pattern), even though the file has no actual `electron` import. Reworded to "has zero imports of Electron, `fs`, or `path`" — same meaning, drops the literal matched substring. Caught and fixed before the Task 1 commit, so no separate deviation entry.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `storePolicy.ts`'s `filterStoreSnapshot()`/`isAllowedStoreField()` are the one policy surface plans 29-04 (eager snapshot handler) and 29-06 (write path) must call — their own acceptance criteria grep for that call in each handler.
- `BOOT_SET_STORES`/`LAZY_STORES` are available for 29-04's snapshot-scope decision and 29-05's `STORE_FETCH_CHANNEL` lazy-hydrate handler.
- The seven `sidecarTransport.ts` channel constants are ready for 29-05 to wire real listeners — until then, `storeSet`/`storeDelete`/`storeNew` frames still vanish into an empty listener array with zero signal (29-RESEARCH Pitfall 1, documented in this plan's own comments as a heads-up to the next plan).
- `npx tsc --noEmit -p tsconfig.json` is clean; the full suite (`npx jest --silent`) passes 110/110 suites, 1929/1929 tests, including the new `Common` project. `src/preload/api/misc.ts` is untouched (`git status --short` confirms), satisfying the plan's own verification requirement.
- No blockers for 29-04 (next plan in the wave).

---
*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: src/common/types/storePolicy.ts
- FOUND: src/common/types/__tests__/storePolicy.test.ts
- FOUND: src/common/jest.config.js
- FOUND: .planning/phases/29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw/29-03-SUMMARY.md
- FOUND: commit 2a4c7514 (Task 1)
- FOUND: commit 289aef73 (Task 2)
- FOUND: commit 118b62a3 (Task 3)
