---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 14
subsystem: ipc-schemas
tags: [settings, zod, launch, wineTools, d-10, d-11]
requires: [70-13]
provides:
  - "src/common/types/ipc/settingsSchema.ts: gameSettingsShape, appSettingsShape, appSettingsSchema, gameSettingsSchema, settingKey, launchOptionSchema"
  - "phase70Passthrough() deleted; census test keeps it gone"
key-files:
  created:
    - src/common/types/ipc/settingsSchema.ts
    - src/backend/sidecar/__tests__/ipcSchemas/settingsParity.test.ts
    - src/backend/sidecar/__tests__/phase70PassthroughCensus.test.ts
  modified:
    - src/common/types/ipc/settings.ts
    - src/common/types/ipc/steam.ts
    - src/common/types/ipc/wineTools.ts
    - src/common/types/ipc/schemaTypes.ts
    - src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/queueStorePush.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 14: Strict settings, launch and wineTools schemas Summary

writeConfig is a strict partial of the full AppSettings shape, setSetting validates `value` against the schema of its `key`, launch LaunchParams (with the LaunchOption union) and wineTools gameSettings are strict, and `phase70Passthrough()` is deleted with a census test.

## Commits

- 5dbc1429c feat(70-14): strict settings, launch and wineTools IPC schemas
- e1ac327c3 test(70-14): settings parity, per-key fixtures, delete phase70Passthrough

## What changed

- `settingsSchema.ts` declares every GameSettings/AppSettings key with its value type (enums for literal unions, bounded strings/arrays, strict nested objects). `settingKey` is an enum over every key. `launchOptionSchema` is a `z.union` of three strict arms.
- `settings.ts`: `configArg = appSettingsSchema.partial()` with no cast; setSetting envelope uses `superRefine` against `appSettingsShape[key]`; an optional key accepts `null` or an absent value.
- `steam.ts` launch and `wineTools.ts` gameSettings no longer use the helper.
- Tests: `settingsParity.test.ts` (tsc `Equal` parity for AppSettings, GameSettings, LaunchParams, key union, negative control; a typed full-record of one valid value per key so a new key breaks tsc; null/absent per optional key; wrong-value samples across kinds; backend default AppSettings and default GameSettings, built through `createGlobalConfig`/`createGameConfigs`, pass writeConfig). Launch rows for each LaunchOption arm in `queueStorePush.test.ts` (where the launch fixture lives, not steamAuth.test.ts).
- `unknownFutureKey` moved from the valid writeConfig row to an invalid row. The `darkTrayIcon` setSetting fixture (retired key) became `trayIconVariant`; `darkTrayIcon` is now an invalid row.

## Deviations from Plan

1. **[Rule 1 - Bug] wineVersion admits the no-wine factory default.** The backend default is `{ bin: '', name: 'Default Wine - Not Found', type: 'wine' }` when no wine is on PATH, and `{}` on Windows. `wineInstallationArg()` requires a non-empty `bin`, so the default AppSettings failed writeConfig (found by the defaults test; T-70-31). `wineVersionArg` is now `union([wineInstallationArg(), noWineInstallation])`, a named loose boundary, cast to `WineInstallation`. `wineInstallationArg()` itself is unchanged.
2. **[Rule 1 - Bug] wineTools gameSettings keeps a cast and is partial.** The renderer sends a persisted GameSettings (defaults merged with the game file); the defaults never set some required keys (`ignoreGameUpdates`, `DXVKFpsCap`, and on Windows `winePrefix`/`wineVersion`). A required-key strict schema would reject the sideload installer's `runWineCommand`. So `gameSettingsArg = gameSettingsSchema.partial() as unknown as z.ZodType<GameSettings, GameSettings>`: keys and value types are strict, presence is not. This contradicts the plan's "no cast" / `z.ZodType<GameSettings` count 0 for wineTools.ts; that acceptance grep now reports 1 and is not a pass.
3. **[Rule 3] `value` in setSetting is `z.unknown().optional()`.** zod 4 treats an absent `unknown` key as required; JSON drops a positional `undefined`, so an optional key set to undefined would have been rejected and silently dropped (send channel).
4. **[Rule 3] `LaunchOption.executable` is the branded `Path`.** Schema uses `str().brand<'Path'>()` (type-only brand; the handler validates), and the compile check is `satisfies z.ZodType<LaunchOption>` (input side is unbranded).
5. `testContainment.test.ts` gained one list entry for the new census test (required by its set-equality tripwire).

## Acceptance-grep notes

- `phase70Passthrough` grep over settings.ts/steam.ts/wineTools.ts: 0 (was non-zero: real pass). `grep -rn "phase70Passthrough(\|PHASE70-PASSTHROUGH" src meta` excluding the census test: empty (real pass; the helper is gone from schemaTypes.ts).
- `z.ZodType<(Partial<AppSettings>|LaunchParams|GameSettings)` count: 0 for settings.ts and steam.ts, 1 for wineTools.ts (deviation 2).
- `wineInstallationArg()` count in settingsSchema.ts is 1 (>= 1).
- setSetting per-key coverage is asserted via the typed full-record plus `Object.keys(validValues)` equal to `Object.keys(appSettingsShape)` rather than a literal fixture table.

## Verification

tsc clean; `npx jest src/backend/sidecar` 3245 tests, 1 flake (`outboundHttpRegistry` WebSocket case, passes alone 9/9, unrelated); rendererZodGuard, `pnpm check:ipc-contract`, `pnpm find-deadcode` (PASS), `pnpm boundaries`, `pnpm gameinfo-narrowing-ceiling` (PASS 785 files) green; prettier clean. `pnpm lint`: the one pre-existing error at `updateEstimate.ts:138` (other session), nothing from this plan.

## Known Stubs

None.

## Threat Flags

None new. T-70-29/30/31/33 mitigated; T-70-32 accepted (wineVersion stays loose). Live settings gate remains 70-16.

## Self-Check: PASSED
