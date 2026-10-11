---
created: 2026-10-05T00:00:00.000Z
title: Orphaned library-top-section locale keys (and soon setting.maxRecentGames) — decide whether to remove them, and how
area: i18n
severity: minor
platform: any
ready: human
found_by: "Phase 48 plan 05 (retired the Library Top Section dropdown; SPEC Boundaries put key removal out of scope)"
source: ".planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-05-PLAN.md"
files:
  - public/locales/en/translation.json
---

## Problem

Phase 48 plan 05 deleted `Settings/components/LibraryTopSection.tsx`, so these catalogue entries
are now referenced by nothing:

- `setting.library_top_section`
- `setting.library_top_option.*` (four option labels)

They are present in 47 locale catalogues under `public/locales/*/translation.json`. Plan 48-06
deletes `MaxRecentGames` and orphans `setting.maxRecentGames` (also 47 catalogues) the same way,
so one decision covers all of them.

They are **inert** — an unread catalogue entry costs bytes, not correctness — which is why this is
`minor` and was left alone. Removing them is a decision, not an edit, because key removal in this
repo has three measured traps:

1. **The affected-locale count is 47, not 49.** 49 locale directories exist but only 47 carry
   these keys; a sweep that assumes 49 reports a false miss on the other two.
2. **`da`, `id` and `nl` behave differently** from the rest when a key is removed — do not assume
   a uniform removal pass.
3. **`_one` plural suffixes are load-bearing.** Removing a base key without checking its plural
   siblings can silently break plural resolution for the locales that use them.

## Solution

Decide whether the bytes are worth a removal pass. If yes, remove all four orphaned groups in a
single pass, derive the per-locale fill from in-repo parallels rather than assuming uniformity,
and run `pnpm i18n` plus the lint-translations gate over the result — `pnpm i18n` emitting zero
warnings is the pass condition. If no, close this todo as won't-fix; the keys cost nothing.

## Resolution (2026-10-12, quick 261012-913)

Decision: REMOVE, not won't-fix. The quick task asked for the removal; precedent 260911-srh removed
an inert key from the same 47 catalogues; none of the three traps above arms here (answered below);
and removal clears 9 pre-existing `lint-translations` findings.

- `0c59089e9` chore(quick-261012-913): 47 catalogues, 8 lines each, 376 lines deleted, 0 added,
  0 trailing-comma repairs. The edit is a line-deleting sweep with no JSON re-serialisation:
  `.planning/quick/261012-913-remove-the-orphaned-setting-library-top-/sweep-library-top-keys.cjs`.
  Each of the three entries was located independently inside the `setting` object, because adjacency
  was not uniform: `library_top_section` directly follows the option object in 40 catalogues and sits
  elsewhere in 7 (6 later, 1 earlier). All 47 were re-parsed and deep-compared against the removal
  commit's parent (`--check --against 0c59089e9^`): each equals its pre-task parse minus exactly
  `setting.library_top_option`, `setting.library_top_section` and `setting.maxRecentGames`.
  `git diff --numstat` reads `0 8` on all 47 rows.
- "All four orphaned groups" means three `setting` entries and 6 leaf keys: `library_top_section`,
  the four `library_top_option.*` labels, and `maxRecentGames`. These are exactly the keys
  `f66ba9b73` (48-05, `LibraryTopSection.tsx`) and `de83f63b9` (48-06, `MaxRecentGames.tsx`) stopped
  referencing. There is no fourth group.
- The todo's three traps, by measurement:
  1. 47 is the full population: `br/` and `sl/` have no `translation.json`, and the sweep asserts it.
  2. The da/id/nl trap is the trailing-comma case from 260911-srh. None of the three entries was the
     last member of its object in any catalogue, and the structural detector fired 0 times.
  3. Zero `_one`/`_other`/`_few`/`_many`/`_zero` plural siblings exist for these keys.
  Removal needs no per-locale fill, so the "derive the fill from in-repo parallels" clause does not
  apply.
- Gates, each against a baseline taken at `05978e870` before the edit:
  - `pnpm i18n`: no diff under `public/locales` before or after the removal commit. Its warning-word
    count was 4 before and 4 after, NOT zero: the four lines are two `Parsing ...Warning...` source
    file names, a Node `DeprecationWarning` and its trace hint, none a parser warning and none naming
    a removed key. The todo's "zero warnings" wording cannot be met literally and was not claimed.
  - `pnpm i18n-churn-guard`: clean.
  - `pnpm lint-translations`: 8225 findings / 96 hard failures to 8216 / 96, red (exit 1) before and
    after. The sorted finding-set difference is exactly the 9 ka/th `Empty translation for ...` lines
    naming the removed keys (4 ka, 5 th), all baseline-side, nothing added.
  - No presence-baseline regeneration is owed: `meta/i18nCatalogPresenceBaseline.json` is scoped to
    the `gamelib` namespace.
  - Residue grep for the three names outside `.planning/` and `src-tauri/src/main.rs`: empty.
  - Prettier check omitted as vacuous: every written path is prettier-ignored.
- Out of scope, recorded as observations only (no edit, no new todo):
  - `AppSettings.libraryTopSection` is NOT orphaned. `src/common/focusRowMigration.ts` reads it to
    seed `focusRow` for legacy profiles, and `src/backend/config.ts` seeds its default. It stays.
  - `src-tauri/src/main.rs` still reads the stored `settings.maxRecentGames` config value for the
    tray (8 hits). That is a settings read, not a locale key, and was untouched. Its comment near
    line 431 cites `src/backend/recent_games/recent_games.ts`'s `maxRecentGames || 5`, an expression
    that `de83f63b9` removed.
