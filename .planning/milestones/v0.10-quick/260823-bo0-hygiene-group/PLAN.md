---
quick_id: 260823-bo0
slug: hygiene-group
created: 2026-08-23
status: complete
---

# Fix 34.2 gap-cycle-4 IN-03 through IN-07 — the hygiene group

Five findings. Three are prose that stopped being true; two are real test
hygiene defects with behavioural consequences. All five verified live on
2026-08-23.

| ID | File | Nature |
|---|---|---|
| IN-03 | `longRunningChannels.test.ts` | Test name says "six pre-existing" but one of the six was added by this phase |
| IN-04 | `structuralContainment.test.ts` | A forward-declaration comment describes work that has landed |
| IN-05 | `jest.setupContainment.ts` | Stale "per-pid" wording; and a `chmodSync` the review wrongly calls a no-op |
| IN-06 | `loggerCallSiteGuard.test.ts`, `loggerFlows.test.ts` | Twelve spies never restored; three `mockRestore()` after the assertions they guard |
| IN-07 | `jest.setupContainment.ts` | The `userInfo` override returns a string `homedir` to buffer-encoding callers |

## Where the review is wrong

IN-05 claims `chmodSync(root, 0o700)` is a no-op because `mkdtempSync` already
creates at 0700. **Measured false:** mkdtemp's mode is subject to umask — under
umask 0277 it yields 0500 and the chmod restores owner-write. The call stays. The
docstring's framing is wrong in the other direction, though: chmod is not the
security control, since umask can only remove bits, so a mkdtemp directory never
carries group/other bits for chmod to strip.

## Gates

- RED proof for the two behavioural changes (IN-06, IN-07).
- For the prose corrections, evidence cited in the replacement text.
- Concurrent session's working-tree entries unchanged after every commit.
