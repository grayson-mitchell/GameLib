---
phase: quick-261127-upb
plan: 01
subsystem: frontend
tags: [dead-code, cachedimage, preload, jest-ratchet]
status: complete
requirements:
  - "quick:261127-upb"
  - "todo:2026-11-22-dead-imagecache-scheme-branch-in-renderer"
key-files:
  modified:
    - src/frontend/components/UI/CachedImage/index.tsx
    - src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
    - meta/backendDiCeilings/frontend-components-ui.json
    - src/preload/tauriTransport.ts
  moved:
    - .planning/todos/pending/2026-11-22-dead-imagecache-scheme-branch-in-renderer.md -> .planning/todos/completed/
metrics:
  completed: 2026-11-27
  tasks: 3
  commits: 3
plan_head_before: b171b3eee4cdcc7f3ca9e5b0f27e3a432d698455
plan_head_after: 386d7bb2583fc659d97f6f5c9a01e94b0d066116
actuals:
  tasks: 3
  commits: 3
---

# Quick 261127-upb: Remove the dead image-cache scheme branch

CachedImage now renders its source as given and falls back through `fallback` in order, with the scheme state, rewrite and
retry gone; the always-false predicate is deleted from the preload transport.

## Commits

| Task | Hash | Subject |
| ---- | ---- | ------- |
| 1 | 921d60a1f | refactor(quick-261127-upb): CachedImage renders its source as given, with no cache-scheme branch |
| 2 | f6adc3217 | refactor(quick-261127-upb): drop the image-cache scheme predicate from the preload transport |
| 3 | 386d7bb25 | docs(quick-261127-upb): close the dead image-cache scheme branch todo |

## Red step (Task 1)

After rewriting the test and before touching the component, the suite ran 8 passed, 1 failed. The failing assertion was
the source guard: `expect(stripped).not.toMatch(/tauriTransport/)` at index.test.tsx line 225, because index.tsx still
imported from the transport. The http-source tests passed already (the real predicate returns false), which is consistent
with the plan's claim that the runtime path did not change.

## Measured gate outputs

- CachedImage suite: 9 tests, 0 failures (12 at HEAD: one asserting the removed behaviour deleted, the five scheme-gated
  tests replaced by three http-source tests, the source guard rewritten to one test).
- Shard gate: `jestMock=89 (17 files)` (was 90). Full ratchet: `jestMock=1582 (365 files)` (was 1583), PASS.
- Four-suite run (CachedImage, tauriTransport, rendererAllowList, isTauriRemoved): 4 suites, 71 tests, 0 failures
  (74 at HEAD minus the 3 removed CachedImage tests).
- Sweeps: `grep -rniE imagecache src/ meta/` prints nothing (35 lines at HEAD); `grep -rln images_cache src/` lists exactly
  the three backend gate files (`diPhaseGates.test.ts`, `infoPortComplete.test.ts`, `portSliceGate.ts`), which were not edited.
- `pnpm -s codecheck` exit 0; scoped eslint clean; `prettier --file-info` not ignored and `prettier --check` clean for
  all four source/config paths (prettier --write was applied to the two CachedImage files before the check; the tool
  reformatted nothing beyond my edits).
- `pnpm planning-gates`: 12/12.
- `graphify update .` ran successfully.

## Deviations from Plan

None - plan executed as written. Task 2's first delete was off by one line (a stray `/**` left behind); it was caught by
the next `sed` read and fixed before the commit, so no commit carried it.

## Verification note

As the plan states, the library-render check was verified by tests, not a live `pnpm tauri:dev` render.

## Notes

- Commits went to `main`; `git.allow_default_branch_commits` is true in `.planning/config.json`.
- Only explicit paths were staged; `git diff --cached --name-only` was checked before each commit. Quick 261127-u6h's
  edits were not touched. By the end, its runner/redact.rs edits no longer showed as dirty (it had committed them); the
  remaining dirty `src-tauri/` and `.planning/` files are not mine.

## Known Stubs

None.

## Self-Check: PASSED

Commits 921d60a1f, f6adc3217, 386d7bb25 are ancestors of HEAD; all four code paths exist; the completed todo exists and
the pending copy does not.
