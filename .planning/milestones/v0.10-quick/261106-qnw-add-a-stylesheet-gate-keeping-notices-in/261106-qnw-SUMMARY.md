---
phase: quick-261106-qnw
plan: 01
status: complete
completed: 2026-11-06
commit: a736d833e
key-files:
  created:
    - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
---

# Quick 261106-qnw: NoticeStack stylesheet gate

A Frontend-project jest source gate (no new dependencies) with a small SCSS declaration parser. It resolves nesting, `&`, `>` and comma lists, and it skips `@keyframes`. It enforces that only `.noticeStack` is `position: fixed`. It forbids `sticky` anywhere. It forbids `absolute` and anchors on region rules and slot toast-root rules. Inner rules such as the Steam countdown bar may use an anchor only when the same rule is `position: absolute`.

It also has a non-vacuity block, a containment premise check (`.noticeStackToast` is `relative`), five derived-specimen self-tests, and a discovery guard. The guard covers `renderNoticeSlot(` callers, the children of `<NoticeStack>`, and each slot's scss import and root literal.

## Verification
- `NoticeStack.test.tsx` and the new gate run together: 2 suites, 14 tests, all pass.
- `npx prettier --check` on the new file passes.
- `pnpm codecheck` is clean.
- `pnpm lint` reports 0 errors (1120 existing warnings).
- The three scss files are clean in `git diff` after the mutation run.

## Mutation run (not committed, reverted)
I added `position: fixed; bottom: var(--space-lg); right: var(--space-lg);` inside `.humbleExpiryToast {`. The gate failed:

```
FAIL noticeStackStylesheetGate.test.ts
  ✕ no notice stylesheet positions itself outside the region
  ✕ is not vacuous: parser sees exactly one fixed and an absolute bar
  ✕ ignores a trailing comment mentioning position: fixed
- Expected  - 1 / + Received  + 5
+ "src/frontend/components/UI/HumbleExpiryToast/index.scss: \".humbleExpiryToast\" { position: fixed } - only .noticeStack may be position: fixed",
+ "...: \".humbleExpiryToast\" { bottom: var(--space-lg) } - anchor on a toast-root rule",
+ "...: \".humbleExpiryToast\" { right: var(--space-lg) } - anchor on a toast-root rule",
```

The second and third failures follow from the mutation: the fixed-count is now 2, and the trailing-comment specimen is derived from the mutated sheet. Both pass on the clean tree.

## Deviations
- Passing a path to `npx jest --selectProjects Frontend <path>` ran the whole Frontend project instead of just that path, so I used `--runTestsByPath`.
- **Pre-existing failure, out of scope:** the full Frontend project has one failure, `themeTokens.test.ts` (is-text census, 29 sites vs 27 expected). It is already tracked by the todo in commit 39f721b36, and I did not touch it. This means the plan's `<verify>` command (`npx jest --selectProjects Frontend src/frontend/components/UI/NoticeStack/__tests__`) exits non-zero as written.
- Running jest triggered a `pnpm install` / `download-helper-binaries` prepare step. It changed no tracked files.
- `graphify update .` was run after the commit.

## Self-Check: PASSED
