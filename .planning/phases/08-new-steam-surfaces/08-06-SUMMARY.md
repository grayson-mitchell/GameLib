---
phase: 08-new-steam-surfaces
plan: 06
subsystem: frontend-deals
tags: [deals, discounts, filtering, cross-store, gap-closure]
requires:
  - ContextProvider per-store libraries (epic/gog/amazon/steam/zoom)
provides:
  - all-store owned-title Set on the Deals page
  - hideOwned filter genuinely wired into filteredSorted
  - canHideOwned toggle gate (any-store ownership)
affects:
  - src/frontend/screens/Discounts/index.tsx
  - src/frontend/screens/Discounts/components/DiscountFilters/index.tsx
tech-stack:
  added: []
  patterns:
    - normalized-title (trim+lowercase) Set matching across store libraries (ConsoleMode-style library spread)
key-files:
  created: []
  modified:
    - src/frontend/screens/Discounts/index.tsx
    - src/frontend/screens/Discounts/components/DiscountFilters/index.tsx
decisions:
  - "Match owned games to catalog products by normalized title (trim+lowercase) — stores do not share appName; failure mode is non-destructive (a game simply not hidden)"
  - "Split the previously-combined isGogLoggedIn gate: Wishlist Only stays GOG-gated (it is a GOG-wishlist concept); Hide Owned becomes cross-store via canHideOwned"
metrics:
  duration: ~5min
  completed: 2026-07-04
  tasks: 1
  files: 2
requirements: [STORE-01]
---

# Phase 08 Plan 06: Deals Hide Owned Cross-Store (UAT Gap F) Summary

Made the Deals/Discounts "Hide Owned" toggle honest across the whole unified library: it now hides games owned in ANY store (Epic, GOG, Amazon, Steam, Zoom) via a normalized-title owned set, is genuinely applied in the `filteredSorted` predicate (it was previously not wired in at all), and its toggle is available whenever the user owns any games rather than being gated on GOG login.

## What Was Built

**Task 1 — all-store owned set, applied hideOwned filter, broadened toggle gate** (commit `3caddcdd`)

`src/frontend/screens/Discounts/index.tsx`:
- Broadened the ContextProvider destructure from `{ gog }` to `{ epic, gog, amazon, steam, zoom }`; kept `isGogLoggedIn = !!gog?.username` (still gates Wishlist Only).
- Added a memoized `ownedTitles: Set<string>` built from all five `.library` arrays, mapping each `GameInfo.title` to a normalized `trim().toLowerCase()` key (skipping empties). Dep array is the five `.library` references.
- Added `const canHideOwned = ownedTitles.size > 0`.
- Applied the filter inside the `filteredSorted` `products.filter` predicate: `if (hideOwned && ownedTitles.has(p.title.trim().toLowerCase())) return false`. Added both `hideOwned` and `ownedTitles` to the `filteredSorted` dep array (both were previously absent — without this the toggle would not re-filter).
- Passed `canHideOwned={canHideOwned}` to `DiscountFilters` alongside the retained `isGogLoggedIn`.

`src/frontend/screens/Discounts/components/DiscountFilters/index.tsx`:
- Added `canHideOwned: boolean` to the props interface and destructured it.
- Split the combined `{isGogLoggedIn && (...)}` block that previously wrapped BOTH controls: "Wishlist Only" stays under `{isGogLoggedIn && (...)}`; "Hide Owned" moved to its own `{canHideOwned && (...)}` block so it shows whenever the user owns games in any store, independent of GOG login.

## Verification

- Grep assertions: `steam.library`, `ownedTitles`, `canHideOwned` present in `Discounts/index.tsx`; `canHideOwned` present in `DiscountFilters/index.tsx`; `hideOwned && ownedTitles` filter present. All PASS.
- `pnpm codecheck` (tsc --noEmit): exits 0.
- Behavior: enabling "Hide Owned" now removes catalog products whose title matches a game owned in any store; toggle is visible whenever `ownedTitles` is non-empty.

## Deviations from Plan

None - plan executed exactly as written.

## Root Cause (Gap F)

Diagnosis F in 08-UAT.md: `Discounts/index.tsx` destructured only `{ gog }` and gated the toggle on `isGogLoggedIn`. During planning it was confirmed the `hideOwned` state was persisted and shown but NOT wired into `filteredSorted` at all (no ownership match existed). This plan both broadened the ownership source to all five stores AND genuinely applied the filter for the first time. This was a pre-existing cross-store Deals-page bug (not a Steam-surface regression) that the user scoped into this Phase 8 gap-closure run, mapped to STORE-01.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/frontend/screens/Discounts/index.tsx (modified)
- FOUND: src/frontend/screens/Discounts/components/DiscountFilters/index.tsx (modified)
- FOUND: commit 3caddcdd
