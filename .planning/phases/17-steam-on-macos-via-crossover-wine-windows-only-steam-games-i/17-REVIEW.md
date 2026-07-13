---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
reviewed: 2026-07-13T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/constants.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/main.ts
  - src/backend/tools/index.ts
  - src/preload/api/steam.ts
  - src/common/types.ts
  - src/common/types/electron_store.ts
  - src/common/types/game_manager.ts
  - src/common/types/ipc.ts
  - src/common/types/steam.ts
  - src/frontend/App.tsx
  - src/frontend/hooks/hasStatus.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamBottleSetup.ts
  - src/frontend/types.ts
  - src/frontend/screens/Game/GameContext.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
  - src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-07-13
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Reviewed the Phase 17 (Steam on macOS via CrossOver/Wine) change surface — the
bottle foundation/provisioning/dispatch (`bottle.ts`), bottle-aware library/poll
logic (`library.ts`, `games.ts`), IPC boundary, and the guided-setup frontend.

The core scope-fence work is largely solid: `sanitizeBottleName` blocks path
traversal, `appId` is numeric-guarded before every `cxbottle`/`steam.exe`/`runWineCommand`
dispatch, all subprocess spawns use argv arrays (no shell), and `runWineCommandOnGame`
hard-refuses `runner === 'steam'`.

However there is **one BLOCKER**: the single most important scope invariant of the
phase — "Steam is NEVER installed into the shared GameLib GOG/Epic bottle" (constants.ts
D-01) — is enforced only by frontend defaults, not by the backend. `provisionBottle`
accepts any renderer-supplied `bottleName` with no check that it differs from the user's
shared bottle, and the guided-setup dialog exposes a "Use shared Wine prefix" toggle that
actively feeds the shared bottle name in. Because `provisionBottle`'s win32→win64 recreate
branch runs `wineserver -k` + `cxbottle --delete --force` + `rmSync`, this can *delete the
user's shared GOG/Epic bottle* (data loss). The known `pollInstallOnce` timer leak
(deferred) was not re-reported per instructions.

## Critical Issues

### CR-01: `provisionBottle` has no scope guard against the shared GOG/Epic bottle — reachable delete/contaminate path (data loss)

**File:** `src/backend/storeManagers/steam/bottle.ts:540-615` (with `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx:166-180` and `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx:69-72`)

**Issue:** `provisionBottle` trusts the renderer-supplied `bottleName` and never verifies it is distinct from the user's shared `wineCrossoverBottle`; the win32-recreate branch then kills wineserver, `cxbottle --delete --force`s, and `rmSync`s that bottle directory — so a `bottleName` equal to the shared GOG/Epic bottle destroys it. The `killBottleWineServer` docstring itself declares "`WINEPREFIX` MUST be the dedicated Steam bottle … Never the shared GameLib GOG/Epic bottle dir", but nothing in code enforces that; the caller (`provisionBottle`) can be handed the shared name.

**Failure scenario:** A macOS user with an existing CrossOver `GameLib` GOG/Epic bottle (created 32-bit — a common CrossOver default) clicks Install on a Windows-only Steam game, the guided setup dialog opens, and they toggle "Use shared Wine prefix" in the embedded `WineSelector` (warned-against but fully functional). `WineSelector` calls `setCrossoverBottle(globalConfig.wineCrossoverBottle)` (= the shared bottle), `handleConfirm` sends `steamBottleProvision({ bottleName: <sharedBottle> })`, and `provisionBottle` sees `isBottleProvisioned(shared) && bottleWineArch(shared) === 'win32'` → runs `killBottleWineServer(shared)` (terminating the user's running GOG/Epic Wine games) then `cxbottle --delete --force` + `rmSync(getBottleDir(shared))`, permanently deleting every GOG/Epic Wine game installed in that bottle. On a win64 shared bottle it instead skips create and installs a multi-GB Windows Steam client *into* the shared bottle (persistent contamination), and persists the shared name to `steamBottleConfigStore`, so all future bottled-Steam ops keep targeting it.

**Fix:**
```ts
// In provisionBottle(), after sanitizeBottleName and BEFORE step 2b/delete:
const sharedBottle = GlobalConfig.get().getSettings().wineCrossoverBottle
if (sharedBottle && bottleName === sharedBottle) {
  logError(
    `provisionBottle: refusing to provision into the shared GOG/Epic bottle "${bottleName}" (D-01 scope fence)`,
    LogPrefix.Steam
  )
  return {
    status: 'error',
    error: 'Refusing to install Steam into the shared Wine bottle.'
  }
}
```
Additionally, remove/disable the "Use shared Wine prefix" toggle from the Steam guided-setup `WineSelector` (or ignore its `crossoverBottle` output), since a dedicated bottle is mandatory here.

## Warnings

### WR-01: bottle install starts an ACF poller even when the dispatch failed

**File:** `src/backend/storeManagers/steam/games.ts:549-557`

**Issue:** `install()` calls `startInstallPolling(this.appId, { source: 'bottle' })` unconditionally after `tellBottledSteamToInstall`, so a failed dispatch (`result.status === 'error'`) still spawns a ~60s bottle poller and emits `installing` status before the returned error surfaces.

**Failure scenario:** The bottled Steam client is momentarily not ready / `runWineCommand` throws → `tellBottledSteamToInstall` returns `{status:'error'}`. The user still sees the game flip to an "installing" state (poller emits `gameStatusUpdate {status:'installing'}` on any transient ACF) for up to a minute before the grace window stops it, contradicting the error result also returned to the DownloadManager.

**Fix:**
```ts
const result = await tellBottledSteamToInstall(this.appId)
if (result.status !== 'done') {
  return { status: 'error', error: result.error }
}
startInstallPolling(this.appId, { source: 'bottle' })
return { status: 'done' }
```

### WR-02: `SteamBottleConfig.loggedIn` is declared/consumed but never written — always reports `false`

**File:** `src/common/types/steam.ts:25`, `src/backend/main.ts:899-905` (never set anywhere in `src/backend`)

**Issue:** `loggedIn` is a required field of `SteamBottleConfig` and is surfaced by the `steamBottleStatus` IPC handler, but no backend code ever writes it (grep for `set('loggedIn'` / `loggedIn: true` returns nothing). The `main.ts:892` comment claims it "is only ever flipped by the guided-setup flow", but that flow does not set it. It therefore permanently reports `false`.

**Failure scenario:** Any current or future consumer that gates behavior on `steamBottleStatus().loggedIn` (its stated D-04 purpose) will always see the bottled client as logged-out even after a successful login, silently mis-driving UI/routing.

**Fix:** Either wire the guided-setup completion to `steamBottleConfigStore.set('loggedIn', true)`, or remove `loggedIn` from `SteamBottleConfig`, the `steamBottleStatus` return `Pick`, and the docstring so no consumer trusts a dead signal.

## Info

### IN-01: `steamBottleStatus` polling banner cannot observe `provisioned` flipping true on its own

**File:** `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx:105-114`; `src/backend/main.ts:899-905`

**Issue:** The provisioning banner polls `steamBottleStatus`, which returns the raw stored `provisioned` flag. That flag is only self-healed to `true` as a side effect of `isBottleReady()` (bottle.ts:253), which the status handler never calls — so the "Steam is installed" state depends on an unrelated routing call happening to run. (Related to the signed-off GAP-17-PROVISIONED-FLAG-STUCK; noted, not re-litigated.)

**Fix:** Have `steamBottleStatus` (or a dedicated readiness IPC) call `isBottleReady()` so the persisted flag reconciles on the same read the banner polls.

### IN-02: `getInstallLabel` called with inconsistent arity

**File:** `src/frontend/screens/Game/GamePage/components/GameStatus.tsx:147` vs `151-155`

**Issue:** The `is.installing` branch calls `getInstallLabel(gameInfo.is_installed, is.notAvailable)` (omitting `statusContext`), while the non-installing branch passes all three args. Harmless today (the installing branch doesn't reach a `statusContext`-dependent label), but the asymmetry is a latent trap if label branches are reordered.

**Fix:** Pass `statusContext` in both call sites for consistency.

---

_Reviewed: 2026-07-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
