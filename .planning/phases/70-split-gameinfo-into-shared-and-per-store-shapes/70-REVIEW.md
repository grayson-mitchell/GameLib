---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
reviewed: 2026-11-14T00:00:00Z
depth: standard
files_reviewed: 118
files_reviewed_list:
  - .github/workflows/lint.yml
  - .husky/pre-push
  - meta/__tests__/gameInfoNarrowingCeiling.test.ts
  - meta/__tests__/gameInfoNarrowingWiring.test.ts
  - meta/gameInfoNarrowingBaseline.json
  - meta/gameInfoNarrowingCeiling.cjs
  - package.json
  - src/backend/__tests__/storeReadOnly.test.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/launcher.ts
  - src/backend/macArch/__tests__/recovery.test.ts
  - src/backend/macArch/recovery.ts
  - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
  - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/gameInfoParity.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/install.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/queueStorePush.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/settings.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/settingsParity.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/wineTools.test.ts
  - src/backend/sidecar/__tests__/phase70PassthroughCensus.test.ts
  - src/backend/sidecar/__tests__/steamFlows.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
  - src/backend/storeManagers/gog/__tests__/gogRuntime.test.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/gogRuntime.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/gog/stores.ts
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/legendary/__tests__/legendaryRuntime.test.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/legendary/legendaryRuntime.ts
  - src/backend/storeManagers/legendary/library.ts
  - src/backend/storeManagers/legendary/stores.ts
  - src/backend/storeManagers/nile/library.ts
  - src/backend/storeManagers/nile/stores.ts
  - src/backend/storeManagers/sideload/library.ts
  - src/backend/storeManagers/steam/__tests__/bridgeRouteVerdict.test.ts
  - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/library.localLibrary.test.ts
  - src/backend/storeManagers/steam/__tests__/queueHeadRevalidation.test.ts
  - src/backend/storeManagers/steam/__tests__/staleQueueHeadCancel.regression.test.ts
  - src/backend/storeManagers/steam/bridgeInstallState.ts
  - src/backend/storeManagers/steam/gameMetadata.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library/index.ts
  - src/backend/storeManagers/steam/library/installPollOnce.ts
  - src/backend/storeManagers/steam/library/macArch.ts
  - src/backend/storeManagers/steam/library/refresh.ts
  - src/backend/storeManagers/steam/library/resume.ts
  - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
  - src/backend/storeManagers/steam/library/uninstallPolling.ts
  - src/backend/storeManagers/steam/macArchKnownFix.ts
  - src/backend/storeManagers/steam/state.ts
  - src/backend/storeManagers/steam/stores.ts
  - src/backend/storeManagers/storeManagerCommon/games.ts
  - src/backend/storeMigrations/__tests__/fixtures/download-manager-gameinfo-v1.json
  - src/backend/storeMigrations/__tests__/fixtures/download-manager-real-keys.json
  - src/backend/storeMigrations/__tests__/fixtures/gog-installed-gameinfo-v1.json
  - src/backend/storeMigrations/__tests__/fixtures/gog-installed-real-keys.json
  - src/backend/storeMigrations/__tests__/fixtures/gog-library-gameinfo-v1.json
  - src/backend/storeMigrations/__tests__/fixtures/gog-library-real-keys.json
  - src/backend/storeMigrations/__tests__/fixtures/legendary-library-gameinfo-v1.json
  - src/backend/storeMigrations/__tests__/fixtures/legendary-library-real-keys.json
  - src/backend/storeMigrations/__tests__/fixtures/nile-library-gameinfo-v1.json
  - src/backend/storeMigrations/__tests__/fixtures/nile-library-real-keys.json
  - src/backend/storeMigrations/__tests__/fixtures/sideload-library-gameinfo-v0.json
  - src/backend/storeMigrations/__tests__/fixtures/sideload-library-real-keys.json
  - src/backend/storeMigrations/__tests__/fixtures/steam-library-gameinfo-v1.json
  - src/backend/storeMigrations/__tests__/fixtures/steam-library-real-keys.json
  - src/backend/storeMigrations/__tests__/gameInfoLibraries.test.ts
  - src/backend/storeMigrations/gameInfoLibraries.ts
  - src/backend/storeMigrations/index.ts
  - src/backend/storeVersioning/__tests__/gameInfoLibrariesEngine.test.ts
  - src/backend/testUtils/gameInfoFixtures.ts
  - src/common/__tests__/gameInfoNarrowing.test.ts
  - src/common/__tests__/typesHomes.test.ts
  - src/common/gameInfoNarrowing.ts
  - src/common/types.ts
  - src/common/types/game_manager.ts
  - src/common/types/gog.ts
  - src/common/types/ipc/gameDetails.ts
  - src/common/types/ipc/gameInfoSchema.ts
  - src/common/types/ipc/install.ts
  - src/common/types/ipc/runnerMisc.ts
  - src/common/types/ipc/schemaTypes.ts
  - src/common/types/ipc/settings.ts
  - src/common/types/ipc/settingsSchema.ts
  - src/common/types/ipc/steam.ts
  - src/common/types/ipc/wineTools.ts
  - src/common/types/legendary.ts
  - src/common/types/nile.ts
  - src/common/types/sideload.ts
  - src/common/types/steam.ts
  - src/common/types/typed_store.ts
  - src/frontend/helpers/stores.ts
  - src/frontend/hooks/hasAnticheatInfo.ts
  - src/frontend/hooks/hasStatus.ts
  - src/frontend/screens/Game/GamePage/components/Achievements.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
  - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - src/frontend/screens/Game/ModifyInstallModal/GOG/index.tsx
  - src/frontend/screens/Game/TimeContainer/index.tsx
  - src/frontend/screens/Library/__tests__/filterEngine.test.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/index.tsx
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/librarySort.ts
findings:
  critical: 0
  warning: 7
  info: 3
  total: 10
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-11-14
**Depth:** standard
**Files Reviewed:** 118 (46 tests reviewed lightly)
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Only hunks from `(70-NN)` commits were judged; other sessions' work in the same range was excluded.

The reader migration holds up. I traced every `asStoreGame(x, '<store>')?.field` site against who writes that field. `isEAManaged`, `isUbisoftManaged` and `namespace` are written only by `legendary/library.ts`. `is_delisted`, `steamPlatformsCaptured`, `installable`, `steamResumePending` and `extra.steamPlaytimeMinutes`/`steamLastPlayed` are written only by Steam. `installedDLCs` is GOG-only, and `browserUrl` is set only by SideloadDialog. So none of the narrowings changes what a real runner sees. Objects with no `runner` (the `{}` that SteamGame returns on a double cache miss) gave `undefined` for these fields before the change and still do. The strip migration is idempotent and only deletes keys. It falls back to the file's store when an item has no `runner`, and leaves unknown runners alone. Nested strictness comes straight from the schemas. I also tested the `setSetting` superRefine under zod 4.6.7: an invalid `key` never reaches `appSettingsShape[key]`.

The problems are in the enforcement layer around the split:

- The new CI ratchet step does not run while lint is red, which it is today.
- The ratchet can be bypassed in at least four ways. One bypass is already in use.
- `addNewApp` accepts every runner member, but its handler only ever writes a sideload entry.
- The strict IPC schemas are stricter than the D-12 strip, which covers only part of the data they validate.
- Settings writes became strict with no strip migration for per-game config files.

No BLOCKER is proven. On the operator's profile, a counts-only census of Steam metadata and GamesConfig found nothing the strict schemas would reject. The schema-versus-strip gaps are latent: they depend on what is on disk.

## Warnings

### WR-01: The GameInfo narrowing ratchet step is skipped in CI whenever an earlier step fails, which is the case today

**File:** `.github/workflows/lint.yml:48-51`, `.husky/pre-push:2`
**Issue:** The new `GameInfo narrowing ceiling` step has no `if:`, so it gets the default `success()` condition and is skipped as soon as any earlier step fails. The comment on the step just above (`Backend DI ceilings`) records this exact failure: "from a58e3e3e8 a red `Lint code.` hid ceiling drift (quick 261114-2gg)". That step was fixed with `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}`. `pnpm lint` is red today: the 70-13, 70-14 and 70-16 summaries all record the `depotRust/updateEstimate.ts:138` error. So D-15's CI enforcement currently never runs. Pre-push is in the same position: the ratchet is chained after `pnpm lint && … && pnpm backend-di-ceilings`. `deferred-items.md` records that `backend-di-ceilings` fails today too, so the pre-push run never reaches the ratchet either.
**Fix:**
```yaml
      - name: GameInfo narrowing ceiling
        if: ${{ !cancelled() && steps.deps.outcome == 'success' }}
        run: pnpm gameinfo-narrowing-ceiling
```
In pre-push, run the ceiling checks so that each one executes regardless of the others, then combine their exit codes. Do not short-circuit them behind `&&`.

### WR-02: The ratchet does not count several ways to narrow, and one is already used to dodge it

**File:** `meta/gameInfoNarrowingCeiling.cjs:31-42,135-138`; `src/backend/testUtils/gameInfoFixtures.ts:5-41`; `src/common/storeCapabilities.ts:157-160`
**Issue:** `countNarrowing` counts only `isStoreGame`/`asStoreGame` calls and the five `*GameInfo` identifiers. Each of these narrows a GameInfo and is not counted:
- `GameInfoByRunner['steam']`. `gameInfoFixtures.ts` uses it for exactly this reason: its own line-5 comment says so, and the 70-13 summary (deviation 1) records it as the way to keep the count at 0.
- `Extract<GameInfo, { runner: 'steam' }>`.
- `isStore(game, 'steam')`. Its overload `subject is T & { runner: K }` narrows the `GameInfo` union to the member type. SideloadDialog reads `browserUrl` after `isStore(info, 'sideload')` and compiles. D-03 says "Don't add a parallel `runner === '…'` escape hatch", but `isStore` already is one, and the ratchet ignores it.
- `src/common/**`. It is shared code by definition, and `SCAN_DIRS` leaves it out.

So shared code can read store-only fields without the shrink-only baseline ever changing.
**Fix:** Count `GameInfoByRunner` (indexed access), `Extract<…GameInfo…>`, and `isStore(` calls whose first argument has a GameInfo type. A syntactic approximation is fine: count every `isStore(` call whose second argument is a string literal, in files that also mention `GameInfo`. Add `src/common` to `SCAN_DIRS`, exempting `src/common/types/**` and `gameInfoNarrowing.ts`. Then rename the fixture builders' return types so the dodge is visible, or give `src/backend/testUtils` its own baseline entry with a reason.

### WR-03: The `addNewApp` schema accepts any runner, but the handler always writes a sideload entry

**File:** `src/common/types/ipc/gameDetails.ts:32`; `src/backend/gamedetails/dispatch.ts:355-357`; `src/backend/storeManagers/sideload/library.ts:25-38`
**Issue:** `addNewApp: z.tuple([gameInfoSchema])` accepts all five members. `dispatch.addNewApp` always routes to `managers.library['sideload'].addNewApp`. That method builds `{ runner: 'sideload', … }` and now reads `browserUrl`/`customUserAgent`/`launchFullScreen` through `asStoreGame(gameInfo, 'sideload') ?? {}`. A payload with `runner: 'gog'` (or any other member) therefore passes the strict IPC check and is written into `sideload_apps/library` as a sideload game. Its browser fields are silently dropped, where the pre-phase code read them regardless of runner. The channel's only sink is sideload, so its strict schema should accept only the sideload member. As written it is strictness in name only.
**Fix:**
```ts
import { sideloadGameInfoSchema, installPlatform } from './gameInfoSchema'
// …
addNewApp: z.tuple([sideloadGameInfoSchema]),
```
In `SideloadLibraryManager.addNewApp`, type the parameter as `SideloadGameInfo` and destructure the three fields directly, dropping the `asStoreGame(...) ?? {}`.

### WR-04: The strict GameInfo schema rejects data the D-12 strip never cleans, with no self-heal

**File:** `src/backend/storeMigrations/gameInfoLibraries.ts:40-53`; `src/common/types/ipc/gameInfoSchema.ts:94-114,165-169`; `src/backend/storeManagers/steam/library/refresh.ts:450-459`
**Issue:** D-12's reasoning is "strip at load so the IPC schema can be strict". The strip does less than the schema checks:
1. **Nulls.** The strip removes only undeclared keys. Every declared optional key in the schema is `.optional()`, which rejects `null`. The one exception is `legendary.save_path`, which was widened after a census of one profile. Any other `null` written by a third-party payload or an older build, such as `art_logo`, `developer`, `description` or `extra.releaseDate`, survives the strip. The game then fails `install`/`updateGame` with `IPC_INVALID_ARGS`.
2. **Array elements.** `treeOf` deliberately never recurses into arrays. But `extra.reqs[]` and `gog_save_location[]` are `z.strictObject` elements in the schema, so an extra key inside an element survives the strip and is rejected at IPC.
3. **Sources outside D-12.** Every Steam refresh rebuilds the library entry with `extra: { reqs: [], ...(cachedMeta?.extra ?? {}), … }` from `store_cache/steam_metadata.json`, a store that has no strip chain. Any undeclared or null `extra` key there is re-injected into `steam_library` on every refresh, which undoes the migration. The `about` schema also requires both `description` and `shortDescription`. Legendary's `about.description` comes straight from Epic metadata with no default (`library.ts:587`), so an Epic title with no description loses the key in JSON and fails install.

None of these shows up on the operator's profile: I ran a counts-only census of `steam_metadata.json`, and 70-13 censused the library files. But the "unknown key is a real bug" premise only holds if the strip and the schema agree. When they disagree, the user can no longer install or update that game, and nothing recovers it.
**Fix:** Derive the strip from the same schema as the check, and make it cover what the schema checks:
- In `treeOf`, recurse into `z.ZodArray` whose element is a `ZodObject`, and strip each element.
- Drop `null` for any key whose schema rejects `null` (`!schema.safeParse(null).success`).
- Add a strip chain for `store_cache/steam_metadata` (its `extra`), or sanitize `cachedMeta.extra` through the Steam extra key set at the `refresh.ts` spread.
- Default `description` to `''` in `legendary/library.ts`, as `shortDescription` already is.

### WR-05: Settings IPC is strict, but no migration cleans the per-game config files the renderer round-trips through it

**File:** `src/common/types/ipc/settings.ts:23,73-75`; `src/common/types/ipc/wineTools.ts:33-36`; `src/backend/game_config.ts:204-238`; `src/backend/storeMigrations/settingsGame.ts:10-12`
**Issue:** `writeConfig` now takes `appSettingsSchema.partial()`, which is strict. The renderer callers send the whole persisted per-game object back: DownloadDialog `:332/:345`, ThirdPartyDialog `:85/:98`, SideloadDialog `:237/:279` and ConsoleMode InstallOverlay `:332` all do `{ ...await requestGameSettings(appName), … }`. `GameConfigV0.readSettings` returns `{ ...defaults, ...settings[appName] }`, which passes on every key in the file, and `flush` is always explicit. So any key ever written to a GamesConfig file comes straight back. The settings chain is identity-only, so nothing removes keys that are no longer declared. One example: `useSteamRuntime` was removed from `GameSettings` in `56b1edc46` (2026-08-10) "with no settings migration". A Linux user who toggled it before then still has it in that game's file. For that game:
- DownloadDialog's `await writeConfig(...)` (engine-override branch) throws `IPC_INVALID_ARGS` after `backdropClick()`, and `install()` never runs.
- The unawaited branch is an unhandled rejection: the chosen `winePrefix`/`wineVersion`/`wineCrossoverBottle` is silently not saved and the install goes ahead without it.
- `runWineCommand`'s `gameSettings` is rejected in the same way.

On the operator's macOS profile, 0 of 53 GamesConfig files carry an undeclared key, so the 70-16 gate could not have hit this.
**Fix:** Add a `settings/game` v1→v2 strip chain derived from `gameSettingsShape` (and `settings/global` from `appSettingsShape`), following the D-12 pattern, so a strict schema has a clean store behind it. Alternatively, have `readSettings` drop keys outside `gameSettingsShape` before it returns. Separately, await and handle the `writeConfig` calls in the install dialogs so a rejection is visible.

### WR-06: Casts and a loose arm weaken the D-11 settings schemas

**File:** `src/common/types/ipc/wineTools.ts:33-36`; `src/common/types/ipc/settingsSchema.ts:24-32`
**Issue:**
- `gameSettingsSchema.partial() as unknown as z.ZodType<GameSettings, GameSettings>` tells the handler every key is present, but the validated value is a partial. A missing `wineVersion`/`winePrefix` reaches the handler typed as defined and fails as a `TypeError` deep in the Wine runner, not as `IPC_INVALID_ARGS`. This is the "cast hiding a type error" pattern that D-09 removed from `install.ts`.
- `noWineInstallation` is `z.looseObject({ bin: z.literal('').optional(), name?, type? })`. It matches any object without a non-empty `bin` and imposes no bounds or types on any other key. `{ wineserver: <any>, lib: <any>, lib32: <any>, … }` passes `writeConfig`/`setSetting('wineVersion')` even though the first arm bounds and types exactly those keys. That makes it the loosest object in the "fully strict" settings surface.
**Fix:**
- Type `gameSettingsArg` honestly as `z.ZodType<Partial<GameSettings>>` and make the handler fill in defaults, by merging with `gameConfigs.get(appName).getSettings()`.
- Declare `lib`/`lib32`/`wineserver` on the no-wine arm with the same `z.string().max(4096).nullish()` bounds as `wineInstallationArg()`, and make it strict. Its only purpose is to admit the two known factory defaults (`{ bin: '', name, type }` and `{}`).

### WR-07: `SteamGame.getGameInfo()` now returns an empty object typed as a Steam member

**File:** `src/backend/storeManagers/steam/games.ts:144,174`
**Issue:** The double-miss stub changed from `{} as GameInfo` to `{} as SteamGameInfo`. The type now claims `runner: 'steam'`, `app_name: string` and so on, and the union no longer forces callers to narrow. Code that branches on `getGameInfo().runner` (for example `deps.managers.library[gi.runner]`) or forwards the object to `install`/`updateGame` type-checks but gets `undefined` at runtime. At least four sites already carry comments about this trap (`protocol.ts:444`, `utils.ts:222`, `tools/index.ts:1674`, `uninstaller.ts:132`). Narrowing the stub's type makes the lie more specific: `isStoreGame(gi, 'steam')` and `gi.runner === 'steam'` now disagree on the same value.
**Fix:** Return `SteamGameInfo | undefined`, which `SteamLibraryManager.getGameInfo` already does, and handle the miss at the callers. As a minimum interim step, return `Partial<SteamGameInfo>` so the compiler surfaces each reader.

## Info

### IN-01: The baseline reason for GamePage describes a read the file does not make

**File:** `meta/gameInfoNarrowingBaseline.json` (`src/frontend/screens/Game/GamePage/index.tsx` reason)
**Issue:** The reason says "Legendary-only fields (EA/Ubisoft managed, namespace)", but `GamePage/index.tsx` makes exactly one narrowing, for `isEAManaged`/`isUbisoftManaged` (line 194). It does not read `namespace`. A ratchet reason that does not match the code undermines the "short reviewed allowlist" premise.
**Fix:** Change the reason to "Legendary-only isEAManaged/isUbisoftManaged for the not-supported third-party check".

### IN-02: A GOG launch option can be rejected by the strict `lastUsedLaunchOption` schema

**File:** `src/backend/storeManagers/gog/library.ts:1665-1668`; `src/common/types/ipc/settingsSchema.ts:33-37`
**Issue:** `name: task?.name || infoFile.name` can be `undefined` when neither is present. The strict base arm needs `name: string`, so `setSetting({ key: 'lastUsedLaunchOption', value })` from `helpers/library.ts:372/453` would be dropped silently, because a send channel drops a rejected payload without reporting it. This is low-likelihood, but the choice would not be remembered and nothing would say so.
**Fix:** Write `name: task?.name || infoFile.name || ''`.

### IN-03: GameCard `isInstallable` now treats `null` differently

**File:** `src/frontend/screens/Library/components/GameCard/index.tsx:170`
**Issue:** The old `installable === undefined || installable` evaluated to falsy for `null`. The new `asStoreGame(...)?.installable ?? true` makes it `true`. No writer stores `null` today, since `refresh.ts` always writes `true`, so this has no current effect. It is still a semantic change in a "no behaviour change" phase.
**Fix:** None needed. Optionally use `!== false` to keep the intent explicit.

---

_Reviewed: 2026-11-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
