---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
reviewed: 2026-11-14T06:09:10Z
depth: standard
scope: re-review of gap-closure plans 70-17..70-22 (diff 671ed7ff4..HEAD, src/frontend excluded)
files_reviewed: 23
files_reviewed_list:
  - .github/workflows/lint.yml
  - .husky/pre-push
  - meta/__tests__/gameInfoNarrowingWiring.test.ts
  - src/backend/storeMigrations/schemaStrip.ts
  - src/backend/storeMigrations/__tests__/schemaStrip.test.ts
  - src/backend/storeMigrations/gameInfoLibraries.ts
  - src/backend/storeMigrations/index.ts
  - src/backend/storeMigrations/__tests__/gameInfoLibraries.test.ts
  - src/backend/storeMigrations/settingsGame.ts
  - src/backend/storeMigrations/__tests__/settingsGame.test.ts
  - src/backend/storeMigrations/settingsGlobal.ts
  - src/backend/storeMigrations/__tests__/settingsGlobal.test.ts
  - src/backend/storeManagers/steam/library/refresh.ts
  - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
  - src/backend/storeManagers/legendary/library.ts
  - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
  - src/backend/constants/others.ts
  - src/common/types.ts
  - src/backend/storeVersioning/__tests__/gameInfoLibrariesEngine.test.ts
  - src/backend/storeVersioning/__tests__/settingsFiles.test.ts
  - src/backend/__tests__/settingsVersioning.test.ts
  - src/backend/__tests__/storeReadOnly.test.ts
  - src/backend/engine/__tests__/engineConfig.test.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
gap_status:
  WR-01: resolved
  WR-04: resolved_with_residual
  WR-05: resolved_with_residual
status: issues_found
---

# Phase 70: Code Review Report (gap-closure re-review, 70-17..70-22)

**Reviewed:** 2026-11-14T06:09:10Z
**Depth:** standard
**Files Reviewed:** 23 (source plus tests; I skimmed the fixtures)
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This review covers the changes since `671ed7ff4`, limited to the gap-closure plans 70-17 through 70-22 (G1/WR-01, G2/WR-04, G3/WR-05). For the large shared files I judged only the changed hunks. I traced callers and readers where a hunk depends on them: `config.ts`, `game_config.ts`, `engineConfig.ts`, `gameMetadata.ts`, `settingsMirrorResync.ts`, `settingsSchema.ts` and `gameInfoSchema.ts`. I also ran `stripToSchema` against the real project schemas with `tsx` to confirm the edge cases below. I did not assume them.

The gap closures are mostly sound:

- **The single schema-derived strip** (`schemaStrip.ts`) does what its header says for the constructs the project schemas use today:
  - it removes undeclared keys at every depth, including inside array elements and record values;
  - it removes `null` on members that reject it;
  - it removes optional members that are still invalid, inner members first;
  - it leaves loose and catchall objects alone, so `dlcList` and the `wineVersion` loose arm are preserved;
  - it is safe against `__proto__` (verified).
- **`.partial()` on a strict object stays strict** under the installed zod (verified), so the settings strips are really strict.
- **The v2→v3 re-strip** reaches profiles that the original 70-15 strip had already stamped v2.
- **Steam's refresh path cleans its rebuilt entries.** These come from `store_cache/steam_metadata.json`, so this cleaning closes the re-injection route that WR-04 named.

The new defects come from the strip's drop rules rather than from its coverage:

- Inside a union, dropping invalid optionals can change which variant a value is.
- Required arrays and objects are dropped as a whole when one element or field is bad. In a cache that does not matter, but in user-state settings it means data loss.

No BLOCKER is proven. Each defect needs on-disk data that I could not show exists on a real GameLib profile.

## Gap closure verdicts

### WR-01 (narrowing ratchet masked in CI and pre-push): RESOLVED

- **CI.** `lint.yml:53` now carries `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}`. The `deps` id exists (`lint.yml:24`). This is the same guard as `Backend DI ceilings`.
- **Pre-push.**
  - `.husky/pre-push:4` runs the ratchet outside the `&&` chain.
  - Both exit statuses are captured right after their own command, before anything else can overwrite `$?`.
  - The two are combined so that a red result from either one fails the push.
  - The graphify step still runs only when everything is green.
- **Tests.** `gameInfoNarrowingWiring.test.ts` pins the CI condition, including a near-miss that removes the guard. It also executes the real hook against a stubbed `pnpm` and covers four cases: all green, red DI ceilings, red lint, and a red ratchet alone. That is a behavioural check, not just a text match. The stub's `PATH` leaves out `~/.local/bin`, so graphify cannot run during the test.

### WR-04 (GameInfo caches not schema-clean): RESOLVED, with residual risk (see WR-03 below)

Each of the four sub-points in the original finding is now handled:

| Original sub-point | What fixes it now |
| --- | --- |
| Nulls | Removed when the member is optional and rejects `null`. |
| Array elements | Recursed into. |
| `steam_metadata` re-injection | Sanitised at `refresh.ts:483`. |
| Legendary `about.description` | Defaulted to `''` (`legendary/library.ts:588`). |

The residual is that the strip runs once per store version. Of the in-memory regeneration paths, only Steam's refresh re-strips. Required members are never repaired. The `''` default covers `undefined` but not `null`.

### WR-05 (settings/game and settings/global not schema-clean): RESOLVED, with residual risk (see WR-01 and WR-02 below)

`settings-game-v1-v2` and `settings-global-v1-v2` strip against `gameSettingsSchema.partial()` and `appSettingsSchema.partial()`. `currentGameConfigVersion` and `currentGlobalConfigVersion` are both now `'v2'`, and `GameConfigVersion` and `GlobalConfigVersion` admit `'v2'`. The tests show a v1 file carrying `useSteamRuntime` plus a wrong-typed value round-tripping through the strict `writeConfig` schema.

Three things are left:

- The strip's granularity can delete valid user settings (WR-02).
- Union coercion applies to `lastUsedLaunchOption` (WR-01).
- The original fix's second half was not done: the install dialog's unawaited `writeConfig` (IN-05).

## Warnings

### WR-01: Union handling can silently turn a launch option into a different variant

**File:** `src/backend/storeMigrations/schemaStrip.ts:84-90` (with `cleanObject` at lines 49-57)
**Issue:** For an invalid union value, `clean` tries each option in declaration order. Within an option it applies `dropInvalidOptional`. `launchOptionSchema` lists `baseLaunchOption` first, and that arm's `type: z.literal('basic').optional()` is optional. So the base arm:

- deletes the `'dlc'` or `'altExe'` discriminant as an "invalid optional";
- strips `dlcAppName`, `dlcTitle` and `executable` as undeclared;
- accepts the result if `name` and `parameters` happen to be present.

The value then wins as a *basic* option, even though the dlc or altExe arm would also have cleaned it successfully. I verified this:

```
stripToSchema({type:'dlc', dlcAppName:'a', dlcTitle:'b', name:'N', parameters:''},
              launchOptionSchema, {dropInvalidOptional:true})
// -> {"name":"N","parameters":""}
```

`settings-game-v1-v2` runs this on every persisted `lastUsedLaunchOption`. A remembered DLC or alternate-exe launch would quietly become "launch the base game with these parameters". Nothing is logged, and the original survives only in the backup. The result also depends on the arm order in `settingsSchema.ts`, which nobody would expect to be load-bearing.
**Fix:** Never let an arm's own discriminant be dropped. Before any lossy pass, prefer the arm whose literal members already match the value:

```ts
if (inner instanceof z.ZodUnion) {
  if (accepts(inner, value)) return value
  const opts = inner.options as z.ZodType[]
  // pass 1: strip undeclared keys only (no dropInvalidOptional)
  for (const o of opts) {
    const c = clean(value, o, { dropInvalidOptional: false })
    if (accepts(o, c)) return c
  }
  // pass 2: lossy, but only on arms whose literal members the value already satisfies
  for (const o of opts) {
    if (!literalMembersMatch(unwrap(o), value)) continue
    const c = clean(value, o, options)
    if (accepts(o, c)) return c
  }
  return value
}
```

Add a regression test for the dlc and altExe cases above.

### WR-02: A whole user setting is deleted when one leaf inside it is bad

**File:** `src/backend/storeMigrations/schemaStrip.ts:54-56,71-74`; `src/backend/storeMigrations/settingsGame.ts:28-41`; `src/backend/storeMigrations/settingsGlobal.ts:49-62`
**Issue:** The strip never removes array elements or required members. A bad leaf therefore makes the enclosing required container invalid. `.partial()` turns every top-level setting into an optional, and `dropInvalidOptional` then removes the entire setting. I verified two cases:

- `enviromentOptions: [{key:'A',value:'1'}, {key:'B',value:null}]` gives `{}`. Every environment variable for that game is deleted, not just the bad one. `wrapperOptions`, `gogSaves`, `customWinePaths` and `dismissedSignInNotices` behave the same way: one out-of-enum store in `dismissedSignInNotices` brings back every dismissed notice.
- A `gamescope` object without `additionalOptions` gives `{}`. The header comment at `settingsGame.ts:9-11` names this "older-build `gamescope`" as an expected input. The runtime already tolerated it, since `gamescopeCommand.ts:68` uses `settings.additionalOptions ?? ''`. Yet the migration discards every gamescope field (upscaling, limiter, resolution). The global strip can do the same, and `getFactoryDefaults()` has no `gamescope` to fall back on.

These are user-state files, not regenerable caches. "The default applies" (`settingsGame.ts:14`) is not a recovery here: the user's environment variables and wrappers have no default. The 0600 backup is invisible to the user and nothing is logged. The 70-21 and 70-22 trade-off notes accept dropping *an invalid value*. They do not accept dropping its valid siblings.
**Fix:** For settings, make the strip element- and leaf-granular, and repair known legacy shapes before validating:

- add a `dropInvalidElements` option and use it in the settings chains, so an invalid array element is removed and the rest are kept;
- fill `gamescope.additionalOptions ??= ''` (and any other known additive fields) before the strip;
- log, without values, each top-level key the migration removed, so a lost setting can be traced to its backup.

### WR-03: Only the Steam regeneration path keeps GameInfo clean; nothing reports an entry that is still invalid

**File:** `src/backend/storeManagers/steam/library/refresh.ts:480-487`; `src/backend/storeManagers/legendary/library.ts:588`; `src/backend/storeMigrations/gameInfoLibraries.ts:79-85`
**Issue:**

1. **The strip runs once per store version.** After v3 is stamped, the GOG, Legendary, Nile and Sideload in-memory entries are rebuilt by their producers on every refresh, and nothing strips them. The renderer then sends those entries to the strict `install`/`updateGame` schemas. Their producers are typed object literals, which makes undeclared keys unlikely. But nulls and array-element shapes are not compile-checked.
2. **The Legendary fix covers only part of the case.** `description = ''` defaults `undefined` only. An Epic payload with `description: null` still produces `about.description: null`, which `aboutSchema` rejects. The Steam equivalent uses `??` (`gameMetadata.ts:119`), which also covers null.
3. **Required members are never repaired, and nothing says so.** `stripToSchema(...) as SteamGameInfo` casts without validating. For example, `title: app.name` can be `undefined` when the CM omits a name. An entry like that is still pushed and persisted, then fails `install` with `IPC_INVALID_ARGS`, and no log points to the cause.

**Fix:**

- Use `description ?? ''` in Legendary. One way: `const description = metadata.description ?? ''`, outside the destructure default.
- After each `stripToSchema` call, run `schema.safeParse(clean)`. On failure, log the issue paths with `logWarning` (paths only, no values) so a still-invalid entry is visible.
- Either apply the same strip at the GOG, Legendary and Nile `library.set` sites, or record in the phase notes that their producers are trusted. If you trust them, add a parity test that runs each producer's output through its member schema.

## Info

### IN-01: The `schemaStrip.ts` header claims more than the code delivers

**File:** `src/backend/storeMigrations/schemaStrip.ts:1-17,29-39,63-92`
**Issue:** The header says the strip and the schema "can never disagree". `unwrap` handles only Optional, Nullable and Default. `clean` handles only Object, Array, Record and Union. Any member later written with `.pipe`/`.transform`, `.catch`, `.prefault`, `z.lazy`, `z.intersection`/`.and`, `z.tuple` or `.readonly()` passes through untouched, so the strip and the schema silently diverge again. None of these is used today.
**Fix:** In `clean`, throw in tests (or return and count) on an unrecognised schema class that wraps structure. Alternatively, add a drift test that walks `gameInfoSchema`, `gameSettingsSchema` and `appSettingsSchema` and asserts every node is a handled class or a leaf.

### IN-02: Every v0 or v1 per-game config now gets a rewrite and a backup on first access, even when nothing changes

**File:** `src/backend/storeMigrations/settingsGame.ts:27-41`; `src/backend/engine/__tests__/engineConfig.test.ts:211-214`
**Issue:**

- The non-identity v1→v2 step rewrites, re-stamps and backs up every GamesConfig file on its first `GameConfigs.get` or `readStoredGameConfig` call, including files the strip leaves byte-identical. On the operator's 53-file profile that means 53 backups.
- `readStoredGameConfig`, a read path, now writes. The test `readEngineForGame … never writes` was kept green by stamping its fixtures `version: 'v2'`, not by covering the migrating read.
- After a rollback to a pre-v2 build, every touched settings file is "newer" and therefore read-only.

**Fix:** Have the engine skip the rewrite and the backup when a non-identity step's output deep-equals its input. Keep the version bump implicit until the next real write. Add an `engineConfig` test for a v1 fixture that asserts exactly one migration write and none after it.

### IN-03: The `store/config.json` settings mirror keeps the retired and invalid keys that the global strip removed

**File:** `src/backend/settingsMirrorResync.ts:16-21`
**Issue:** `mergeSettingsMirror` keeps keys that only the mirror holds, by design. After `settings-global-v1-v2`, `config.json` no longer has `useSteamRuntime` or a dropped invalid value, but the mirror keeps them forever. Today the renderer only reads named fields from the mirror (`defaultInstallPath`, `dismissedSignInNotices`, `hideChangelogsOnStartup`), so nothing strict receives it. Even so, the claim that the store is clean does not cover the mirror.
**Fix:** In the resync, drop mirror keys that are not in `appSettingsShape` once. Alternatively, record the mirror as an explicit non-strict surface.

### IN-04: The function name and comment say "keys", but the function now drops values too

**File:** `src/backend/storeMigrations/gameInfoLibraries.ts:44-59`; `src/backend/storeMigrations/settingsGlobal.ts:12-13`
**Issue:** `stripUndeclaredGameInfoKeys` now also removes nulls and invalid optional values. The `settingsGlobal` comment says "The factory default then applies for each removed value". That is false for `winePrefix`: `config.ts:261-268` overwrites it after the spread with `defaultSettings?.winePrefix?.replace(...)`, so a removed `winePrefix` becomes `undefined` rather than `sharedWinePrefix`. The per-game path does fall back (`game_config.ts:220`).
**Fix:** Rename the function to `cleanGameInfoItem`. Correct the comment, or make `getSettings` fall back with `winePrefix ?? factory.winePrefix`.

### IN-05: The second half of WR-05 was not done: an install-dialog `writeConfig` is still unawaited

**File:** `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:345-353` (outside this review's file list; noted for traceability)
**Issue:** The `wineVersion` branch still calls `writeConfig({...})` without `await` or `.catch`. With the stores now clean this is far less likely to reject. But if it does reject (see WR-01 and WR-02 for remaining ways strict-invalid data can exist), the result is still an unhandled rejection, and the install proceeds without the chosen prefix or Wine version.
**Fix:** Write `await writeConfig(...)` and surface the error, as the `engineOverride` branch two lines above already does.

## Prior findings outside the gap scope (still open, not counted above)

Plans 70-17 to 70-22 did not target these, and I confirmed each is unchanged at HEAD:

| ID | Status | Evidence |
| --- | --- | --- |
| prior WR-02 (ratchet blind spots) | open | `meta/gameInfoNarrowingCeiling.cjs:29` still has `SCAN_DIRS = ['src/frontend', 'src/backend']`, with no `GameInfoByRunner`/`isStore` counting |
| prior WR-03 (`addNewApp` accepts any runner) | open | `src/common/types/ipc/gameDetails.ts:32` still uses `gameInfoSchema` |
| prior WR-06 (settings casts and the loose no-wine arm) | open | not touched |
| prior WR-07 (`{} as SteamGameInfo`) | open | `src/backend/storeManagers/steam/games.ts:174` |
| prior IN-01 / IN-02 / IN-03 | open | `gog/library.ts:1666` still has `task?.name \|\| infoFile.name` |

---

_Reviewed: 2026-11-14T06:09:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
