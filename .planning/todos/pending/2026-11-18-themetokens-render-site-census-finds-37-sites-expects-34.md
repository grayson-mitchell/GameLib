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
