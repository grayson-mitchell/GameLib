---
phase: quick-261027-jjz
reviewed: 2026-10-27T01:30:26Z
depth: deep
files_reviewed: 13
files_reviewed_list:
  - src/frontend/screens/Library/librarySort.ts
  - src/frontend/screens/Library/__tests__/librarySort.test.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/Header/index.css
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/types.ts
  - src/preload/api/misc.ts
  - src/preload/tauriTransport.ts
  - public/locales/*/gamelib.json + gamelib.mt.json (structural skim only)
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
fix_status: all_fixed
fixed_at: 2026-10-27
---

# Quick 261027-jjz: Code Review Report

**Reviewed:** 2026-10-27T01:30:26Z
**Depth:** deep
**Files Reviewed:** 13 (plus the 97 locale files, skimmed for structure)
**Status:** issues_found

## Summary

Commits reviewed: 91f8cae81 (tests), 4ce83e3fc (librarySort module), 3be1aef7f (wiring, Header,
preload), 93b8869fb (locales). The 261027-jgs commits were ignored.

The pure module (`librarySort.ts`) is correct against the locked Decisions and the plan:

- Unknowns sort last in both directions (`:239-241`).
- Steam seconds are normalised to ms (`:195`); `0` and `undefined` count as unknown.
- `parseInstallSize` handles the real `filesize` v10 `{base:2}` output. I ran it: `4.66 GiB`,
  `0 B`, `1023 B`, `3 TiB`. Zero, `''`, `'0'` and `NaN B` all map to unknown.
- Numeric ties break by title ascending in both directions.
- The install-status grouping (installed, then installing, then not installed, each as a stable
  partition of the sorted list) gives the same order as the old code.
- The legacy `sortDescending` / `sortInstalled` migration maps `'true'`/`'false'` correctly, and
  any other value falls back to the default.
- The field-change direction reset matches the orchestrator amendment (`index.tsx` `handleSortField`).

**Default-settings regression check:** none found. A fresh profile gets `name/asc/installStatus`. A
legacy profile keeps its old direction and grouping. With the default field the hydration effect
returns early, so default users never reach the new preload surface.

The new preload surface is typed: it lands on `window.api` through `import * as Misc` in
`preload/api/index.ts`. The sidecar's `STORE_FETCH_CHANNEL` handler validates the store name,
`ensureStoreHydrated` never rejects, and it de-dupes in-flight fetches. The defects are in how the
Library consumes it: a failed hydrate is never retried or surfaced, and the per-filter map is
rebuilt asynchronously, so for one render after a filter change the order is wrong. The direction
button's accessible name is also ambiguous.

The locales are structurally sound. All 49 `gamelib.json` files parse and contain all 12 new keys,
none of them empty. There are no duplicate JSON keys (checked with an `object_pairs_hook`), so the
new top-level `tour` object does not shadow anything.

No BLOCKERs: I could not construct a scenario with data loss, a security impact, or a lasting wrong
order for a user on default settings.

## Warnings

### WR-01: A failed `timestampStore` hydrate leaves Last played permanently wrong for every non-Steam game, and nothing re-runs the effect

**Fix status:** fixed (e99bf4175, 6a5cc6a7f) — requires human verification (logic). `ensureStoreHydrated` now resolves `Promise<boolean>`; the new `useNonSteamLastPlayed` hook reads the store only on `true`, retries at 1s/2s/4s/8s with timers cleared on re-run/unmount, then logs ONE warning; a later `storeOnChanged` notification re-arms it. No per-game lazy-miss warnings.

**File:** `src/frontend/screens/Library/index.tsx:871-888` (with `src/preload/tauriTransport.ts:294-330, 414-416`)
**Issue:** `ensureStoreHydrated` resolves, and never rejects, even when the fetch fails: `hydrateStore` catches the error and leaves `hydrated` unset. The effect's `.then` cannot tell the two outcomes apart. On failure it calls `timestampStore.get_nodefault(app_name)` once per game. Each call hits `snapshotGet` on an un-hydrated store, which:
1. emits one `STORE_LAZY_MISS_MARKER` `console.warn` per game, i.e. N warnings for N non-Steam games;
2. starts a background `hydrateStore`;
3. returns `undefined`.

The map is therefore all `undefined`. If that background hydrate then succeeds, nothing re-runs the effect, because its deps are `sortField`, `gamesForAlphabetFilter` and `recentAppNames`.
**Failure scenario:** The user has Last played selected (persisted), and the sidecar is slow or briefly unavailable at the first fetch, for example during boot while the sidecar is still starting. Every Epic, GOG, Amazon and sideloaded game sorts as "never played", below all Steam games. This lasts until the user happens to change a filter or launch a game, and the console fills with one lazy-miss warning per game.
**Fix:** Have the transport report whether the store actually hydrated, and retry or bail out instead of reading a cold store:
```ts
// tauriTransport.ts
export async function ensureStoreHydrated(storeName: string): Promise<boolean> {
  if (!hydrated.has(storeName)) await hydrateStore(storeName)
  return hydrated.has(storeName)
}
// index.tsx
void window.api.storeEnsureHydrated('timestampStore').then((ok) => {
  if (cancelled) return
  if (!ok) { retryTimer = window.setTimeout(() => setHydrateRetry((n) => n + 1), 2000); return }
  ...
})
```
Add `hydrateRetry` to the deps and clear the timer in the cleanup.

### WR-02: The non-Steam last-played map is keyed to the *filtered* list and rebuilt asynchronously, so newly visible games sort as "never played" for a render

**Fix status:** fixed (6a5cc6a7f) — requires human verification (logic). Map is built synchronously (memo) over the unfiltered `libraryUnion`, not the filtered list, so filter changes do not rebuild it. Not-yet-hydrated returns `null`, which the grid renders as Name A-Z rather than ranking every non-Steam game as never played; a module-level latch makes remounts build the map on their first render, so the fallback is at most once per window for one RPC round-trip. Unchanged re-reads keep the map identity.

**File:** `src/frontend/screens/Library/index.tsx:871-888, 891-928`
**Issue:** The effect builds `nonSteamLastPlayedIso` only for the games in `gamesForAlphabetFilter`, which is the post-filter list, and does so in a `.then` microtask after commit. `libraryToShow` is a synchronous `useMemo` over the new `gamesForAlphabetFilter` and the old map. Any game that was filtered out before therefore has no map entry and is ranked unknown, which means last. One render later the effect replaces the map and the grid reorders.
**Failure scenario:** Sort by Last played, then filter by Store = GOG, then clear the filter. For one frame every Epic, Amazon and sideloaded game you have played is pushed below all never-played games, and then the grid jumps back. The same jump happens on every launch with Last played persisted: the first render uses `{}`, so all non-Steam games sort last until hydration resolves. The order also reshuffles on every filter keystroke, because a new map object invalidates `libraryToShow` again.
**Fix:** Build the map once over the whole store rather than the filtered list. After hydration, read every key of `timestampStore`, or iterate the unfiltered library union. Key the effect on the hydration and recent-games signals only, not on `gamesForAlphabetFilter`. Until the first successful build, keep the previous order or show nothing, rather than treating every non-Steam game as unknown.

### WR-03: The direction button's accessible name states its current state, not its action, and has no `aria-pressed` or context

**Fix status:** fixed (656382000). Stable `aria-label` from the EXISTING `library.sortDescending` key ("Sort Descending", 45/47 translation catalogs; ka/th fall back to English) plus `aria-pressed` = descending; stateful `title` kept for hover. No new i18n strings.

**File:** `src/frontend/components/UI/Header/index.tsx:284-299`
**Issue:** `aria-label={directionLabel}` resolves to "Ascending" or "Descending", which is the *current* state. On a toggle button a screen reader cannot tell whether "Ascending, button" means "currently ascending" or "click to sort ascending". The name also never says it is a sort-direction control. It only works because it sits next to the select, and the `<label>` is bound to the select, not to the button. The removed A-Z button carried a deliberate comment against exactly this ("an accessible name should name the control, not narrate its state"). The plan asked for this wording, but it is still an a11y regression compared with the code it replaced.
**Failure scenario:** A VoiceOver or NVDA user tabs from the "Sort by" select to the next control and hears "Ascending, button". They activate it expecting ascending order, and the list flips to descending.
**Fix:** Give the button a stable name that describes the control, and expose the state separately:
```tsx
<button type="button" aria-label={tGamelib('gamelib:library.sort.direction.toggle', 'Sort direction')}
  aria-describedby="library-sort-direction-state" ...>
<span id="library-sort-direction-state" hidden>{directionLabel}</span>
```
Alternatively, keep a stateful `title` and use an `aria-label` such as "Sort direction: Ascending". That one needs a new string in 49 catalogs.

### WR-04: The new preload surface and the hydration effect have no tests

**Fix status:** fixed (e99bf4175, 30c350966, 6a5cc6a7f). `tauriTransport.test.ts`: hydrated / in-flight de-dupe / fetch-failure-then-retry / waits-for-invalidation-refetch, plus `onStoreChanged` cases. New `useNonSteamLastPlayed.test.ts` (mocked-react hook pattern; no jsdom here): null-until-hydrated, retry/backoff/one-warning, re-arm after giving up, cleanup on deactivate and unmount, store-change re-read, identity stability, remount latch, `.catch`.

**File:** `src/preload/tauriTransport.ts:414-416`, `src/preload/api/misc.ts:204`, `src/frontend/screens/Library/index.tsx:871-888`
**Issue:** `grep -rln "ensureStoreHydrated\|storeEnsureHydrated" src` finds only the three source files. Nothing covers these four behaviours:
- it resolves immediately when the store is hydrated;
- it de-dupes with an in-flight fetch;
- it resolves without hydrating on a fetch failure (the WR-01 path);
- it waits for re-hydration after an `invalidated` push.

Nothing covers the effect's cancel-on-unmount or its re-read on `recentGamesChanged` either. The `librarySort` unit tests pass in a map directly, so the whole Last played data path from store to map has no test.
**Failure scenario:** A later refactor of `hydrated` / `inflight` changes when the promise resolves. Last played silently becomes blank for non-Steam runners and no test fails. Phase 29 already shipped this class of bug: the `hydrated` set froze and the UI never updated (`gog-login-ui-never-updates`).
**Fix:** Add `storeApi.test.ts` cases for `storeEnsureHydrated`: hydrated, in-flight, fetch-reject and invalidated. Add a Library render test with the field set to `lastPlayed` that asserts the map is built after the promise resolves, and is not applied after unmount.

### WR-05: The last-played refresh depends on two independent pushes arriving in order

**Fix status:** fixed (30c350966, 6a5cc6a7f) — requires human/live verification. No renderer-side signal existed, so `onStoreChanged(storeName, cb)` was added to `tauriTransport` (`window.api.storeOnChanged`), firing after a field patch is applied and after every successful (re-)hydrate. The hook re-reads on it; `recentAppNames` stays as a backstop trigger.

**File:** `src/frontend/screens/Library/index.tsx:864-888` (with `src/backend/launcher.ts:302, 323`)
**Issue:** The only trigger that re-reads `timestampStore` after a game session is `recentAppNames`, which changes when the `recentGamesChanged` frontend message arrives. The backend writes `tsStore.set(`${appName}.lastPlayed`)` at `launcher.ts:302`, before `addRecentGame` at `:323`. The renderer only sees that write when a separate `STORE_CHANGED_CHANNEL` push patches the snapshot. Both pushes go sidecar → shell → webview, but nothing in this change guarantees their order or relies on a documented guarantee. If the recent-games push is handled first, the effect reads the pre-session `lastPlayed`, and nothing re-reads it later.
**Failure scenario:** The user plays a GOG game with Last played selected. When they quit, the game does not move to the top, and it stays stale until an unrelated filter change.
**Fix:** Drive the re-read from the store change itself. For example, expose a `storeOnChanged(storeName, cb)` listener, or bump a `timestampStore` version counter in the `STORE_CHANGED_CHANNEL` handler, rather than from `recentGamesChanged`. If the ordering is in fact guaranteed, add a comment that cites where it is guaranteed.

## Info

### IN-01: A stale comment claims the focus row reuses `librarySortTitle`, but it was made private in this same commit

**Fix status:** fixed (f3f018cf5). `librarySortTitle` exported and called from `focusRowTitleComparator`; comments corrected.

**File:** `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts:37-43`; `src/frontend/screens/Library/librarySort.ts:177-184`
**Issue:** The comment says the focus row's title key is "`librarySortTitle` … reused so the focus row's ordering cannot drift". In fact `focusRowTitleComparator` inlines its own copy (`.toUpperCase().replace('THE ', '')`), and 3be1aef7f removed the `export` from `librarySortTitle`. The drift guard the comment describes does not exist. The two copies are kept in step only by a comment.
**Fix:** Export `librarySortTitle` and call it from `focusRowTitleComparator`, or correct the comment to say it is a duplicate kept in parity by hand.

### IN-02: The effect's promise chain has no `.catch`

**Fix status:** fixed (6a5cc6a7f). The hydrate chain ends in `.catch` that logs.

**File:** `src/frontend/screens/Library/index.tsx:874`
**Issue:** `void window.api.storeEnsureHydrated(...).then(...)`: the promise itself never rejects, but if the callback throws, the result is an unhandled rejection. The callback can throw if a future `get_nodefault` change throws, or if the method is absent from a test or mock `window.api` (`TypeError` before `.then`).
**Fix:** Append `.catch((e) => console.error('library lastPlayed map', e))`.

### IN-03: Games with identical titles and equal keys fall back to input order

**Fix status:** fixed (cd31cb0fa). Tie-break by runner then app_name (always ascending) after the title comparison, with a test.

**File:** `src/frontend/screens/Library/librarySort.ts:232-243`
**Issue:** `byTitle` returns 0 for equal title keys, for example the same game owned on Steam and GOG. For Name sort, and for ties after the numeric key, the order then depends on the library merge order. The focus row uses an `app_name` tie-break (`focusRowSelectors.ts:50`); the grid does not. The old code behaved the same way, so this is not a regression, but the plan's "ties break by Name" leaves this case undefined.
**Fix:** After the title comparison, add `|| a.runner.localeCompare(b.runner) || a.app_name.localeCompare(b.app_name)`.

### IN-04: `nonSteamLastPlayedIso` is kept, and used, after switching away from Last played and back

**Fix status:** fixed (6a5cc6a7f). The hook returns `null` whenever the field is not Last played, so no stale map survives a switch back.

**File:** `src/frontend/screens/Library/index.tsx:868-873`
**Issue:** When `sortField !== 'lastPlayed'` the effect returns early without clearing the map. Switching back renders once with the map from the previous Last-played session, which may be outdated, before the new read lands. This is cosmetic and is subsumed by the WR-02 fix.
**Fix:** Covered by WR-02. Alternatively, clear the map in the effect's early-return branch.

---

_Reviewed: 2026-10-27T01:30:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
