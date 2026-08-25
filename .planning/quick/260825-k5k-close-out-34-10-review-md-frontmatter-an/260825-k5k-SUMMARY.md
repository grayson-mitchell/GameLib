---
quick_id: 260825-k5k
slug: close-out-34-10-review-md-frontmatter-an
date: 2026-08-25
status: complete
type: docs
description: >
  Closed 34.10-REVIEW.md (issues_found -> resolved). Its last two open findings, WR-02 and
  IN-01, are CLOSED BY DELETION — both cite files Phase 34.11 plan 09 removed. Captured the
  mirror-image defect found while proving IN-01 moot (LibraryTour targets two deleted
  data-tour anchors) as a pending todo owned by Phase 34.12.
files_touched:
  - .planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md
  - .planning/todos/pending/2026-08-25-librarytour-targets-two-deleted-data-tour-anchors.md
  - .planning/STATE.md
  - .planning/quick/260825-k5k-close-out-34-10-review-md-frontmatter-an/260825-k5k-PLAN.md
source_changes: none
---

# 260825-k5k — 34.10 closes; the finding that mattered was the one nobody wrote down

## What was actually open in 34.10

One artifact. `34.10-VERIFICATION.md` is `passed` 9/9 with `gaps_remaining: []` and
`human_verification: []`, `34.10-SECURITY.md` is `verified` at 0/105 open, `34.10-VALIDATION.md`
is `audited`. Only `34.10-REVIEW.md` sat at `status: issues_found`, and its own `open_findings`
block already recorded `critical_fully_open: 0` — the status stood on **WR-02 and IN-01 alone**,
both non-Critical, exactly as that block's trailing comment said.

## Both were moot — and moot the same way

Verified against HEAD rather than taken from the record:

- **IN-01** (dead `data-tour` props on `<Dropdown>`) cited
  `components/UI/CategoryFilter/index.tsx:76` and `components/UI/LibraryFilters/index.tsx:264`.
  **Both directories no longer exist.** `grep -rn data-tour src/frontend` returns no `<Dropdown>`
  call site anywhere in the tree.
- **WR-02** (untranslatable Steam / ZOOM Platform labels) cited the same deleted file.
  `RunnerToStore` moved to `screens/Library/facetLabels.ts:26`, and the defect WR-02 described —
  `t()` invoked with a computed key never registered in `translation.json` — **cannot occur at
  the successor sites because `t()` is no longer called on those values at all**:
  `FilterStoreFacet/index.tsx:73` renders `RunnerToStore[value]` bare, and
  `chipLabels.ts:106-110` returns `{ literal: brand }`, a variant deliberately typed as distinct
  from that module's `{ ns, key, defaultText }` variant.

Both were removed by **Phase 34.11 plan 09** — which `facetLabels.ts:19-21` says outright ("plan
09 deletes that whole component"), the reason it copies the map verbatim instead of re-exporting.

Recorded as **CLOSED BY DELETION**, kept distinct from "fixed" on purpose: nobody changed
behaviour, the surface went away. The consequence for WR-02 is worth stating plainly because it
inverts the finding — `'Steam'` and `'ZOOM Platform'` being absent from `translation.json` is now
**correct**, not a gap. Store brand names as untranslated literals is a 34.11 design decision.

## The find: checking IN-01 instead of accepting it

`LibraryTour` **is rendered** — `screens/Library/index.tsx:1090`, gated only by `isTourActive` —
and two of its eight anchored steps point at anchors deleted with those same components:

| Step | Selector | Anchor at HEAD |
|---|---|---|
| `LibraryTour.tsx:65` | `[data-tour="library-categories"]` | **GONE** (was `CategoryFilter`) |
| `LibraryTour.tsx:73` | `[data-tour="library-filters"]` | **GONE** (was `LibraryFilters`) |

The other six resolve (`LibrarySearchBar`, `ActionIcons` x4, `AddGameButton`), as does the
conditional `library-game-card` step.

**IN-01 was a prop with no reader. This is a reader with no prop.** A grep-based gate written in
either direction alone catches one and not the other; a correct gate reconciles the *set* of
emitted anchors against the *set* of consumed selectors.

`NavShell/__tests__/tourDisabled.test.ts` is blind to it **by construction** — its scope is the
`NavShell/` directory and `LibraryTour.tsx` lives under `screens/Library/`. The test is not
wrong; it is measuring a different surface than the one that broke.

Routed to **Phase 34.12** (onboarding-tour rework, a phase that really exists since 2026-08-13)
as `.planning/todos/pending/2026-08-25-librarytour-targets-two-deleted-data-tour-anchors.md`.

## Two things the todo is careful about

1. **`resolves_phase: "34.12"` is quoted.** Unquoted `34.12` is a YAML **float** — verified both
   ways with js-yaml, not assumed. `resolves_phase` being absent or unreadable is precisely the
   shape that made todo auto-close silently miss three times before.
2. **The failure mode is marked UNVERIFIED.** `Tour.tsx` wraps `intro.js-react`, and intro.js
   falls back to a floating unhighlighted tooltip when `element` resolves to `null` — so the
   likely symptom is two unanchored steps, not a crash. **That is reasoning, not observation**,
   and the todo says so and tells 34.12 to confirm before designing the fix.

## Also recorded, same file, same root cause

`LibraryTour.tsx:35` still tells users to log in via "Manage accounts **on the sidebar**" — the
sidebar Phase 34.10 deleted. It is in the base `en` catalog (`tour.library.welcome.intro2`), not
the `gamelib:` namespace, so the i18n gate applies: regenerate, never hand-edit.

## Deliberately NOT done

- **No `src/` change.** `LibraryTour` is left as-is for its owner.
- **The frozen `findings:` census stays at `critical: 2 / warning: 2 / info: 1 / total: 5`.** Its
  own header comment forbids decrementing it, with `15-REVIEW.md`/`17-REVIEW.md` as precedent.
- **CR-01 and CR-02 not re-opened.** Closed via 34.11 D-31/D-32, quick task `260823-w2f`, and the
  live sweep `260825-ysk`. CR-02 remains **source-verified-only permanently** — never restate it
  as live-confirmed.
- **The gamepad focus-scroll residual not touched.** Already relocated to Phase 38 as 38-C05 on
  2026-08-22; run it alongside 38-C01..C04.

## Verification

- `gsd-sdk query frontmatter.get 34.10-REVIEW.md status` → `resolved`
- `open_findings`: `critical_fully_open` / `critical_partially_open` / `warning_open` /
  `info_open` all **0**; YAML parses, 6 items
- `findings:` still `2 / 2 / 1 / 5`
- todo frontmatter parses; `resolves_phase` reads the **string** `"34.12"`, `status: pending`
- `git diff --numstat -- .planning/STATE.md` → `1  0` (one row appended, nothing rewritten)
