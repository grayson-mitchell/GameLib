---
phase: quick-261011-j8z
plan: 01
subsystem: frontend/library
tags: [css, contrast, themes, wcag, nord-light, F-49-R1-6]
requires: []
provides:
  - "Library sign-in row text, logo, footer button label and dismiss glyph at >= 4.5:1 on the banner in all 10 themes"
  - "Per-theme jest gate (themeTokens.test.ts) for the sign-in row pair, with inherit checker and mutation proofs"
affects:
  - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
key-files:
  modified:
    - src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  created:
    - .planning/todos/pending/2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md
  moved:
    - .planning/todos/completed/2026-10-10-not-connected-row-illegible-in-nord-light.md
decisions:
  - "Row text uses the navbar surface's own chain var(--navbar-inactive, var(--navbar-accent)); no per-theme override"
  - "Logo, in-row footer button and dismiss glyph inherit the row colour; in-row footer button is transparent"
  - "Dismiss hover, expired triangle and in-row button hover residuals filed, not fixed (hue decisions)"
metrics:
  tasks: 3
  files: 4
status: complete
actuals:
  tokens: 11000
  tasks: 3
  commits: 4
plan_head_before: 21974bb70a9f0bd94d5be9a04cb9af76c7181a5b
plan_head_after: cab4f54cc137896770888c339e0fb7935eb7393a
commits: 4
---

# Phase quick-261011-j8z Plan 01: Fix the not-connected sign-in row render in nord_light Summary

The Library sign-in row now paints the navbar surface's own text chain (`var(--navbar-inactive, var(--navbar-accent))`) instead of the body text token, with the logo, footer button label and dismiss glyph inheriting it, taking nord-light from 2.11:1 to 7.38:1 and all 10 themes to at least 4.87:1 (marine), gated per theme in `themeTokens.test.ts`.

## Commits

Branch: `quick-261002-b63` (ancestry from `21974bb70` asserted before the first commit).

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 RED | `af3757c7d` | test(library): pin the sign-in row text contrast in every theme (RED, 261011-j8z) |
| 1 GREEN | `cfd1aea8e` | fix(library): paint the sign-in row with the navbar surface's own text chain in every theme (261011-j8z) |
| 2 | `0f62cd292` | test(library): prove the sign-in row gate sees F-49-R1-6 and its inherit checker can fail (261011-j8z) |
| 3 | `cab4f54cc` | docs(quick-261011-j8z): close the nord_light not-connected row todo and file the row glyph and hover residual |

## Test results

Command (paths first, `--selectProjects Frontend` last): `pnpm jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts src/frontend/screens/Library --selectProjects Frontend`

- RED (new describe against the unchanged stylesheet): `Test Suites: 1 failed, 45 passed, 46 total`, `Tests: 3 failed, 1204 passed, 1207 total`. The three failures were exactly the predicted set: the non-vacuity test, the nord-light case, and the inherit test. The other nine per-theme cases passed. The RED set matched the plan.
- GREEN after Task 1: `Test Suites: 46 passed, 46 total`, `Tests: 1207 passed, 1207 total`. `librarySignInNoticeSource.test.ts` and `signInTracer.test.ts` still pass.
- After Task 2 (proofs A and B): `Test Suites: 46 passed, 46 total`, `Tests: 1209 passed, 1209 total`.
- `pnpm codecheck` exits 0. `npx prettier --check` passes over the two prettier-visible paths. The GATES-OK grep gate prints OK (the four files the plan names as untouched are byte-identical to `21974bb70`, 3 non-comment `color: inherit;` lines, 1 remaining non-comment `--text-default` (the dismiss hover fallback), hj6's margin and padding lines survive).
- `pnpm planning-gates`: 12/12 passed.

## Per-theme ratios (token-resolved, from the plan's resolver measurement)

Jest prints values only on failure, so the AFTER column is the plan's planning-time table; the green gate (>= 4.5 in all 10 themes) is consistent with it. The nord-light BEFORE value (2.11) is the figure the RED nord-light case failed on. No value was re-measured with a different outcome.

| theme | row text BEFORE (`--text-default` on `--navbar-background`) | row text AFTER | in-row button BEFORE, fresh launch |
|---|---|---|---|
| midnightMirage | 14.56 | 13.11 (`#d1e4e9`) | 13.16 |
| cyberSpaceOasis | 13.26 | 7.77 (`#e0ab40`) | 9.22 |
| gruvbox_dark | 10.74 | 11.92 (`#f9f5d7`) | 4.69 |
| high-contrast | 15.32 | 18.73 (`#ffffff`) | 5.35 |
| dracula | 9.15 | 7.48 (`#eae8e5`) | 8.33 |
| nord-light | **2.11** | **7.38** (`#ffffff`) | **2.59** |
| nord-dark | 10.56 | 7.09 (`#afc4eb`) | 7.01 |
| marine | 9.51 | 4.87 (`#d39f37`) | 7.80 |
| zombie | 10.48 | 5.82 (`#59c627`) | **1.55** |
| sweet | 15.73 | 11.27 (`#d4c2d6`) | 5.11 |

After the fix the logo, dismiss glyph and in-row button label all equal the row AFTER column, because they inherit it.

## Accepted visible changes

- The row text takes the navbar accent hue in cyberSpaceOasis (amber), marine (gold) and zombie (green); those themes' tier-2 nav rows already paint that hue on the same surface.
- The row text colour shifts slightly in the other themes (midnightMirage `#caf3fd` to `#d1e4e9`, gruvbox_dark `#eae8e5` to `#f9f5d7`, dracula `white` to `#eae8e5`).
- On a fresh launch the in-row footer button is no longer a `--primary`-filled button: it is transparent, as it already was once the Settings chunk loaded and as zombie already rendered it.

## Deviations from Plan

None - plan executed exactly as written. `themes.scss`, `styles/_buttons.scss`, `Settings/index.css` and `LibrarySignInNotice/index.tsx` are untouched; hj6's `margin-block: 0` and `padding-block: var(--space-2xs)` survive.

One procedural note, not a deviation from the plan's intent: `pnpm planning-gates` first reported 11/12 because `planning-envelope-tag-gate.py` enumerates git-tracked `.md` files and the moved todo's pending path was still tracked but deleted from the working tree. Staging the rename (as the Task 3 commit does) cleared it: 12/12.

## Open observations

- NOT LIVE-VERIFIED. The result is contrast arithmetic over the shipped stylesheets; the visual result is unconfirmed until the operator's next macOS launch. A live look is owed at nord_light (row text, "Sign in" label and store logo now light on the dark banner) and at one accent-hue theme such as marine (row text now gold). A fresh launch now shows the in-row button transparent rather than filled.
- Residuals filed in `.planning/todos/pending/2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md` (all nord-light, all pre-existing): dismiss hover 1.52:1, expired-row triangle 2.82:1 (both against 3:1), and the in-row button hover/focus-visible 3.50:1 (against 4.5) from Settings' equal-specificity `.button.is-footer:hover`.
- Parent todo `2026-10-10-not-connected-row-illegible-in-nord-light.md` is closed in `.planning/todos/completed/` with a single RESOLVED `status:` key and the corrected `files:` path.
- `graphify update .` ran after the code changes (the Task 2 run completed; a final run after the docs commit was started in the background).

## Known Stubs

None.

## Threat Flags

None. A renderer-only stylesheet token change and a source-text jest gate; no new trust boundary. The pre-existing untracked/modified `.planning/state.json`, `.planning/milestone.lock` and `.planning/debug/rust-test-ci-missing-sidecar.md` stayed out of every commit.

## Self-Check: PASSED

- FOUND: src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
- FOUND: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
- FOUND: .planning/todos/completed/2026-10-10-not-connected-row-illegible-in-nord-light.md
- FOUND: .planning/todos/pending/2026-10-11-library-sign-in-row-glyphs-and-button-hover-miss-in-nord-light.md
- FOUND commits: af3757c7d, cfd1aea8e, 0f62cd292, cab4f54cc
