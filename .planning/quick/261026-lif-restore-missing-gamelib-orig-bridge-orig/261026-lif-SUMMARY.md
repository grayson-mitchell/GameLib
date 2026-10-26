---
phase: quick-261026-lif
plan: 01
subsystem: steam-bridge
tags: [steam, bridge, depot, shim, repair]
requires: []
provides:
  - downloadSelectedDepotFiles (filtered depot fetch, no ACF)
  - restoreBridgeSteamApiOriginals (per-shim .gamelib-orig restore)
  - SteamBridgeScanVerdict.originalFingerprints and fingerprint-based rescan
  - real SteamGame.repair() for bridge titles, Steam "Verify and Repair" menu item
affects: [bridge placement, SteamGame.repair, GameSubMenu]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/originalRestore.ts
    - src/backend/storeManagers/steam/bridge/__tests__/originalRestore.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/gamedetails/dispatch.ts
    - src/frontend/screens/Game/GameSubMenu/index.tsx
metrics:
  tasks-complete: 3 of 4 (Task 4 is the pending operator checkpoint)
---

# Quick 261026-lif: Restore missing `.gamelib-orig` bridge originals

**Status: code complete (Tasks 1-3 committed); Task 4 operator checkpoint PENDING. The todo has not been moved or closed.**

GameLib's own depot download now restores the game-original `steam_api*.dll` as `<shim>.gamelib-orig`
behind placed bridge shims, `SteamGame.repair()` drives it, and placement rescans when a backup is new or
changed.

## Commits

| Task | Commit | Summary |
|---|---|---|
| 1 | d40082a2b | `downloadSelectedDepotFiles` (depot.ts) + `restoreBridgeSteamApiOriginals` (bridge/originalRestore.ts) |
| 2 | 1b6bab13a | `originalFingerprints` in the verdict, backup-preferred version reads, stale-verdict rescan, reworded hint |
| 3 | 39692c70a | real `SteamGame.repair()`, fingerprint threading at launch, Steam "Verify and Repair" menu item |
| 4 | none | operator checkpoint, see below |

## What was built

- **depot.ts:** exported `downloadSelectedDepotFiles(appId, opts)`, `normalizeDepotPath`, and
  `DownloadSteamDepotsOpts`. It runs buildDepotPlan, keeps only files `select` accepts (never directory or
  symlink entries), recomputes `totalBytes`, and calls `downloadDepotFiles` (injectable seam). It never calls
  `finalizeToSteam`, so no ACF is written, and it never throws (`done | cancelled | error`).
- **originalRestore.ts:** enumerates with the existing bounded `findRuntimeLoadedSteamApiDlls`, classifies
  each dll, makes ONE download call into a staging tree at `<bottle>/.gamelib-restore/<appId>`, verifies the
  sha1 against the manifest and rejects shim-marked bytes, then writes only `<shim>.gamelib-orig` with
  `flag: 'wx'`. The staging dir is removed in `finally`. The live shim is never touched.
- **shimGenerate.ts:** `probeOriginalBackup` exported. Versions come from a restorable `.gamelib-orig` before
  the persisted pool (static and runtime branches). Every verdict (placed, placed-miss, withheld) carries
  `originalFingerprints` (key = path relative to the bottle, `/` separators). Both `already-placed`
  short-circuits fall through when a restorable backup has no persisted fingerprint or a different one (the
  284100 case), logging the reason. Hint now says GameLib's "Verify and Repair".
- **games.ts:** `repair()` resolves the bridge install with the same predicates as `launchBridgeGame`, calls
  the restore helper, returns one `<relpath>: <outcome>` line per file, and throws (naming failed paths) on
  `partial`/`error`, or a scoped error on a non-bridge title. `launchBridgeGame` threads
  `persistedOriginalFingerprints`.
- **GameSubMenu:** "Verify and Repair" shown for Steam; disabled while a Steam game is playing.

## Verification

- `npx jest` on depot.selectedFiles, originalRestore, shimGenerate, bridgeVerdict, bridgeRoute, depot,
  depot.prescreen, games, launchDispatch: all pass (16 new + 10 new shimGenerate + 7 new games tests).
- `npx tsc --noEmit` clean; `pnpm lint:src` exit 0 (0 errors; existing warnings only).
- `npx prettier --check` over every `src/` path written passes.
- `graphify update .` run.

## Deviations from Plan

**1. [Rule 1 - Behaviour change, existing test updated] CR-04 "second call is already-placed" test**
- **Found during:** Task 2
- **Issue:** `shimGenerate.test.ts` "a second call with the shim in place is already-placed with no verdict"
  now rescans, because the first call leaves a `.gamelib-orig` and the second passed no persisted
  fingerprint. That is exactly the 284100 behaviour the plan mandates.
- **Fix:** the test passes the first verdict's `originalFingerprints` back as
  `persistedOriginalFingerprints` (mirrors what `launchBridgeGame` does), so the relaunch stays a no-op. The
  assertion on `already-placed` itself is unchanged.
- **Commit:** 1b6bab13a

**2. [Rule 3] `backup-refused` detection in originalRestore**
- `probeOriginalBackup` returns `no-backup` (not `refused`) for a symlink or non-regular backup path, so the
  restore helper does its own `lstat` to classify those as `backup-refused`, as the plan's outcome list
  requires. `probeOriginalBackup` is still used for the valid-backup case.

**3. Survey count differs from the todo.** The "before" survey found 13 shims and 1 original (230070
`steam_api.dll`, shim=0), not 15 shims. Recorded in BACKFILL.md.

## Known Stubs

None.

## Threat surface

No new surface beyond the plan's threat model (T-lif-01..06 mitigations implemented: sha1 + shim-marker
check, containment + lstat + `wx` write, backup read only when `restorable`, live dll never overwritten).

## Task 4: operator checkpoint (PENDING)

Executor prep done: `pnpm build:sidecar` run (sidecar.js 15:43:45, after the Task 3 commit); BACKFILL.md
written with the "before" survey for all 11 appIds (11 rows, verify command passes). The repair outcome,
`.gamelib-orig present`, relaunch verdict and bridge verified columns are EMPTY and must be filled by the
operator after a live signed-in run. Instructions are at the bottom of
`261026-lif-BACKFILL.md`. On approval: `git mv` the todo from `.planning/todos/pending/` to
`.planning/todos/completed/`, run `pnpm planning-gates`, and copy the filled table here.

### Per-bottle backfill table

See `261026-lif-BACKFILL.md` (before-survey only; operator columns pending).

## Self-Check: PASSED

Commits d40082a2b, 1b6bab13a, 39692c70a exist; created files exist.
