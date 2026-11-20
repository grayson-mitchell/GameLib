---
phase: quick-260921-q9v
plan: 01
subsystem: frontend/styles
tags: [css, custom-properties, cascade, wkwebview, live-gate]
requirements: [QUICK-260921-Q9V]
key-files:
  modified:
    - src/frontend/index.scss
    - src/frontend/components/UI/Dialog/index.css
    - .planning/todos/completed/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
decisions:
  - "Re-homed --dialog-margin-horizontal to index.scss's :root rather than applying the Dialog class or repointing consumers"
  - "Deleted the bare .Dialog rule outright: padding/text-align never matched any element, and re-homing them would have been the rejected option smuggled in under a token fix"
  - "Closed only on a live re-measurement matching a prediction pinned BEFORE the edit, not on green gates"
status: complete
---

# Quick 260921-q9v — re-home `--dialog-margin-horizontal`, close the bare-`.Dialog` todo

## What shipped

`--dialog-margin-horizontal: 32px` moved out of the bare `.Dialog` rule in
`src/frontend/components/UI/Dialog/index.css` and into the `:root` block of
`src/frontend/index.scss`, under a new `/* Layout */` group beside the existing `/* Effects */`
tokens. The now-entirely-dead `.Dialog { padding: 0; text-align: start; }` rule and its stale
`quick-260921-nub` guard comment were deleted. `Dialog/index.css` survives as a file — two suites
`jest.mock` that path and `Dialog/index.ts` imports it — carrying its two live rules,
`.log-upload-result` and `.Dialog__footer`.

Census afterwards: exactly 3 occurrences of the token name in exactly 3 files, zero under
`components/UI/Dialog/`. A bare count could not have distinguished "moved" from "did nothing", so
the assertion pinned the file *set*, not the number.

## The result, and why it is a result

The prediction was pinned **before** the edit, from the `260921-pec` baseline, and was falsifiable:
the "as shipped" column had to become identical to the "under a `.Dialog` ancestor" control column.

| element | BEFORE | AFTER | PREDICTED | verdict |
| --- | --- | --- | --- | --- |
| `anticheatInfo_asShipped` | `0px/0px/0px/0px` | `16px/32px/0px/32px` | `16px/32px/0px/32px` | MATCH |
| `installWrapper_asShipped` | `16px/0px/16px/0px` | `16px/32px/16px/32px` | `16px/32px/16px/32px` | MATCH |

`tokenAtRoot`/`tokenAtBody` went `""` → `32px`.

Two controls carry the weight:

1. **The positive-control column did not move.** A control that drifted to meet the result would
   have proven nothing; it held still while the measured column travelled to it.
2. **`sanity_spaceMd` still reads `1em`** through the same getter, so the non-blank token readings
   are the instrument working rather than a changed probe.

Evidence: `evidence/wkresults_after.json`, against
`.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`.

## Gates

`pnpm codecheck` clean · `pnpm lint` production 1119 / ceiling 1124 and tests 638 / ceiling 638,
both numerically unchanged · `npx jest --selectProjects Frontend` 167 suites / 2655 tests green,
including `cssTokenSweep.test.ts` · `pnpm planning-gates` 11/11.

**What jest green does NOT prove here.** `cssTokenSweep.test.ts` is a NAME gate whose own header
says it "can NEVER prove that anything renders", and the Frontend project runs
`testEnvironment: 'node'` with no CSS engine. Its passing shows only that the token name is still
declared somewhere — which is exactly why this item was closed on the WKWebView re-measurement and
not on the suite.

## Scope limit

The measurement is CSS cascade resolution in WebKit against the app's real Vite-served stylesheets.
It is not the running app's own webview, React tree, or emotion runtime styles. It proves the two
`margin` shorthands now compute to their authored values; it does not constitute anyone having
looked at the two surfaces on screen and judged 32px to be right. Restoring authored intent was the
scope.

## Traps hit during execution

- **`git mv` staged HEAD content and dropped the unstaged edit** — the repo's twice-recorded
  failure, hit a third time here. `git show :<path>` returned 0 hits for the new section while the
  working tree had it. Fixed with an explicit `git add` before committing; verified staged and
  worktree line counts matched (206/206) rather than trusting the move.
- **A Vite orphan survived the teardown sweep.** It runs as `pnpm exec vite`, not
  `node_modules/.bin/vite`, so the path-based `pkill` missed it — also a recorded trap. Killed by
  PID; `pgrep` confirmed all clear.
- **The plan proposed `platform: macos` for the todo.** Overridden: the defect is a CSS cascade
  question reproducible anywhere, and only the chosen measuring instrument is Mac-specific. An
  instrument's platform is not the defect's platform. Kept `platform: any`.

## Outcome

`2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md` is CLOSED and moved to
`.planning/todos/completed/`.
