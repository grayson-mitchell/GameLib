# Phase 70: Split GameInfo into shared and per-store shapes - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning (execution waits on Phase 69's open UAT, D-14)

<domain>
## Phase Boundary

`GameInfo` (`src/common/types.ts:234`, 41 top-level fields, ~134 non-test importers: 71 frontend,
29 `storeManagers/`, 34 other) becomes a shared core plus one member type per runner, so shared
code can no longer read Steam, GOG, Epic, Amazon or sideload fields without saying which store it
means. Three parts, from the roadmap: (1) the split, (2) migrating readers by area under a
shrink-only ratchet, (3) moving store-specific types out of `common/types.ts`. This phase also
closes all four of Phase 67's `phase70Passthrough()` IPC schemas (D-09, D-11).

No behaviour change. The library data shape that's persisted and sent over IPC stays the same
(D-01). The one exception is that keys nobody declares get stripped (D-12).

</domain>

<decisions>
## Implementation Decisions

### Shape of the split
- **D-01: Flat discriminated union on `runner`.** `GameInfo = SteamGameInfo | GogGameInfo |
  LegendaryGameInfo | NileGameInfo | SideloadGameInfo`, each one `extends GameInfoCore` with a
  literal `runner`. Store fields stay at the top level of the object, so the persisted JSON in the
  library caches and the IPC payloads stay byte-identical: no Phase 68 shape migration is needed
  for the split itself. A nested `storeData.<store>` field was considered and rejected, because it
  would force a must-migrate migration (Phase 68 D-02) on every library cache in a no-behaviour-change
  phase.
- **D-02: The plain name `GameInfo` is the union**, and `GameInfoCore` is the shared base. The
  existing importers keep compiling until they read a store field, so the migration shows up as
  type errors at the exact read sites rather than as a big-bang rename.
- **D-03: One narrowing module in `src/common/`** with `isStoreGame(game, runner): game is
  <Member>` (a type guard for branching) and `asStoreGame(game, runner): <Member> | undefined` (an
  accessor). There is no throwing variant. This is the sanctioned way to narrow wherever Phase 62's
  runner-literal ban applies (`frontend/screens/**`, checked by `meta/runnerLiteralSelectors.cjs`).
  Don't add a parallel `runner === '…'` escape hatch.
- **D-04: `sideload` is a full union member.** `SideloadGameInfo` carries `browserUrl`,
  `customUserAgent` and `launchFullScreen` like any other store's fields.
- **D-05: Phase 62's capability flags are untouched.** They live in the per-runner table in
  `src/common/storeCapabilities.ts`, not on `GameInfo`, so the split doesn't move them.

### What counts as shared
- **D-06: The rule is "concept shared".** A field belongs in `GameInfoCore` if it means
  something for every store, even when only one store fills it today. Fields that only make sense
  for one store go to that store's member. Applying the rule (the planner confirms each one against
  who sets it):
  - **Core:** `is_mac_native`, `is_linux_native`, `is_windows_native` (a platform concept that
    sits with the other two, though only Steam fills it; its D-17 `=== true` contract and JSDoc
    carry over unchanged), `mac_arch`, `metacritic_score` (D-07), `version`, `canRunOffline`,
    `title`, `art_*`, `install`, `is_installed`, `overrides`, and the save and cloud-save concepts
    where more than one store has them.
  - **Steam member:** `is_delisted`, `steamPlatformsCaptured`, `installable` (only Steam sets
    it; confirm), and anything else that only has meaning on Steam.
  - **GOG member:** `gog_save_location`. **Epic (legendary) member:** `namespace`, `dlcList`
    (only legendary sets it; confirm). **Sideload member:** D-04.
- **D-07: `metacritic_score` stays in core.** The operator asked whether non-Steam scores have a
  source. There's no official Metacritic API (the RapidAPI offerings are unofficial scrapers, so
  not an option). But every store is already covered: Steam `appdetails` fills
  `GameInfo.metacritic_score` on the backend, and PCGamingWiki covers any store through the
  renderer's wiki map (`useWikiMetacriticScores.ts`, merged by `metacriticScoreOf` in
  `librarySort.ts`). Because it's a cross-store concept, it belongs in core. OpenCritic and IGDB
  `aggregated_rating` are different scores and must not feed a "Metacritic" sort.
- **D-08: The split reaches nested objects, with no persisted move.** Per-store nested types
  narrow the shared ones in place. For example, `SteamGameInfo.extra: SteamExtraInfo` carries
  `steamPlaytimeMinutes`/`steamLastPlayed`, and GOG's `install` carries `isDosbox`/`dosboxConf`.
  The JSON paths stay where they are, so no migration is needed, but shared code can no longer
  reach those fields without narrowing first.
- **Third-party launcher flags** (`thirdPartyManagedApp`, `isEAManaged`, `isUbisoftManaged`):
  see Claude's Discretion.

### IPC schemas (closing Phase 67 D-07)
- **D-09: Full per-runner zod schema.** The `GameInfo`-carrying passthroughs (install/update args
  in `src/common/types/ipc/install.ts`, `addNewApp` in `src/common/types/ipc/gameDetails.ts`)
  become a `z.discriminatedUnion('runner', …)`: a strict core plus a strict member per store,
  including the nested types from D-08. An undeclared key is rejected with Phase 67's
  `IPC_INVALID_ARGS`. The `as unknown as z.ZodType<GameInfo, GameInfo>` cast in `install.ts` goes.
- **D-10: The TypeScript types stay hand-written interfaces**, with a compile-time parity test
  that checks both directions (schema-inferred type ⇄ interface, per member and for the union).
  Their JSDoc is load-bearing (for example D-17 on `is_windows_native` and MAC32-01 on
  `mac_arch`), so the types are not replaced with `z.infer`.
- **D-11: The fourth passthrough, `Partial<AppSettings>` in settings writes
  (`src/common/types/ipc/settings.ts`), is tightened in this phase too**, so all four Phase 67
  passthroughs close. Use a settings-key enum with a per-key value type, per Phase 67 D-07's
  suggestion. When done, `phase70Passthrough()` in `src/common/types/ipc/schemaTypes.ts` has no
  callers and is deleted, and grepping `PHASE70-PASSTHROUGH` returns nothing.
- **D-12: Unknown keys are stripped at load and rejected at IPC.** A Phase 68 versioned migration
  on each library cache (`steam-library`, `gog-library` incl. `gog_store/installed`,
  `epic-library`, `amazon-library`, `sideload-library`; backend stores and the renderer mirror in
  `src/frontend/helpers/stores.ts`) drops keys that no member declares, so objects from an older
  build come out clean. It follows Phase 68's backup and non-destructive-fallback rules and has a
  test fixture of the old shape. The IPC schema can then be strict: an unknown key there is a real
  bug, not leftover data.

### Order, ratchet, verification
- **D-13: Type homes.** The member types and other store-specific types (for example
  `GOGCloudSavesLocation`) move into the existing `src/common/types/{steam,gog,legendary,nile}.ts`.
  Sideload gets `src/common/types/sideload.ts` if needed. When done, `common/types.ts` holds only
  shared types and re-exports nothing store-specific. They can't go next to the backend store
  managers, because the frontend can't import backend modules.
- **D-14: Plan now; execute after Phase 69's 3 human UAT items close.** Those items (i18next
  init timing, the DownloadManager sequence token, `runPostMountBoot` gating) aren't library
  readers, but waiting keeps any stale-UI regression attributable to one phase.
- **D-15: The ratchet is a shrink-only count of non-test files** outside `storeManagers/` and
  store-specific UI that call `isStoreGame`/`asStoreGame` or name a `*GameInfo` member type. It
  follows the pattern of Phase 62's ratchets and the `meta/*Ratchet.cjs` / `*Ceilings.cjs` tools.
  The end state is a short reviewed allowlist, not zero, because some shared UI (the Steam-only
  Windows-depot menu, delisted hiding in ConsoleMode) legitimately needs a store field.
- **D-16: Only a final live gate in `pnpm tauri:dev`.** Waves in between rely on tsc and jest. The
  final gate must cover: an **upgraded profile** (library caches written by the pre-phase build)
  whose offline Library loads with all stores intact after the D-12 migration; install and
  `addNewApp` for each store passing the strict IPC schema; a settings write passing D-11's
  schema; the Library sort including Metacritic; the Game page; ConsoleMode with delisted Steam
  games hidden; and the Steam Windows-depot menu item present only when `is_windows_native === true`.
  UAT items follow the repo's UAT item shape (`gamelib-conventions`).

### Claude's Discretion
- **The third-party launcher flags** (`thirdPartyManagedApp`, `isEAManaged`,
  `isUbisoftManaged`; 9 frontend readers). The planner traces who sets each one and applies D-06:
  "managed by another launcher" is likely shared (`thirdPartyManagedApp` is set by GOG), while a
  flag only one store produces goes to that member.
- The final classification of every remaining field under D-06, recorded as a table in the plan.
- The internal layout of the narrowing module (D-03) and of the parity test (D-10).
- How waves are cut by area (backend outside `storeManagers/`, then frontend by screen).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` § "Phase 70: Split GameInfo into shared and per-store shapes" — goal, three parts, open questions (answered above)
- `.planning/REQUIREMENTS.md` — ARCH-03

### Prior-phase decisions this phase builds on
- `.planning/phases/62-module-boundaries-and-decomposition/62-CONTEXT.md` — capability flags, runner-literal ban, ratchet pattern
- `.planning/phases/67-schema-validation-at-the-sidecar-ipc-boundary/67-CONTEXT.md` — D-07 (the passthroughs this phase closes), D-08 (`IPC_INVALID_ARGS`)
- `.planning/phases/68-versioned-persisted-stores-and-migrations/68-CONTEXT.md` — D-01/D-02 (library caches are must-migrate), D-03 (downgrade), backup/fallback rules
- `.planning/phases/69-consolidate-frontend-state-onto-globalstatev2/69-CONTEXT.md` — D-03 (library stays per-store `GameInfo[]` arrays)
- `.planning/phases/69-consolidate-frontend-state-onto-globalstatev2/69-VERIFICATION.md` — the 3 human UAT items D-14 waits on

### Repo conventions
- `Skill("gamelib-conventions")` — `<verify>` prettier check, UAT item shape, todo frontmatter

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/common/storeCapabilities.ts`: the `hasCapability(runner, flag)` pattern, which has the same shape as `isStoreGame`.
- `src/common/types/{steam,gog,legendary,nile}.ts`: existing per-store type homes (D-13). `nile.ts` already has a `NileGameInfo` (the raw store shape, so pick a member name that doesn't collide).
- `src/common/types/ipc/schemaTypes.ts`: `phase70Passthrough()`, deleted once it has no callers.
- `src/backend/storeVersioning/` (`engine.ts`, `backup.ts`, `readOnlyStores.ts`): Phase 68's versioned-migration engine. `readOnlyStores.ts:27-32` maps the library cache ids.
- `meta/runnerLiteralSelectors.cjs`, `meta/knipRatchet.cjs`, `meta/backendDiCeilings.cjs`, `meta/steamLineCeiling.cjs`: existing ratchet and ceiling tooling to copy for D-15.
- `src/common/metacriticScore.ts`, `src/frontend/screens/Library/librarySort.ts:230`: the Metacritic merge (D-07).

### Established Patterns
- Library caches: `CacheStore<GameInfo[], …>` in `src/backend/storeManagers/{steam,gog,legendary,nile}/stores.ts`, mirrored in `src/frontend/helpers/stores.ts:124-162`.
- Strict envelope plus explicit loose nested object (Phase 67 D-07), now becoming fully strict.

### Integration Points
- Where `GameInfo` is built: each store manager's library hydration (for example Steam's `library.ts`, which hydrates `is_windows_native` and `steamPlatformsCaptured` from `steamMetadataStore`). The member type gets fixed here.
- The renderer's library slices (Phase 69 GlobalStateV2) hold per-store `GameInfo[]` arrays, and can be typed as per-store member arrays.

</code_context>

<specifics>
## Specific Ideas

- The operator challenged the first recommendation to put `metacritic_score` on the Steam member,
  asking whether other stores have a source. The answer (PCGamingWiki already covers them) is why
  it's in core. Apply the same "is there a cross-store source or concept?" test to similar fields.

</specifics>

<deferred>
## Deferred Ideas

- **Hydrate PCGamingWiki Metacritic scores onto `GameInfo.metacritic_score` for non-Steam games
  in the backend.** Today this is a lazy, title-keyed renderer map that loads only while the
  Metacritic sort is active. That would be a behaviour change, so it's a future phase or todo.

### Reviewed Todos (not folded)
- The todo matcher returned only keyword noise (launch-notice theming, Steam bridge/overlay, depot
  manifest todos). None of them concern `GameInfo`, so nothing was folded.

</deferred>

---

*Phase: 70-split-gameinfo-into-shared-and-per-store-shapes*
*Context gathered: 2026-11-14*
