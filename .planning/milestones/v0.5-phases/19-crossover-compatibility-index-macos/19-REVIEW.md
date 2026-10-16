---
phase: 19-crossover-compatibility-index-macos
reviewed: 2026-07-14T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - meta/buildCrossoverIndex.ts
  - meta/measureCrossoverMatching.ts
  - meta/__tests__/buildCrossoverIndex.test.ts
  - src/backend/crossover_index/schema.ts
  - src/backend/crossover_index/electronStore.ts
  - src/backend/crossover_index/fetcher.ts
  - src/backend/crossover_index/index.ts
  - src/backend/crossover_index/ipc_handler.ts
  - src/backend/crossover_index/normalize.ts
  - src/backend/crossover_index/__tests__/fetcher.test.ts
  - src/backend/crossover_index/__tests__/index.test.ts
  - src/backend/crossover_index/__tests__/ratingMap.test.ts
  - src/backend/crossover_index/__tests__/schema.test.ts
  - src/backend/crossover_index/__tests__/normalize.test.ts
  - src/backend/wiki_game_info/wiki_game_info.ts
  - src/backend/wiki_game_info/codeweavers/utils.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/nile/library.ts
  - src/backend/storeManagers/sideload/library.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/zoom/library.ts
  - src/backend/main.ts
  - src/preload/api/library.ts
  - src/common/types/ipc.ts
  - src/common/types/game_manager.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/GlobalStateV2.ts
  - src/frontend/screens/Library/components/GameCard/CrossoverBadge.tsx
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/CrossoverBadge.test.tsx
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
  - src/frontend/components/UI/LibraryFilters/index.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/types.ts
  - .github/workflows/build-crossover-index.yml
  - .github/workflows/build-base.yml
  - .github/workflows/draft-release-mac.yml
  - public/locales/en/translation.json
  - public/locales/en/gamepage.json
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
fixed_at: 2026-07-14T00:00:00Z
warnings_fixed: 5/5
warnings_fix_commits:
  - 015b632b # WR-01
  - 38618b0c # WR-04
  - 32539796 # WR-02
  - f2e0a2f3 # WR-03
  - 3f16b6c0 # WR-05
info_fixed: 0/4 # out of scope for this fix pass (Warning-only)
fix_status: warnings_resolved
---

# Phase 19: Code Review Report

**Reviewed:** 2026-07-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30 (+ supporting files read for call-chain verification: `src/backend/cache.ts`, `.gitignore`, `i18next-parser.config.js`)
**Status:** issues_found

## Summary

Reviewed the CrossOver Compatibility Index (macOS) phase: the CI index builder
(`meta/buildCrossoverIndex.ts`), the measurement harness that gated D-02
(`meta/measureCrossoverMatching.ts`), the fetch/schema/cache layer
(`src/backend/crossover_index/*`), the index-first wiring into
`wiki_game_info.ts`, the six `getListOfGames()` additions, the IPC/state
plumbing, the grid badge/filter/install-modal UI, the GitHub Actions
publishing workflow, and the i18n locale files.

The core trust-boundary work (D-09 schema validation, D-08 TTL, D-05
non-blocking collision handling, the D-04 total-order dedup, the D-02
promotion-gate transcription, the D-16 three-state honesty invariant, the
D-10 `isMac` gate) is implemented carefully and is well covered by tests that
assert the *absence* of keys, not just their values — a good sign the team
understood the subtlety of the three-state contract. The GitHub Actions
workflow correctly avoids the `v*` tag collision (T-04) and uses
`--latest=false`, and permission scope is minimal (`contents: write` only, no
`pull_request`/`pull_request_target` trigger that would create a pwn-request
risk).

No BLOCKER-level defects were found — no data loss, no injection, no
authentication/authorization gap, no crash path. However, several real gaps
were found that should be fixed: a self-heal path (`crossoverIndexHas`) that
is blind to the bundled-snapshot fallback (silently degrading D-13's stated
guarantee under a specific but plausible offline/first-run condition), two
sets of i18n keys referenced in code but absent from the English locale
files (breaking the project's own extraction pipeline for translators), an
unenforced "MUST be https" invariant, and a rating map that never refreshes
when the library changes mid-session. Also some quality/dead-weight items.

## Warnings

**Fix status (2026-07-14):** All 5 warnings below have been fixed and committed on `fix/steam-list-view-store-label`. See the `RESOLVED` note under each finding for the commit and a summary of the applied fix.

### WR-01: `crossoverIndexHas()` is blind to the bundled-snapshot fallback — D-13 self-heal silently breaks when only the bundled snapshot is available

**RESOLVED (`015b632b`):** `loadIndex()`'s bundled-snapshot fallback (both the schema-rejection branch and the catch branch) now goes through a new `persistBundledFallback()` helper that writes the bundled data into `crossoverIndexStore` (via `crossoverIndexStore.set(desc.name, { data: bundled, fetchedAt: Date.now() })`) before returning it — the same store `crossoverIndexHas()` reads directly. Added `fetcher.test.ts` coverage: both bundled-fallback branches now assert the store was populated, and a new `crossoverIndexHas — WR-01 self-heal via bundled snapshot` test exercises the exact "network never succeeded + bundled snapshot present" scenario end-to-end (`crossoverIndexHas()` false before the lookup, true after).

**File:** `src/backend/crossover_index/fetcher.ts:94-123` and `src/backend/crossover_index/index.ts:137-147`

**Issue:** `loadIndex()` has two fallback tiers on any failure: the last-good
value from `crossoverIndexStore`, and `loadBundledSnapshot()`. Only the first
tier is ever persisted back into `crossoverIndexStore` (via `.set()` at
`fetcher.ts:111-114`, on a successful validated network fetch). The bundled
snapshot's data is *returned* to the caller but never written into the store:

```ts
} catch (error) {
  logError(['Index refresh failed, keeping last good', desc.name, error], LogPrefix.Backend)
  return cached?.data ?? loadBundledSnapshot(desc)   // <-- never stored
}
```

`crossoverIndexHas()` (the synchronous D-13 self-heal probe consumed by
`wiki_game_info.ts`'s `staleCrossoverData` check) reads `crossoverIndexStore`
*directly*, bypassing `loadIndex()` entirely:

```ts
export function crossoverIndexHas(gameInfo: IndexLookupInput): boolean {
  const cached = crossoverIndexStore.get(crossoverIndexDescriptor.name) as ...
  if (!cached) return false
  ...
}
```

So on any machine where the network fetch to the GitHub Release asset has
never once succeeded (offline first run, corporate firewall, a transient
outage during every attempt within the 24h TTL window, etc.), `crossoverIndexStore`
stays empty forever even though `getCodeweaversFromIndex()` (the *primary*
lookup path) is correctly using the bundled snapshot on every call via
`loadIndex()`'s own fallback. The practical effect: a title that was
previously cached under Phase 16's "checked, none found" marker
(`codeweavers.macRating === null`) will never self-heal to pick up a rating
that the bundled snapshot has had all along — the doc comment's claim that
`crossoverIndexHas` "reads the store's last-good payload ... [and] applies
the SAME ... resolution as `getCodeweaversFromIndex`" is not true when only
the bundled snapshot exists. Blast radius is bounded by `wikiGameInfoStore`'s
own 30-day TTL (`src/backend/wiki_game_info/electronStore.ts:4-7`, which uses
the default `invalidateCheck: () => true` and so does evict on its own), but
within that window the self-heal fast-path silently never fires. No test in
`fetcher.test.ts` or `index.test.ts` exercises `crossoverIndexHas()` against
a store populated only via the bundled-snapshot path — this gap is invisible
to the existing suite.

**Fix:** Either persist a successfully-parsed bundled snapshot into
`crossoverIndexStore` the first time it's used (so the store and the
self-heal check see the same "last good" data the primary path sees), or
have `crossoverIndexHas()` fall through to `loadBundledSnapshot()` (accepting
the sync-file-read cost) when the store is empty:

```ts
// electronStore.ts / fetcher.ts: on bundled-snapshot success, also cache it
const bundled = loadBundledSnapshot(desc)
if (bundled) {
  crossoverIndexStore.set(desc.name, { data: bundled, fetchedAt: Date.now() })
}
return bundled
```

---

### WR-02: `header.show_crossover_*` i18n keys referenced in code are missing from `en/translation.json`

**RESOLVED (`32539796`):** Added `show_crossover_gold`/`show_crossover_silver`/`show_crossover_bronze`/`show_crossover_wont_run`/`show_crossover_unrated` to `public/locales/en/translation.json`'s `header` object (alphabetically sorted, matching the surrounding `show_*` keys' English text from the `LibraryFilters/index.tsx` extraction comments). Verified valid JSON.

**File:** `src/frontend/components/UI/LibraryFilters/index.tsx:167-181` and `public/locales/en/translation.json:443-458`

**Issue:** `crossoverRatingLabels` uses dynamic keys `header.show_crossover_gold`,
`header.show_crossover_silver`, `header.show_crossover_bronze`,
`header.show_crossover_wont_run`, `header.show_crossover_unrated`, with the
usual `// t('header.show_crossover_gold', 'Runs great (gold)')` extraction
comments (the pattern this codebase uses specifically so
`i18next-parser` — present in `package.json` and configured via
`i18next-parser.config.js` — can pick up dynamically-constructed keys). None
of the five keys exist in `public/locales/en/translation.json`'s `header`
section (verified: only `show_available_games`, `show_favourites_only`,
`show_hidden`, `show_installed_only`, `show_support_offline_only`,
`show_third_party_managed_only`, `show_updates_only` are present). The UI
still renders correctly in English because `t(key, defaultText)` falls back
to `defaultText`, but the keys will never be extracted or exposed to
translators — every other locale silently never gets this string.

**Fix:** Run the project's translation extraction step (or manually add the
five keys with their English defaults to `public/locales/en/translation.json`'s
`header` object) before merging.

---

### WR-03: `install.warn-crossover-wont-run` i18n key (gamepage namespace) is missing from `en/gamepage.json`

**RESOLVED (`f2e0a2f3`):** Added `install.warn-crossover-wont-run` to `public/locales/en/gamepage.json` with the same text as the `<Trans>` JSX children in `WineSelector/index.tsx`. Verified valid JSON.

**File:** `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx:186-194` and `public/locales/en/gamepage.json:226-243`

**Issue:** The D-18 non-blocking advisory uses
`<Trans i18n={i18n} i18nKey="install.warn-crossover-wont-run" ns="gamepage">`.
`gamepage.json`'s `install` object (lines 226-243) has no `warn-crossover-wont-run`
key — only `anticheat-warning`, `disk-space-left`, `flatpak-path-not-writtable`,
`not-enough-disk-space`, `path`, `path-not-writtable`, `space-after-install`,
`wineprefix`, `wineversion`. `<Trans>` falls back to its JSX children when the
key is unresolved, so English rendering is unaffected, but — same as WR-02 —
this string will never reach the translation pipeline.

**Fix:** Add `install.warn-crossover-wont-run` to `public/locales/en/gamepage.json`
with the same text currently given as the `<Trans>` children.

---

### WR-04: `IndexDescriptor.url`'s "MUST be https" invariant (T-19-03) is a comment only, never enforced

**RESOLVED (`38618b0c`):** Added `assertHttps()` in `fetcher.ts`, called as the first statement in `loadIndex()` (before the cache lookup and before any network call), throwing `IndexDescriptor '${desc.name}' url must be https` for any non-`https://` URL. Callers such as `getCodeweaversFromIndex()` already catch and log, so this fails loud without propagating further. Added a `fetcher.test.ts` case asserting an `http://` descriptor is rejected and `axiosClient.get` is never called.

**File:** `src/backend/crossover_index/fetcher.ts:20-31`

**Issue:** The `IndexDescriptor<T>` interface documents `url` as "MUST be
https (T-19-03)", but `loadIndex()` passes `desc.url` straight to
`axiosClient.get()` with no scheme check. The one real descriptor today
(`crossoverIndexDescriptor` in `index.ts:19`) is hardcoded to an `https://`
GitHub Release URL, so this isn't exploitable as shipped. But D-19's entire
premise is that a second descriptor (the deferred mac-arch-overrides index)
will be added later "without rework" — at that point there is no runtime
guard preventing an accidental `http://` URL (or a future refactor that reads
the URL from a config/remote source) from silently downgrading the transport
for a payload that drives a user-facing compatibility claim.

**Fix:** Assert the scheme once, at the point a descriptor is used (or at
construction), e.g.:

```ts
if (!desc.url.startsWith('https://')) {
  throw new Error(`IndexDescriptor '${desc.name}' url must be https`)
}
```

---

### WR-05: `crossoverRatings` is resolved once at startup / once on renderer mount — never refreshed when the library changes

**RESOLVED (`3f16b6c0`), requires human verification:** Extracted the startup fire-and-forget call into `refreshCrossoverRatingMap()` in `main.ts` and re-invoke it at the end of the `refreshLibrary` IPC handler (after the existing Humble-ownership-recompute block), so every manual "Refresh Library" and background Steam metadata sync completion now re-pushes `crossoverIndexChanged`. The frontend's existing `handleCrossoverIndexChanged` listener in `GlobalState.tsx` needed no change to pick this up (comment updated to document the new trigger). `pnpm tsc --noEmit` is clean, but there is no automated test exercising the `refreshLibrary` handler's new fire-and-forget call (no existing `main.ts` test harness) — flagged for manual/live verification that a game added mid-session picks up its badge after a library refresh.

**File:** `src/backend/main.ts:357-370`, `src/frontend/state/GlobalState.tsx:1081-1096`

**Issue:** `buildCrossoverRatingMap()` is invoked from exactly two places in
the whole codebase: `main.ts`'s `app.whenReady()` handler (fire-and-forget,
once) and `GlobalState.tsx`'s one-time `getCrossoverIndex()` pull on mount.
There is no listener tying this to `handleRefreshLibrary`, a Steam metadata
sync completing, or any other library-mutation event. A game purchased/
installed/synced into the library *after* app start (e.g. a new Steam
purchase appearing via a background Steam metadata sync, or a manual
"Refresh Library") is therefore permanently absent from the `crossoverRatings`
map for the rest of the session — its grid tile shows no badge and it's
excluded from the D-17 filter's "unrated" bucket rather than included in it,
until the app is restarted. This degrades gracefully (no wrong information is
ever shown, consistent with D-16's honesty invariant), so it is not a
correctness violation of the documented contract, but it is a real,
user-visible completeness gap that isn't called out anywhere except a
tangential note in `19-06-SUMMARY.md` about *index-data* refresh (not
library-membership changes).

**Fix:** Re-invoke `buildCrossoverRatingMap()` (and push
`crossoverIndexChanged`) from the same place(s) that already fire
`handleRefreshLibrary` / library-change notifications, or at minimum
document this as a known v1 limitation in the phase's carry-forwards.

## Info

### IN-01: Builder emits a `label` field that no consumer validates or reads

**File:** `meta/buildCrossoverIndex.ts:94-103, 309-320`, `src/backend/crossover_index/schema.ts:14-26`

**Issue:** `IndexPayload.entries[].label` is populated by the builder (`r.label`)
and shipped in the published JSON, but `crossoverIndexSchema` doesn't declare
`label` at all, so zod's default "strip unknown keys" behavior silently
drops it on every consumer parse. Nothing in `src/backend/crossover_index/`
or the frontend ever reads `.label`. D-12's context note frames keeping the
raw label as "purely as a check that the derivation matches the source" —
but no such check exists anywhere in the codebase, so this is dead weight
that doesn't actually deliver the stated benefit.

**Fix:** Either wire up the described self-consistency check (assert the
derived tier from `rating` matches a mapping of `label` in a test), or drop
`label` from the emitted payload to avoid shipping unused bytes and a
misleading comment.

---

### IN-02: `dist-index/` (the CI builder's output directory) is not gitignored

**File:** `.gitignore`, `meta/buildCrossoverIndex.ts:28` (`DEFAULT_OUT_DIR = 'dist-index'`)

**Issue:** `public/crossover-index.json.gz` (the bundled snapshot destination)
is gitignored, but the builder's own default output directory `dist-index/`
(containing `crossover-index.json.gz` and `collisions.json`, written whenever
a contributor runs `pnpm build-crossover-index` locally) has no matching
`.gitignore` entry.

**Fix:** Add `dist-index/` to `.gitignore`.

---

### IN-03: Inline `await` inside the `Promise.all` array literal mixes awaited and un-awaited promise types

**File:** `src/backend/wiki_game_info/wiki_game_info.ts:67-79`

**Issue:**

```ts
const [pcgamingwiki, gamesdb, applegamingwiki, umuId, codeweavers] =
  await Promise.all([
    ...,
    isMac
      ? (await getCodeweaversFromIndex(gameInfo)) ?? getInfoFromCodeweavers(title)
      : isLinux ? getInfoFromCodeweavers(title) : null
  ])
```

The `isMac` branch sometimes evaluates to a plain `CodeweaversInfo` object
(index hit — no further await needed) and sometimes to an un-awaited
`Promise<CodeweaversInfo | null>` (index miss, live-scrape fallback). This is
functionally correct — `Promise.all` treats non-thenables as
already-resolved — but the inline `await` inside the array literal means
JS must fully evaluate this element (including resolving
`getCodeweaversFromIndex`) *before* `Promise.all` is even invoked, which
partially defeats the apparent intent of fetching everything concurrently,
and the mixed return-type-per-branch makes the code harder to reason about
under future changes.

**Fix:** Extract the CrossOver lookup into its own `async function` so the
array element is always a single `Promise<CodeweaversInfo | null>`:

```ts
async function resolveCodeweavers(): Promise<CodeweaversInfo | null> {
  if (isMac) return (await getCodeweaversFromIndex(gameInfo)) ?? getInfoFromCodeweavers(title)
  if (isLinux) return getInfoFromCodeweavers(title)
  return null
}
// ...
const [..., codeweavers] = await Promise.all([..., resolveCodeweavers()])
```

---

### IN-04: `.gameCardCrossoverBadge` shares a `z-index` with `.gameTitle`, which renders later in the DOM — possible visual overlap on hover

**File:** `src/frontend/screens/Library/components/GameCard/index.css:115-131, 217-231`, `src/frontend/screens/Library/components/GameCard/index.tsx:519-527`

**Issue:** `.gameCardCrossoverBadge` is `position: absolute; bottom: 5px; right: 0.5rem; z-index: 3`. `.gameTitle` is also `z-index: 3`, anchored `bottom: 0px`, spans the full card width, and slides into view on hover/`titlesAlwaysVisible` (`transform: translateY(0)`). `<CrossoverBadge>` is rendered before the `<Link>` containing the title in `GameCard/index.tsx` (line 519 vs. 520+), so at equal `z-index` the later-painted `.gameTitle` sits on top in stacking order. On hover, the title bar sliding up from the bottom can visually cover the medal dot it sits next to — undermining the "scannability" rationale D-15 gives for the badge, at exactly the moment (hover) a user might want to double-check it.

**Fix:** Give `.gameCardCrossoverBadge` a higher `z-index` than `.gameTitle` (e.g. `4`), or reposition it clear of the title's hover-revealed footprint.

---

_Reviewed: 2026-07-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
