---
phase: quick-261102-p8r
plan: 01
subsystem: frontend/window-controls
tags: [windows, frameless, window-controls, css, svg]
requires: [quick-261102-dma]
provides:
  - native-style 46x32 transparent caption buttons with 10px glyphs
  - 138px trailing reserve on Windows/Linux frameless, macOS unchanged
affects:
  - src/frontend/components/UI/WindowControls
  - src/frontend/index.scss
  - src/frontend/components/UI/NavShell/index.scss
tech-stack:
  added: []
  patterns: [inline SVG glyphs on a 10x10 box, token-derived layout reserve scoped off macOS]
key-files:
  created:
    - src/frontend/components/UI/WindowControls/CaptionGlyphs.tsx
    - src/frontend/components/UI/WindowControls/__tests__/captionButtons.test.tsx
  modified:
    - src/frontend/components/UI/WindowControls/index.tsx
    - src/frontend/components/UI/WindowControls/index.scss
    - src/frontend/index.scss
    - src/frontend/components/UI/NavShell/index.scss
  deleted:
    - src/frontend/components/UI/WindowControls/RestoreWindow.tsx
  moved:
    - .planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md -> .planning/todos/completed/
decisions:
  - Buttons are 46x32 (native Win11 size); reserve widened to 138px instead of squeezing buttons to 40px
  - Reserve override lives on .App:not(.macOverlayTitlebar).frameless; body's 120px fallback left byte-identical
metrics:
  tasks: 3
  duration: n/a
completed: 2026-11-02
status: complete
commits: 5
plan_head_before: c1fe7003e080e9c501c9ab0e914a98a6811d245b
plan_head_after: f680f4d0a52dc97a351957dac9ec3d2ac8e90c61
actuals:
  tasks: 3
  commits: 5
---

# Quick 261102-p8r: WindowControls match the native caption buttons

GameLib's in-app window buttons (Windows/Linux, frameless) are now transparent 46x32 buttons with
10px, 1px-stroke glyphs and a vertically centred minimize dash, and the frameless-refresh todo is
closed.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 RED | e83cc804e | test: pin native-style caption glyph geometry |
| 1 GREEN | 9ee71db24 | fix: draw caption glyphs on a native 10px box with a centred minimize dash |
| 2 RED | 4dcac63b4 | test: pin transparent 46x32 caption buttons and the off-mac reserve |
| 2 GREEN | 667360ef9 | fix: transparent 46x32 caption buttons; widen the frameless reserve to 138px off macOS |
| 3 | f680f4d0a | docs: close the frameless-refresh todo after the Windows live gate passed |

## Dimension/reserve decision

Buttons are 46x32, glyphs are 10px with 1px strokes, and the cluster is 138px. The reserve is
widened to 138px on Windows/Linux only, via `.App:not(.macOverlayTitlebar).frameless` redeclaring
`--overlay-controls-width` from `3 * var(--window-controls-button-width)`. Body keeps its 120px
fallback byte-identical, so macOS computes what it did before. The navbar trailing padding is
148px on Windows/Linux. StoreEmbedControls and GamePage reserve 138px there; both sit below the
navbar row, so that is dead space, not a collision. `--overlay-controls-height`'s fallback drops
from 39px to 32px (only consumer is `.windowControls button`, never rendered on macOS).

## Zoom note

CSS px follow Windows display scaling (DIPs), so at any Windows scale with GameLib's zoom at 100%
the buttons match native size. GameLib's own app zoom scales CSS px but not the native buttons. At
a non-100% app zoom (e.g. 140%, x1.44) GameLib's buttons will look proportionally larger or
smaller than native. This is expected and not compensated for.

## Not changed / observations

- Hover tints are `--secondary-hover` #a7baff and `--status-danger-hover` #fc9ba1, as before. The
  native hovers are subtler: a faint white overlay, and #C42B1C with a white glyph on close. A
  follow-up can change this if the operator wants it.
- `--titlebar-color` is still declared but no longer painted, so a user custom theme that set it no
  longer tints the buttons.
- The StoreEmbedControls and GamePage reserves are legacy: they no longer share a row with
  WindowControls, and on macOS they reserve 120px for buttons that never render. That predates this
  task; it is noted, not fixed.

## Operator live check (Windows; the operator's step)

Use a build containing this task's commits, frameless ON, app zoom 100%:

1. The buttons sit top-right on the tab bar with the tab bar's colour behind them, with no black
   block. Check at least midnightMirage (default) and dracula (its navbar is lighter than its body).
2. Minimize is a thin dash centred vertically. Maximize, restore (maximize the window to see it)
   and close are the same size and stroke weight.
3. Toggle frameless OFF and compare with the native buttons: the width and height should match.
4. Hover: minimize/maximize tint and close turns the danger tint, as before.
5. Narrow the window: the tab strip's trailing edge never slides under the buttons.

Optional, Mac: no visible change. Linux: not live-checked.

## Verification

- `captionButtons.test.tsx`: 16 passed (G1-G3, C1-C5 and all anti-vacuity sanity checks).
- windowControlsPlacement, shellTokens, cssTokenSweep, themeTokens: with captionButtons, 5 suites,
  302 tests passed. appShellLayout under the plan's `-t` filter: 32 passed, 2 skipped, 0 failed.
- `tsc --noEmit` clean; eslint clean on new files, `index.tsx` at its 1 baseline warning
  (`no-floating-promises`, L18, untouched); `findDeadcode` OK; scoped prettier clean.
- App.tsx, StoreEmbedControls/index.css, GamePage/index.css unchanged.
- Planning gates: todo-frontmatter gate PASS; only FAIL is the pre-existing
  `state-sdk-field-anchor-gate.py`.
- RED phases confirmed: task 1 failed on missing module; task 2 failed C1/C3/C4/C5 before the CSS.

## Deviations from Plan

None - plan executed exactly as written. Two small notes: the first RED commit attempt was
rejected by the `.husky/pre-commit` prettier check, so the test file was formatted with
`prettier --write` and re-staged (no `--no-verify`); and commits landed directly on `main`
(`git.branching_strategy: none`, no worktree), matching the repo's recent quick-task commits.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Files verified present: CaptionGlyphs.tsx, captionButtons.test.tsx, completed todo; RestoreWindow.tsx
and the pending todo are gone. Commits e83cc804e, 9ee71db24, 4dcac63b4, 667360ef9, f680f4d0a exist.
