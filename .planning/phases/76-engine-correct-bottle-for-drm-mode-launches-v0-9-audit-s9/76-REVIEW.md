---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
reviewed: 2026-11-17T00:00:00Z
depth: standard
diff: cca9701f4..HEAD (76-03 aa4f95deb, 51861c8dc; 76-04 30bb27f50, 357d839af)
files_reviewed: 7
files_reviewed_list:
  - src/backend/engine/engineSwitch.ts
  - src/backend/engine/__tests__/engineSwitch.test.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/gameInstallBridge.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 76: Code Review Report (gap closure 76-03 / 76-04)

**Reviewed:** 2026-11-17
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the gap-closure diff `cca9701f4..HEAD` for the seven listed files. Context reads:
`bottlePrimitives.ts` (`createFallbackBottle`), `gameLaunch.ts` (`maybeNotifyDrmModeFailed`,
`sendLaunchDone`), `engineDecision.ts`, `toolSettings.ts`, `bridgeWineTools.ts`, `launcher.ts`
(`autoInstallDxvk` gating). The reviewer did not run the tests.

The fix holds for the case UAT items 6-8 exercised. `inferMarker` now ranks DXVK-macOS above the
`Timestamp`. `prepareBottleForEngine` distrusts a crossover marker when DXVK-macOS is present. New
bridge bottles get a marker when they are created, and the DRM branch reconciles the marker before
`drmOfflinePrecheck` and `preflightCrossover`. The claim that `autoInstallDxvk` only installs on
non-CrossOver engines is correct: `launcher.ts:640-643` deletes it for `crossover`. Because
`createFallbackBottle` fails when DXVK does not install, `status: 'done'` means DXVK is present.
The 76-01 WR-04 path now sends a terminal `done`.

No blockers. The main remaining defect: the distrust rule exists only inside the switch. The
read-only marker views (offline refusal, Wine tools, inconclusive pre-flight) still accept a
contradicted crossover marker, so the TCP path and the tool paths disagree with the switch about
which engine the bottle is on.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Read-only marker views do not apply the CR-01 distrust rule, so they disagree with the switch

**File:** `src/backend/engine/engineSwitch.ts:237-322` (`readBottleEngineMarkerKind`, `readBottleEngineMarkerSummary`, `restoreNeedsAbsentPin`) vs `:460-475` (`trustedMarker`) and `:827`
**Issue:** `prepareBottleForEngineBody` applies `trustedMarker`. If a crossover marker sits on a
bottle that has `current_dxvk-macOS`, the switch treats the bottle as `pinned`. The three read-only
views call `readMarker` directly and still report `crossover`. Only the DRM branch heals the marker
first, through `reconcileBottleEngineMarker`. Every other caller sees the contradiction. That
includes the TCP launch offline refusal (`gameLaunch.ts:556-558`), `launchEngine.ts:354-359` for
other stores, the Wine-tools engine choice (`toolSettings.ts:271`, `bridgeWineTools.ts:135`), and
the inconclusive pre-flight (`engineDecision.ts:622`).

Here is what happens when a bottle still carries a crossover marker that the pre-fix code wrote
onto a Staging bottle (the exact state CR-01 described):

- **Offline TCP launch:** `offlineLaunchCertainlyBlocked` sees `crossover`, so the dedicated
  offline refusal never fires. The switch then distrusts the marker and needs a restore source.
  `resolveRestoreSource` cannot download the pin offline, and the user gets a generic `dxvk-failed`.
- **Wine tools:** they run through CrossOver on a bottle the switch treats as Staging.

**Fix:** Make the views use the same trust rule. For example:
```ts
const raw = readMarker(bottleDir, ctx)
const marker = trustedMarker(bottleDir, bottleName, raw)
if (!marker) return null // readBottleEngineMarkerKind / Summary
// restoreNeedsAbsentPin: when raw is a contradicted crossover marker, treat prev as the
// inferred pinned marker (restore needed, pin = ENGINE_PINS.current)
```
Use a non-logging variant of `trustedMarker` so the views do not log a warning on every read. An
alternative is to call `reconcileBottleEngineMarker` at the top of the TCP branch and in the
tool-settings resolvers. Add a test where each view reads a crossover marker plus DXVK-macOS.

### WR-02: `reconcileBottleEngineMarker` persists a guessed pin id and an empty wineserver, which turns off the pre-restore kill

**File:** `src/backend/engine/engineSwitch.ts:437-445`, `:493-495`; consumed at `:607-623` (`killPrevious`)
**Issue:** Before this change, an inferred marker was rebuilt on every switch. Reconcile now writes
it to disk, guess included:

- `id` is always `ENGINE_PINS.current.id`, even if the bottle was built with
  `ENGINE_PINS.previous`. `gameInstallBridge` passes `creation.pin.id`, so this can happen.
- `wineserverBin` is `''` whenever the current pin is not installed.

From then on the marker is trusted. In `killPrevious`, `bin === ''` gives `allowed === false`. The
code logs "ignoring marker wineserver outside the engine roots" and never stops the bottle's Staging
wineserver before the CrossOver restore. This holds even after the pin is installed, until some
later switch rewrites the marker. Before this change, re-inference would have picked up the
installed pin's wineserver. The wrong pin id also feeds `resolveRestoreSource` (DLL list) and the
`cx-inconclusive` "keep the bottle's built-in engine" branch in `engineDecision.ts:622-636`.
**Fix:** Do not persist an engine identity you cannot resolve. Choose one:
1. In reconcile, skip the write (return `null`) when `currentPinEngine()` is null.
2. In `killPrevious`, treat a pinned marker with an empty `wineserverBin` as unresolved and fall
   back to `pinnedEnginePaths(pinById(prev.id) ?? ENGINE_PINS.current)` when that pin is installed.

Option 2 also covers the existing inferred-marker case.

### WR-03: `recordPinnedBottleEngine`, `recordCrossoverBottleEngine` and `reconcileBottleEngineMarker` report success when the write failed

**File:** `src/backend/engine/engineSwitch.ts:495-500`, `:540-545`, `:557-572`; `writeMarker` at `:371-396`
**Issue:** `writeMarker` catches every error (ENOSPC, EACCES, rename failure) and logs only a
generic "engine marker write failed". It returns `void`, so all three new functions then log
"recorded at creation: …" or "reconciled before the CrossOver pre-flight: …" and return
`true`/`'pinned'`. The boolean contract the tests assert (`toBe(true)`) is therefore not true for
I/O failures. During triage the log claims a marker exists when it does not, and that is exactly
the evidence someone would check for a CR-01 recurrence.
**Fix:** Have `writeMarker` return `boolean` and propagate it:
```ts
function writeMarker(...): boolean { ...; renameSync(tmp, markerPath(bottleDir)); return true } catch { ...; return false } }
// record*/reconcile:
if (!writeMarker(ctx.versioning, target.bottleDir, marker)) return false
logInfo(`… recorded at creation …`)
```

## Info

### IN-01: The test named "the offline pre-check reads the reconciled marker" asserts only call order

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:16353-16362`
**Issue:** Both `reconcileBottleEngineMarker` and `readBottleEngineMarkerKind` are mocks, so the
test proves the order of calls, not that the pre-check sees the reconciled kind. The engine-level
tests do not connect them either.
**Fix:** Rename the test to describe ordering, or add an engineSwitch-level test:
`reconcileBottleEngineMarker` on a marker-less Staging bottle, then `readBottleEngineMarkerKind`,
expecting `'non-crossover'`.

### IN-02: `recordPinnedBottleEngine` drops `dxvk` silently instead of recording `'failed'`

**File:** `src/backend/engine/engineSwitch.ts:534-536`
**Issue:** If `engine.dxvk` is set but `current_dxvk-macOS` is missing, the marker gets no `dxvk`
key. The same-engine retry in `prepareBottleForEngineBody:831` only fires on `dxvk === 'failed'`,
so DXVK would never be reinstalled. `createFallbackBottle` makes this unreachable today because it
fails without the file, so this guard is dead code in practice. Nothing tests that branch.
**Fix:** `marker.dxvk = hasStagingDxvk(dir) ? { dir, version } : 'failed'` when `engine.dxvk` is
set. Otherwise, drop the check and document that the caller provides the guarantee.

### IN-03: Marker-context construction runs outside any try in the provisioning and launch paths

**File:** `src/backend/storeManagers/steam/bridgeBottleLifecycle.ts:570-580`, `:691-702`; `src/backend/storeManagers/steam/gameBridgeLaunch.ts:193-197`
**Issue:** The `record*` and `reconcile*` functions never throw. `switchContextFrom(...)` and
`engineServicesFrom(...)` are evaluated by the caller, though, and they dereference
`engineRuntime.fallback` and `ledger`. If one of them throws after `cxbottle --create` succeeded,
provisioning rejects and leaves a bottle without its cleanup. That contradicts the "never fails
provisioning" intent of the surrounding step. A throw in the launch path would also skip
`sendLaunchDone`.
**Fix:** Wrap each block in `try { … } catch (e) { logWarning(...) }`, or have the `record*` and
`reconcile*` functions take the services and build the context inside their own try.

### IN-04: The prologue and id regex are duplicated across the new exports

**File:** `src/backend/engine/engineSwitch.ts:486-491` vs `:506-517`; regex at `:342`, `:362`, `:527`
**Issue:** `reconcileBottleEngineMarker` repeats `markerWritable` (name check, migration,
read-only check) except for the `cxbottle.conf` test. `/^[A-Za-z0-9._-]{1,64}$/` now appears three
times. If one copy drifts, the guards stop matching.
**Fix:** Have reconcile call `markerWritable` and then check `cxbottle.conf`. Hoist the regex to a
`const SAFE_ID`.

---

## Prior review (76-01, 2026-11-16)

Kept as history. Status after the 76-03/76-04 gap closure (`gameLaunch.ts` and
`public/locales/en/gamelib.json` are unchanged since `cca9701f4`, so findings in those files are
still open):

| Prior ID | Status |
| -------- | ------ |
| CR-01 | **Resolved.** 76-03 hardened `inferMarker` and added contradicted-marker distrust; 76-04 added creation-time markers and launch-time reconcile, implementing candidate fixes 1 + 3. Validated live in UAT items 6-8. Residual inconsistency in the read-only views is raised above as WR-01. |
| WR-01 | Open (`gameLaunch.ts` not touched). |
| WR-02 | Open. |
| WR-03 | Open. |
| WR-04 | **Resolved.** `sendLaunchDone` added at `gameBridgeLaunch.ts:180`, asserted in games.test.ts. |
| WR-05 | Open. |
| WR-06 | **Partially resolved.** The real-switch CR-01 test on a temp bottle dir now exists (engineSwitch.test.ts "76 gap" block). The `bottle-busy` to shared-bottle wording mapping is unchanged. |

Original 76-01 review body follows.

Reviewed at standard depth by gsd-code-reviewer. `src/backend/engine/engineSwitch.ts` and
`src/backend/engine/offlineRefusal.ts` were read for context only. Tests were not run by the reviewer.
Line numbers marked `~` are approximate.

### Critical (76-01)

#### CR-01: Marker-less Wine-Staging bottle is mis-inferred as CrossOver; DRM switch silently no-ops (UAT item 3 gap)

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

### Warnings (76-01)

#### WR-01: `drmSwitchRefused` leaks a raw reason code and gives wrong advice for `invalid-bottle`

**Files:** `src/backend/storeManagers/steam/gameLaunch.ts:~897-905`, `public/locales/en/gamelib.json:709`

The catch-all interpolates `reason: prep.reason`, so users see "(invalid-bottle)"/"(game-running)", and the
copy says "Close any game running from this bottle" even for `invalid-bottle`. The test only checks the key.
**Fix:** a separate `invalid-bottle` string; human wording for `game-running` or drop `({{reason}})`.

#### WR-02: Dead branch and wasted lookup in `drmOfflinePrecheck`

**File:** `src/backend/storeManagers/steam/gameLaunch.ts:~796-835`

`override` is pinned to `'crossover'`; `offlineLaunchCertainlyBlocked` only yields `crossover-missing` when
`override === 'automatic'`, so that arm is unreachable and the `isCrossoverMissing(...)` call (dynamic
imports + deps) cannot change the outcome. **Fix:** pass `crossoverMissing: false`, drop the dead branch.

#### WR-03: Offline refusal reuses the "couldn't download its built-in engine" dialog and `engine-download-failed` tag

**File:** `src/backend/storeManagers/steam/gameLaunch.ts:~828-838`

DRM mode is CrossOver-only; the real cause is that restoring the bottle needs the pin, which is not on
disk. Misleading copy, and telemetry conflates it with real download failures. **Fix:** dedicated string
and tag (e.g. `engine-drm-restore-offline`).

#### WR-04: Unresolved DRM install root returns without a terminal `done` (pre-existing)

**File:** `src/backend/storeManagers/steam/gameBridgeLaunch.ts:~175-180`

Calls `maybeNotifyDrmModeFailed` and returns `false` without `sendLaunchDone`, unlike every other early
return in the DRM block; the card can stay in a launching state. **Fix:** send `done` there (if
`maybeNotifyDrmModeFailed` does not already).

#### WR-05: `setting-up` status not cleared on success; uncaught `drmLaunchSetup` throw leaves no `done`

**File:** `src/backend/storeManagers/steam/gameLaunch.ts:~868-876`

`onSwitching` emits `status: 'engine-download'`, `context: 'setting-up'`; on `ok:true` it relies on later
statuses to overwrite it. If `drmLaunchSetup` throws, only explicit failure paths send `done`. **Fix:**
try/finally sending `sendLaunchDone` on non-success exit, or an explicit reset after a successful switch.

#### WR-06: Tests mock the whole switch; `bottle-busy` mapped to shared-bottle wording

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:~15995-16170`

All new tests stub `prepareBottleForEngine` and `preflightCrossover`; ordering (precheck → preflight →
switch), `crossoverHealthy` default, `ensurePinEngine` wiring and the CR-01 case are untested. The `it.each`
row maps `bottle-busy` to the "shared bridge bottle" dialog, though it means another game is running.
**Fix:** correct the mapping/wording; add an integration test against the real `engineSwitch` on a temp
bottle dir.

---

_Reviewed: 2026-11-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
