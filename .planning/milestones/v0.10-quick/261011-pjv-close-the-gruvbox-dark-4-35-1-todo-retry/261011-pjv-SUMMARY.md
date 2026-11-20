---
phase: quick-261011-pjv
plan: 01
subsystem: ui-styling
tags: [winetricks, gruvbox_dark, contrast, themeTokens, todos]
dependency-graph:
  requires: ["261011-gpn (Apply's gruvbox_dark override and resolver chain)"]
  provides: ["gruvbox_dark Retry/Clear/.button.is-text text-contrast fix", "261011-pjv is-text hover/is-link residual todo"]
  affects:
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
    - src/frontend/styles/_buttons.scss
tech-stack:
  added: []
  patterns:
    - "GUARDED_OVERRIDE_TAIL shared regex fragment keeps a test's guard-detection checker and its generalized colour-resolver from drifting apart"
key-files:
  created:
    - .planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md
  modified:
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss
    - src/frontend/styles/_buttons.scss
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/rowStates.test.tsx
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
    - .planning/todos/completed/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
decisions:
  - "Took fix option (a) (component-local overrides) and extended it one control further than the todo scoped: `.button.is-text` carries the same collision as Retry/Clear and was folded into the same fix rather than left for later"
  - "`.button.is-text`'s override additionally excludes `:not(.is-link)`; Retry and Clear have no `.is-link` consumer and don't need it"
  - "Did not take option (b) (theme-level `--accent`/`--background` change) -- still a design decision, not a desk-only fix; themes.scss stays byte-unchanged"
metrics:
  duration: "~1h10m (resumed mid-session after a context-window compaction)"
  completed: 2026-10-11
actuals:
  tokens: 10834
  tasks: 3
  commits: 3
  plan_head_before: 6bb8e809e
  plan_head_after: 6c227783e
status: complete
---

# Phase quick-261011-pjv Plan 01: Close the gruvbox_dark 4.35:1 accent-text todo (Retry, Clear, `.button.is-text`) Summary

Fixed the gruvbox_dark 4.35:1 accent-fill text collision on Winetricks' Retry and Clear buttons and extended the same fix to `.button.is-text` globally, each with a guarded `body.gruvbox_dark &:not(:disabled)` (`.button.is-text` additionally `:not(.is-link)`) `--neutral-01` override; backed by a non-vacuity-proven all-10-theme census plus five load-bearing/no-reach/no-regression proofs, then closed the originating todo and filed a residual todo for `.button.is-text`'s unexamined `.is-link` and `:hover` pairs.

## What Was Built

**Task 1** (`33cca8462`, tracer/tdd): Added an all-10-theme, three-control census to `themeTokens.test.ts` (Retry, Clear, `.button.is-text`), generalized `applyTextColourDecl` to resolve a theme-scoped override when present and the base declaration otherwise. Observed the predicted RED (6 failures: 3 non-vacuity sabotage failures proving the census can fail, plus the 3 predicted gruvbox_dark failures, each at the measured ratio `4.34587088954811`) before landing the fix. Added the three guarded gruvbox_dark `--neutral-01` overrides (`Row/index.scss`, `EverythingElseGroup/index.scss`, `_buttons.scss`). Observed a second predicted intermediate RED in `rowStates.test.tsx`'s selector-prefix scope test, failing on exactly the new selector `body.gruvbox_dark .WinetricksSettings .WinetricksRow__retry:not(:disabled)` before amending that test's scope pattern and adding an enumerate/can-fail proof alongside it. Final state: GREEN, 261 tests across 4 suites.

**Task 2** (`a0e698197`, auto/tdd): Introduced a shared `GUARDED_OVERRIDE_TAIL` regex fragment so the test's own guard-detection checker (`themeOverridesMissingNotDisabled`) and the generalized colour resolver (`applyTextColourDecl`) can't define "guarded" differently. Added `themeOverridesReachingIsLink` and five proof tests: Test A (each override is load-bearing -- removing it in-memory drops the ratio back to 4.35:1), Test B (the override cannot reach a disabled button, checked per control), Test C (the override cannot reach an `.is-link` consumer), Test D (a triple in-memory sabotage proving all three guard-detection helpers are not vacuously true), Test E (`.button.is-text:hover` is unaffected by the new override). Refreshed `StickyBar/index.scss`'s stale "recorded in a follow-up todo" comment to point at the now-landed fix. Final state: GREEN, 270 tests across 4 suites. `pnpm codecheck` exits 0.

**Task 3** (`6c227783e`, auto): Appended a `## Fix (2026-10-11, quick 261011-pjv, commit \`33cca8462\`)` section (items a-g: chosen option + extension, current line numbers superseding the todo's stale L232/240/245 and L82/86/88 citations, a before/after token table, the gate description with both observed-RED counts and both commits, the themes.scss byte-unchanged confirmation, the NOT-live-verified disclaimer, and the residual todo's filename) to the pending todo, updated its `files:` frontmatter, and `git mv`'d it to `.planning/todos/completed/`. Filed `.planning/todos/pending/2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md` covering: (1) the 22 `.is-link` render sites' own text-colour pair is unmeasured across all 10 themes, (2) `.button.is-text:hover` is unexamined outside gruvbox_dark, (3) `.settingsWrapper > .button.is-text` (`Settings/index.css:148`) looks unreachable -- no render site under either host of `.settingsWrapper` (`Settings/index.tsx`, `Accessibility/index.tsx`) mentions `is-text` -- flagged with its specificity relative to the new gruvbox_dark override in case it's ever reconnected. `pnpm planning-gates` ran 12/12 pass both before and after this commit.

### `is-text` render-site counts (reconciled)

A raw `grep -rn 'is-text' src/frontend | wc -l` returned **49** at Task 3 time, not the plan's planning-time **28** -- the difference is entirely Tasks 1-2's own added test/comment prose in `themeTokens.test.ts`, `_buttons.scss` and `StickyBar/index.scss`, not a change in actual render sites. A targeted `grep -rn 'className="[^"]*is-text' src/frontend` census confirmed the render-site classification is unchanged and matches the plan exactly: **23** render sites total, **22** carrying `.is-link` (21 in `Game/GameSubMenu/index.tsx`, 1 in `Game/GamePage/components/MainButton.tsx`), and exactly **1** pure `.button.is-text` site -- the DownloadManager "Clear List" button (`DownloadManager/index.tsx:165`).

## Verification

- `npx jest themeTokens.test.ts tokenCensus.test.ts rowStates.test.tsx everythingElse.test.tsx --selectProjects Frontend`: **4 suites, 270 tests, all passing.**
- `git log --oneline 6bb8e809e..HEAD -- src/frontend/themes.scss`: empty. `git diff --quiet 6bb8e809e -- src/frontend/themes.scss`: passes. `src/frontend/themes.scss` is byte-unchanged.
- `npx prettier --check` over the 6 touched source/test paths (Row/index.scss, EverythingElseGroup/index.scss, _buttons.scss, themeTokens.test.ts, rowStates.test.tsx, StickyBar/index.scss): all pass.
- `pnpm codecheck` (`tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`): exits 0.
- `pnpm planning-gates`: 12/12 pass, both before and after Task 3's commit.
- `pnpm lint`: exits 0 (pre-existing unrelated warnings only; no new warnings/errors in any file this plan touched).
- `git log --oneline 6bb8e809e..HEAD`: exactly 3 new commits, each carrying `261011-pjv` -- `33cca8462` (fix), `a0e698197` (test), `6c227783e` (docs).
- `git branch --show-current`: `quick-261002-b63`.
- No live capture was performed (none required by the plan).

## Deviations from Plan

None -- plan executed exactly as written, including both predicted non-vacuity/intermediate RED observations.

## Open observations

- A pixel-sampled gruvbox_dark capture of enabled Retry, enabled Clear, and the DownloadManager "Clear List" `.button.is-text` button is still owed -- every ratio in this plan and its predecessor (261011-gpn) is token-resolved through `themeTokens.test.ts`'s resolver chain, not pixel-sampled. Optionally also capture a GamePage menu view in gruvbox_dark to visually confirm the `:not(.is-link)` exclusion did not repaint any `.is-text.is-link` menu item.
- The residual todo (`2026-10-11-button-is-text-hover-and-is-link-pairs-miss-4-5-to-1.md`) carries three unmeasured surfaces of its own: the 22 `.is-link` render sites' text-colour pair across all 10 themes, `.button.is-text:hover` outside gruvbox_dark, and `.settingsWrapper > .button.is-text`'s reachability.

## Self-Check: PASSED

- All 8 created/modified files confirmed present on disk.
- All 3 commit hashes (`33cca8462`, `a0e698197`, `6c227783e`) confirmed present in `git log --oneline --all`.
