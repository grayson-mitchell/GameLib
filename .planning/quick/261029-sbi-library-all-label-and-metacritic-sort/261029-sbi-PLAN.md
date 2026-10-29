---
phase: quick-261029-sbi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/metacriticScore.ts
  - src/common/__tests__/metacriticScore.test.ts
  - src/common/types.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/metacriticCapture.ts
  - src/backend/storeManagers/steam/__tests__/metacriticCapture.test.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
  - src/backend/storeManagers/steam/__tests__/removeCopies.test.ts
  - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
  - src/frontend/screens/Library/librarySort.ts
  - src/frontend/screens/Library/__tests__/librarySort.test.ts
  - src/frontend/screens/Library/useWikiMetacriticScores.ts
  - src/frontend/screens/Library/__tests__/useWikiMetacriticScores.test.ts
  - src/frontend/screens/Library/index.tsx
  - meta/i18nGateScope.json
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/genI18nGateScope.test.ts
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/components/UI/NavShell/components/FilterViewList/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/FilterViewList.test.tsx
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
  - public/locales/en/gamelib.json
autonomous: true
requirements: [QUICK-261029-SBI]

must_haves:
  truths:
    - "The Library filter panel chip row reads (Installed) | (All) (Native); every other place that showed 'All games' (Focus row picker, FocusRowStrip heading) still shows 'All games'"
    - "The Sort by dropdown offers Name, Last played, Install size, Metacritic, in that order, and picking Metacritic orders highest score first"
    - "Games with no known Metacritic score sort after every scored game in BOTH directions, tie-broken by title then runner/app_name"
    - "A Steam game gets its score from Steam's own data (PICS common.metacritic_score on library sync, appdetails metacritic.score on the lazy per-game fetch); any game whose title already has a cached PCGamingWiki entry gets that score if Steam supplied none"
    - "Choosing the Metacritic sort issues no network request of any kind: no PCGamingWiki fetch, no appdetails fetch, no PICS call"
    - "A score that lands in the wiki cache while the Library is open (game page fetch) is picked up through the store-change notification without a remount"
  artifacts:
    - path: "src/common/metacriticScore.ts"
      provides: "parseMetacriticScore(raw: unknown): number | undefined, the one validator both tiers use"
      exports: ["parseMetacriticScore"]
    - path: "src/backend/storeManagers/steam/metacriticCapture.ts"
      provides: "Bulk PICS metacritic capture, scoped to apps never captured, never throws"
      exports: ["captureOwnedAppMetacritic"]
    - path: "src/frontend/screens/Library/useWikiMetacriticScores.ts"
      provides: "Read-only renderer view of the wikigameinfo store as title -> score"
      exports: ["useWikiMetacriticScores"]
    - path: "src/frontend/screens/Library/librarySort.ts"
      provides: "'metacritic' sort field, metacriticScoreOf, buildWikiMetacriticByTitle"
      contains: "'metacritic'"
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts syncOwnedLibrary"
      to: "captureOwnedAppMetacritic"
      via: "awaited after the platform-capture block, before Step 2 hydration"
      pattern: "captureOwnedAppMetacritic\\("
    - from: "src/backend/storeManagers/steam/library.ts hydration loop"
      to: "GameInfo.metacritic_score"
      via: "cachedMeta?.metacritic_score seed"
      pattern: "metacritic_score: cachedMeta\\?\\.metacritic_score"
    - from: "src/backend/storeManagers/steam/games.ts fetchMetadataIfNeeded"
      to: "steamMetadataStore enumerated write"
      via: "metacritic_score / metacriticCaptured written or carried forward"
      pattern: "metacriticCaptured"
    - from: "src/frontend/screens/Library/index.tsx"
      to: "sortLibrary"
      via: "wikiMetacriticByTitle option"
      pattern: "wikiMetacriticByTitle"
---

<objective>
Two follow-ups to quick 261029-riq (Library filter panel polish):

1. The All chip in the filter panel's `(Installed) | (All games) (Native)` row reads "All", using a new key `library.filterPanel.nativeAll`. The existing `viewAll` "All games" string stays, because FilterFocusRow and FocusRowStrip still use it.
2. The Sort by dropdown gains a Metacritic option. It sorts on data that is already local: Steam's own score, plus whatever PCGamingWiki entries are already in the wiki cache.

Purpose: riq left the All label as "All games" because the wrap could not be measured, and suggested `nativeAll` if the user wanted "All". The user has now asked for both items.
Output: a Steam metacritic capture path, a `GameInfo.metacritic_score` field, a renderer wiki-cache reader, the fourth sort field, and the two label changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/quick/261029-riq-library-filter-panel-polish/261029-riq-SUMMARY.md
@src/frontend/screens/Library/librarySort.ts
@src/frontend/screens/Library/useNonSteamLastPlayed.ts
@src/backend/storeManagers/steam/platformCapture.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>` step or touching the sidecar. Load `Skill("sketch-findings-gamelib")` before Task 3 (chip row and dropdown in the ~230px filter column).

## Data-source findings (verified while planning)

- **Steam PICS** `appinfo.common.metacritic_score` is a numeric STRING (`"90"` in `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-64bit.json:308`, `"80"` in appinfo-32bit.json:196, `"79"` in appinfo-false-flag.json:214). appinfo-no-osarch.json has only `metacritic_url`, with no score. Nothing in `src/backend` reads it today. The existing bulk PICS call (`captureOwnedAppPlatforms`) is scoped to apps whose depot signal is not captured, so it converges to zero apps. Reusing that call alone would never reach the existing cached library, which is why this plan adds a separate scoped capture.
- **Steam appdetails** (`games.ts` `fetchMetadataIfNeeded`, `STEAM_STORE_API`) returns `data.metacritic = { score: number, url: string }` when Steam has a score. It is fetched lazily, once per appId, and is not re-fetched for entries already captured. Its `steamMetadataStore.set` at games.ts ~1488 is an ENUMERATED literal (it replaces the whole entry, T-18-02-04), so it must carry the new fields forward explicitly. All the other writers (`markForcedWindowsViaBottle`, `clearForcedWindowsViaBottle`, the delisted branch, `macArchKnownFix.ts`, `verifyMacArchGroundTruth`, `migrateStaleArtUrls`, `mergePlatformCapture`) spread `existing`, so they keep the new fields automatically.
- **When a Steam library sync runs:** `refresh()` → `syncOwnedLibrary()` runs only after an explicit Refresh or when a Steam session is already open (Phase 54 `acquireOpenAuthenticated`). Otherwise it is `refuseDeferred()`. On cold start, `init()` pushes the persisted `steamLibraryStore` list. That list was written by the last sync's Step 4 and will carry `metacritic_score` from then on.
- **PCGamingWiki** scores live in the backend `wikiGameInfoStore` (`CacheStore<WikiInfo>('wikigameinfo', 30 days)`), keyed by `removeSpecialcharacters(gameInfo.title)`. The score sits at `.pcgamingwiki.metacritic.score`, a STRING (`GameScoreInfo.score: string`, common/types.ts:963). The cache is filled only by `getWikiGameInfo`, which runs on game-page open, Winetricks settings, the GameSubMenu and nonesteamgame.
- **The renderer can already read the wiki cache, with no IPC.** `wikigameinfo` is in `LAZY_STORES` with policy `'*'` (src/common/types/storePolicy.ts:156, :412). The sidecar serves its fetch (src/backend/sidecar/handlers.ts:271; round-trip covered in storeLayer.test.ts). Backend `CacheStore.set` announces both the value key and the `__timestamp.` key, so `window.api.storeOnChanged('wikigameinfo', cb)` fires when a game page fetch lands. The frontend copy of `removeSpecialcharacters` (src/frontend/helpers/index.ts:137, exported at :186) uses the exact regex of the backend copy (src/backend/utils.ts:426).
- **Sort direction:** `defaultDirectionFor` already returns `'desc'` for every field except `'name'`, so Metacritic defaults to highest first with no change to that function. `sortLibrary` already puts `undefined` keys last whichever way the sort runs, and tie-breaks by `librarySortTitle`, then `runner`, then `app_name`.
- **i18n gate:** `meta/i18nForkTouchedFiles.json` (289) and `meta/i18nGateScope.json` (243) cover `src/frontend` only, with 0 backend files and 0 `__tests__` files. So the ONLY new file that needs the gate ceremony is `src/frontend/screens/Library/useWikiMetacriticScores.ts`. The new `src/common` and `src/backend` files do not. Every existing frontend file this plan edits is already in both artifacts.

<interfaces>
From src/frontend/screens/Library/librarySort.ts (current):
- `export type LibrarySortField = 'name' | 'lastPlayed' | 'installSize'`
- `export const LIBRARY_SORT_FIELDS: readonly LibrarySortField[] = ['name','lastPlayed','installSize']`
- `export function defaultDirectionFor(field): LibrarySortDirection` (returns 'asc' only for 'name')
- `interface SortOptions { field; direction; nonSteamLastPlayedIso: Readonly<Record<string, string | undefined>> }`
- `export function sortLibrary(games: readonly GameInfo[], opts: SortOptions): GameInfo[]`, which builds `numKey` per field. An undefined key sorts last; ties go to byTitle, then byIdentity.

From src/backend/storeManagers/steam/platformCapture.ts:
- `export interface PlatformCapturePicsClient { getProductInfo(apps: number[], packages: number[], inclTokens?: boolean): Promise<{ apps?: Record<number, { appinfo?: unknown }>; unknownApps?: number[] }> }`
- `export async function withPlatformCaptureLock<T>(section: () => Promise<T>): Promise<T>`
- the `captureOwnedAppPlatforms(client, appIds)` shape: try → lock → scope → `withTimeout(client.getProductInfo(scoped, [], true), STEAM_PICS_BULK_TIMEOUT_MS, label)` → per-id merge → logInfo summary; catch → logError, failure summary

From src/backend/storeManagers/steam/library.ts `syncOwnedLibrary` (~1237-1272):
- `const appIds = ownedApps.map((app) => app.appid)`; `const heldClient = client as unknown as PlatformCapturePicsClient`; `const anonClient = await getAnonymousPicsClient('platform-capture')`. Then the platform passes, then `try {` Step 2 hydration. The hydration GameInfo literal is at ~1392 (`is_windows_native: cachedMeta?.is_windows_native,` ...).

From the renderer API (src/preload/api/misc.ts:197-207):
- `window.api.storeGet(storeName, key, defaultValue?)`, `window.api.storeEnsureHydrated(storeName): Promise<boolean>`, `window.api.storeOnChanged(storeName, cb): () => void`

Analog to mirror for the hook: src/frontend/screens/Library/useNonSteamLastPlayed.ts (active gate, bounded hydrate retry, storeOnChanged re-read, identity-preserving memo) and its test src/frontend/screens/Library/__tests__/useNonSteamLastPlayed.test.ts.
</interfaces>

## Decisions taken in planning (Claude's discretion; restate in SUMMARY)

- D-sbi-1 Steam score storage: `steamMetadataStore` gains `metacritic_score?: number` and `metacriticCaptured?: boolean`. `GameInfo` gains `metacritic_score?: number`. Only the Steam runner ever sets the GameInfo field. Steam's own score wins over the wiki score for a Steam game.
- D-sbi-2 Wiki scores are read in the renderer from the existing `wikigameinfo` store snapshot. Nothing writes them onto GameInfo and no IPC is added. This is cheaper than writing a score into each runner's library store, and it stays live through `storeOnChanged`. The read is strictly read-only: it never calls `storeDelete`. That is why the frontend `CacheStore` class is NOT used, because its `get()` evicts expired entries. An expired but still-present entry's score is used, since Metacritic scores are stable and a sort must never evict.
- D-sbi-3 Dropdown label is "Metacritic" (key `library.sort.field.metacritic`), not "Metacritic score". It keeps the Dropdown title "Sort by Metacritic" short in the narrow column (the same wrap concern as item 1), and the brand name already says it is a score. The user can rename it.
- D-sbi-4 The tour's sort step names the fields, so it moves to a NEW key `tour.library.sortWithMetacritic`, following riq's `quickFiltersCollections` precedent. The existing `tour.library.sort` value is left alone.
- D-sbi-5 While the wiki store is still hydrating, the Metacritic sort shows Name A-Z, the same as the Last played WR-02 precedent. If hydration gives up after the bounded retries, the hook returns `{}`, so the sort runs on Steam scores only and does not stay on Name forever. A later store-change notification re-arms it.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Steam Metacritic score capture (PICS bulk + appdetails) onto steamMetadataStore and GameInfo</name>
  <files>src/common/metacriticScore.ts, src/common/__tests__/metacriticScore.test.ts, src/common/types.ts, src/backend/storeManagers/steam/electronStores.ts, src/backend/storeManagers/steam/metacriticCapture.ts, src/backend/storeManagers/steam/__tests__/metacriticCapture.test.ts, src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts, src/backend/storeManagers/steam/__tests__/removeCopies.test.ts, src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts</files>
  <behavior>
    - parseMetacriticScore: 90 → 90; "90" → 90; " 79 " → 79; "100" → 100; "0" → undefined; 0 → undefined; "101" → undefined; "-5" → undefined; "87.5" → undefined; "abc" → undefined; "" → undefined; null/undefined/{}/NaN/Infinity → undefined
    - captureOwnedAppMetacritic: when every appId already has metacriticCaptured === true, it makes no getProductInfo call at all
    - It makes ONE getProductInfo call for exactly the uncaptured ids, with args (scoped, [], true)
    - An app whose appinfo.common.metacritic_score is "90" is written as { ...existing, metacritic_score: 90, metacriticCaptured: true }, and existing fields (art_cover, platformsCaptured, mac_arch_verified, bridge) survive
    - An app with appinfo.common but no score is written as metacriticCaptured: true with NO metacritic_score key (a stale one is removed)
    - An id in unknownApps, or one with no appinfo or no common, is NOT written and stays uncaptured for the next sync
    - A rejecting or timing-out getProductInfo does not throw; it logs via logError and returns failed: true
    - The summary log line reads `Steam bulk metacritic capture: scoped=N captured=N skipped=N`
    - library refresh: the synced GameInfo carries metacritic_score from cachedMeta.metacritic_score; an absent cachedMeta gives undefined (never 0)
    - library refresh: captureOwnedAppMetacritic is awaited with the anonymous client when one is available, otherwise with the held client, and before the first pushGameToLibrary
    - appdetails: data.metacritic.score 88 gives a persisted metacritic_score 88 with metacriticCaptured true, and the pushed GameInfo has metacritic_score 88
    - appdetails: no data.metacritic means existing metacritic_score/metacriticCaptured are carried forward unchanged; they are neither erased nor invented
  </behavior>
  <action>
Write the failing tests first (RED), then implement (GREEN).

1. Create `src/common/metacriticScore.ts`. It exports `parseMetacriticScore(raw: unknown): number | undefined`. It accepts a finite number, or a string that trims to digits only (`/^\d+$/`). It returns the integer only when it is from 1 to 100, and `undefined` otherwise. No imports. A header comment names the three sources: PICS string, appdetails number, PCGamingWiki string (GameScoreInfo.score). It also states that 0 means "no score", not a real score. Test it in `src/common/__tests__/metacriticScore.test.ts` (the `src/common` jest root, precedent `src/common/__tests__/runsForMe.test.ts`).

2. `src/common/types.ts` GameInfo (near `is_windows_native?` / `steamPlatformsCaptured?`, ~:287-293): add `metacritic_score?: number` with a doc comment. It is set only for Steam, from steamMetadataStore. `undefined` means unknown, never 0. Non-Steam scores come from the wiki cache in the renderer (see librarySort.ts).

3. `src/backend/storeManagers/steam/electronStores.ts` `SteamMetadataCacheEntry`: add `metacritic_score?: number` and `metacriticCaptured?: boolean`. Document that `metacriticCaptured === true` means a PICS or appdetails answer was read for this app, whether or not it carried a score. It is the scope predicate for the bulk capture. Document that the enumerated appdetails write in games.ts must carry both fields forward.

4. Create `src/backend/storeManagers/steam/metacriticCapture.ts` with `captureOwnedAppMetacritic(client: PlatformCapturePicsClient, appIds: number[]): Promise<{ scopedCount; capturedCount; skippedCount; failed }>`. Mirror `captureOwnedAppPlatforms` in shape:
   - `try` around everything, then `withPlatformCaptureLock` (imported from `./platformCapture`, so the two bulk jobs never overlap).
   - Scope: `appIds.filter(id => steamMetadataStore.get(String(id))?.metacriticCaptured !== true)`. An empty scope returns with no call.
   - `withTimeout(client.getProductInfo(scoped, [], true), STEAM_PICS_BULK_TIMEOUT_MS, 'captureOwnedAppMetacritic getProductInfo')`.
   - Per id, skip `unknownApps`. A local narrow cast `interface AppCommonMetacritic { common?: { metacritic_score?: unknown } }` gives the shape. Skip when there is no `appinfo?.common`. Otherwise read existing, delete `metacritic_score` from a shallow copy, and `steamMetadataStore.set(String(id), { ...rest, ...(score !== undefined ? { metacritic_score: score } : {}), metacriticCaptured: true } as SteamMetadataCacheEntry)`. Use the same partial-entry cast and comment as `mergePlatformCapture`.
   - Finish with `logInfo` of the summary; the catch arm calls `logError`.
   - Header comment: it is scoped and converges, issues one bulk call per sync only while uncaptured apps exist, never throws (same D-03 fail-soft rationale, referenced and not repeated), and adds no timer, watcher or socket. The sidecar exit contract is untouched: the only handle is the PICS request, which `withTimeout` already bounds, and it runs only inside an explicit or open-session sync, never at boot.
   - Test file `src/backend/storeManagers/steam/__tests__/metacriticCapture.test.ts` mirrors `platformCapture.test.ts`'s mock setup (factory-mocked `backend/logger`; `../electronStores` with get/set/entries jest.fn; `resetMocks` is on, so set implementations in beforeEach). Use `appinfo-64bit.json`'s `common` block as one realistic fixture input.

5. `library.ts` `syncOwnedLibrary`: right after the platform-capture if/else and before the `try {` that opens Step 2, add `await captureOwnedAppMetacritic((anonClient ?? heldClient) as unknown as PlatformCapturePicsClient, appIds)`. Do NOT read its return value. The four test files mock it with a bare `jest.fn()`, which returns undefined. Comment: it is public appinfo, so the anonymous client is enough (Phase 54). It makes a single pass with no held-session second pass, because an app missed here stays uncaptured and is retried on the next sync. In the hydration GameInfo literal, add `metacritic_score: cachedMeta?.metacritic_score,` next to `is_windows_native`.

6. `games.ts` `fetchMetadataIfNeeded`: compute `const metacritic_score = parseMetacriticScore(data.metacritic?.score)`.
   - In the `updated` GameInfo, set `metacritic_score: metacritic_score ?? existingMeta?.metacritic_score`.
   - In the enumerated `steamMetadataStore.set` literal, add a sixth carry-forward with a comment in the style of the existing ones. When `metacritic_score !== undefined`, write `{ metacritic_score, metacriticCaptured: true }`. Otherwise spread `existingMeta?.metacritic_score !== undefined ? { metacritic_score: existingMeta.metacritic_score } : {}` and `existingMeta?.metacriticCaptured === true ? { metacriticCaptured: true as const } : {}`.

7. Add `jest.mock('../metacriticCapture', () => ({ captureOwnedAppMetacritic: jest.fn() }))` next to the existing `jest.mock('../platformCapture', ...)` in library.test.ts, macArchKnownFixRouting.test.ts, removeCopies.test.ts and steamStartupKeyringDeferral.test.ts. Then add these tests:
   - library.test.ts: next to the D-17 "synced GameInfo carries is_windows_native" tests (~:719), add a seed test and an absent-cachedMeta test. In the "Phase 54 platform capture runs anonymous first" describe (~:1096), add one wiring test: called with the anon client and appIds, and called before the first pushGameToLibrary.
   - games.test.ts: next to the D-17 appdetails tests (~:892) and the "carry-forward on the DECLINED path" test (~:1062), add two tests: appdetails score written, and absent score carried forward.
  </action>
  <verify>
    <automated>pnpm exec jest src/common/__tests__/metacriticScore.test.ts src/backend/storeManagers/steam/__tests__/metacriticCapture.test.ts src/backend/storeManagers/steam/__tests__/platformCapture.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts src/backend/storeManagers/steam/__tests__/removeCopies.test.ts src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts && pnpm codecheck && npx prettier --check src/common/metacriticScore.ts src/common/__tests__/metacriticScore.test.ts src/common/types.ts src/backend/storeManagers/steam/electronStores.ts src/backend/storeManagers/steam/metacriticCapture.ts src/backend/storeManagers/steam/__tests__/metacriticCapture.test.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts src/backend/storeManagers/steam/__tests__/removeCopies.test.ts src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts</automated>
  </verify>
  <done>All listed suites pass (new and pre-existing). `pnpm codecheck` exits 0. Prettier is clean on every path written; run `npx prettier --file-info` on one path first to confirm it is not ignored. `grep -n "metacriticCaptured" src/backend/storeManagers/steam/games.ts` shows the carry-forward in the enumerated write. `pnpm find-deadcode` reports no new finding for `parseMetacriticScore` or `captureOwnedAppMetacritic`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Metacritic sort field, renderer wiki-cache reader, Library wiring, i18n gate promotion</name>
  <files>src/frontend/screens/Library/librarySort.ts, src/frontend/screens/Library/__tests__/librarySort.test.ts, src/frontend/screens/Library/useWikiMetacriticScores.ts, src/frontend/screens/Library/__tests__/useWikiMetacriticScores.test.ts, src/frontend/screens/Library/index.tsx, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts</files>
  <behavior>
    - LIBRARY_SORT_FIELDS equals ['name','lastPlayed','installSize','metacritic']; defaultDirectionFor('metacritic') is 'desc'
    - readLibrarySortPrefs on a stored 'metacritic' returns field 'metacritic'
    - metacriticScoreOf: a Steam game with metacritic_score 90 and a wiki map giving 70 for its title → 90; a GOG game with a wiki map giving 81 → 81; a GOG game with metacritic_score set to an invalid value through a cast (e.g. 0) and no wiki entry → undefined
    - sortLibrary field 'metacritic' desc on [A:70, B:undefined, C:90, D:70] gives C, A, D, B (A/D by title); asc gives A, D, C, B (unknown still last)
    - buildWikiMetacriticByTitle(games, readEntry): reads `.pcgamingwiki.metacritic.score` through parseMetacriticScore; an entry of null, without pcgamingwiki, or with score '' contributes no key; it is keyed by the raw game.title
    - useWikiMetacriticScores: inactive → null and no storeEnsureHydrated call; active and hydrating → null; hydrated → map built from window.api.storeGet('wikigameinfo', removeSpecialcharacters(title)); a storeOnChanged callback re-reads; after exhausting the retries → {} (not null); window.api.storeDelete is never called
  </behavior>
  <action>
1. `librarySort.ts` (keep it pure; `common/metacriticScore` is a pure common module, so importing it keeps the "no React, no window, no store imports" rule):
   - Extend `LibrarySortField` with `'metacritic'` and append it to `LIBRARY_SORT_FIELDS`.
   - Update the header comment: the fourth field was added by operator request in quick 261029-sbi. Its sources are Steam's own score on GameInfo first, then a PCGamingWiki score already in the wiki cache. Never fetched for a sort. Unknown sorts last.
   - Update the `defaultDirectionFor` doc to mention Metacritic is highest first. The body is unchanged.
   - Export `metacriticScoreOf(game, wikiMetacriticByTitle)`. It returns `parseMetacriticScore(game.metacritic_score) ?? wikiMetacriticByTitle[game.title]`, re-validating the GameInfo value so a corrupt cached number cannot rank.
   - Export `buildWikiMetacriticByTitle(games: readonly GameInfo[], readEntry: (title: string) => unknown): Record<string, number>`. Narrow defensively with no cast to WikiInfo; the shape is untrusted cached data.
   - Add optional `wikiMetacriticByTitle?: Readonly<Record<string, number | undefined>>` to SortOptions. It is optional, so existing callers and tests stay valid. Add the `numKey` arm `else if (field === 'metacritic') numKey.set(g, metacriticScoreOf(g, wikiMetacriticByTitle ?? {}))`.
   - Tests go in librarySort.test.ts. Extend the existing `defaultDirectionFor` and `readLibrarySortPrefs` describes rather than replacing assertions. Add a `describe('metacritic sort (quick 261029-sbi)')`.

2. Create `src/frontend/screens/Library/useWikiMetacriticScores.ts`, exporting `useWikiMetacriticScores(active: boolean, games: readonly GameInfo[]): Readonly<Record<string, number>> | null`. Mirror `useNonSteamLastPlayed.ts` structurally:
   - A module-level `wikiStoreHydratedOnce` flag.
   - A `storeOnChanged('wikigameinfo', ...)` subscription only while active, bumping a version counter.
   - A bounded-retry `storeEnsureHydrated('wikigameinfo')` effect that reuses the exported `LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS` (import it, do not copy it).
   - On give-up, set a `gaveUp` state so the hook returns `{}` (D-sbi-5), re-armed by the next store-change bump.
   - Build the map in a `useMemo` via `buildWikiMetacriticByTitle(games, (title) => window.api.storeGet('wikigameinfo', removeSpecialcharacters(title)))`, with an identity-preserving previous-map ref like the analog.
   - `removeSpecialcharacters` is imported from `frontend/helpers`.
   - The header comment states: it is read-only (never storeDelete, and the CacheStore class is deliberately not used; see D-sbi-2); the key is the backend key (`wiki_game_info.ts` uses `removeSpecialcharacters(gameInfo.title)`); it issues no network request; it hydrates the lazy store only while the Metacritic sort is active.
   - Test in `__tests__/useWikiMetacriticScores.test.ts`, copying `useNonSteamLastPlayed.test.ts`'s window.api mocking and renderHook pattern. If importing `frontend/helpers` pulls in its preload side effect under jest, `jest.mock('frontend/helpers', ...)` with a `removeSpecialcharacters` that applies the same regex as src/frontend/helpers/index.ts:138, and say so in a comment.

3. `Library/index.tsx`: next to `useNonSteamLastPlayed(...)` (~:897), add `const wikiMetacriticByTitle = useWikiMetacriticScores(sortField === 'metacritic', libraryUnion)`. Pass the unfiltered union, the same WR-02 reasoning as the analog. In `libraryToShow`, generalise the pending fallback: `const metacriticPending = sortField === 'metacritic' && wikiMetacriticByTitle === null`. Use Name asc when either pending flag is true. Pass `wikiMetacriticByTitle: wikiMetacriticByTitle ?? {}` to `sortLibrary` and add it to the memo deps.

4. i18n gate promotion for the ONE new frontend file. Follow commit 4e5d9d862 / e45096b03 exactly, and do this step LAST in this task, after `git add` of the new hook:
   (a) Audit: run `scanScope({ extraFiles: ['src/frontend/screens/Library/useWikiMetacriticScores.ts'] })` from `meta/hardcodedStringGate.ts` through a scratchpad script with `node meta/runTs.cjs --bundle --platform=node --target=node21 <script>`. It must report ZERO violations for that path. If there are any, fix the source; never allowlist.
   (b) Hand-insert the path into `meta/i18nGateScope.json` `files` in sorted position. Append to `generatedBy`: `, then quick 261029-sbi promoted screens/Library/useWikiMetacriticScores.ts after an audit-mode scanScope({ extraFiles }) showed 0 violations`. This replaces the trailing `-- still NOT a pnpm gen-i18n-gate-scope run`, which must stay at the very end.
   (c) Run `pnpm gen-i18n-gate-scope`, then `git diff meta/i18nForkTouchedFiles.json`. The ONLY intended change is the one added path. Restore `generatedAt` to `2026-10-29T04:10:56.267Z`. If the regen changed anything else, revert and hand-apply just the one line (the 260903-w73 cascade note).
   (d) In `meta/__tests__/genI18nGateScope.test.ts`, re-pin A0/A2/A3/A4: scope 243 → 244, fork-touched 289 → 290, in both the `toBe(...)` counts and the test titles. Add a dated history entry `2026-10-29 (quick 261029-sbi): fork-touched 289 -> 290, scope 243 -> 244 ...` after the riq entry. Verify the starting counts are still 243/289 before editing. If another task moved them, re-pin from the measured numbers instead.
  </action>
  <verify>
    <automated>pnpm exec jest src/frontend/screens/Library/__tests__/librarySort.test.ts src/frontend/screens/Library/__tests__/useWikiMetacriticScores.test.ts src/frontend/screens/Library/__tests__/useNonSteamLastPlayed.test.ts meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts && pnpm codecheck && npx prettier --check src/frontend/screens/Library/librarySort.ts src/frontend/screens/Library/__tests__/librarySort.test.ts src/frontend/screens/Library/useWikiMetacriticScores.ts src/frontend/screens/Library/__tests__/useWikiMetacriticScores.test.ts src/frontend/screens/Library/index.tsx meta/i18nGateScope.json meta/i18nForkTouchedFiles.json meta/__tests__/genI18nGateScope.test.ts</automated>
  </verify>
  <done>All five suites pass, including genI18nGateScope A-17 anti-rot and A0-A4 at 244/290. codecheck exits 0. Prettier is clean; run `npx prettier --file-info meta/i18nGateScope.json` first, and if it reports ignored, drop the meta JSON paths from the check and say so in the SUMMARY. `git diff meta/i18nForkTouchedFiles.json` shows exactly one added line and an unchanged `generatedAt`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: "All" chip label, Metacritic dropdown row, tour copy, en catalog keys, pinned-list tests</name>
  <files>src/frontend/components/UI/NavShell/components/FilterViewList/index.tsx, src/frontend/components/UI/NavShell/__tests__/FilterViewList.test.tsx, src/frontend/components/UI/Header/index.tsx, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx, src/frontend/screens/Library/components/LibraryTour.tsx, src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx, public/locales/en/gamelib.json</files>
  <behavior>
    - The FilterViewList chip labels equal ['Installed', 'All', 'Native']; the source contains the literal `'gamelib:library.filterPanel.nativeAll'` and no longer contains `'gamelib:library.filterPanel.viewAll'`; there are still exactly 3 tGamelib call sites
    - The Header sort Dropdown has 4 NavItem button rows keyed in LIBRARY_SORT_FIELDS order, labelled ['Name','Last played','Install size','Metacritic']; the active flags follow sortField; the title for sortField 'metacritic' reads 'Sort by|Metacritic'
    - The library-sort tour step reads `gamelib:tour.library.sortWithMetacritic`
  </behavior>
  <action>
1. `FilterViewList/index.tsx:61`: change the All chip to `tGamelib('gamelib:library.filterPanel.nativeAll', 'All')`. Leave `viewAll` in FilterFocusRow/index.tsx:90 and FocusRowStrip/index.tsx:192 untouched. Update the file's header note that lists labels, if it names "All games". In `FilterViewList.test.tsx`, update the label assertion (~:112-116) to `'All'` and the key assertion (~:194) to `nativeAll`. Keep the `toHaveLength(3)` count. These are updates to pinned tests; do not delete any of them.

2. `Header/index.tsx` `sortRows` (~:103-116): append `{ value: 'metacritic', label: tGamelib('gamelib:library.sort.field.metacritic', 'Metacritic') }` (D-sbi-3). Update the riq comment at ~:100-102 to say four rows in LIBRARY_SORT_FIELDS order. In `headerTourAnchors.test.tsx` (~:495-541), rename the test to "four NavItem button rows". Make it `toHaveLength(4)`, four `'button'`s, labels with `'Metacritic'` appended, active `[false, true, false, false]`, and add `expect(titleText('metacritic')).toBe('Sort by|Metacritic')`.

3. `LibraryTour.tsx:117-119`: switch the library-sort step to `tGamelib('gamelib:tour.library.sortWithMetacritic', 'Sort your games by name, last played, install size or Metacritic score, and flip the direction.')` (D-sbi-4). In `libraryTourAnchors.test.tsx`, add an assertion beside the riq quickFiltersCollections test (~:122) that the sort step reads the new key, following that test's exact pattern. If an existing assertion pins `tour.library.sort`, update it rather than delete it.

4. `public/locales/en/gamelib.json` ONLY, by hand. Do NOT run `pnpm i18n`, do NOT touch other locales, and do NOT touch `public/locales/en/gamepage.json` (it holds an unrelated uncommitted user edit). Add `"nativeAll": "All"` in `library.filterPanel` in alphabetical position (between `"native"` and `"newCollection"`). Add `"metacritic": "Metacritic"` in `library.sort.field` (between `"lastPlayed"` and `"name"`). Add `"sortWithMetacritic": "Sort your games by name, last played, install size or Metacritic score, and flip the direction."` in `tour.library` after `"sort"`. Match the file's 4-space indentation. Leave `viewAll` and `tour.library.sort` values unchanged.

5. Run `pnpm lint-translations` and `pnpm i18n-churn-guard`. Both must pass with only the en catalog changed.
  </action>
  <verify>
    <automated>pnpm exec jest src/frontend/components/UI/NavShell/__tests__/FilterViewList.test.tsx src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx meta/__tests__/hardcodedStringGate.test.ts && pnpm codecheck && pnpm lint-translations && pnpm i18n-churn-guard && npx prettier --check src/frontend/components/UI/NavShell/components/FilterViewList/index.tsx src/frontend/components/UI/NavShell/__tests__/FilterViewList.test.tsx src/frontend/components/UI/Header/index.tsx src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx</automated>
    Prettier check is omitted for public/locales/en/gamelib.json: `npx prettier --file-info public/locales/en/gamelib.json` reports `"ignored": true`, so a check would be vacuous. Its formatting is hand-matched to the surrounding 4-space corpus.
  </verify>
  <done>The chip row's All chip reads "All". The dropdown shows four rows ending in "Metacritic". The tour sort step names Metacritic. The three en keys exist. gamepage.json's diff is exactly the user's prior edit (`git diff public/locales/en/gamepage.json` is unchanged from session start). All listed suites and the translation gates pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM PICS → sidecar | `appinfo.common.metacritic_score` is Valve-controlled, loosely typed data |
| store.steampowered.com appdetails → sidecar | `data.metacritic.score` is a remote JSON value |
| wikigameinfo cache → renderer | Cached PCGamingWiki wikitext extraction, a regex-captured string |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sbi-01 | Tampering | parseMetacriticScore | mitigate | The only path any score takes into a store or a sort. Accepts integers 1-100 only, digits-only strings, rejects NaN/Infinity/objects |
| T-sbi-02 | Denial of service | captureOwnedAppMetacritic | mitigate | Scoped to `metacriticCaptured !== true`, so it converges to zero calls. One bulk call bounded by STEAM_PICS_BULK_TIMEOUT_MS, serialised with platform capture by withPlatformCaptureLock, never throws |
| T-sbi-03 | Denial of service | Metacritic sort | mitigate | No network on sort. Wiki data is read from the local snapshot only, and getWikiGameInfo is never called from the Library |
| T-sbi-04 | Tampering | useWikiMetacriticScores | mitigate | Read-only. It never calls storeDelete/storeSet, so a sort cannot evict or corrupt the wiki cache |
| T-sbi-05 | Information disclosure | wikigameinfo renderer read | accept | The store is already `'*'` policy in storePolicy.ts and carries no secrets |
</threat_model>

<verification>
- Tasks 1-3 verify blocks all green.
- `pnpm codecheck` and `pnpm find-deadcode` show no new findings.
- `git diff --stat` touches no locale file other than public/locales/en/gamelib.json, plus the untouched pre-existing user edit in gamepage.json.
- No new IPC channel, so `flowRegistrationCensus.test.ts`, `runnerSliceRegistration.test.ts` and `.planning/IPC-PORT-INVENTORY.md` need no edit. Confirm with `git diff --stat src/backend/sidecar` (empty).
</verification>

<success_criteria>
- The filter panel reads (Installed) | (All) (Native).
- Sort by → Metacritic orders scored games highest first, unknown last, ties by title. It works for Steam games with no game-page visit after one Steam library sync, and for any game whose wiki info was ever fetched.
- No PCGamingWiki or appdetails request is triggered by choosing or applying the sort.

Needs a live check (record in SUMMARY):
1. "(Installed) | (All) (Native)" fits on one line in the ~230px column in midnightMirage, gruvbox_dark and dracula.
2. "Sort by Metacritic" fits the dropdown trigger.
3. After a Steam Refresh, the sidecar log shows `Steam bulk metacritic capture: scoped=<library size> ...` once, and `scoped=0` on the next Refresh.
4. Metacritic sort puts scored Steam games first.
5. Opening a GOG game's page, then going back, ranks it by its PCGamingWiki score.
</success_criteria>

<output>
Create `.planning/quick/261029-sbi-library-all-label-and-metacritic-sort/261029-sbi-SUMMARY.md` when done.
</output>
