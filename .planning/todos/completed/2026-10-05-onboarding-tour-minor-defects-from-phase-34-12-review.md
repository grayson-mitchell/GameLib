---
created: 2026-10-05T00:00:00.000Z
title: "Onboarding tour minor defects: anchor census counts files not elements, disproved FIX comments, sidebar-era tour copy, Library tour ignores Steam/Zoom"
area: ui
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.12"
files:
  - src/frontend/components/UI/NavShell/__tests__/navTourAnchorCensus.test.ts
  - src/frontend/components/Tour/Tour.tsx:36-43
  - src/frontend/state/TourContext.tsx:136-149
  - src/frontend/screens/Library/components/LibraryTour.tsx:28-43
  - public/locales/en/translation.json
---

## Problem

1. **Anchor census counts files** (`navTourAnchorCensus.test.ts`, `filesContaining()`):
   `toHaveLength(1)` means "one file", so a second `data-tour="nav-settings"` in the same file stays
   green — the duplicate-selector class the gate was written for. `library-view-toggle` legitimately
   appears twice in one ternary (`Header/index.tsx:215/225`).
2. **"FIX (introjs-tooltip-not-rendering)" comments name a disproved cause**: `Tour.tsx:36-43`,
   `NavShellTour/index.tsx:33-37,50-54`, `LibraryTour.tsx:39-43`, `TourContext.tsx:136-149` say the
   memoisation fixed the blank tooltip. `.planning/debug/introjs-tooltip-not-rendering.md`
   §"RECORD CORRECTION" says the real fix is `visibility: visible` at `Tour.scss:13-15`.
3. **Tour copy predates the tab layout**: `tour.library.welcome.intro2` says "Manage accounts on the
   sidebar"; `tour.sidebar.accounts` says "(Epic, GOG, Amazon)"; `tour.sidebar.stores` says
   "Epic, GOG, and Amazon" — no sidebar exists and Steam is missing.
4. **`hasGames` ignores Steam and Zoom** (`LibraryTour.tsx:28-33`): a Steam-only user never gets the
   `library-game-card` step.

## Failure scenario

See each item.

## Suggested fix

1. Count occurrences per file (`split(needle).length - 1`), require a total of 1, allow-list
   `library-view-toggle`.
2. Relabel as hygiene and point to `Tour.scss`.
3. Add new keys with tab-layout copy (D-07: add keys rather than edit).
4. Add `steam.library.length || zoom.library.length`.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

All four items confirmed against the code before fixing.

**1. Census counted files.** `navTourAnchorCensus.test.ts` gains `occurrencesOf()` (one entry per
hit, via `split(needle).length - 1`) and the nav-step, launcher and library-anchor uniqueness
checks use it; the dead-id and `sidebar-*` checks keep the file count (they assert 0, where the
two are equivalent). `library-view-toggle` is not censused, so no allow-list was needed — the
helper's comment says one would be if it ever is. Mutation proof on PRODUCT code: a second
`data-tour="nav-settings"` added to `NavTabs/index.tsx` left the old census (run from a temp copy
of the HEAD file) PASS and turned the new one FAIL (1 failed); mutation reverted.

**2. Disproved FIX comments.** The five "FIX (introjs-tooltip-not-rendering)" comments in
`Tour.tsx`, `TourContext.tsx`, `NavShellTour/index.tsx` (x2) and `LibraryTour.tsx` now say
"Hygiene, not the blank-tooltip fix", cite the debug file's RECORD CORRECTION, and point to
`Tour.scss`'s `.introjs-tooltipReferenceLayer { visibility: visible }`. Comment-only; no RED
possible.

**3. Sidebar-era copy.** Per D-07, new keys rather than edits — and in the fork-owned `gamelib`
namespace, since `i18nCatalogChurnGuard` forbids fork edits to `translation.json`:
`gamelib:tour.library.welcome.intro2` ("…sign in to your stores from the Accounts tab…"),
`gamelib:tour.nav.stores` ("…Epic, GOG, Steam and Amazon stores."), `gamelib:tour.nav.accounts`.
`pnpm i18n` wrote only `public/locales/en/gamelib.json`; the old `tour.sidebar.*` /
`tour.library.welcome.intro2` keys stay in `translation.json` (keepRemoved). The stores copy names
the four stores `StoresPanel` actually lists (Zoom is not there).

**4. `hasGames` ignored Steam/Zoom.** `LibraryTour.tsx` now also checks `steam.library.length` and
`zoom.library.length`.

**RED (items 3, 4).** `NavShellTour.test.tsx` and `libraryTourAnchors.test.tsx` now resolve `t()`
against the shipped en catalogues (`faithfulTranslate`) instead of returning the inline default —
the old mock could not see item 3 at all, because the stale text lives in the catalogue. New cases
failed on the unfixed code: Steam-only and Zoom-only libraries got no `library-game-card` step;
the rendered copy contained "Manage accounts on the sidebar", "Epic, GOG, and Amazon" and
"(Epic, GOG, Amazon)".

**GREEN.** NavShell + Library + Header + state suites: 81 suites, 1418 tests pass. `pnpm codecheck`
exit 0; eslint 0 errors (pre-existing warnings only); prettier `--check` clean on all seven touched
source/test files (`gamelib.json` is prettier-ignored); `pnpm i18n --fail-on-update` clean;
`pnpm i18n-churn-guard` clean.

**Not verified / left open.** `meta/__tests__/lintTranslations.test.ts`'s two live-tree checks
(REQ-41-01 baseline drift, REQ-41-02 gamelib hard failures) are red — but were already red at the
branch tip before this change (the `box.protocol.launch.*` keys from `91d4756`). This change adds
three more unlocalised gamelib keys to that list. The baseline
(`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`) was deliberately not
regenerated here, because parallel branches are adding gamelib keys and a regenerated baseline
would conflict; regenerate once after merging. No live tour run.
