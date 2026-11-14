# Phase 70: Split GameInfo into shared and per-store shapes - Research

**Researched:** 2026-11-14
**Domain:** TypeScript discriminated-union refactor, zod 4 strict IPC schemas, Phase 68 versioned-store migrations, shrink-only meta ratchets
**Confidence:** HIGH on codebase facts (every number below was measured, mostly by a throwaway `tsc` prototype of the split); MEDIUM on the two judgement calls flagged in Open Questions.

<user_constraints>
## User Constraints (from 70-CONTEXT.md)

### Locked Decisions
- **D-01: Flat discriminated union on `runner`.** `GameInfo = SteamGameInfo | GogGameInfo | LegendaryGameInfo | NileGameInfo | SideloadGameInfo`, each one `extends GameInfoCore` with a literal `runner`. Store fields stay at the top level of the object, so the persisted JSON in the library caches and the IPC payloads stay byte-identical: no Phase 68 shape migration is needed for the split itself. A nested `storeData.<store>` field was considered and rejected, because it would force a must-migrate migration (Phase 68 D-02) on every library cache in a no-behaviour-change phase.
- **D-02: The plain name `GameInfo` is the union**, and `GameInfoCore` is the shared base. The existing importers keep compiling until they read a store field, so the migration shows up as type errors at the exact read sites rather than as a big-bang rename.
- **D-03: One narrowing module in `src/common/`** with `isStoreGame(game, runner): game is <Member>` (a type guard for branching) and `asStoreGame(game, runner): <Member> | undefined` (an accessor). There is no throwing variant. This is the sanctioned way to narrow wherever Phase 62's runner-literal ban applies (`frontend/screens/**`, checked by `meta/runnerLiteralSelectors.cjs`). Don't add a parallel `runner === '…'` escape hatch.
- **D-04: `sideload` is a full union member.** `SideloadGameInfo` carries `browserUrl`, `customUserAgent` and `launchFullScreen` like any other store's fields.
- **D-05: Phase 62's capability flags are untouched.** They live in the per-runner table in `src/common/storeCapabilities.ts`, not on `GameInfo`, so the split doesn't move them.
- **D-06: The rule is "concept shared".** A field belongs in `GameInfoCore` if it means something for every store, even when only one store fills it today. Fields that only make sense for one store go to that store's member. Applying the rule (the planner confirms each one against who sets it):
  - **Core:** `is_mac_native`, `is_linux_native`, `is_windows_native` (a platform concept that sits with the other two, though only Steam fills it; its D-17 `=== true` contract and JSDoc carry over unchanged), `mac_arch`, `metacritic_score` (D-07), `version`, `canRunOffline`, `title`, `art_*`, `install`, `is_installed`, `overrides`, and the save and cloud-save concepts where more than one store has them.
  - **Steam member:** `is_delisted`, `steamPlatformsCaptured`, `installable` (only Steam sets it; confirm), and anything else that only has meaning on Steam.
  - **GOG member:** `gog_save_location`. **Epic (legendary) member:** `namespace`, `dlcList` (only legendary sets it; confirm). **Sideload member:** D-04.
- **D-07: `metacritic_score` stays in core.** (Steam `appdetails` fills it on the backend; PCGamingWiki covers any store through the renderer's wiki map in `useWikiMetacriticScores.ts`, merged by `metacriticScoreOf` in `librarySort.ts`. OpenCritic and IGDB `aggregated_rating` are different scores and must not feed a "Metacritic" sort.)
- **D-08: The split reaches nested objects, with no persisted move.** Per-store nested types narrow the shared ones in place. For example, `SteamGameInfo.extra: SteamExtraInfo` carries `steamPlaytimeMinutes`/`steamLastPlayed`, and GOG's `install` carries `isDosbox`/`dosboxConf`. The JSON paths stay where they are, so no migration is needed, but shared code can no longer reach those fields without narrowing first.
- **Third-party launcher flags** (`thirdPartyManagedApp`, `isEAManaged`, `isUbisoftManaged`): see Claude's Discretion.
- **D-09: Full per-runner zod schema.** The `GameInfo`-carrying passthroughs (install/update args in `src/common/types/ipc/install.ts`, `addNewApp` in `src/common/types/ipc/gameDetails.ts`) become a `z.discriminatedUnion('runner', …)`: a strict core plus a strict member per store, including the nested types from D-08. An undeclared key is rejected with Phase 67's `IPC_INVALID_ARGS`. The `as unknown as z.ZodType<GameInfo, GameInfo>` cast in `install.ts` goes.
- **D-10: The TypeScript types stay hand-written interfaces**, with a compile-time parity test that checks both directions (schema-inferred type ⇄ interface, per member and for the union). Their JSDoc is load-bearing (for example D-17 on `is_windows_native` and MAC32-01 on `mac_arch`), so the types are not replaced with `z.infer`.
- **D-11: The fourth passthrough, `Partial<AppSettings>` in settings writes (`src/common/types/ipc/settings.ts`), is tightened in this phase too**, so all four Phase 67 passthroughs close. Use a settings-key enum with a per-key value type, per Phase 67 D-07's suggestion. When done, `phase70Passthrough()` in `src/common/types/ipc/schemaTypes.ts` has no callers and is deleted, and grepping `PHASE70-PASSTHROUGH` returns nothing.
- **D-12: Unknown keys are stripped at load and rejected at IPC.** A Phase 68 versioned migration on each library cache (`steam-library`, `gog-library` incl. `gog_store/installed`, `epic-library`, `amazon-library`, `sideload-library`; backend stores and the renderer mirror in `src/frontend/helpers/stores.ts`) drops keys that no member declares, so objects from an older build come out clean. It follows Phase 68's backup and non-destructive-fallback rules and has a test fixture of the old shape. The IPC schema can then be strict: an unknown key there is a real bug, not leftover data.
- **D-13: Type homes.** The member types and other store-specific types (for example `GOGCloudSavesLocation`) move into the existing `src/common/types/{steam,gog,legendary,nile}.ts`. Sideload gets `src/common/types/sideload.ts` if needed. When done, `common/types.ts` holds only shared types and re-exports nothing store-specific. They can't go next to the backend store managers, because the frontend can't import backend modules.
- **D-14: Plan now; execute after Phase 69's 3 human UAT items close** (i18next init timing, the DownloadManager sequence token, `runPostMountBoot` gating).
- **D-15: The ratchet is a shrink-only count of non-test files** outside `storeManagers/` and store-specific UI that call `isStoreGame`/`asStoreGame` or name a `*GameInfo` member type. It follows the pattern of Phase 62's ratchets and the `meta/*Ratchet.cjs` / `*Ceilings.cjs` tools. The end state is a short reviewed allowlist, not zero, because some shared UI legitimately needs a store field.
- **D-16: Only a final live gate in `pnpm tauri:dev`.** Waves in between rely on tsc and jest. The final gate must cover: an **upgraded profile** (library caches written by the pre-phase build) whose offline Library loads with all stores intact after the D-12 migration; install and `addNewApp` for each store passing the strict IPC schema; a settings write passing D-11's schema; the Library sort including Metacritic; the Game page; ConsoleMode with delisted Steam games hidden; and the Steam Windows-depot menu item present only when `is_windows_native === true`. UAT items follow the repo's UAT item shape (`gamelib-conventions`).

### Claude's Discretion
- The third-party launcher flags (`thirdPartyManagedApp`, `isEAManaged`, `isUbisoftManaged`; 9 frontend readers). The planner traces who sets each one and applies D-06.
- The final classification of every remaining field under D-06, recorded as a table in the plan.
- The internal layout of the narrowing module (D-03) and of the parity test (D-10).
- How waves are cut by area (backend outside `storeManagers/`, then frontend by screen).

### Deferred Ideas (OUT OF SCOPE)
- Hydrate PCGamingWiki Metacritic scores onto `GameInfo.metacritic_score` for non-Steam games in the backend (behaviour change; future phase or todo).
- Reviewed todos: none folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

ARCH-03 is milestone-level. Suggested phase-level IDs for the planner to mint (all roll up to ARCH-03):

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-03.1 | `GameInfoCore` plus five member types and the union; narrowing module (`isStoreGame`/`asStoreGame`) | Field table; prototype tsc; expand-contract sequencing |
| ARCH-03.2 | Readers outside `storeManagers/` migrated by area; shrink-only ratchet wired into lint.yml and pre-push | Reader inventory; ratchet tooling patterns |
| ARCH-03.3 | Store-specific types moved out of `common/types.ts` (D-13) | Types-to-move list |
| ARCH-03.4 | All `phase70Passthrough()` callers closed with strict schemas; parity test; helper deleted | IPC section (six call sites, not four) |
| ARCH-03.5 | Phase 68 migration strips undeclared keys from every library cache (and the download queue's persisted `gameInfo`) | Migration section |
| ARCH-03.6 | Live gate on an upgraded profile (D-16) | Validation Architecture |
</phase_requirements>

## Summary

Phase 70 is mostly mechanical, and smaller than the importer count suggests. I built a throwaway prototype of the split in a scratch copy of `src/` (core plus five members plus nested `SteamInstalledInfo` / `GogInstalledInfo` / `SteamExtraInfo`, `GameInfo` flipped to the union) and ran `tsc --noEmit` (about 12 s). Against a 10-line baseline of unrelated errors it produced 174 new error lines, from only **16 non-test files inside `storeManagers/`, 19 non-test files outside it (4 backend, 15 frontend), and 10 test files**. Those 19 are the real D-15 starting set. [VERIFIED: scratch tsc prototype, 2026-11-14]

Three findings change the plan's shape and CONTEXT's assumptions:
1. **Sequence by expand-contract, not by flipping the union first.** `tsc` is whole-program, so flipping `GameInfo` to the union turns about 45 files red at once and no per-area plan can commit green. Keep `GameInfo` as today's fat interface while adding `GameInfoCore`, the members and the guards (a member is assignable to the fat interface, and the guard narrows the fat interface to the member; both verified in a micro prototype). Migrate readers area by area with green builds, then flip `GameInfo` to the union in the last code wave and delete the fat interface.
2. **There are six `phase70Passthrough()` call sites in five files, not four.** CONTEXT names install (outer), install (nested `install`), gameDetails and settings. `steam.ts` (`launchParamsArg` / `LaunchParams`) and `wineTools.ts` (`gameSettingsArg` / `GameSettings`) also call it. D-11's end state ("no callers, helper deleted, grep empty") requires closing those two as well. `GameSettings` is a subset of the `AppSettings` shape D-11 already needs, so it comes almost free.
3. **Two things CONTEXT states are not true today.** (a) Delisted Steam games are **not** hidden in ConsoleMode: Phase 37 (REQ-37-02 D-13) removed that, and `ConsoleMode/selectors.ts` no longer reads `is_delisted`. The only `is_delisted` consumers outside `storeManagers/` are `filterEngine.ts` (the "no store page" facet), `GameCard`, `MainButton` and `GameSubMenu`. D-16's "ConsoleMode with delisted Steam games hidden" check would assert behaviour that was deliberately removed; replace it with "delisted games are visible in ConsoleMode and the Library 'no store page' facet still hides them". (b) `thirdPartyManagedApp` is **not** meaningfully set by GOG: GOG writes an explicit `thirdPartyManagedApp: undefined`, which JSON drops. Only legendary produces a value.

**Primary recommendation:** Plan five waves: (0) types, guards, parity-test skeleton, ratchet tool, with `GameInfo` still fat; (1) retype store managers to member types; (2) migrate the 4 backend and 15 frontend readers by area; (3) strict IPC schemas for all six call sites plus the D-12 strip migration; (4) flip `GameInfo` to the union, move types out of `common/types.ts`, freeze the ratchet baseline, delete `phase70Passthrough`; then the D-14-gated live gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `GameInfo` type definitions and narrowing guards | Shared (`src/common`) | — | Both backend and renderer import them; `common` may only `import type` from backend/frontend |
| Strict IPC zod schemas | Backend/sidecar (`src/common/types/ipc`, backend-only value imports) | — | D-04 keeps zod out of the renderer; `rendererZodGuard.test.ts` enforces it. The narrowing module must not value-import `ipc/` or zod |
| Library cache strip migration (D-12) | Backend (`storeMigrations`, `storeVersioning` engine) | — | Migrations run at store construction in the sidecar. The renderer `CacheStore` mirror only proxies `window.api.storeNew`; it carries no `kind` or version |
| Per-store `GameInfo` construction | Backend `storeManagers/<store>` | — | Store managers are the only constructors (plus `SideloadDialog` on the renderer for `addNewApp`) |
| Reader narrowing | Renderer screens and backend shared modules | — | Uses `isStoreGame`/`asStoreGame`, never `runner === '…'` (ESLint-enforced) |
| Ratchet | Meta tooling (`meta/*.cjs`, `lint.yml`, `.husky/pre-push`) | — | Same as `steamLineCeiling.cjs` |

## Standard Stack

No new packages. This phase adds no dependency. [VERIFIED: package.json, no install step]

| Library | Version (installed) | Purpose |
|---------|---------|---------|
| zod | 4.6.7 | Strict per-runner schemas, `z.discriminatedUnion`, `z.strictObject` [VERIFIED: node_modules] |
| typescript | 5.8.3 | Union narrowing, compile-time parity checks, AST scanning in the ratchet [VERIFIED] |
| jest + ts-jest | 29.7.0 / 29.3.3 | Test runner; five projects (Backend, Frontend, Preload, Common, Meta, plus Relay) [VERIFIED] |
| knip | 6.42.1 | Dead-export gate; **new unused exported types are findings** (see Pitfalls) |

### Package Legitimacy Audit
No external packages are installed in this phase. slopcheck not run. **Packages removed:** none. **Packages flagged:** none.

## Field Classification Table (D-06)

Top-level fields of `GameInfo` (`src/common/types.ts:234`): **38**, not 41 as CONTEXT says. "Readers" = non-test files outside `storeManagers/` that read the field off a `GameInfo` typed value, taken from the prototype's error list (structurally typed props like `hasStatus`'s are noted). Setters were traced with grep in `storeManagers/**`.

| Field | Setters (runner) | Readers outside SM | Proposed home | Note |
|---|---|---|---|---|
| runner | all | many | core, `Runner` wide; each member narrows to a literal | |
| app_name, title, art_cover, art_square, is_installed, canRunOffline, install, overrides | all | many | core | `overrides` is merged at read time, not persisted in the caches |
| art_logo | legendary, nile | Game, Library | core | `art_*` per D-06 |
| art_background | gog, nile | Game, DownloadManager | core | |
| art_icon | gog | 1 backend | core | `art_*` per D-06 |
| store_url | legendary, steam | Game (1) | core | 2 stores |
| developer | gog, legendary, nile, steam | Game, WebView, backend | core | |
| description | nile, sideload | Game, Library, Settings, WebView | core | |
| folder_name | gog, legendary, nile, sideload | Game, DownloadManager, helpers | core | |
| extra | all | Game, Library | core, typed `ExtraInfo`; `SteamGameInfo.extra: SteamExtraInfo` | D-08 |
| version | not traced | — | core | per D-06 [ASSUMED: setter not traced] |
| cloud_save_enabled | gog, legendary | Game, Settings | core | 2 stores |
| save_folder | gog, legendary | none outside SM | core | 2 stores |
| save_path | legendary only | `save_sync.ts` (2 sites) | **Legendary** | 1 store, 1 backend reader |
| gog_save_location | gog only | none | **GOG** | D-06 explicit |
| is_mac_native, is_linux_native | steam, gog, legendary, nile | Game, Library, ConsoleMode, state | core | |
| is_windows_native | steam only | Library (steamPlatformRow), InstallGameModal, ConsoleMode `consoleSteamTarget` (structural props) | core | D-06 explicit; JSDoc carries over unchanged |
| mac_arch | steam, gog, legendary | Game, Library, backend | core | MAC32-01 JSDoc carries over |
| metacritic_score | steam only | `librarySort.ts` | core | D-07 |
| installable | steam only (`library/refresh.ts:456`) | `GameCard` | **Steam** | D-06 "confirm": confirmed. No other store, and `winetricksApplyGuard` is an unrelated string |
| is_delisted | steam only | `filterEngine`, `GameCard`, `MainButton`, `GameSubMenu` (+ `steamInstallOptionsEntry` structural) | **Steam** | The `hasCapability(runner,'canBeDelisted')` guard in `filterEngine` does not narrow; use `asStoreGame(g,'steam')?.is_delisted` |
| steamPlatformsCaptured | steam only | `AppleWikiInfo`, `InstallModal/index` (passes to a structural fn) | **Steam** | |
| namespace | legendary only (`legendary/library.ts`) | `launcher.ts:786`, `hasAnticheatInfo.ts` | **Legendary** | The two shared readers both look up the anticheat DB; they become narrowing sites |
| dlcList | legendary only | **zero readers** (the `DLCList` component only uses it as a CSS class) | **Legendary** | See Pitfall 5: real persisted entries carry undeclared keys |
| thirdPartyManagedApp | legendary (real value); gog writes explicit `undefined` | 11 files: `filterEngine`, `ConsoleMode/selectors`, `hasStatus`, `GamePage`, `GameSubMenu`, `InstalledInfo`, `DownloadSizeInfo`, `InstallModal`, `ThirdPartyDialog`, `launcher.ts`, `steamInstallOptionsEntry` (comment) | **core** | "Managed by another launcher" is a cross-store concept with 11 shared readers; keeping it in core removes 9 narrowing sites |
| isEAManaged, isUbisoftManaged | legendary only; both are pure functions of `thirdPartyManagedApp` (`legendary/library.ts:724-729`) | `downloadqueue.ts`, `hasStatus` (structural), `GamePage`, `InstalledInfo`, `DownloadSizeInfo`, `ThirdPartyDialog` | **Legendary** (recommended) | Alternative: leave in core to avoid 5 narrowing sites. See Open Question 1 |
| browserUrl, customUserAgent, launchFullScreen | sideload only | `SideloadDialog`, `LibraryContext` area, backend `storeManagerCommon` | **Sideload** | D-04. `storeManagerCommon/games.ts:68` reads `browserUrl` and is in SM |

Nested types (D-08), setters and readers traced:

| Type | Store-only keys | Home |
|---|---|---|
| `InstalledInfo` (`install`) | GOG: `isDosbox`, `dosboxConf`, `installedWithDLCs`, `installedDLCs`, `versionEtag`, `buildId`, `pinnedVersion`, `cyberpunk`. Steam: `steamResumePending`, `steamResumeTargetSteamappsDir`, `steamResumeInstalldir`, `steamResumeInstalledAtStart` | `GogInstalledInfo` in `types/gog.ts`, `SteamInstalledInfo` in `types/steam.ts`; core keeps `manifest`, `executable`, `install_path`, `install_size`, `is_dlc`, `version`, `platform`, `appName`, `language`, `branch` (`branch` is used by more than one store; keep core, [ASSUMED: not exhaustively traced]) |
| `ExtraInfo` | `steamPlaytimeMinutes`, `steamLastPlayed` | `SteamExtraInfo` in `types/steam.ts` |

Nested readers outside SM (from the prototype): `macArch/recovery.ts` (`installedDLCs`), `hasStatus.ts` and `MainButton.tsx` (`steamResumePending`), `ModifyInstallModal/GOG` (`buildId`, `pinnedVersion`, `cyberpunk`, `installedDLCs`), `TimeContainer` (`steamPlaytimeMinutes`, `steamLastPlayed`), `librarySort.ts` (`steamLastPlayed`).

`InstalledInfo` is also the element type of two other persisted shapes: `gogInstalledGamesStore.installed` and `sideloadedStore.installed` (`typed_store.ts:62,142`), and `GameInfo.install` is `Partial<InstalledInfo>`. Keep `InstalledInfo` as the fat/core base for those stores until the contract wave, then retype the GOG installed store as `GogInstalledInfo[]`.

### Member names and collisions
- `NileGameInfo` already exists in `common/types/nile.ts:44` as the **raw Amazon library JSON entry** (`{id, product}`), used in exactly two places (`nile/library.ts:15,72`). Rename the raw type to `NileLibraryEntry` (2 sites) and give the member the `NileGameInfo` name D-01 uses, so all five members follow `<Store>GameInfo`.
- Free names (grep across `src`, 0 hits): `SteamGameInfo`, `GogGameInfo`, `LegendaryGameInfo`, `SideloadGameInfo`, `GameInfoCore`, `GameInfoByRunner`, `isStoreGame`, `asStoreGame`. Do **not** use `*Game` names: `SteamGame` (1,114 hits), `GOGGame`, `LegendaryGame`, `NileGame`, `SideloadGame` are the backend store-manager classes. `SteamInfo` is a wiki/Steam Deck type and must keep its name.
- `isStore(subject, store)` already exists in `common/storeCapabilities.ts:157` with a `subject is T & {runner:K}` overload. `isStoreGame` should delegate to it for the runner check and add the `GameInfoByRunner[K]` result type. Do not create a second raw comparison.

### Types to move out of `common/types.ts` (D-13)
`GOGAchievement` and its alias `GameAchievement` (importers: `Achievements.tsx`, 4 files), `GOGLoginData` (4), `GOGImportData` (3), the nested store keys above, and the member types. `GOGCloudSavesLocation` is already in `types/gog.ts` (12 importers; `types.ts` only imports it). `SteamInfo` / `SteamDeckComp` are wiki Steam Deck compatibility data used for every store, so leave them (flag in Open Question 3). The `GameInfo` union itself stays in `types.ts` and `import type`s the members (type-only cycles are fine; `nile.ts` already imports from `common/types`).

## Reader Inventory (drives waves and the D-15 start value)

Prototype result (classification above, `GameInfo` = union, nested split included):

| Area | Non-test files that break | Files |
|---|---|---|
| `storeManagers/` (exempt from ratchet, still must compile) | 16 | gog: `games`, `library`, `setup`; legendary: `games`, `setup`; sideload: `library`; steam: `cancelDelete`, `gameInstall`, `gameMetadata`, `games`, `library/index`, `library/refresh`, `library/resume`, `library/resumeBreadcrumbs`, `queueHeadRevalidation`; `storeManagerCommon/games` |
| Backend outside `storeManagers/` | **4** | `downloadmanager/downloadqueue.ts`, `launcher.ts`, `macArch/recovery.ts`, `save_sync.ts` |
| Frontend `hooks/` | **2** | `hasAnticheatInfo.ts`, `hasStatus.ts` |
| Frontend `screens/Game/` | **8** | `GamePage/index.tsx`, `GamePage/components/{AppleWikiInfo,DownloadSizeInfo,InstalledInfo,MainButton}.tsx`, `GameSubMenu/index.tsx`, `TimeContainer/index.tsx`, `ModifyInstallModal/GOG/index.tsx` |
| Frontend `screens/Library/` | **5** | `components/GameCard/index.tsx`, `components/InstallModal/index.tsx`, `components/InstallModal/ThirdPartyDialog/index.tsx`, `filterEngine.ts`, `librarySort.ts` |
| Frontend ConsoleMode, state, helpers | 0 | Their store-field reads are already structural props or no longer exist (see Summary item 3) |
| Test files | 10 (about 50 error lines) | 7 steam `__tests__`, gog `library.test`, legendary `getGameInfoForceReloadStaleness.test`, `Library/__tests__/filterEngine.test` (`Partial<GogGameInfo>` rejects `is_delisted`) |

Totals: 19 non-test files outside `storeManagers/`. `ModifyInstallModal/GOG` is store-specific UI (exempt), so the D-15 start value is at most **18**. Real end state will be lower where a component takes a structural `Pick` prop instead of narrowing (`hasStatus.ts` already takes structural props; it only breaks on its `gameInfo ?? {}` destructure).

This is a **lower bound**: `tsc` stops reporting a property once an expression type is already an error. Re-measure after wave 1 with the real definitions. The prototype scratch dir is `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/8dbbe482-d14b-414d-9d78-3e2ccde06855/scratchpad/proto/` (error lists `new2.txt`).

Importer scale for context: `GameInfo` is named in 47 non-test backend files outside `storeManagers/` and 82 frontend files; 118 test files mention it. Most compile unchanged because they only touch core fields.

## Architecture Patterns

### System flow

```
store manager library hydration (steam/gog/legendary/nile/sideload)
   builds <Store>GameInfo  ──►  CacheStore<…GameInfo[]> (disk: store_cache/*.json, sideload_apps/library.json)
                                   ▲ migrated once at store construction by Phase 68 engine (D-12 strip, v1→v2)
   getGameInfo(): <Store>GameInfo   │
        │                           │
        ▼                           │
 sidecar IPC (getGameInfo, library push) ──► renderer libraryState (per-store GameInfo[] slices)
                                                │ readers narrow with isStoreGame/asStoreGame
 renderer ──install/updateGame/addNewApp(gameInfo)──► ipcValidation (strict discriminatedUnion)
                                                          ├─ ok  → handler, store manager
                                                          └─ bad → IPC_INVALID_ARGS (invoke) / log+drop (send)
```

### Pattern 1: Expand-contract sequencing (recommended)
**What:** Land `GameInfoCore`, members, nested types and guards while `GameInfo` stays the current fat interface; migrate; then flip `GameInfo` to the union and delete the fat definition.
**Why:** keeps `tsc` green after every plan (whole-program checker). [VERIFIED: micro prototype `tsc` exit 0]
```ts
// expand phase: members assignable to fat GameInfo; guard narrows the fat type to the member
export interface GameInfoByRunner { steam: SteamGameInfo; gog: GogGameInfo; legendary: LegendaryGameInfo; nile: NileGameInfo; sideload: SideloadGameInfo }
export function isStoreGame<K extends Runner>(g: GameInfoCore | null | undefined, r: K): g is GameInfoByRunner[K]
export function asStoreGame<K extends Runner>(g: GameInfoCore | null | undefined, r: K): GameInfoByRunner[K] | undefined
// drift guard: after the flip, Expect<Equal<GameInfoByRunner[Runner], GameInfo>>
```
Put the module in `src/common/` (outside `runnerLiteralSelectors` scope), value-import nothing but `isStore` from `storeCapabilities`, so `rendererZodGuard.test.ts` stays green.

### Pattern 2: Store managers return their member
`GameManager.getGameInfo: () => GameInfo` (`game_manager.ts:54,99`) allows a class to override with `getGameInfo(): SteamGameInfo` (return covariance), and the four `CacheStore<GameInfo[], …>` declarations (`steam|gog|nile|legendary/stores.ts`, plus the typed `sideloadedStore.games`) become member arrays. This removes the 16 SM breakages at their source rather than by casts. Library slices in `libraryState.ts:60-64` can follow (optional, and `applyGamePush(info: GameInfo)` then needs a runner switch via `asStoreGame`).

### Pattern 3: Strict per-runner schema with `strictObject` spreads
Verified with zod 4.6.7: `z.strictObject({...coreShape, runner: z.literal('steam'), ...})` for each member, `z.discriminatedUnion('runner', [..])`, and `.extend()` on a strict object both stay strict (unknown key fails). A strict member's inferred type is a plain object type (no index signature), so the `as unknown as z.ZodType<…>` cast in `install.ts` is genuinely removable. [VERIFIED: scratch run]

### Pattern 4: Two-way parity test (D-10)
Use **identity equality**, not mutual assignability. Mutual assignability misses an extra optional key on one side (verified: `MutualOk === true` for a schema type lacking an interface's optional key). Verified working pattern:
```ts
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type Simplify<T> = { [K in keyof T]: T[K] } & {}
type Expect<T extends true> = T
type _steam = Expect<Equal<Simplify<z.output<typeof steamGameInfoSchema>>, Simplify<SteamGameInfo>>>
type _union = Expect<Equal<z.output<typeof gameInfoSchema>, GameInfo>>
// negative control, proves the check bites:
// @ts-expect-error
type _bad = Expect<Equal<Simplify<z.output<typeof steamGameInfoSchema>>, Simplify<SteamGameInfo & { extra_key?: string }>>>
```
It runs under `tsc`; jest (ts-jest with `isolatedModules: true`) is probably transpile-only, so `tsc --noEmit` is the real gate for it [ASSUMED: ts-jest 29.3.3 honours the tsconfig `isolatedModules`; irrelevant because `pnpm codecheck` type-checks test files too]. Add a runtime key-coverage test in jest as well: `Object.keys(schema.shape)` per member compared against a key list literal in the test, so a key cannot silently disappear from both sides.

### Anti-patterns
- Flipping the union first and fixing red files in parallel plans (no plan can be green; see Pattern 1).
- A second narrowing path (`runner === 'steam'`, `game.runner` switch): ESLint `error` bans it in `frontend/**` and backend outside `storeManagers/`.
- Casting reads (`(g as SteamGameInfo).is_delisted`): defeats the ratchet's purpose; review should reject it.
- `Partial<GameInfo>` and object spreads that add a store key to a union-typed value (`{ ...current, is_delisted: true }` errors: `gameMetadata.ts:80`). Type the spread source as the member (`SteamGameInfo`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---|---|---|
| Runner narrowing | A new `runner ===` helper or switch | `isStore` (exists) wrapped by `isStoreGame`/`asStoreGame` |
| Runtime key allow-lists for the strip migration | A hand-copied key array per member | Derive from the strict zod schemas' `.shape` keys (single source), plus a jest test that compares against the interface keys |
| Versioned rewrite, backup, read-only fallback | A custom load-time cleaner | Phase 68 engine: add a chain entry in `STORE_MIGRATIONS` |
| Ratchet scaffolding | A fresh CLI | Copy `steamLineCeiling.cjs` (exact-match baseline, floors, no update flag) and its `*Wiring.test.ts` |
| Type-equality assertions | `extends` both ways | the `Equal`/`Simplify` pattern above |

## Phase 68 migration (D-12)

**Engine facts** [VERIFIED: `engine.ts`, `storeMigrations/index.ts`]:
- A migration is `{ id, to, run(file) }` registered in `STORE_MIGRATIONS[chainKey]` (`src/backend/storeMigrations/index.ts`). `run` receives the **whole file object** (`{games: […], '__timestamp.games': …, __internal__: …}`), not the array. Pure: no fs, no logger.
- Chain keys are `<dir basename>/<file name>`: `store_cache/steam_library` (key `games`), `store_cache/gog_library` (`games`), `store_cache/legendary_library` (`library`), `store_cache/nile_library` (`library`), `sideload_apps/library` (`games`, plus an `installed` array), `gog_store/installed` (`installed`). The same map already names them in `readOnlyStores.ts:27-32` for notice areas only.
- All five library caches and `gog_store/installed` are already declared `kind: 'user-state'` (must-migrate); confirmed in each `stores.ts`. For `kind: 'user-state'` the engine writes a pre-migration backup (last 3 kept, 0o600), runs the chain on a `structuredClone`, writes atomically, and on any throw marks the store **read-only with old data** (D-06). A `kind: 'cache'` store would be unlinked instead; do not change any kind.
- No library chain exists yet. The first non-identity entry is `to: 2` (current files are stamped `schemaVersion: 1`, or unstamped for sideload). From unstamped (0) the engine prepends the identity adopt-v1 step.
- Consequence to record: after the bump an **older GameLib build opens these files read-only** (Phase 68 D-03, with one notice per launch). That is the accepted downgrade behaviour, but state it in the UAT notes.
- The renderer mirror (`frontend/helpers/stores.ts:124-162`) constructs stores with `window.api.storeNew(name, {cwd, name, clearInvalidConfig})`, with **no `kind` or version**. The migration chain lives only in the backend registry, so "the renderer mirror" needs only the type annotation change (`CacheStore<…>` member types), not a second declaration.

**Design for the strip:** one `stripUndeclaredGameInfoKeys(item)` per runner, driven by the strict schema's key sets, applied to `file[arrayKey]` items. It must:
- only delete keys; never drop an entry, never fail on a missing required field (so it can't throw into read-only mode);
- recurse only into nested objects whose full key set is declared (`install` members, `extra`, `overrides`, `manifest`, `cyberpunk`) and **not** into raw API blobs (`dlcList` entries; see Pitfall 5);
- be keyed on each item's own `runner` (fall back to the array's store when `runner` is absent).

**Not in CONTEXT's list but persisted `GameInfo` too:** `store/download-manager` (`queue[]` and `finished[]` elements hold `params.gameInfo`, `typed_store.ts:142`, `DMQueueElement.params: InstallParams`). A retried or resumed queue element re-sends `params` through the strict `install`/`updateGame` schema, so a stale undeclared key inside a persisted `gameInfo` would be rejected there. Add `store/download-manager` to the strip (chain key `store/download-manager`, user-state). [VERIFIED: `downloadmanager/stores.ts:16` kind user-state; `installFields.gameInfo` re-sent per `install.ts` comment.] Planner decision; I recommend including it.

**Real data check:** I read the caches on this machine (`~/Library/Application Support/gamelib`), listing key names only. All top-level keys on 401 steam, 10 gog, 19 legendary, 2 nile and 2 sideload entries are declared in the proposed members. `install` and `extra` keys are all declared. Settings (`config.json`, 52 per-game files) have no undeclared keys either. So on this profile the strip is a no-op rewrite; the fixture must therefore **synthesize** old-shape keys. The one real exception is inside `dlcList` (Pitfall 5).

**Test fixtures to copy:** `src/backend/storeMigrations/__tests__/settingsGlobal.test.ts` plus `fixtures/*.json` (fixture JSON read with `readFileSync`, `step.run(structuredClone(file))`, assertions on output, codec round trip); engine-level behaviour tests with `createVersioningHarness` / `setMigrations` from `backend/testUtils/testStoreRoot` (`storeVersioning/__tests__/engine.test.ts`) for backup, failure to read-only, and newer-file refusal. Create fixtures for each of the six chain keys with: undeclared top-level key, undeclared key in `install`, undeclared key in `extra`, a legacy-but-declared key preserved, an entry with no `runner`, and a `dlcList` entry with extra keys that must be preserved.

## IPC schemas (D-09, D-11)

Current state [VERIFIED: grep, reading each file]:

| File | Call site | Currently declares | Target |
|---|---|---|---|
| `ipc/install.ts:34-42` | `gameInfoArg` outer, plus nested `install: phase70Passthrough({platform, install_path})` | `app_name`, `runner`, `install.{platform,install_path}`; cast to `z.ZodType<GameInfo, GameInfo>` | `gameInfoSchema` union (shared module); `install` becomes the per-member strict nested schema; cast removed. Used by `install` and `updateGame` |
| `ipc/gameDetails.ts:29` | `addNewApp` | `app_name`, `runner` | same `gameInfoSchema` |
| `ipc/settings.ts:28` | `writeConfig.config` (`Partial<AppSettings>`) and `setSetting.value: z.unknown()` | no keys | D-11 |
| `ipc/steam.ts:29` | `launch` (`LaunchParams`) | `appName`, `runner`, `skipVersionCheck`, `args` | strict; add `launchArguments` (`LaunchOption`, a small union) |
| `ipc/wineTools.ts:30` | `gameSettingsArg` (`GameSettings`) | `winePrefix` | strict; reuse the GameSettings shape from D-11 |

Put the `GameInfo` schemas in one new shared module (e.g. `common/types/ipc/gameInfoSchema.ts`) so install, gameDetails and the D-12 migration import one definition. Backend/sidecar only; keep it out of any renderer value-import path (`meta/__tests__/rendererZodGuard.test.ts`).

**Strictness hazards found:**
- Nested object keys: `InstalledInfo` has about 25 keys incl. `manifest` (nested `perLangSize` record) and `cyberpunk`; `ExtraInfo.about`, `Reqs`; `overrides`; `GOGCloudSavesLocation[]`. All need declared strict schemas except the raw blob in Pitfall 5.
- JSON turns a positional `undefined` into `null`: any optional field the renderer sends as `undefined` arrives `null` and must be `.nullish()` where a sender can produce it (Phase 67's `optionalArg` policy). Check the renderer senders (`SideloadDialog.handleInstall`, the install modal) against that.
- `addNewApp` is a `send`: a rejected `send` is **logged and dropped** (Phase 67 D-09). A too-strict sideload schema makes "Add game" silently do nothing. The live gate must exercise it.
- The sideload sender omits optional keys and sends `install: {executable, platform}` only. Existing partial fixtures elsewhere (`gameDetailsFlows.test.ts:1180` sends `{app_name, title, runner:'sideload'}`; `enrichmentFlows`, `shortcutsFlows`, `downloadQueueFlows`, `askForceUninstall` also carry `gameInfo:`) will fail the strict required keys (`art_cover`, `art_square`, `install`, `is_installed`, `canRunOffline`, `title`) and must be updated to full fixtures. `ipcSchemas/install.test.ts` already has a complete steam fixture to copy.
- Settings: `ipcSchemas/settings.test.ts:49-54` currently lists `unknownFutureKey: [1, 2]` as a **valid** `writeConfig` fixture; D-11 flips it to invalid and the fixture must be rewritten. `wineVersion` stays loose (`wineInstallationArg`, 67-13 disposition: persisted configs may carry legacy keys).
- Settings shape: `AppSettings` has **95** keys, `GameSettings` 45 (computed with the TS checker). Build a single `appSettingsShape` record (`GameSettings` keys plus the app-only keys), `writeConfig.config = z.strictObject(shape).partial()` (default appName) and a per-game `gameSettingsShape` for non-default appNames. For `setSetting` keep `key` as an enum of the shape's keys and validate `value` with `superRefine` against `shape[key]` (a 95-member `discriminatedUnion` also works but degrades call-site typing). `setSetting` is a `send`, so a wrong value type is dropped silently: write a per-key fixture for every key's value type, and accept `null` for every optional key.
- Contract generator: `pnpm check:ipc-contract` regenerates `src-tauri/src/ipc_contract.rs` from `rustInvokeArgs` (Rust-owned channels only). None of these five channels are Rust-owned, so no regen is expected; run the check anyway.

**Parity coverage:** per member (5), the union, `AppSettings` (key-set equality `keyof` plus per-key `Equal` through a mapped type), `GameSettings`, `LaunchParams`. When all call sites are closed, delete `phase70Passthrough` from `schemaTypes.ts` and its doc line 10, and add a jest census (copy the `grep` form) asserting no `PHASE70-PASSTHROUGH` or `phase70Passthrough(` text remains in `src/` or `meta/`.

## Ratchet tooling (D-15)

Reference implementations [VERIFIED: read in full]:
- `meta/steamLineCeiling.cjs`: exact-match per-file baseline JSON (`meta/steamLineCeilingBaseline.json`), growth fails, shrink fails until lowered in the same commit, stale entry fails, scanned-file floor, no `--update` flag, pure `evaluate()` exported for tests, `parseArgs` with `--root --baseline --min-files`.
- `meta/backendDiCeilings.cjs`: same contract with the TypeScript compiler API (`ts.createSourceFile`, no program) for AST counting, sharded baselines in `meta/backendDiCeilings/*.json`.
- `meta/knipRatchet.cjs`: identity-set baseline (`meta/knip-baseline.txt`).
- `meta/runnerLiteralSelectors.cjs` is **not** a ratchet any more; it is the ESLint `no-restricted-syntax` selector set at `error` (scope: `src/frontend/**`, `src/backend/**` minus `storeManagers/`, tests exempt). It bans `runner === 'steam'`-style comparisons, which is exactly why D-03's guards exist.

Wiring (copy for the new gate): `package.json` script (`"steam-line-ceiling": "node meta/steamLineCeiling.cjs"`), a step in `.github/workflows/lint.yml`, an entry in `.husky/pre-push` (the line chains `pnpm steam-line-ceiling && pnpm backend-di-ceilings`), a `meta/__tests__/<name>Wiring.test.ts` (asserts the script string, the workflow step order and the pre-push line), and a unit test with fixtures for `evaluate()`.

**Recommended design:** `meta/gameInfoNarrowingCeiling.cjs` plus `meta/gameInfoNarrowingBaseline.json` (`{ "src/frontend/…/File.tsx": <count> }`, exact). Count per non-test file, via the TypeScript AST, of (a) calls to `isStoreGame`/`asStoreGame` and (b) identifiers naming `SteamGameInfo|GogGameInfo|LegendaryGameInfo|NileGameInfo|SideloadGameInfo`, over `src/frontend/**` and `src/backend/**` excluding `storeManagers/**`, `__tests__`, `*.test.*`, and a named store-specific UI exempt list (`ModifyInstallModal/GOG`, `ModifyInstallModal/Legendary`, `InstallModal/SteamDialog`, `InstallModal/SideloadDialog`, `DownloadManager/components/SteamManagedItem`, `state/Steam*`, `helpers/steam*`, `ConsoleMode/InstallOverlay/consoleSteam*`; define the list as a constant with a reason per entry like `GENERATED_EXEMPT`). Floor on scanned files. Because the count **grows** while readers adopt guards, the baseline cannot be created at wave 0 as "shrink-only". Create the tool in wave 0 with tests, **freeze the baseline at the end of the reader migration waves** (before the contract flip), then it only shrinks. Allowlist reasons live in a `reasons` map in the same JSON or a sibling doc.

## Common Pitfalls

### 1. Whole-program tsc makes the union flip all-or-nothing
See Pattern 1. If CONTEXT D-02's "type errors at the read sites" is taken literally as the migration mechanism, every wave plan is red until the last one lands.

### 2. `runner` typed wide at call sites
`GameInfoCore.runner: Runner` (wide) is required so core consumers compile, and members narrow it. Object literals built with a wide `runner` variable fail union assignment (the prototype showed `gameMetadata.ts:80,211`: `{ ...current, is_delisted: true }` and an `updated: GameInfo = {…}` literal). Fix by typing the base value as the member (`SteamGameInfo`) so the spread keeps the literal. About 25 `const updated: GameInfo = {…}` sites in `storeManagers/steam/**` follow this shape.

### 3. Spreads and `Partial<GameInfo>`
`Partial` on a union distributes. `useState<Partial<GameInfo>>` in `SideloadDialog` compiled in the prototype because it only touches core keys and is assigned a member through `isStore`, but `filterEngine.test.ts:276` fails on `Partial<GogGameInfo>` with `is_delisted`. Only one non-test `Partial<GameInfo>` exists. `gameOverrides.ts:14-18` spreads `{...game, overrides}` and stays valid (spread of a union with a core key yields the union).

### 4. The `{} as GameInfo` sentinel
Six backend call sites document `SteamGame.getGameInfo()` returning `{} as GameInfo` on a double cache miss (`utils.ts:222`, `protocol.ts:444`, `tools/index.ts:1674`, `downloadmanager/utils.ts:59`, `uninstaller.ts:132`, `shortcutsFlowRegistration.ts:164`; `steam/games.ts:174` produces it). The assertion still compiles under a union, but a guard like `isStoreGame({}, 'steam')` sees `runner === undefined` and returns false, so the guards must be null/undefined/`{}` safe (`isStore` already is). Do not "fix" the sentinel in this phase.

### 5. `dlcList` is a raw Epic API blob with undeclared keys on disk
`GameMetadataInner` has `ageGatings: Record<string, unknown>`, recursive `dlcItemList`/`mainGameItem`, and a `customAttributes` map with 10+ dynamic key names. **Real persisted entries on this machine carry `mainGameItemList`, `esrbGameRatingValue` and `longDescription`, none of which `GameMetadataInner` declares.** A strict schema there rejects a legendary install (the renderer sends the whole cached `GameInfo`), and a recursive strip would delete data. Nothing reads `dlcList` (only a CSS class shares the name). Recommended: keep it in `LegendaryGameInfo` typed `GameMetadataInner[]`, make the IPC element an explicit loose object (`z.array(z.looseObject({...declared keys...}))`, called out as the one sanctioned loose boundary because it is a third-party API shape), and have the strip migration stop at it. File a todo to delete the field (no readers) separately; that is a shape change and out of scope here.

### 6. knip fails on unused exports
The knip ratchet fails on **new** findings, including unused exported types. Each wave must import what it exports (members used by `GameInfoByRunner`, guards used by a reader, schema constants used by an IPC file), or the wave's `pnpm find-deadcode` goes red. Order the waves so exports and their first consumer land together, or tag `@public` with justification.

### 7. `rendererZodGuard`
The narrowing module and the member types are imported by the renderer. They must `import type` only, and must not import anything under `common/types/ipc` or zod. The `GameInfo` schemas live under `ipc/` (backend-only). Parity test lives in a backend/common test file.

### 8. Frontend code that destructures `gameInfo ?? {}`
`hooks/hasStatus.ts:82-86` destructures store keys from a union-or-`{}` value; the union breaks it (`{}` has none of the keys). Give it a structural props type for the three launcher flags (the file already declares such an interface at lines 36-38), and pass narrowed values in.

### 9. Test fixtures
Ten test files fail type-check after the flip; jest likely would not notice (transpile-only), but `pnpm codecheck` includes tests. Strict IPC schemas make about 5 flow-test fixtures runtime-invalid (jest does catch these). Budget a fixture-update task.

### 10. Migration safety
A strip that throws marks the store read-only with old data until the next launch. Keep it total (no `throw`, tolerates non-array, non-object items, unknown runner). The engine skips identity-only chains but any non-identity step rewrites the file once even when nothing is stripped; that is fine and produces a v1 backup per store on first launch (6 more backup files; mention it in UAT).

## Code Examples

### Chain registration shape (follow `settingsGlobal.ts`)
```ts
// src/backend/storeMigrations/gameInfoLibraries.ts  (pure; no fs/logger)
export const steamLibraryChain: readonly Migration[] = [
  { id: 'steam-library-v1-v2', to: 2, run: (file) => stripLibraryFile(file, 'games') }
]
// index.ts
'store_cache/steam_library': steamLibraryChain,
'store_cache/gog_library': gogLibraryChain,
'gog_store/installed': gogInstalledChain,        // key 'installed'
'store_cache/legendary_library': legendaryChain, // key 'library'
'store_cache/nile_library': nileChain,           // key 'library'
'sideload_apps/library': sideloadChain,          // key 'games' (+ 'installed')
'store/download-manager': downloadManagerChain   // queue[].params.gameInfo, finished[].params.gameInfo
```

### Narrowing at a reader (replaces `game.is_delisted` on the wide type)
```ts
const steamGame = asStoreGame(game, 'steam')
const noStorePage = hasCapability(game.runner, 'canBeDelisted') && !!steamGame?.is_delisted
```
The `canBeDelisted` capability stays as the policy check (D-05); `asStoreGame` supplies the type.

## State of the Art

| Old | Current | Impact |
|---|---|---|
| `z.looseObject` + cast to `z.ZodType<T,T>` (Phase 67 passthrough) | `z.strictObject` / `z.discriminatedUnion` whose output type equals the interface (verified) | Cast removed; parity test replaces it |
| ts-prune ratchet | knip identity ratchet (`knip-baseline.txt`) | New unused exports are hard failures |

## Runtime State Inventory

This phase changes persisted data (strip migration), so the five categories, answered explicitly:

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | Five library caches (`store_cache/{steam,gog,legendary,nile}_library.json`, `sideload_apps/library.json`), `gog_store/installed.json`, `store/download-manager` (persisted `params.gameInfo`). All `user-state`, all stamped v1 (sideload unstamped). | Data migration (strip, v1→v2) via `STORE_MIGRATIONS`; this is a data migration, not a code edit |
| Live service config | None. No external service stores `GameInfo` keys. | None, verified by grep of `src/` for non-file stores |
| OS-registered state | None | None |
| Secrets / env vars | None; none of these stores is `tokenBearing` | None |
| Build artifacts / installed packages | `build/main/sidecar.js` (sidecar bundle) and the SEA binary embed the schemas | `pnpm build:sidecar` before live-testing backend changes; **`tauri dev` does not rebuild the sidecar** (memory note), so the D-16 gate must rebuild first |

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | jest 29.7 + ts-jest 29.3.3, projects Backend, Frontend, Preload, Common, Meta, Relay (`jest.config.js`, `src/<area>/jest.config.js`, `meta/jest.config.js`) |
| Type gate | `pnpm codecheck` = `tsc --noEmit && tsc -p tsconfig.meta.json --noEmit` (includes test files). Plain `npx tsc --noEmit` took about 12 s in my scratch copy |
| Lint gate | `pnpm lint` (`meta/lintScoped.cjs`; ESLint incl. runner-literal ban) |
| Other gates | `pnpm find-deadcode` (knip ratchet), `pnpm boundaries`, `pnpm steam-line-ceiling`, `pnpm backend-di-ceilings`, `pnpm check:ipc-contract`, `pnpm planning-gates`, `pnpm prettier` |
| Quick run | `npx tsc --noEmit` plus `npx jest <touched test paths>` (a two-file IPC schema run takes about 1 s) |
| Full suite | `pnpm test:ci` plus `pnpm codecheck && pnpm lint && pnpm prettier && pnpm find-deadcode && pnpm boundaries` (mirror of `.husky/pre-push`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| ARCH-03.1 | Members assignable to core; guard/accessor narrow; null/`{}` safe; drift guard `GameInfoByRunner[Runner] ≡ GameInfo` | unit + type | `npx jest src/common/__tests__/gameInfoNarrowing.test.ts` and `npx tsc --noEmit` | ❌ Wave 0 |
| ARCH-03.2 | Ratchet `evaluate()` (grew/shrank/stale/floor), CLI, wiring | unit (Meta) | `npx jest meta/__tests__/gameInfoNarrowingCeiling.test.ts meta/__tests__/gameInfoNarrowingWiring.test.ts` and `node meta/gameInfoNarrowingCeiling.cjs` | ❌ Wave 0 |
| ARCH-03.2 | No reader casts around the guards; runner-literal ban still green | lint | `pnpm lint` | ✅ |
| ARCH-03.3 | `common/types.ts` re-exports nothing store-specific | unit (source scan) + tsc | `npx jest src/common/__tests__/typesHomes.test.ts` | ❌ Wave 3 |
| ARCH-03.4 | Parity both ways per member, union, AppSettings, GameSettings, LaunchParams; key coverage; strict reject of unknown key per store; `phase70Passthrough` and `PHASE70-PASSTHROUGH` absent | type + unit | `npx tsc --noEmit`; `npx jest src/backend/sidecar/__tests__/ipcSchemas src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts` | partial (`install.test.ts`, `gameDetails.test.ts`, `settings.test.ts`, `wineTools.test.ts`, `steamAuth`-adjacent exist; parity + census new) |
| ARCH-03.4 | Flow tests with full fixtures reach handlers | integration | `npx jest src/backend/sidecar/__tests__/gameDetailsFlows.test.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` | ✅ (fixtures need updating) |
| ARCH-03.5 | Strip: undeclared keys removed, declared and `dlcList` blob preserved, never throws, backup written, v2 stamped, newer-file refusal | unit + harness | `npx jest src/backend/storeMigrations src/backend/storeVersioning` | partial (harness exists; chains/fixtures new) |
| ARCH-03.6 | Upgraded profile loads offline with all stores intact; installs/`addNewApp` per store; settings write; Metacritic sort; Game page; Library "no store page" facet and ConsoleMode delisted visibility; Windows-depot menu only when `is_windows_native === true` | manual live (D-16) | `pnpm build:sidecar && pnpm tauri:dev` (not `tauri:dev:run`) | UAT file, repo item shape |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` and the touched tests; `npx prettier --check <exact paths>` per the repo `<verify>` rule (check `--file-info` first; omit if all paths are prettier-ignored).
- **Per wave merge:** `pnpm codecheck && pnpm lint && pnpm find-deadcode && pnpm boundaries` plus `npx jest --selectProjects Backend Common Meta` for the touched domains.
- **Phase gate:** full `pnpm test:ci` plus the pre-push chain green, then D-16 UAT on a profile written by the pre-phase build (copy the current data dir first; the strip is a no-op on it, so also run the migration against the synthesized old-shape fixtures).

### Wave 0 Gaps
- [ ] `src/common/gameInfoNarrowing.ts` and `src/common/__tests__/gameInfoNarrowing.test.ts` (guards, drift guard)
- [ ] `src/common/types/ipc/gameInfoSchema.ts` plus a parity type test (backend-side, e.g. `src/backend/sidecar/__tests__/ipcSchemas/gameInfoParity.test.ts`; a type-only file checked by `tsc`, with a runtime key-coverage test)
- [ ] `meta/gameInfoNarrowingCeiling.cjs`, baseline JSON, `meta/__tests__/gameInfoNarrowingCeiling.test.ts`, `…Wiring.test.ts`
- [ ] `src/backend/storeMigrations/__tests__/fixtures/*-gameinfo-v1.json` (six chain keys plus download-manager)
- [ ] Rename raw `NileGameInfo` to `NileLibraryEntry` (2 sites) before the member is added

## Security Domain

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V5 Input Validation | yes | zod strict schemas at the sidecar IPC boundary (`IPC_INVALID_ARGS`); the point of D-09/D-11 |
| V2/V3/V4/V6 | no | no auth, session, access-control or crypto change |
| V12 File and resource | marginal | migration writes use the engine's atomic 0o600 write and backup (no new fs code) |

| Threat pattern | STRIDE | Mitigation |
|---|---|---|
| Renderer sends unexpected keys inside a nested `gameInfo`/`config` | Tampering | Strict members; `looseObject` only for the named third-party blobs (`wineVersion`, `dlcList` elements) |
| Over-strict schema silently drops a `send` (settings write, `addNewApp`) | Denial of service (self-inflicted) | Per-key and per-store fixtures; live gate exercises both |
| Migration failure corrupts a library | Tampering/DoS | Engine backup + read-only fallback; migration is total and key-deleting only |

## Open Questions (RESOLVED)

1. **Third-party flags split (Claude's Discretion).** Recommended: `thirdPartyManagedApp` core (11 readers), `isEAManaged`/`isUbisoftManaged` Legendary (derived from the string, only legendary sets them, 5 narrowing sites). Fallback if the planner wants fewer narrowing sites: all three in core, and the D-15 start drops by about 4 files. Either satisfies D-06; I recommend the split because it matches "only makes sense for one store".
   RESOLVED: split adopted — `thirdPartyManagedApp` in core, `isEAManaged`/`isUbisoftManaged` in the Legendary member; recorded in the 70-01 D-06 classification table.
2. **Close `steam.ts` and `wineTools.ts` passthroughs here, and add `store/download-manager` to the strip.** Both exceed CONTEXT's literal text but are required by D-11's end state and D-12's rationale. Recommend yes to both. If the user disagrees, `phase70Passthrough` cannot be deleted and the grep acceptance in D-11 must be narrowed.
   RESOLVED: yes to both — steam.ts `LaunchParams` and wineTools.ts `GameSettings` are closed in 70-14 (helper deleted, census test); `store/download-manager` is stripped in 70-15.
3. **D-16 wording.** ConsoleMode no longer hides delisted games (Phase 37). Update the live-gate item and D-15's "delisted hiding in ConsoleMode" allowlist example (the real allowlist rows are `filterEngine`, `GameCard`, `MainButton`, `GameSubMenu`). `SteamInfo`/`SteamDeckComp` staying in `common/types.ts` is a small D-13 judgement call (they are cross-store wiki data).
   RESOLVED: D-16's item reworded in 70-16 (delisted visible in ConsoleMode; Library 'no store page' facet still finds them) and D-15's allowlist examples corrected in 70-02/70-10 (`filterEngine`, `GameCard`, `MainButton`, `GameSubMenu`); `SteamInfo`/`SteamDeckComp` stay in `common/types.ts` (70-12).
4. **`dlcList`** has no readers; deleting it is a separate todo (shape change).
   RESOLVED: deferred, out of scope — `dlcList` stays in `LegendaryGameInfo` as the named loose IPC element (70-13) and the strip stops at it (70-15); no todo file filed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | ts-jest 29.3.3 treats tsconfig `isolatedModules: true` as transpile-only | Pattern 4, Pitfall 9 | Low: `tsc` still gates types; only changes whether jest alone catches type errors |
| A2 | `version` has a core home with no store-specific meaning (setter not traced) | Field table | Low |
| A3 | `InstalledInfo.branch` is used by more than one store (kept core) | Nested table | Low: moves one key between core and a member |
| A4 | Reader counts are a lower bound (tsc suppresses follow-on errors) | Reader inventory | Medium: re-measure after wave 1; adjust ratchet start |
| A5 | Real user profiles beyond this machine may carry other undeclared keys (this profile has none, except inside `dlcList`) | Migration | Low: strip is the intended handler; fixtures synthesize them |

## Sources

### Primary (HIGH confidence, this session)
- Codebase reads: `src/common/types.ts`, `common/types/ipc/{schemaTypes,install,gameDetails,settings,steam,wineTools}.ts`, `backend/storeVersioning/{engine,types,backup,readOnlyStores}.ts`, `backend/storeMigrations/index.ts`, `settingsGlobal.ts` and its test, store `stores.ts` files, `frontend/helpers/stores.ts`, `common/storeCapabilities.ts`, `meta/{steamLineCeiling,backendDiCeilings,knipRatchet,runnerLiteralSelectors}.cjs`, `.github/workflows/lint.yml`, `package.json` scripts, `knip.jsonc`.
- Scratch experiments: full-repo `tsc` prototype of the split (baseline 10 errors, prototype 174 new lines), zod 4.6.7 strict/discriminatedUnion/parity checks, expand-contract micro prototype.
- Local profile key census (key names only) of the five library caches and settings files.

### Secondary / Tertiary
- None. No web sources were needed; zod behaviour was verified by running the installed version.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages; versions read from node_modules.
- Architecture and sequencing: HIGH, verified by prototype; the field classification is MEDIUM-HIGH (two discretionary calls flagged).
- Pitfalls: HIGH for 1-8, measured from code and real cache data.

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 or the next change to `GameInfo`/`storeManagers/**` (the reader counts move with any code merged before execution, and execution waits on Phase 69 UAT per D-14, so re-run the prototype `tsc` count at plan time).
