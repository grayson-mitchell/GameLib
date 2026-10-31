---
phase: quick-261031-lrx
plan: 01
subsystem: preload gamepad input
tags: [gamepad, focus, scroll-container, tauri]
key-files:
  modified:
    - src/preload/api/tauriGamepadInput.ts
    - src/preload/__tests__/gamepadAction.test.ts
    - .planning/todos/pending/2026-10-30-controller-down-at-bottom-tile-jumps-to-left-panel.md
metrics:
  completed: 2026-10-31
---

# Quick 261031-lrx: Controller Down at bottom library tile scrolls the grid

`moveFocusDirectionally` is now scroll-container-aware: it prefers candidates inside the focused element's scroll container, scrolls the container one tile (with a bounded 250ms reveal poll) when none exist, and falls back to the whole-document search only at the scroll end.

## Commits

- 5a8ad9f09 test(261031-lrx): failing tests (RED)
- 5fd6a3c60 fix(261031-lrx): implementation (GREEN)
- The todo note is edited but uncommitted (docs, left to the orchestrator).

## RED results

Eight `261031-lrx:` tests added plus `FakeElement.contains`. Against the old module 5 failed: (a) container preference, (b) scroll-and-reveal, (b2) no-tile-appears (also failed because the old code never scrolled), (b3) Up mirror, (f) poll abort. (c), (d), (e) passed already, as planned (they pin unchanged behaviour).

## Verification

- `npx jest --selectProjects Preload --runTestsByPath src/preload/__tests__/gamepadAction.test.ts`: 33 passed, 33 total (0 failed).
- `pnpm codecheck`: pass.
- `npx eslint` on both .ts files: clean.
- `npx prettier --check` on both .ts files (confirmed non-ignored): pass.
- `pnpm planning-gates`: 12/12 passed.
- `grep -c 261031-lrx` in the module: 3.
- No `src/frontend/` files touched.
- I ran `pnpm lint` only as `npx eslint` on the two paths, not the full `lint:src` ceiling check.

## Deviations from Plan

None in behaviour. Test (b2) also fails in RED (plan listed a, b, b3, f), which is consistent with the old code never scrolling. `graphify update .` was run.

## Human Verification (live gate, not blocking)

Gate (verbatim from the todo): Live: in a library with more rows than fit on screen, press Down repeatedly from the top row with a pad. The grid scrolls row by row to the last tile, and focus never jumps to the left panel.

1. Restart `tauri dev` (preload/renderer change, reload is enough; confirm the bundle is fresh anyway).
2. Open Games in a library with more rows than fit.
3. Focus the top-left tile with the pad, press Down repeatedly. Each press scrolls the grid about one row and moves focus down a row. Focus never lands in the left panel until the last row.
4. At the last row with the grid at its end, one more Down falls back to the whole-document search by design, so it may reach a control below or to the left. Note whether this edge is accepted.
5. Press Up back to the top. The grid scrolls up symmetrically.
6. Left from the leftmost tile still reaches the left panel.

The todo stays pending with `ready: live-gate`.

## Self-Check: PASSED

Both commits exist; todo frontmatter unchanged and planning-gates green.
