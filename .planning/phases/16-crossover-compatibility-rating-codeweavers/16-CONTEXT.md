# Phase 16: CrossOver Compatibility Rating (CodeWeavers) - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Populate the extra-info panel's **"Crossover rating"** row from **live CodeWeavers
CrossOver compatibility data** (the schema.org `VideoGame` JSON-LD `aggregateRating`
— value + count), replacing the stale AppleGamingWiki source wired in quick task
260710-l27. Lookups are on-demand, cached, and use a desktop-browser User-Agent.
Genuine misses render a graceful "no compatibility data available" state — never an
error or a false rating.

**In scope:** the CrossOver rating row's data source + display + backend lookup
service + caching + graceful miss state, on Mac and Linux.

**Out of scope:** the Wine rating row (stays on AppleGamingWiki), any bulk crawl of
the CodeWeavers directory, Windows-platform behavior, changing ProtonDB/SteamDeck
compat rows.

</domain>

<decisions>
## Implementation Decisions

### Data Source & Lookup Strategy
- **D-01:** The **CrossOver rating** row is sourced from live CodeWeavers data
  (`GET /compatibility/crossover/{slug}`, parse `VideoGame` JSON-LD `aggregateRating`
  → `ratingValue` + `ratingCount`). This replaces the AppleGamingWiki `crossoverRating`
  string for this row only.
- **D-02:** **Slug resolution = constructed title-slug for all runners.** No Steam
  AppID-based lookup and no reuse of AppleGamingWiki's `codeweavers` slug. The spike
  validated title-slug at ~83% with the two required fixes. One clean code path
  regardless of runner (Steam / Epic / GOG / Amazon / sideload).
- **D-03:** Hit/miss detection is **content-based** (presence of a parseable
  `VideoGame` JSON-LD node vs. soft-404 page titled "404 Not Found"), NOT HTTP status
  — every response is HTTP 200. This is a correctness requirement, not optional.
- **D-04:** Slugify MUST (a) **drop apostrophes entirely** (`baldurs-gate-3`, not
  `baldur-s-gate-3`) and (b) **normalize roman numerals to Arabic digits**
  (`modern-warfare-2`). Attempt a **secondary fallback slug** when the primary slug
  misses.

### Display
- **D-05:** Render the CrossOver rating as a **numeric value + count**, faithful to
  CodeWeavers `aggregateRating` (e.g. "4.5 / 5 (2 ratings)" or a star glyph). Do NOT
  bucket the numeric value into the existing categorical tier labels
  (perfect/playable/…). Exact visual treatment may be refined by `/gsd-ui-phase` or
  the planner, but the row shows the real number + rating count, not an invented tier.
- **D-06:** The **Wine rating** row is **unchanged** — it keeps its AppleGamingWiki
  categorical source and `ratingTier()` rendering. Only the Crossover row's source and
  display change.

### Platform Gating
- **D-07:** Fetch live CrossOver data on **Mac AND Linux** (CrossOver's real supported
  platforms). Not Windows.
- **D-08:** Because CrossOver now fetches on Linux too — where AppleGamingWiki is NOT
  fetched (`isMac` gate) — the **CrossOver rating row must render independently of
  `applegamingwiki` presence**. Today the entire `AppleWikiInfo` panel early-returns
  when `wikiInfo.applegamingwiki` is null; that coupling must be broken so the CrossOver
  row can appear on Linux without AppleGamingWiki data.

### Miss / Error Handling
- **D-09:** A **genuine miss** (soft-404, no `VideoGame` node) renders the graceful
  "no compatibility data available" state — distinct from a **fetch error**, which
  should not poison the cache (mirror the existing AppleGamingWiki pattern: cacheable
  "checked, none found" marker for misses; return null on error so it retries).

### Claude's Discretion
- **Cache location & TTL:** reuse the existing `wikiGameInfoStore` (keyed by title)
  alongside `applegamingwiki`, or add a dedicated store — planner's call, following the
  established `EMPTY_APPLEGAMINGWIKI_INFO` cacheable-miss marker pattern.
- **New backend service shape** (`codeweavers/utils.ts` + `constants.ts`), type
  definitions, and where the fetch slots into `getWikiGameInfo`'s `Promise.all`.
- **Exact User-Agent string** (reuse the existing browser UA constant pattern).
- **Whether the row keeps AppleGamingWiki's existing `codeweavers` deep-link** on
  click, or deep-links using the constructed slug.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feasibility & Locked Constraints (spike 260710-nwb)
- `spike/crossover-compat-FINDINGS.md` — validated lookup approach, content-based
  hit/miss detection, slugify bugs (apostrophe-drop, roman-numeral normalization),
  measured match rate (66.7% naive / ~83.3% with fixes), GO recommendation. **This is
  the primary source of truth for the backend lookup behavior.**
- `spike/crossover-compat-lookup.mjs` — the throwaway spike script that proved the
  approach (reference implementation for slugify + JSON-LD parse). Deletable once this
  phase ships.

### Roadmap
- `.planning/ROADMAP.md` § "Phase 16: CrossOver Compatibility Rating (CodeWeavers)" —
  goal, success criteria, locked constraints, and (now-resolved) open questions.

### Existing Code (see code_context below for details)
- `src/backend/wiki_game_info/wiki_game_info.ts` — orchestrator to extend.
- `src/backend/wiki_game_info/applegamingwiki/utils.ts` — closest analog for the new
  CodeWeavers backend service (browser UA, cacheable-miss marker, error→null).
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` — the row-rendering
  component to modify.
- `src/common/types.ts` § `AppleGamingWikiInfo` / `WikiInfo` — type model to extend.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getInfoFromAppleGamingWiki` (`applegamingwiki/utils.ts`)** — direct template for
  a new `getInfoFromCodeweavers`: browser `BROWSER_USER_AGENT` constant, an
  `EMPTY_*_INFO` cacheable "checked, none found" marker, try/catch that returns null on
  error (retryable) vs. the empty marker on genuine miss (cacheable).
- **`wikiGameInfoStore` + self-heal pattern (`wiki_game_info.ts`)** — existing cache
  keyed by cleaned title, with a `staleAppleData` self-heal for entries populated
  before a source existed. A similar self-heal will be needed so caches populated
  before CodeWeavers data existed re-fetch.
- **`ratingTier()` (`appleRating.ts`)** — used by the Wine row (unchanged). The
  CrossOver row moves OFF this to a numeric renderer, so a new display helper is needed.

### Established Patterns
- **Platform-gated fetch in `Promise.all`** — `wiki_game_info.ts` gates AppleGamingWiki
  with `isMac ? … : null` and ProtonDB/SteamDeck with `isLinux`. CrossOver should be
  gated `isMac || isLinux`.
- **Steam AppID direct-wire precedent** — for native Steam games `app_name` IS the
  Steam AppID (see the ProtonDB `runner === 'steam' ? appName : …` wiring). NOT used
  for CodeWeavers lookup (D-02), but documents the pattern if ever revisited.
- **Cacheable-miss marker** — misses return a sentinel object, not null, so they cache;
  errors return null so they retry. Mirror this exactly (D-09).

### Integration Points
- **Backend:** add CodeWeavers fetch to `getWikiGameInfo`'s parallel fetch in
  `src/backend/wiki_game_info/wiki_game_info.ts`; extend `WikiInfo` in
  `src/common/types.ts`.
- **Frontend:** `AppleWikiInfo.tsx` at `GamePage/index.tsx:564` (extra-info TabPanel).
  Break the `if (!applegamingwiki) return null` early-return so the CrossOver row can
  render on Linux (D-08). New i18n key for the "no compatibility data available" state
  (`public/locales/en/gamepage.json` already has `info.crossover-rating` / `wine-rating`).

</code_context>

<specifics>
## Specific Ideas

- CodeWeavers content signal is `use=reference, ai-train=no` — honor it with on-demand,
  reference-style lookups + polite caching + desktop-browser UA. No bulk harvest of the
  ~22,350-app directory (success criterion #2).
- Example live data shapes from the spike: Hades → 5 (1), Half-Life 2 → 4.5 (2),
  Grand Theft Auto V → 5 (2). Genuine misses (soft-404): Baldur's Gate 3 at the *naive*
  slug, Pokémon, and the deliberate oddball.

</specifics>

<deferred>
## Deferred Ideas

- **Move the Wine rating row to a live source** (e.g. WineHQ AppDB) — considered and
  rejected for this phase (D-06). Would be its own phase if ever wanted.
- **Steam AppID / `sameAs`-based reverse lookup** — considered and rejected (D-02) in
  favor of the spike-validated title-slug path. Could be revisited if title-slug match
  rate proves insufficient in practice.

</deferred>

---

*Phase: 16-crossover-compatibility-rating-codeweavers*
*Context gathered: 2026-07-10*
