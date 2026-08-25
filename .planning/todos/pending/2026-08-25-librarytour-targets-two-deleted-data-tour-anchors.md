---
created: 2026-08-25T02:35:00.000Z
title: "LibraryTour targets two `data-tour` anchors that no longer exist — CategoryFilter and LibraryFilters were deleted by Phase 34.11, and the tour still steps through them"
area: frontend
severity: low
status: pending
resolves_phase: "34.12"
found_by: "Quick task 260825-k5k, while proving 34.10-REVIEW.md's IN-01 moot before closing the review"
source: ".planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md (IN-01 disposition)"
files:
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/components/Tour/Tour.tsx
  - src/frontend/components/UI/NavShell/__tests__/tourDisabled.test.ts
---

## Problem

`LibraryTour` **is live** — rendered unconditionally at `screens/Library/index.tsx:1090`, gated
only by `useTour()`'s `isTourActive`. Two of its eight anchored steps point at DOM anchors that
were deleted along with their components:

| Step | Selector | Anchor at HEAD |
|---|---|---|
| `LibraryTour.tsx:65` | `[data-tour="library-categories"]` | **GONE** — was `components/UI/CategoryFilter/index.tsx:76` |
| `LibraryTour.tsx:73` | `[data-tour="library-filters"]` | **GONE** — was `components/UI/LibraryFilters/index.tsx:264` |

Both directories were removed by **Phase 34.11 plan 09**, which replaced the old dropdown-based
filter controls with the tier-2 Games filter panel (`NavShell/components/Filter*`). The tour was
not updated with them.

The other six anchored steps still resolve:

- `library-search` → `components/UI/LibrarySearchBar/index.tsx`
- `library-view-toggle`, `library-sort-az`, `library-sort-installed`, `library-refresh` → `components/UI/ActionIcons/index.tsx`
- `library-add-game` → `screens/Library/components/AddGameButton/index.tsx`

…as does the conditional `library-game-card` step (`screens/Library/components/GamesList/index.tsx`).

## Why no test caught it

`NavShell/__tests__/tourDisabled.test.ts` structurally proves no `NavShell/` source file
references `data-tour` — and it passes. Its scope is the `NavShell/` **directory**;
`LibraryTour.tsx` lives under `screens/Library/`, so the file is outside the assertion entirely.

This is the exact mirror image of the review finding it was found under. **IN-01 was a prop with
no reader** (`data-tour` passed to `Dropdown`, which never forwarded it). **This is a reader with
no prop** — a selector with no element. A grep-based gate written in either direction alone
catches one and not the other; a correct gate has to reconcile the *set* of emitted anchors
against the *set* of consumed selectors.

## Expected failure mode — NOT yet verified live

`Tour.tsx` wraps `intro.js-react`'s `Steps`, and passes `element` selectors straight through.
intro.js resolves `element` with `document.querySelector` and, on `null`, falls back to rendering
the step as a **floating (centered, unhighlighted) tooltip** rather than throwing. So the likely
observable symptom is two steps mid-tour that describe filter controls while highlighting
nothing — degraded, not crashing.

**This has not been confirmed by running the tour.** Confirm before designing the fix; do not
assume the floating-fallback from this note.

## Also stale in the same file (same root cause, free to fix together)

`LibraryTour.tsx:35` still tells the user to *"login with your accounts using the Manage accounts
**on the sidebar**"*. Phase 34.10 deleted the sidebar — Manage Accounts is now a tier-1 card tab.
The string is in the base `en` catalog (`tour.library.welcome.intro2`), **not** the `gamelib:`
namespace, so the i18n gate applies: regenerate via the extraction pass, never hand-edit
`translation.json`.

## Fix direction (34.12 decides)

Phase 34.12 owns the onboarding-tour rework and is the right place to settle this. The two dead
steps should either be re-anchored onto the new tier-2 filter panel or dropped, and the decision
should come with a gate that compares emitted anchors against consumed selectors app-wide, rather
than another directory-scoped grep.

Note the related standing decision: `Sidebar/components/SidebarTour.tsx` is **kept on purpose** as
34.12's work-list (decision D-13) and must not be deleted.
