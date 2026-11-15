---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
reviewed: 2026-11-16T00:00:00Z
depth: standard
diff: 83746beb1 (test), eea599129 (feat)
files_reviewed: 4
files_reviewed_list:
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - public/locales/en/gamelib.json
findings:
  critical: 1
  warning: 5
  info: 0
  total: 6
status: issues_found
---

# Phase 76 Code Review

Reviewed at standard depth by gsd-code-reviewer. `src/backend/engine/engineSwitch.ts` and
`src/backend/engine/offlineRefusal.ts` were read for context only. Tests were not run by the reviewer.
Line numbers marked `~` are approximate.

## Critical

### CR-01: Marker-less Wine-Staging bottle is mis-inferred as CrossOver; DRM switch silently no-ops (UAT item 3 gap)

**Files:** `src/backend/storeManagers/steam/gameBridgeLaunch.ts:184-216`, `src/backend/engine/engineSwitch.ts:422-437` (`inferMarker`), `:693` (silent `writeMarker`)

`launchBridgeGameBody` runs `preflightCrossover` before `prepareDrmBottleForCrossover`. On a
Staging-created bottle with no `.gamelib-engine.json`, the preflight's demo-status probe makes CrossOver
rewrite `cxbottle.conf` with a `Timestamp`. `inferMarker` keys on `/Timestamp/`, so `prepareBottleForEngine`
infers `crossover`, matches `next`, returns `{ok:true, changed:false}`, and persists a crossover marker on a
bottle still carrying Staging's DXVK-macOS and a possibly live pinned wineserver — the mislabel persists for
later launches. It also defeats `drmOfflinePrecheck`: `readBottleEngineMarkerKind` returns null for the
absent marker, so the offline refusal never fires for this bottle. Confirmed live (76-UAT.md item 3).

**Candidate fixes:**

1. Write the marker at pinned-bottle creation — root-cause fix; does not heal existing marker-less bottles.
2. Run the switch before the preflight — not viable alone: `next.binDir`/`crossoverBuild` come from the
   preflight result, and it drops the "CrossOver unhealthy → don't touch the bottle" gate.
3. Infer-and-persist the marker before both `drmOfflinePrecheck` and `preflightCrossover` — cheap, heals
   existing bottles; a never-CrossOver-touched conf has no `Timestamp`, so it infers pinned correctly.

**Recommended:** 1 + 3. **Test gap:** every test mocks `prepareBottleForEngine`; add an engineSwitch-level
test where `cxbottle.conf` gains `Timestamp` between inference and preflight.

## Warnings

### WR-01: `drmSwitchRefused` leaks a raw reason code and gives wrong advice for `invalid-bottle`

**Files:** `src/backend/storeManagers/steam/gameLaunch.ts:~897-905`, `public/locales/en/gamelib.json:709`

The catch-all interpolates `reason: prep.reason`, so users see "(invalid-bottle)"/"(game-running)", and the
copy says "Close any game running from this bottle" even for `invalid-bottle`. The test only checks the key.
**Fix:** a separate `invalid-bottle` string; human wording for `game-running` or drop `({{reason}})`.

### WR-02: Dead branch and wasted lookup in `drmOfflinePrecheck`

**File:** `src/backend/storeManagers/steam/gameLaunch.ts:~796-835`

`override` is pinned to `'crossover'`; `offlineLaunchCertainlyBlocked` only yields `crossover-missing` when
`override === 'automatic'`, so that arm is unreachable and the `isCrossoverMissing(...)` call (dynamic
imports + deps) cannot change the outcome. **Fix:** pass `crossoverMissing: false`, drop the dead branch.

### WR-03: Offline refusal reuses the "couldn't download its built-in engine" dialog and `engine-download-failed` tag

**File:** `src/backend/storeManagers/steam/gameLaunch.ts:~828-838`

DRM mode is CrossOver-only; the real cause is that restoring the bottle needs the pin, which is not on
disk. Misleading copy, and telemetry conflates it with real download failures. **Fix:** dedicated string
and tag (e.g. `engine-drm-restore-offline`).

### WR-04: Unresolved DRM install root returns without a terminal `done` (pre-existing)

**File:** `src/backend/storeManagers/steam/gameBridgeLaunch.ts:~175-180`

Calls `maybeNotifyDrmModeFailed` and returns `false` without `sendLaunchDone`, unlike every other early
return in the DRM block; the card can stay in a launching state. **Fix:** send `done` there (if
`maybeNotifyDrmModeFailed` does not already).

### WR-05: `setting-up` status not cleared on success; uncaught `drmLaunchSetup` throw leaves no `done`

**File:** `src/backend/storeManagers/steam/gameLaunch.ts:~868-876`

`onSwitching` emits `status: 'engine-download'`, `context: 'setting-up'`; on `ok:true` it relies on later
statuses to overwrite it. If `drmLaunchSetup` throws, only explicit failure paths send `done`. **Fix:**
try/finally sending `sendLaunchDone` on non-success exit, or an explicit reset after a successful switch.

### WR-06: Tests mock the whole switch; `bottle-busy` mapped to shared-bottle wording

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:~15995-16170`

All new tests stub `prepareBottleForEngine` and `preflightCrossover`; ordering (precheck → preflight →
switch), `crossoverHealthy` default, `ensurePinEngine` wiring and the CR-01 case are untested. The `it.each`
row maps `bottle-busy` to the "shared bridge bottle" dialog, though it means another game is running.
**Fix:** correct the mapping/wording; add an integration test against the real `engineSwitch` on a temp
bottle dir.
