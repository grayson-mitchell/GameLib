---
phase: quick-260710-rjm
plan: 01
subsystem: ui
tags: [codeweavers, crossover, protondb, gamepage, wiki-game-info, react, jest]

requires:
  - phase: quick-260710-qyc
    provides: AppleWikiInfo relocated into the Install-info tab under Supported platforms, gated on !is.native
provides:
  - CodeweaversInfo carrying separate macRating/linuxRating (no more averaged aggregateRating)
  - extractVideoGameJsonLd parsing per-OS Review nodes instead of the misleading aggregate
  - protonTierToStars helper mapping ProtonDB tiers to a 1-5 star value
  - Monochrome currentColor crossover_icon.svg asset
  - AppleWikiInfo rendering three independently-gated rows: Crossover (macOS), Proton (Steam-on-Linux), Wine (fallback)
affects: [gamepage-compat-rows, wiki-game-info-cache]

tech-stack:
  added: []
  patterns:
    - "Per-OS JSON-LD Review node classification (about.operatingSystem, falling back to reviewAspect) instead of trusting a single averaged aggregateRating field"
    - "show*/gate boolean flags computed once, then used directly in JSX conditional rendering (avoids non-null assertions, keeps TS narrowing simple)"

key-files:
  created:
    - src/frontend/assets/crossover_icon.svg
    - src/frontend/screens/Game/GamePage/components/protonRating.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/protonRating.test.ts
  modified:
    - src/common/types.ts
    - src/backend/wiki_game_info/codeweavers/utils.ts
    - src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts
    - src/backend/wiki_game_info/wiki_game_info.ts
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - public/locales/en/gamepage.json
  deleted:
    - src/frontend/screens/Game/GamePage/components/crossoverRating.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts

key-decisions:
  - "Used codeweavers?.macRating / applegamingwiki?.wineRating with optional chaining instead of non-null assertions in JSX, since typescript-eslint's no-unnecessary-type-assertion flagged the `!` operator as redundant given the show*-flag-gated render tree"
  - "Proton row takes priority over Wine row on Linux (showWine = applegamingwiki && !showProton) since ProtonDB gives a more specific Steam-on-Linux compatibility signal than the generic WineHQ AppDB link"

requirements-completed: [QUICK-260710-rjm]

duration: ~25min
completed: 2026-07-10
---

# Quick Task 260710-rjm: Rework GamePage Emulation Compat Rows Summary

**Fixed the CodeWeavers rating to read per-OS macOS/Linux Review nodes instead of an averaged aggregateRating, added a monochrome CrossOver icon, and introduced a Proton compatibility row for Steam-on-Linux games driven by the existing ProtonDB tier data.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 4 (3 code tasks + 1 verification-only task)
- **Files modified:** 6 modified, 3 created, 2 deleted

## Accomplishments
- CodeWeavers parser (`extractVideoGameJsonLd`) now walks per-OS `Review` nodes (classified via `about.operatingSystem`, falling back to `reviewAspect`) and returns `{ macRating, linuxRating }` separately, fixing the bug where a macOS=5/Linux=1 pair was shown as an averaged 3-star aggregate
- `staleCrossoverData` in `wiki_game_info.ts` now also treats old-shaped caches (`macRating === undefined`) as stale so existing users get re-fetched into the new shape automatically
- New `protonTierToStars` helper (platinum→5 ... borked→1; pending/native/unknown/empty→null) gives GamePage a Proton compatibility row for Steam-on-Linux games, reusing the existing `steamInfo.compatibilityLevel` ProtonDB data already fetched by `wiki_game_info.ts`
- New monochrome `crossover_icon.svg` (`stroke="currentColor"`) replaces the multicolor CodeWeavers logo in the Crossover row
- `AppleWikiInfo.tsx` rewritten into three independently-gated rows: Crossover (macOS, `codeweavers.macRating`), Proton (Linux + `runner === 'steam'` + a ProtonDB tier), Wine (fallback when Proton isn't shown)
- Deleted the now-unused `crossoverRating.ts` (`formatCrossoverRating`) helper and its test — the Crossover row no longer shows a rating-count label

## Task Commits

1. **Task 1: Backend per-OS CrossOver rating (types, parser, test, cache-stale)** - `7054d940` (fix)
2. **Task 2: Proton star helper + monochrome CrossOver icon asset** - `3c32fb32` (feat)
3. **Task 3: Rewrite AppleWikiInfo into three OS rows; delete crossoverRating; add locale key** - `ea08c570` + `d6998d2f` (feat, two commits — see Issues Encountered)
4. **Task 4: Full verification** - no code changes, verification only

**Plan metadata:** (added by orchestrator)

## Files Created/Modified
- `src/common/types.ts` - `CodeweaversInfo` now `{ macRating, linuxRating, slug }` (was `{ rating, ratingCount, slug }`)
- `src/backend/wiki_game_info/codeweavers/utils.ts` - `extractVideoGameJsonLd` parses per-OS `Review` nodes via a `VideoGame`-node-required + `Review`-node walk; `getInfoFromCodeweavers` returns the new shape on hit/fallback/miss
- `src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` - fixture rewritten to emit `VideoGame` + per-OS `Review` nodes; HIT/miss/fallback assertions updated to the new shape; added a "VideoGame present but both ratings null" miss test
- `src/backend/wiki_game_info/wiki_game_info.ts` - `staleCrossoverData` also refetches caches with `codeweavers.macRating === undefined`
- `src/frontend/assets/crossover_icon.svg` - new monochrome `currentColor` icon
- `src/frontend/screens/Game/GamePage/components/protonRating.ts` - `protonTierToStars` helper
- `src/frontend/screens/Game/GamePage/components/__tests__/protonRating.test.ts` - covers all five tiers, case-insensitivity, pending/native/empty/undefined/null/unknown
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` - rewritten to three `show*`-gated rows (Crossover/Proton/Wine)
- `public/locales/en/gamepage.json` - added `"proton-rating": "Proton emulation"` (alphabetically placed between `"path"` and `"protondb-compatibility-info"`)
- `src/frontend/screens/Game/GamePage/components/crossoverRating.ts` - **deleted** (unused after rewrite)
- `src/frontend/screens/Game/GamePage/components/__tests__/crossoverRating.test.ts` - **deleted**

## Decisions Made
- Optional chaining (`codeweavers?.macRating`, `applegamingwiki?.wineRating ?? ''`) used instead of non-null assertions inside the gated JSX rows, per an eslint `no-unnecessary-type-assertion` error surfaced during Task 4 verification (see Deviations)
- Proton row takes priority over Wine row on Linux — `showWine = !!applegamingwiki && !showProton` — since a ProtonDB tier is a more specific Steam-on-Linux signal than the generic WineHQ AppDB search link

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unnecessary non-null assertions flagged by eslint**
- **Found during:** Task 4 (full verification — `pnpm lint` on touched files)
- **Issue:** The plan's action text implied `codeweavers!.macRating` / `applegamingwiki!.wineRating` style non-null assertions inside the `show*`-gated rows. `@typescript-eslint/no-unnecessary-type-assertion` flagged both as errors (the assertions didn't change the expression's type given TS's narrowing, since MUI `Rating`'s `value` prop already accepts `number | null` and `ratingTier` accepts a plain string).
- **Fix:** Replaced with optional chaining: `codeweavers?.macRating` (still `number | null`, compatible with `Rating`'s `value` prop) and `applegamingwiki?.wineRating ?? ''` (satisfies `ratingTier(rating: string)`).
- **Files modified:** `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx`
- **Verification:** `pnpm codecheck` (0 errors) and targeted eslint run both clean afterward; `pnpm test src/frontend/screens/Game/GamePage/components` still green.
- **Committed in:** `d6998d2f` (Task 3 second commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - lint-driven bug fix, no behavior change)
**Impact on plan:** Cosmetic/type-safety fix only — the rendered output and gating logic are unchanged from the plan's intent. No scope creep.

## Issues Encountered
- **Task 3 commit split into two commits:** a `git add` invocation listing both the two already-`git rm`'d deleted paths and the two still-modified paths failed with a "pathspec did not match any files" error on the deleted-file argument, which aborted the whole `git add` before staging the modified files (the deletions were already staged from the earlier `git rm` and committed on their own in `ea08c570`). Recovered by staging and committing the remaining `gamepage.json` + `AppleWikiInfo.tsx` changes in a follow-up commit (`d6998d2f`). No functional impact — both commits are part of Task 3 and land together in this plan's commit range.
- **Pre-existing eslint `any` warnings retained:** `src/backend/wiki_game_info/codeweavers/utils.ts` carries 4 `@typescript-eslint/no-unsafe-*` **warnings** (not errors) on the `JSON.parse(match[1])` result and the `@graph` walk — this is the same untyped-JSON-parsing pattern the original code already had (the plan explicitly said to keep the JSON.parse/regex handling verbatim). Left as-is per the plan's scope boundary; 0 errors, only pre-existing-style warnings.
- **Grep verification gate has a pre-existing false-positive collision:** `grep -rn "crossoverRating" src/` still matches 9 lines, but all of them are the unrelated, pre-existing `AppleGamingWikiInfo.crossoverRating: string` field (a different wiki-data field from a different interface, untouched by this plan). A narrower grep for the actually-deleted symbols (`formatCrossoverRating`, `import ... from '.../crossoverRating'`) returns zero matches, confirming the deleted helper module is fully unreferenced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Runtime visual UAT still pending (needs GUI) — same as prior CrossOver/Wine-row quick tasks in this session (260710-qyc, 260710-l27) — to confirm the Crossover/Proton/Wine rows render correctly and the Proton row appears for a real Steam-on-Linux game with a ProtonDB tier.
- Existing cached `WikiInfo` entries with the old `{ rating, ratingCount }` CodeWeavers shape will self-heal on next fetch via the widened `staleCrossoverData` check — no manual cache migration needed.

---
*Quick task: 260710-rjm*
*Completed: 2026-07-10*

## Self-Check: PASSED

All created/modified files found on disk, both deletions confirmed, all 4 task commits (`7054d940`, `3c32fb32`, `ea08c570`, `d6998d2f`) found in `git log`.
