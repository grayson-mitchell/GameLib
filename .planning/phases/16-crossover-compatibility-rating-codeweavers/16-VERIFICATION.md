---
phase: 16-crossover-compatibility-rating-codeweavers
verified: 2026-07-10T19:30:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
gap_resolution: >
  The single gap (D-08 Extra-info tab reachability) was closed inline during
  this execution by commit cf022f4d: `hasWikiInfo` in
  src/frontend/screens/Game/GamePage/index.tsx now includes
  `wikiInfo?.codeweavers?.rating != null`, so the Extra-info tab (and the
  CrossOver row) surfaces on Linux whenever a live CodeWeavers rating exists,
  independent of applegamingwiki/HLTB/PCGamingWiki/Steam data. The gate uses
  `rating != null` rather than a raw `codeweavers` truthy check because a
  genuine soft-404 miss caches a truthy EMPTY marker ({rating:null,...}), which
  would otherwise open the tab for every Mac/Linux game. Verified via
  `pnpm codecheck` (exit 0) and code inspection. All 3 success criteria and
  locked constraints now satisfied.
gaps:
  - truth: "CrossOver row renders on Linux independently of AppleGamingWiki (D-08)"
    status: resolved
    reason: >
      AppleWikiInfo.tsx's own render logic is correctly decoupled from
      applegamingwiki (the CrossOver <a> block is gated only on `codeweavers`
      presence, per src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:56).
      However the PARENT "Extra info" tab — the only UI entry point into the
      component containing this row — is gated by a `hasWikiInfo` boolean in
      src/frontend/screens/Game/GamePage/index.tsx:375-380 that does NOT include
      `wikiInfo?.codeweavers`:
        const hasWikiInfo =
          wikiInfo?.applegamingwiki ||
          wikiInfo?.howlongtobeat ||
          wikiInfo?.pcgamingwiki?.metacritic.score ||
          wikiInfo?.pcgamingwiki?.opencritic.score ||
          wikiInfo?.steamInfo
      On Linux, `applegamingwiki` is always null (isMac-gated fetch), so for a
      title whose ONLY enriched wiki data is a CodeWeavers hit (no HLTB entry,
      no PCGamingWiki metacritic/opencritic score, and no Steam linkage so
      steamInfo stays null), the "Extra info" Tab button itself never renders
      (GamePage/index.tsx:515 `{hasWikiInfo && <Tab value="extra" .../>}`), and
      `currentTab` can only change via clicking that Tab
      (GamePage/index.tsx:177-179, 487-488) — so the CrossOver row is
      unreachable in the UI even though `wikiInfo.codeweavers` was fetched and
      populated correctly. This is a real violation of D-08 ("renders on
      Linux") and puts SC-1 at risk for exactly the class of Linux titles the
      phase's stated goal targets (sideloaded/non-Steam-linked games with a
      CodeWeavers listing but no other wiki source).
    artifacts:
      - path: "src/frontend/screens/Game/GamePage/index.tsx"
        issue: "hasWikiInfo (lines 375-380) omits wikiInfo?.codeweavers, so the Extra-info tab (and therefore the CrossOver row) can be hidden even when live CodeWeavers data exists"
    missing:
      - "Add `wikiInfo?.codeweavers?.rating !== undefined && wikiInfo.codeweavers !== null` (or equivalent truthy check on `wikiInfo?.codeweavers`) to the `hasWikiInfo` disjunction in src/frontend/screens/Game/GamePage/index.tsx so the tab (and CrossOver row) surfaces whenever CodeWeavers data — hit or graceful miss — is present, independent of applegamingwiki/HLTB/PCGamingWiki/Steam data."
---

# Phase 16: CrossOver Compatibility Rating (CodeWeavers) Verification Report

**Phase Goal:** The extra-info panel's "Crossover rating" row is populated from live CodeWeavers CrossOver compatibility data (replacing the stale AppleGamingWiki source added in quick task 260710-l27), fetched on-demand and cached, with a graceful "no compatibility data" state for genuine misses.

**Verified:** 2026-07-10T19:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: For a title with a real CodeWeavers listing, the row shows CodeWeavers value+count (not AppleGamingWiki) | ✓ VERIFIED (component level) | `AppleWikiInfo.tsx:65-78` renders `<Rating value={codeweavers.rating} .../>` + count label from `formatCrossoverRating`, sourced from `wikiInfo.codeweavers` (not `applegamingwiki.crossoverRating`). Human-verified/approved per Task 3 checkpoint on titles with strong wiki presence (Hades, Half-Life 2, GTA V). See gap below for the tab-visibility caveat. |
| 2 | SC-2: Lookups on-demand + cached, no bulk crawl, desktop UA | ✓ VERIFIED | `getInfoFromCodeweavers` only invoked per-title inside `getWikiGameInfo` (`wiki_game_info.ts:53`), result written to `wikiGameInfoStore.set` (`wiki_game_info.ts:93`), `staleCrossoverData` self-heal avoids re-fetch once cached (`wiki_game_info.ts:36-37`). `BROWSER_USER_AGENT` (Chrome desktop UA string) sent on every request (`codeweavers/utils.ts:139-143`, `codeweavers/constants.ts:14-15`). At most 2 requests per title (primary + 1 bounded fallback) — asserted by test `FALLBACK: both primary and fallback slug miss -> EMPTY marker, bounded to 2 calls`. |
| 3 | SC-3: Genuine misses render "no compatibility data available", not error/false rating | ✓ VERIFIED | `getInfoFromCodeweavers` returns the `{rating:null,ratingCount:null,slug}` cacheable EMPTY marker on soft-404 (both primary+fallback), never `null` on a genuine miss (tested). `AppleWikiInfo.tsx:65-78` renders `t('info.no-compatibility-data', ...)` when `codeweavers.rating === null`, skipping the star component entirely. i18n key confirmed present in `public/locales/en/gamepage.json:189`. |
| 4 | Hit/miss decided by CONTENT (parseable VideoGame JSON-LD), not HTTP status | ✓ VERIFIED | `isSoft404()` tests `SOFT_404_TITLE_RE` against the response body/title (`codeweavers/utils.ts:78-80, 145-147`); no `response.status` check anywhere in `fetchRatingForSlug`. `SOFT_404_TITLE_RE` JSDoc explicitly documents "every response is HTTP 200" (`constants.ts:17-24`). |
| 5 | Slugify drops apostrophes + normalizes roman numerals; one secondary fallback slug on primary miss | ✓ VERIFIED | `slugify()` drops apostrophes before hyphen-collapse and maps roman numerals I-X to Arabic (`codeweavers/utils.ts:59-66`); `naiveSlugify()` is the pre-D-04 fallback. `getInfoFromCodeweavers` attempts exactly one fallback (`utils.ts:172-182`). All D-04 test cases pass (`Baldur's Gate 3` -> `baldurs-gate-3`, `Call of Duty: Modern Warfare II` -> `call-of-duty-modern-warfare-2`, fallback bounded to 2 axios calls). |
| 6 | Wine rating row unchanged — AppleGamingWiki + ratingTier() (D-06) | ✓ VERIFIED | `AppleWikiInfo.tsx:90` still calls `ratingTier(applegamingwiki.wineRating).label`; `grep -c "ratingTier(applegamingwiki.crossoverRating)"` = 0 (no longer used for CrossOver). |
| 7 | Fetched on Mac AND Linux (D-07); title-derived slug for all runners (D-02) | ✓ VERIFIED | `wiki_game_info.ts:53`: `isMac \|\| isLinux ? getInfoFromCodeweavers(title) : null` — gated on both platforms, called with `title` only (no `appName`/`runner`/`runner === 'steam'` branch). |
| 8 | CrossOver row decoupled from applegamingwiki so it renders on Linux (D-08) | ✗ PARTIAL / GAP | Component-level render logic IS decoupled (`AppleWikiInfo.tsx:56` gates on `codeweavers`, not `applegamingwiki`). But the parent "Extra info" **tab** — the only navigation path to that component — is gated by `hasWikiInfo` in `GamePage/index.tsx:375-380`, which does **not** include `wikiInfo?.codeweavers`. On Linux (where `applegamingwiki` is always null), a title whose only enriched data is CodeWeavers will never show the "Extra info" tab at all, so the row is unreachable. See gap in frontmatter. |

**Score:** 7/8 truths verified (1 partial/gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/wiki_game_info/codeweavers/utils.ts` | getInfoFromCodeweavers, slugify, JSON-LD parse, soft-404 detection | ✓ VERIFIED | Exports present; 16/16 unit tests pass; `pnpm codecheck` 0 errors; scoped lint 0 errors (8 pre-existing-style warnings). |
| `src/backend/wiki_game_info/codeweavers/constants.ts` | BASE_URL, BROWSER_USER_AGENT, SOFT_404_TITLE_RE, ldJsonRegEx | ✓ VERIFIED | All four named consts present, non-greedy `ldJsonRegEx`, content-based `SOFT_404_TITLE_RE`. |
| `src/common/types.ts` | CodeweaversInfo + WikiInfo.codeweavers field | ✓ VERIFIED | `CodeweaversInfo` at line 738 (rating/ratingCount/slug); `WikiInfo.codeweavers: CodeweaversInfo \| null` at line 764. |
| `src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` | hit/miss/error/UA/slugify/fallback cases | ✓ VERIFIED | 16 tests, all passing (`pnpm test src/backend/wiki_game_info/codeweavers`). |
| `src/backend/wiki_game_info/wiki_game_info.ts` | codeweavers fetch in Promise.all, self-heal, cached | ✓ VERIFIED | Import, `isMac \|\| isLinux ? getInfoFromCodeweavers(title) : null`, `staleCrossoverData` guard, `codeweavers` in cached literal — all present and wired. |
| `src/frontend/screens/Game/GamePage/components/crossoverRating.ts` | formatCrossoverRating helper | ✓ VERIFIED | Exports `formatCrossoverRating`; returns count-label string or null on miss; 3/3 unit tests pass. |
| `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` | per-row conditional, numeric/star CrossOver row, miss state | ✓ VERIFIED (component-local) | `if (!applegamingwiki) return null` early-return removed; CrossOver row gated on `codeweavers`; Wine row gated on `applegamingwiki`; miss state renders i18n string. See gap re: upstream tab visibility. |
| `public/locales/en/gamepage.json` | info.no-compatibility-data key | ✓ VERIFIED | Key present at line 189, valid JSON (`node -e "require(...)"` exits 0). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `codeweavers/utils.ts` | codeweavers.com | `axiosClient.get` + User-Agent header | ✓ WIRED | Confirmed in `fetchRatingForSlug`; UA-header regression test passes. |
| `codeweavers/utils.ts` | `BASE_URL` + `slugify(title)` | URL construction | ✓ WIRED | `${BASE_URL}/${slug}`; slug constrained to `[a-z0-9-]` (T-16-01 closed). |
| `wiki_game_info.ts` | `getInfoFromCodeweavers` | `isMac \|\| isLinux` gated Promise.all entry | ✓ WIRED | Confirmed at `wiki_game_info.ts:53`. |
| `wikiGameInfo` literal | `wikiGameInfoStore.set` | codeweavers included before cache write | ✓ WIRED | Confirmed at `wiki_game_info.ts:83-93`. |
| `AppleWikiInfo.tsx` | `wikiInfo.codeweavers` | independent per-row conditional | ✓ WIRED (component-local) | Confirmed at `AppleWikiInfo.tsx:56`. |
| `AppleWikiInfo.tsx` CrossOver row | codeweavers deep-link | `createNewWindow` to slug URL | ✓ WIRED | Confirmed at `AppleWikiInfo.tsx:26-36`. |
| `GamePage/index.tsx` "Extra info" Tab | `AppleWikiInfo.tsx` (containing CrossOver row) | `hasWikiInfo` gate → Tab → TabPanel | ✗ NOT WIRED for codeweavers-only case | `hasWikiInfo` (`index.tsx:375-380`) omits `wikiInfo?.codeweavers`; when codeweavers is the sole populated wiki source (common on Linux, since `applegamingwiki` is never fetched there), the Tab never renders and the CrossOver row is unreachable. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `AppleWikiInfo.tsx` | `codeweavers` (from `wikiInfo.codeweavers`) | `getWikiGameInfo` → `getInfoFromCodeweavers(title)` → live axios fetch + JSON-LD parse | Yes — real HTTP fetch to codeweavers.com, real JSON-LD extraction, no static/hardcoded return | ✓ FLOWING |
| `GamePage/index.tsx` `hasWikiInfo` → Tab visibility | `wikiInfo` (context) | same `getWikiGameInfo` result | Codeweavers portion flows correctly into `wikiInfo`, but is excluded from the `hasWikiInfo` disjunction that gates the Tab | ⚠️ PARTIALLY DISCONNECTED (see gap) |

### Requirements Coverage

No formal requirement IDs are assigned to this phase in `.planning/REQUIREMENTS.md` (ROADMAP Requirements: TBD, confirmed by grep — no "Phase 16" entries found). Verified against the 3 stated success criteria and locked constraints instead (see Observable Truths table above). PLAN frontmatter `requirements:` fields (SC-01/SC-02/SC-03, D-01 through D-09) are the phase's own internal decision-log IDs, not externally tracked REQUIREMENTS.md IDs — no orphans to report.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/frontend/screens/Game/GamePage/index.tsx` | 375-380 | `hasWikiInfo` disjunction omits `codeweavers` | 🛑 Blocker (for D-08/SC-1 on Linux) | CrossOver row unreachable in the UI for codeweavers-only titles (see gap). |
| `src/backend/wiki_game_info/codeweavers/utils.ts` | 93-113 | `ldJsonRegEx` matches only the first ld+json block; `@graph` fallback mishandles a bare top-level array root | ⚠️ Warning (pre-existing finding, `16-REVIEW.md` WR-01) | Could misclassify a real hit as a miss if CodeWeavers ever emits the VideoGame node outside the first ld+json block or as a bare array root. Not demonstrated against real pages (spike-validated structure matches current parse). |
| `src/backend/wiki_game_info/codeweavers/utils.ts` | 120-127 | `Number(null)` / `Number('')` coerces to `0`, not rejected before the `Number.isFinite` guard | ⚠️ Warning (pre-existing finding, `16-REVIEW.md` WR-05) | A malformed hit page with `ratingValue: null` would cache/render a false "0 rating" rather than the miss state — a latent SC-3 risk, not demonstrated on real data. |
| `src/frontend/screens/Game/GamePage/components/crossoverRating.ts` | 29-31 | Hardcoded English `'rating'`/`'ratings'` pluralization bypassing i18next | ℹ️ Info (pre-existing finding, `16-REVIEW.md` WR-03) | Won't localize; cosmetic i18n gap, not a goal-blocker. |
| `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` | 33, 45 | `gameInfo.title` interpolated unencoded into fallback search URL | ℹ️ Info (pre-existing finding, `16-REVIEW.md` WR-04) | Titles with `&`/`#`/`=` could break the fallback URL; copies a pre-existing pattern, not new risk introduced by this phase's core goal. |

Note: `16-REVIEW.md` (code review, run after all phase commits, `be3ffdb7`) independently found 6 warnings + 2 info items across this same code, none classified as critical/blocker by the reviewer. None of these were subsequently fixed (no follow-up commit after `be3ffdb7`). They are re-surfaced here for completeness but do not change this verification's core status determination except where they overlap with the `hasWikiInfo` finding, which the code review did not identify (it reviewed the listed 10 files only, not `GamePage/index.tsx`).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend codeweavers unit suite | `pnpm test src/backend/wiki_game_info/codeweavers` | 16/16 passed | ✓ PASS |
| Frontend crossoverRating unit suite | `pnpm test crossoverRating` | 3/3 passed | ✓ PASS |
| Full wiki_game_info backend suite (regression) | `pnpm test src/backend/wiki_game_info` | 40/40 passed (6 suites) | ✓ PASS |
| Type check | `pnpm codecheck` | 0 errors | ✓ PASS |
| Scoped lint on touched files | `npx eslint --cache <touched files>` | 0 errors, 8 pre-existing-style warnings | ✓ PASS |
| i18n JSON validity | `node -e "require('./public/locales/en/gamepage.json')"` | exits 0 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or discovered for this phase (not a migration/tooling phase). Step 7c: SKIPPED (no probes applicable).

### Human Verification Required

None outstanding. Per task instructions, the human-verify checkpoint (Task 3 of plan 16-03) was already performed and approved during execution — numeric/star hit render, graceful miss state, unchanged Wine row, and Linux rendering were confirmed by the user on the running app. That checkpoint used titles with strong existing wiki presence (Hades, Half-Life 2, GTA V), which masked the `hasWikiInfo` tab-visibility gap identified above (those titles have PCGamingWiki/HLTB/Steam data independent of CodeWeavers, so the tab was already visible for other reasons). The gap found in this verification is code-level and does not require further human testing to confirm — it is directly readable from `GamePage/index.tsx:375-380`.

### Gaps Summary

The backend lookup service (plan 16-01), orchestrator wiring (plan 16-02), and the CrossOver row's own render logic (plan 16-03) are all correctly implemented, tested, and wired exactly as specified: content-based hit/miss detection, D-04 slugify fixes with one bounded fallback, on-demand + cached lookups with a desktop UA, a graceful miss state, and a component-level decoupling from `applegamingwiki`. All automated tests pass and `codecheck`/scoped lint are clean.

The single gap is an upstream wiring omission the phase's plans never examined: the "Extra info" tab that hosts `AppleWikiInfo.tsx` (and therefore the CrossOver row) is itself gated by a `hasWikiInfo` boolean in `GamePage/index.tsx` that predates this phase and was never updated to include `wikiInfo?.codeweavers`. Because `applegamingwiki` is only fetched on Mac, this means on Linux — the exact platform D-08 calls out — a title whose sole enriched wiki source is CodeWeavers will never show the tab at all, making the row structurally unreachable despite being correctly fetched, cached, and ready to render. This directly undermines the phase's D-08 locked constraint and puts SC-1 at risk for a real subset of Linux titles. It is a small, well-scoped fix (one additional disjunct in `hasWikiInfo`), not a structural rework, but it was not caught by the human-verify checkpoint because the tested titles all had other wiki data masking the issue.

---

_Verified: 2026-07-10T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
