---
phase: quick-260819-r4r
plan: 01
subsystem: frontend-state, sidecar-store-layer
tags: [steam, cache-hydration, cold-start, boot-snapshot]
dependency-graph:
  requires: []
  provides:
    - "steam_library boot-set cache-store registration (storePolicy.ts, sidecar handlers.ts)"
    - "renderer steamLibraryStore CacheStore"
    - "GlobalState.loadSteamLibrary() cold-start seed"
    - "GlobalStateSteamCacheHydration.test.ts anti-drift/anti-regression gate"
  affects:
    - "src/frontend/state/GlobalState.tsx steam.library initial state"
    - "src/backend/sidecar boot snapshot payload (now includes steam_library)"
tech-stack:
  added: []
  patterns:
    - "Fifth CacheStore mirrored into the D-13 boot-set (GOG/Epic/Amazon/Zoom pattern extended to Steam)"
key-files:
  created:
    - src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts
  modified:
    - src/common/types/storePolicy.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
    - src/frontend/helpers/electronStores.ts
    - src/frontend/state/GlobalState.tsx
    - src/common/types/__tests__/storePolicy.test.ts
decisions:
  - "Constructor-only seed: refresh() deliberately left untouched so live pushGameToLibrary state is never clobbered by a stale disk re-read"
  - "loadSteamLibrary() is a plain read (steamLibraryStore.get('games', []) + applyGameOverrides) — no platform-verdict normalisation, no merge of a separate installed-games store"
metrics:
  duration: "~45 min"
  completed: "2026-08-19"
---

# Quick Task 260819-r4r: Cache Steam library on startup Summary

Seeded `GlobalState`'s `steam.library` synchronously from the persisted `steam_library`
cache during construction, giving Steam the same cold-start hydration GOG/Epic/Amazon/Zoom
already have — Steam games now render on the first frame instead of staying empty until a
live CM sync completes.

## Task 1 CONFIRM (c) — live game count

The on-disk cache at
`~/Library/Application Support/gamelib/store_cache/steam_library.json` was a FILLED
specimen: **378 games** in the `games` array. All three CONFIRM checks passed before any
edit was made:
- (a) `steamLibraryStore` in `src/backend/storeManagers/steam/electronStores.ts` still
  constructs as `new CacheStore<GameInfo[], 'games'>('steam_library', null)`.
- (b) `steam_library` was absent from `storePolicy.ts`, `sidecar/handlers.ts`, and
  `frontend/helpers/electronStores.ts` before this plan.
- (c) 378 games confirmed live on disk (see above).

## Out-of-scope finding (recorded per plan's `<output>` spec)

`initStoreManagers()` — and therefore `SteamLibraryManager.init()`, `startRunningPoll()`,
and Steam's interrupted-install resume-surfacing — is **dead code under Tauri**. Its only
call site is `src/backend/main.ts:422`, inside Electron's `whenReady()`. `main.ts` is
imported by nothing in the sidecar chain (`bootstrap.ts` imports `./handlers`, never
`../main`). This is the same class of defect as the known `MigrationSystem` trap
(Electron-only startup code that silently never runs under Tauri). Reviving it would start
resume-surfacing machinery at boot for the first time under Tauri — a known prior root
cause of a silent whole-app crash — so it is deliberately NOT fixed here; the constructor
seed delivered by this plan fully satisfies the user's ask (Steam games visible at cold
start) without touching that surface.

## What changed

1. **`src/common/types/storePolicy.ts`** — added `'steam_library'` to
   `BOOT_SET_CACHE_STORE_NAMES`, putting it in both `BOOT_SET_STORES` (eager pre-mount
   snapshot) and `RECOGNIZED_CACHE_STORE_NAMES` (so the renderer's `storeNew` for it is
   accepted, not refused as DoS-junk).
2. **`src/backend/sidecar/handlers.ts`** — added `'steam_library'` to
   `CACHE_BACKED_STORE_NAMES` so `resolveRawStore('steam_library')` returns the real cached
   games list instead of falling through to the diagnostic `{}` branch.
3. **`src/backend/sidecar/__tests__/storeLayer.test.ts`** — mirrored the same addition in
   the test's local `CACHE_BACKED_STORE_NAMES` list so the round-trip `it.each` covers
   `steam_library`.
4. **`src/frontend/helpers/electronStores.ts`** — declared `steamLibraryStore = new
   CacheStore<GameInfo[], 'games'>('steam_library', null)`, identical shape to
   `gogLibraryStore`, exported alongside the other stores.
5. **`src/frontend/state/GlobalState.tsx`**:
   - Imported `steamLibraryStore`.
   - Added `loadSteamLibrary()`, shaped exactly like `loadLegendaryLibrary` (plain
     `steamLibraryStore.get('games', [])` + `applyGameOverrides`, declared above the
     `state` field so class-field initialisation order resolves correctly).
   - Replaced the hardcoded `steam: { library: [] }` with `library:
     this.loadSteamLibrary()`.
   - Extended `componentDidMount`'s mount-time `refreshLibrary` `runInBackground`
     disjunction with `this.state.steam.library.length !== 0`, so a populated Steam cache
     refreshes behind the already-rendered grid instead of blocking it — the same parity
     the other four runners already have.
   - Confirmed (without changing) that `handleGamePush`'s `steam` branch matches on
     `app_name` and REPLACES a found entry rather than appending, so a seeded game
     converges to live state with no duplicate row.
   - `refresh()` (line ~922) was deliberately left untouched — its final `setState` never
     writes the `steam` slice, so a mount-time refresh cannot clobber freshly pushed
     entries with a staler disk read.
6. **`src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts`** (new) — a
   source-text structural gate with 6 tests: the real seed shape, a mandatory anti-vacuity
   self-test proving the matcher fails against a synthetic old-shape source, a positive
   control proving the matcher correctly resolves the runtime `state:` initialiser rather
   than the earlier `StateProps` TYPE interface's own `steam: { ... }` shape (both start
   with the literal text `steam: `), the loader's plain-read shape, the three-list
   anti-drift check, and the no-credential-surface check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fourth mirrored `BOOT_SET_CACHE_STORE_NAMES` copy in `storePolicy.test.ts` broke after Task 1**
- **Found during:** full-suite verification after Task 3.
- **Issue:** the plan's diagnosis names exactly three mirrored copies of the boot-set
  cache-store list (`storePolicy.ts`, `sidecar/handlers.ts`, `storeLayer.test.ts`). A
  fourth, undocumented local copy exists in
  `src/common/types/__tests__/storePolicy.test.ts` (line 49), consumed by the
  `'every name in STORE_UNIVERSE has an allow-list entry or is a recognized cache store'`
  assertion. Adding `steam_library` to the real `BOOT_SET_CACHE_STORE_NAMES` put
  `steam_library` in `STORE_UNIVERSE` without a matching allow-list entry, and this
  fourth copy — used as the "or is a recognized cache store" fallback — didn't know about
  it, so the assertion went RED.
- **Fix:** added `'steam_library'` to the local `BOOT_SET_CACHE_STORE_NAMES` array in
  `storePolicy.test.ts`, matching the other three mirrors.
- **Files modified:** `src/common/types/__tests__/storePolicy.test.ts`
- **Commit:** `95cfb238a`

**2. [Test infra bug found and fixed during authoring, not a deviation from the plan's scope] `extractArrayBlock`'s marker text self-collision**
- **Found during:** first run of the new Task 3 test.
- **Issue:** the array-extraction helper searched for the array's opening `[` starting
  from the MARKER'S start index, but the marker text itself
  (`'CACHE_BACKED_STORE_NAMES: readonly string[] = '`) contains a `[` as part of the
  `string[]` type annotation. The helper matched that inner bracket and closed
  immediately on the next `]`, silently extracting the 2-character type annotation
  instead of the array literal — Test 4 failed with a false negative.
- **Fix:** start the bracket search from `markerIdx + marker.length` instead of
  `markerIdx`.
- **Files modified:** `src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts`
  (authored in the same commit as the rest of Task 3, no separate commit).

### Flaky/out-of-scope observations (not fixed, not caused by this plan)

Two full-suite runs each surfaced a single, DIFFERENT test failure
(`src/backend/sidecar/__tests__/enrichmentFlows.test.ts` once, then
`src/backend/sidecar/__tests__/devSecretVault.test.ts` on the next full run) — neither
file is in this plan's `files_modified`, both pass cleanly in isolation, and a third
full-suite rerun came back 296/296 (and a fourth scoped rerun 57/57) with zero failures.
This is pre-existing test-order/pollution flakiness, not a regression introduced by this
plan. Logged here per the scope-boundary rule rather than investigated further.

## Self-Check: PASSED

- FOUND: `src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts`
- FOUND: commit `fff96d473` (Task 1)
- FOUND: commit `03b17d106` (Task 2)
- FOUND: commit `95cfb238a` (Task 3)

## Verification results

1. `pnpm jest src/backend/sidecar/__tests__/storeLayer.test.ts src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts` — 2 suites, 42 tests, all green.
2. `pnpm tsc --noEmit` — 0 errors. `pnpm eslint` on all touched files — 0 errors (32 pre-existing warnings, none new/related to this change).
3. `grep -rn "steam_library" src --include="*.ts" --include="*.tsx"` lists exactly 6 files: `storePolicy.ts`, `handlers.ts`, `storeLayer.test.ts`, `frontend/helpers/electronStores.ts`, `backend/storeManagers/steam/electronStores.ts`, `GlobalStateSteamCacheHydration.test.ts`.
4. Baseline (`pnpm jest src/backend/sidecar src/frontend/state`, captured BEFORE any edit): 56 suites / 1154 tests passing. Post-change (same scope, rerun to settle the flake noted above): 57 suites / 1161 tests passing, zero failures — the +1 suite / +7 tests is the new `GlobalStateSteamCacheHydration.test.ts` file joining the scope.
5. Anti-vacuity proof beyond the required self-test: manually reverted the Task 2 seed
   (`steam: { library: [] }`) against the real `GlobalState.tsx`, reran the gate — Test 1
   went RED as expected — then restored the fix and confirmed green again with no diff
   against the committed state.

## Live verification (orchestrator, 2026-08-19 19:56–20:05)

Ran the real app via `pnpm tauri:dev` and confirmed the user-visible behaviour.

**PASS — Steam games render at cold start.** 344 Steam titles in the library grid
(`All Games 344 of 350` with the Store filter narrowed to Steam; GOG contributes the other 6).

**Proof it came from the cache, not a live sync** — the decisive evidence is file mtimes, not the
log (sidecar `console.*` is invisible, so a quiet log cannot prove a quiet network):
- `store_cache/steam_library.json` mtime stayed **19:41:00** across both app launches (19:56, 20:02)
  and still holds 378 entries — no Steam library refresh ran or wrote.
- `store_cache/gog_library.json` was rewritten at **20:02:04** during the same run — refresh
  machinery was demonstrably active and does write; Steam simply never synced.
- The runtime log shows the renderer constructing the new store:
  `[storeWriteHandlers] storeNew ... for 'steam_library'`, alongside the other four libraries, and
  **no** `no live store instance for 'steam_library'` line (which would have been the
  silent-failure signature of a missed `handlers.ts` registration).

**Success criterion 2 of the plan is WRONG as written and is NOT met.** It required the count at
first paint to equal the cached `games` length (378). Actual: 344. The 34-entry difference is
`src/frontend/screens/Library/filterEngine.ts:232-237`, which excludes delisted Steam games (9 in
this library) plus anything in the `nonAvailableGames` / hidden localStorage lists (~25 here). That
filter is pre-existing, shared with every runner, and applied *after* the seed — `applyGameOverrides`
is `attachGameOverrides`, which attaches overrides and never filters, so the seed does pass all 378
into state. The criterion should have been stated against the post-filter count.

**Not verified:** a sub-second first-frame screenshot. The attempt to launch
`target/debug/gamelib-shell` directly for a fast relaunch failed — `build/main/sidecar.js` had been
removed between runs (concurrent session rebuild), so that instance came up with `entry_exists=false`
and no backend at all. The mtime evidence above substitutes for it and is stronger.

## Known Stubs

None.

## Threat Flags

None — this plan's only new trust-boundary surface (`steam_library` entering the eager
boot snapshot and the `storeNew` allow-list) was fully anticipated and mitigated by the
plan's own threat model (T-R4R-01/T-R4R-03), verified by Task 1's CONFIRM (c) live-file
inspection and Task 3's Test 5.
