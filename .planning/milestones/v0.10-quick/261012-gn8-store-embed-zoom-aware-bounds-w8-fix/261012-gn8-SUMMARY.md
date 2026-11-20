---
phase: quick-261012-gn8
plan: 01
subsystem: frontend / store embed (WebView)
tags: [tauri, store-embed, webview-zoom, bounds-sync, windows, W8]
requires:
  - quick 261012-f25 (Windows store embed)
  - quick 261011-t4y (publishWebviewZoom writes --webview-zoom)
provides:
  - zoom-aware store embed bounds (CSS px -> logical px) on all platforms
  - re-flush on zoom publish and after every successful storeEmbedOpen
affects:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
tech-stack:
  added: []
  patterns:
    - unit conversion in the renderer, single geometry writer (D-18) preserved
key-files:
  created:
    - src/frontend/screens/WebView/storeEmbedZoom.ts
    - src/frontend/screens/WebView/__tests__/storeEmbedZoom.test.ts
  modified:
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
    - .planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md
decisions:
  - "Fix is renderer-only: scale by --webview-zoom (inline style read) and follow every ok open with a throttled setBounds; no Rust/preload change, no second geometry writer"
status: complete
plan_head_before: 4c3e745b9a84e2b81214debab8f18e162ef0dc0d
plan_head_after: 2f87db8b8b660568e3126c4df621d67dcc7b23b8
commits: 3
actuals:
  tokens: 0
  tasks: 3
  commits: 3
metrics:
  completed: 2026-10-12
---

# Phase quick-261012-gn8 Plan 01: Store embed zoom-aware bounds (W8 fix) Summary

Renderer-only fix for the Windows live-gate failure W8 (store embed displaced at 120% Accessibility zoom): the hook now sends `slot.getBoundingClientRect()` multiplied by the applied `--webview-zoom`, re-sends when that factor is published, and re-sends after every successful `storeEmbedOpen`.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | `e97265b1c` | `storeEmbedZoom.ts` helpers, `flush()` scales via `scaleRectForZoom`, D-18 comments reworded, BASE.sha + RED/GREEN evidence |
| 2 | `a8e03e290` | MutationObserver re-flush on factor change, throttled follow-up after ok open, disposed flag, Z3-Z8 tests, mutation + lint evidence |
| 3 | `2f87db8b8` | Todo records W8 FAIL, diagnosis, fix, desk evidence, R1-R6 re-run steps (stays `ready: live-gate`) |

## Diagnosis (re-confirmed by reading the code at 4c3e745b9)

1. Renderer sent CSS px; Rust positions in logical px (`add_child` / `set_position` / `set_size` with `Logical*`; Linux GTK fixed). Under webview zoom f, logical = CSS x f.
2. `store_embed_open`'s existing-embed branch re-applies the rect on Linux only; on macOS/Windows it shows and navigates and drops the rect. Zoom is changed on another screen while the hook is unmounted, so the embed returned at its 100% geometry.
3. `publishWebviewZoom` writes the property only after `setZoom` resolves, so the re-flush is keyed on the property write (MutationObserver on the root `style`), not on resize.

## Verification (actual results)

- RED first, both tasks: Task 1 `jest-red-task1.json` 2 failed tests (Z1, Z2) + helper suite failing to resolve; Task 2 `jest-red-task2.json` 5 failed tests (Z3, Z3b, Z4, Z5, Z6).
- GREEN: Task 1 2 suites / 47 tests / 0 failed; Task 2 (helper + hook + `storeEmbedReloadLoop`) 3 suites / 63 tests / 0 failed, hook suite 36.
- Mutation runs (`evidence/mutations.txt`): factor comparison deleted -> Z4 red; disposed check deleted -> Z7 red; status check deleted -> Z8 red (1 failure each); reverted by hand and diffed clean against the saved good copy.
- `pnpm codecheck` clean; `pnpm lint` `production: PASS | tests: PASS` (after fixing 3 `no-unsafe-member-access` warnings my first draft of the tests added, which pushed the tests ceiling to 641 > 638); scoped `prettier --check` clean over the four source/test paths (all four confirmed not-ignored via `--file-info`); `pnpm planning-gates` 12/12; `todo-frontmatter-gate.py` OK.
- Structural pins (comment-stripped): exactly one `getBoundingClientRect()`, one `storeEmbedSetBounds(`, one `storeEmbedOpen(`; `git diff BASE -- src-tauri/ src/preload/` empty.
- Wider WebView `__tests__` directory run: 13 of 14 suites pass; the one failure is the known pre-existing `storeEmbedSingleOpener.test.ts` (Windows backslash path), not a gate and not touched.
- The running `pnpm tauri:dev` instance was not touched; nothing under `src-tauri/` changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test-file lint warnings pushed the tests ceiling over**
- **Found during:** Task 2 verify (`pnpm lint`)
- **Issue:** my Z1/Z2/helper code indexed `jest.fn().mock.calls` (typed `any`), adding 3 warnings (641 vs ceiling 638)
- **Fix:** typed helpers `firstOpenBounds` / `lastBounds` / `expectBounds` cast through `unknown` like the existing property 3b; Z1/Z2 reuse them
- **Files modified:** `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx`
- **Commit:** `a8e03e290` (folded in before the commit)

### Notes

- At Task 2 RED, Z4 failed because `MockMutationObserver.instances[0]` did not exist yet (a throw), not on its assertion; its real proof is the mutation run. Z7 and Z8 passed at RED as the plan anticipated (must-not guards).
- Prettier reformatted my new lines in `useStoreEmbedHost.ts` and the test file; only my own additions changed.
- `evidence/planning-gates.txt` (output of the Task 3 gate run) is left untracked, since the plan commits the todo alone.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or trust-boundary schema; the root-style read is normalised so a malformed value cannot produce a non-finite payload (T-261012-gn8-01).

## Not verified

- Live app at any zoom (W8 re-run R1-R6 owed to the operator on Windows, steps are in the todo).
- macOS and Linux, although the fix applies to them.
- The un-measured "window resized while away from the store route" sibling, which the open follow-up should also cover.
- Spike 017's "1:1 viewport-to-logical" skill note is intentionally not updated until W8 passes live.

## Self-Check: PASSED

- Files present: `storeEmbedZoom.ts`, `__tests__/storeEmbedZoom.test.ts`, edited hook + hook test, todo, evidence directory.
- Commits present: `e97265b1c`, `a8e03e290`, `2f87db8b8` (measured: `git rev-list --count BASE..HEAD` = 3).
