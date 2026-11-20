---
phase: quick-261011-hj6
plan: 01
subsystem: frontend/Library
tags: [library, sign-in-notice, layout, density, source-gates]
status: complete
commits: 4
plan_head_before: 4f2caf9b9c1e51343ce1f53501f2bf4c9c266d58
plan_head_after: 2937edc0f135772979665d8459525de963d262a9
requirements: [todo-2026-10-10-library-sign-in-rows-placement-and-banner-height]
key-files:
  modified:
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/screens/Library/__tests__/librarySignInNoticeSource.test.ts
    - src/frontend/screens/Library/__tests__/signInTracer.test.ts
    - .planning/todos/completed/2026-10-10-library-sign-in-rows-placement-and-banner-height.md (moved from pending/)
actuals:
  tasks: 3
  commits: 4
---

# Quick 261011-hj6: Library sign-in rows at the top, banner half as tall

Two operator requests from the Phase 49 macOS live gate (Run 1) were acted on. The sign-in rows now mount directly after the chip row and above the first shelf (FocusRowStrip). Each row's vertical density was halved, from about 78px (62px on a fresh launch) to about 41px.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 RED | e3c05aca8 | test: relock the Library sign-in notice above the first shelf (RED) |
| 1 GREEN | d6355aa87 | feat: mount the Library sign-in rows above the first shelf |
| 2 | 67684475b | feat: halve the Library sign-in banner's height |
| 3 | 2937edc0f | docs: close the library sign-in rows placement and banner height todo |

## RED / GREEN

- RED (tests relocked, `index.tsx` unmoved): `pnpm jest src/frontend/screens/Library` gave 44 suites with 2 failed, and 3 failed / 1094 passed / 1097 total. The three failures were exactly the plan's prediction:
  1. G4 real-source spec.
  2. L1 real-source spec.
  3. The existing "G4: an ErrorComponent beside the mount" RED proof.
  The four new RED proofs passed already, as expected.
- GREEN (after the move, and again after the SCSS change): 44 suites passed, 1097 tests passed. Baseline at planning time was 1093 tests; the +4 are the new RED proofs (3 in G4, 1 in L1).
- `pnpm codecheck` exits clean. Prettier `--check` is clean over all four prettier-visible paths (each re-probed with `--file-info` as not ignored). `pnpm planning-gates` reports 12/12.
- Compiled-CSS check printed `density OK`.
- DD-3 untouched-files check (`git diff --quiet 4f2caf9b9` over the six listed files) exits 0.

## Padding values, before and after

| Property | Before | After |
| -------- | ------ | ----- |
| `.LibrarySignInNotice__row` padding-block | `var(--space-sm)` (10px) | `var(--space-2xs)` (5px) |
| Footer button (`.button.is-footer` in the row) padding-block | 12px (from `.button`, 0.75em) | `var(--space-2xs)` (6px) |
| Footer button margin-block | 8px once the Settings stylesheet loaded, else 0 | `0` |
| One row height | about 78px (Settings loaded) / 62px (fresh launch) | about 41px in both states |

The new rule is `.LibrarySignInNotice__row .button.is-footer`, three classes, so it outranks Settings' two-class `.button.is-footer` regardless of CSS chunk load order. Inline padding, gaps, colours and borders are unchanged.

## Deviations from Plan

None. The plan executed as written. The conventions skill file `C:/Users/grays/.claude/skills/gamelib-conventions/SKILL.md` does not exist at that path, so the plan's own summary of the formatter rule was applied (scoped `npx prettier --check` after a `--file-info` probe; the `.planning/` todo path is prettier-ignored, so no check was run on it).

## Not verified here (operator at next macOS launch)

Jest runs with `testEnvironment: 'node'` and evaluates no CSS. These results come from source-text gates and a Sass compile, not from rendering. Two things can only be confirmed by eye at the operator's next macOS launch:

1. The sign-in rows paint at the top of the Library (above the first shelf, below the chip row when filters are active).
2. A row is about 41px tall (roughly half of the previous ~78px).

No UAT item was added and no `*-UAT.md` file was touched.

## Housekeeping

- Todo `2026-10-10-library-sign-in-rows-placement-and-banner-height` moved to `.planning/todos/completed/` with a single `status: "RESOLVED 2026-10-11 ..."` key. The `files:` path was corrected to `src/frontend/screens/Library/components/LibrarySignInNotice/index.scss`.
- `graphify update .` ran clean (54782 nodes, 72161 edges).
- Excluded by plan: F-49-R1-6 (`nord_light` not-connected text illegible), SteamSyncNotice placement, and the banner's inline inset.

## Self-Check: PASSED

All four commits exist in `git log`; the four modified source files and the moved todo exist; the pending copy is gone.
