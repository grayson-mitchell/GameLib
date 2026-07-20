---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 04
subsystem: infra
tags: [crossover, wine, bottle, cxbottle, macos, steam-bridge]

# Dependency graph
requires:
  - phase: 24 (24-01/24-02/24-03)
    provides: vtable/flat shim generator, native helper + wire protocol, bridge-eligibility allowlist
provides:
  - "provisionBridgeBottle() — creates the dedicated GameLibSteamBridge CrossOver bottle, no Windows Steam client installed"
  - "getBridgeBottleSettings() — resolves the bridge bottle for runWineCommand callers"
  - "isBridgeBottleReady() — cxbottle.conf-only readiness signal for the bridge bottle"
  - "DEFAULT_BRIDGE_BOTTLE_NAME ('GameLibSteamBridge') constant"
affects: [24-08 (games.ts installBridgeGame integration), 24-09 (D-11 fallback provisioning), 24-10 (hardware UAT)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forked-primitive pattern: provisionBridgeBottle() reuses provisionBottle()'s cxbottle-create argv-form spawnAsync call verbatim but drops the SteamSetup.exe download/run half entirely"
    - "Narrower readiness signal: isBridgeBottleReady() intentionally does NOT reuse isBottleReady() (which requires a bottled steam.exe) — it checks cxbottle.conf existence only, since the bridge bottle never contains a bottled Steam client by design (R6)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts

key-decisions:
  - "isBridgeBottleReady() cannot reuse isBottleReady() — that function requires a bottled steam.exe to exist, which the bridge bottle must NEVER have (R6); reusing it would make the bridge bottle permanently non-ready"
  - "getBridgeBottleSettings() does not read steamBottleConfigStore overrides (unlike getSteamBottleSettings()) — the bridge bottle name/engine are not user-configurable this phase, matching D-03's single shared bottle"
  - "D-08 CrossOver-only guard applied at the wineVersion-parameter level: a caller-supplied non-crossover WineInstallation.type is rejected before any cxbottle call, rather than inspecting global settings (this function's only caller is 24-08's installBridgeGame(), which is expected to pass no wineVersion override in the normal case)"

patterns-established:
  - "Grep-verifiable absence: the R6 acceptance criterion (no SteamSetup.exe reference in provisionBridgeBottle) is enforced by an actual test reading bottle.ts's own source via node:fs (real, unmocked) and slicing from the function declaration to EOF, following the manifest.test.ts precedent for source-grep acceptance tests"

requirements-completed: [R4, R6]

# Metrics
duration: ~20min
completed: 2026-07-20
---

# Phase 24 Plan 04: Dedicated Bridge Bottle Provisioning Summary

**`provisionBridgeBottle()` creates a new, distinct `GameLibSteamBridge` CrossOver bottle via the same `cxbottle --create --template win10_64` primitive `provisionBottle()` uses, but never downloads or runs the Windows Steam installer — closing the R6 gap where every prior spike ran inside the Phase 17 bottle that already contains a full bottled Windows Steam client.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-20T06:40:39Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `DEFAULT_BRIDGE_BOTTLE_NAME` (`'GameLibSteamBridge'`), distinct from the Phase 17 `DEFAULT_STEAM_BOTTLE_NAME` (`'GameLibSteam'`) — closes RESEARCH.md Pitfall 1 (the spikes' opportunistic reuse of the Steam-client-containing bottle).
- `provisionBridgeBottle(opts?)` — sanitizes the bottle name (`sanitizeBottleName`, T-24-06), rejects a non-CrossOver `wineVersion` before any side effect (D-08, T-24-09), idempotently short-circuits via `isBridgeBottleReady()`, creates the bottle via the same locked argv-form `cxbottle --create --bottle <name> --template win10_64` `spawnAsync` call `provisionBottle()` uses, and kills the wineserver afterward (`killBottleWineServer` idiom, avoiding `cxstart` per the SPEC tooling-hygiene constraint). Never references the Windows Steam installer artifact or its download URL — grep-verified via a source-slice test.
- `getBridgeBottleSettings()` — mirrors `getSteamBottleSettings()`'s `GameSettings` composition but always resolves `DEFAULT_BRIDGE_BOTTLE_NAME`, never reading a stored per-install override (the bridge bottle is one shared bottle, D-03).
- `isBridgeBottleReady()` — a deliberately narrower readiness signal than `isBottleReady()`: checks only `cxbottle.conf` existence (via `isBottleProvisioned()`), since the bridge bottle must never contain a bottled Windows Steam client (R6), so gating on `steam.exe` presence would make it permanently non-ready.

## Task Commits

Each task was committed atomically:

1. **Task 1: provisionBridgeBottle() + getBridgeBottleSettings() (no SteamSetup, CrossOver-only)** - `94459b14` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/bottle.ts` - Added `DEFAULT_BRIDGE_BOTTLE_NAME`, `isBridgeBottleReady()`, `getBridgeBottleSettings()`, `provisionBridgeBottle()`
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` - 26 new tests: constant distinctness, readiness-signal semantics (no steam.exe required), settings resolution, name sanitization, D-08 CrossOver-only rejection/acceptance, idempotent short-circuit, argv-form cxbottle create call shape, custom bottle names, no-downloadFile/no-runWineCommand assertions, error paths (create fails / throws), wineserver-kill scoping, and a real-source-grep test asserting `provisionBridgeBottle`'s own text contains no `SteamSetup.exe`/`STEAM_SETUP_EXE_URL` reference

## Decisions Made

- `isBridgeBottleReady()` intentionally does NOT reuse `isBottleReady()` — see key-decisions in frontmatter. This was the single design choice most likely to be gotten wrong (the plan's own acceptance criteria hint at reusing `isBottleReady(DEFAULT_BRIDGE_BOTTLE_NAME)`, but that function's `steam.exe`-existence check can never be satisfied by a bridge bottle by construction).
- `getBridgeBottleSettings()` does not consult `steamBottleConfigStore` at all (no bridge-specific store keys were added) — kept the plan's `files_modified` scope (`bottle.ts` + its test only) tight; a persisted bridge-bottle override was not requested by the plan or CONTEXT.md's Claude's-Discretion list, and D-03 describes one shared bottle, not a user-configurable one.
- D-08's CrossOver-only rejection is enforced on the `opts?.wineVersion` parameter specifically (reject if provided and `type !== 'crossover'`), not on the process-wide default wine engine — `provisionBridgeBottle()`'s only caller (24-08, per BLOCKER 1) is not expected to pass an override in the normal path, and bottle *creation* is always hardcoded to `cxbottle` regardless (mirroring `provisionBottle()`'s own unconditional `CXBOTTLE_BIN` usage).

## Deviations from Plan

None - plan executed exactly as written. The threat model's two entries (T-24-06 sanitizeBottleName-before-argv, T-24-09 D-08 CrossOver-only rejection) were both implemented as specified, with tests directly asserting each.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (No live CrossOver/cxbottle installation was exercised — this plan is unit-tested only, per its own `<verification>` block; the live "bottle contains no steam.exe" hardware acceptance check is explicitly deferred to 24-10 per this plan's `<success_criteria>`.)

## Next Phase Readiness

- `provisionBridgeBottle()`, `getBridgeBottleSettings()`, and `isBridgeBottleReady()` are ready for 24-08's `installBridgeGame()` to call inline when `!isBridgeBottleReady()` (BLOCKER 1 — its sole caller per the plan's must_haves).
- No frontend/IPC surface was added in this plan (correct per scope — the bridge bottle has no separate guided-setup dialog; only 24-09's D-11 fallback provisioning targets the Phase 17 bottle).
- Live hardware confirmation that the created bridge bottle genuinely contains no `steam.exe` (R6's real acceptance bar) remains for 24-10, as this plan's `<success_criteria>` states explicitly.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*
