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
