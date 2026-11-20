---
created: 2026-11-18T00:00:00.000Z
title: 'themeTokens.test.ts "render-site census" finds 37 .is-link render sites, expects 34'
area: testing
severity: minor
platform: any
ready: code
files:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
---

## Problem

`src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` (the
`Game-menu .is-link family: render-site census ...` describe, 261015-7tt) has one
failing case: `render-site census: re-derived F1 counts match exactly (34 total, 27
is-link, 26 GameSubMenu, 1 MainButton, 1 pure DownloadManager, 2 pure
SteamManagedItemView, 4 pure EngineNotices)`. It finds 37 sites where the pin says 34
(`expect(isTextSites).toHaveLength(34)`, around line 2801).

It fails at HEAD before phase 64 touched anything: 288 of 289 tests pass. It is
unrelated to theme tokens as such. Phase 64 plan 01 found it while lifting the colour
helpers and left it alone, deliberately.

## Direction

Re-derive the census: work out which three render sites were added since the pin was
written (the list printed in the failure shows `GameSubMenu/index.tsx` repeated), decide
whether each belongs in the `.is-link` family, then update the pinned counts and the
case title together. Do not just bump 34 to 37 without looking at the sites, because the
case exists to catch a new site that escaped the contrast census.

## Resolution

Resolved by phase 82 plan 01 (commit `013e721c8`). The census was re-derived site by site: at HEAD it found 39 `is-text` sites, not 37, against the pin of 34. The five new sites are all pure `button is-text` (no `.link`, no `.is-link`), so the `.is-link` subset stays at 27:

- `NativePortInfo.tsx` x3, added by quick 261117-r4c (`20e70fdc1`)
- `ThemeEditor/index.tsx` Back, added by phase 64-07 (`eb33e8668`)
- `ThemeEditor/index.tsx` Rename, added by phase 64-09 (`1f9c0efa1`)

None of the five declares a colour or background of its own (`ThemeEditor/index.scss` and `GamePage/index.css` only lay them out), so none escaped the contrast census: they take the theme-global `.button.is-text` colour and hover pair that the pure-family tests already measure. The pin is now 39, with named per-file counts for the two new files and an accounting assertion (27 is-link + 12 pure = 39) so a future site in neither list fails instead of being absorbed by a bumped total. No frontend source file changed.
