---
phase: quick-261011-hh5
plan: 01
subsystem: ui
tags: [css, scss, mui, dialog-sizing, winetricks, settings]

requires:
  - phase: "45-11"
    provides: "Winetricks tab UI whose truncation contracts (row ellipsis, log wrap, sticky bar) were already correct, pending the dialog-width fix this plan makes"
provides:
  - "A top-level `.InstallModal__dialog:has(.WinetricksSettings) { min-width: 0; }` rule that releases the Settings dialog paper's content-driven width floor only while the Winetricks tab is mounted"
  - "A jest pin (`releasesDialogWidthFloor`, 6 tests) in tokenCensus.test.ts proving the rule's presence, shape and scoping"
  - "The closed todo with a full diagnosis/fix record, plus a filed residual todo for two narrower, unmeasured width floors"
affects: [45-12, winetricks-settings, settings-modal]

actuals:
  tokens: 5207
  tasks: 2
  commits: 2
  plan_head_before: 16380bcbe
  plan_head_after: 99900bbd2

tech-stack:
  added: []
  patterns:
    - "`:has()`-scoped top-level override to out-specify a shared ancestor class only while a specific child is mounted, rather than editing the shared class"

key-files:
  created: []
  modified:
    - src/frontend/screens/Settings/sections/WinetricksSettings/index.scss
    - src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts
    - .planning/todos/completed/2026-10-11-winetricks-settings-dialog-width-is-content-driven-and-overflows-the-window.md
    - .planning/todos/pending/2026-10-11-winetricks-tab-keeps-two-rigid-width-floors-at-narrow-windows.md

key-decisions:
  - "Released the paper's `min-width: fit-content` floor from inside the Winetricks tab's own stylesheet (`:has()`-scoped), rather than editing `InstallModal/index.scss` (shared by the Install modal and every other Settings tab), `Dialog.tsx`'s `StyledPaper` (TSX, out of the CSS-only brief, ~25 consumers), or adding `contain: inline-size` (collapses to zero width under any shrink-to-fit ancestor)"
  - "Left the GamesSettings 500px section floor and the rigid German cached badge unfixed, filing both as a separate minor/any/code residual todo rather than widening this plan's scope"

patterns-established:
  - "A brace-depth-aware top-level-rule checker (count `{`/`}` before the match index) to distinguish a real top-level CSS rule from the same selector text nested inside another rule, where it would compile to a never-matching descendant selector"

requirements-completed: [45-12-G1, D-02, D-21]

duration: ~15min
completed: 2026-10-11
status: complete
---

# Quick Task 261011-hh5: Winetricks tab makes the Settings dialog wider than the window — Summary

**Released the per-game Settings dialog paper's `min-width: fit-content` content-driven width floor with a single `:has()`-scoped CSS rule, so the Winetricks tab's rows, log lines, and locale badges can no longer push the dialog past either window edge.**

## Root Cause

`SettingsModal/index.tsx:55` borrows `className={'InstallModal__dialog'}` for its MUI paper.
`Library/components/InstallModal/index.scss:1-5` gives that class `min-width: fit-content`, which
wins over every `max-width` in the chain (CSS 2.1 §10.4) and overrides the paper's automatic
flex-item minimum. The paper therefore grows to the `fit-content` of the Winetricks tab's
unbounded content — hundreds of `white-space: nowrap` row titles, the log panel's unwrapped
max-content, and the rigid German `Zwischengespeichert (Offline-Installation)` badge — and MUI's
`DialogContainer` centres the oversized paper, so it overflows both window edges equally. Every
truncation contract inside the tab (row ellipsis, log `pre-wrap`/`overflow-wrap: anywhere`, sticky
bar ellipsis) was already correct; none of them could act because the ancestor had already grown
past them. The `min-width: 0` already present on the tab's own flex chain never helped, because
`min-width: 0` on a flex child only lowers that child's own automatic minimum — it does not stop
the child's content from feeding an ancestor's `fit-content`.

## The Fix

Added one top-level rule to `WinetricksSettings/index.scss`:

```scss
.InstallModal__dialog:has(.WinetricksSettings) {
  min-width: 0;
}
```

It applies only while the tab is mounted (`:has()` scoping) and its 0,2,0 specificity beats the
shared floor's 0,1,0 in any stylesheet load order, so the Install modal and every other Settings
tab keep today's sizing untouched (verified by a byte-unchanged gate over `InstallModal/index.scss`,
`Dialog/*`, `SettingsModal/index.tsx`, `Settings/index.css`, `GamesSettings/index.scss`,
`LogPanel/index.scss`, `StickyBar/index.scss`, `Row/index.scss`, and `public/locales`).

Rejected alternatives: editing `InstallModal/index.scss` directly (shared by ~25 other dialogs'
worth of tabs), `Dialog.tsx`'s `StyledPaper` (TSX, out of the CSS-only brief), and
`contain: inline-size` on `.WinetricksSettings` (collapses to zero width under any shrink-to-fit
ancestor).

## Test Counts (Task 1, TDD)

**RED** (pre-fix stylesheet): `Tests: 1 failed, 21 passed, 22 total` — the only failure was test 6,
`index.scss releases the Settings dialog paper's min-width floor while the tab is mounted`.

**GREEN** (post-fix stylesheet): `Tests: 22 passed, 22 total`.

The new `releasesDialogWidthFloor` checker is pinned by a `describe('Settings dialog width floor
(261011-hh5)', ...)` block with 6 tests: it accepts the real rule; rejects a `max-width: 100vw`
substitute; rejects a comment-only occurrence; rejects the rule nested inside
`.WinetricksSettings` (a never-matching descendant selector); rejects the pre-fix shape (only a
root-level `min-width: 0`); and requires the real `index.scss` to pass. No file was mutated to
prove the checker discriminates — the five inline samples are the mutation proof.

## Commits

- `682a20ac7` — `fix(winetricks): stop the tab widening the Settings dialog past the window (261011-hh5)` — the scss rule + jest pin, 2 files
- `99900bbd2` — `docs(quick-261011-hh5): close the Settings dialog width todo and file the narrow-window residual` — todo close + residual, 3 files (rename counts as 2)

## Gate Results

- `pnpm jest .../tokenCensus.test.ts --selectProjects Frontend`: RED 1/21/22 → GREEN 22/22 (above)
- Byte-unchanged gate over every file the diagnosis ruled out, plus `public/locales`: PASS
- `npx prettier --check` (scoped to the two edited source files): PASS after one `--write` auto-format pass on the test file (same content, formatting only)
- `npx eslint` on the edited test file: PASS (0 errors)
- `pnpm codecheck` (`tsc --noEmit` x2): PASS, 0 errors
- `pnpm planning-gates`: **12/12 planning gates passed**
- `graphify update .` (AST-only): completed cleanly, 56089 nodes / 64533 edges / 4866 communities; output is git-ignored and untouched by any commit

## Deviations from Plan

None — plan executed exactly as written, including the exact commit message shapes and the
scoped-prettier handling. One prettier `--write` pass was needed on the test file after the TDD
edits (formatting only, no behavior change); this is within the plan's own verify-and-fix loop,
not a deviation.

## Open observations

- **Owed operator live check (NOT verified here):** a window capture at the next 45-12 live-gate
  re-run, on a build containing commit `682a20ac7` — captures at Everything-else expanded (first
  open), a long Show-details log line (~200 chars) with Show details open, the German (`de`)
  locale showing `Zwischengespeichert (Offline-Installation)`, and an ~800px-wide window. That
  re-run re-scores 45-UAT items 24, 26 and 27, and makes items 11 and 12 observable again.
  `45-UAT.md` was left byte-unchanged by this task (confirmed by `git diff --quiet`).
- **Residual todo filed:** `.planning/todos/pending/2026-10-11-winetricks-tab-keeps-two-rigid-width-floors-at-narrow-windows.md`
  (severity: minor, platform: any, ready: code) — the GamesSettings 500px section floor
  (`index.scss:34-36`, specificity 0,2,1) that out-specifies the tab's three section groups'
  `min-width: 0` (0,2,0), and the rigid `.WinetricksRow__cached` German badge
  (`Row/index.scss:179-185`) that cannot shrink below the 700px paper width this fix was proven
  against. Both are desk-derived and unmeasured; a live capture at a narrow (~600-700px) window in
  `de` is owed.

## Self-Check: PASSED

- `src/frontend/screens/Settings/sections/WinetricksSettings/index.scss`: FOUND
- `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts`: FOUND
- `.planning/todos/completed/2026-10-11-winetricks-settings-dialog-width-is-content-driven-and-overflows-the-window.md`: FOUND
- `.planning/todos/pending/2026-10-11-winetricks-tab-keeps-two-rigid-width-floors-at-narrow-windows.md`: FOUND
- commit `682a20ac7`: FOUND in `git log --oneline --all`
- commit `99900bbd2`: FOUND in `git log --oneline --all`
