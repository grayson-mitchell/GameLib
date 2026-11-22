---
phase: 84-logger
fixed_at: 2026-11-22T04:30:03Z
review_path: .planning/phases/84-logger/84-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 84: Code Review Fix Report (round 5)

**Fixed at:** 2026-11-22T04:30:03Z
**Source review:** .planning/phases/84-logger/84-REVIEW.md
**Iteration:** 1
**Scope:** all (warnings + info)

**Summary:**

- Findings in scope: 3
- Fixed: 3
- Skipped: 0

`workflow.use_worktrees` is `false`, so the fixes were edited and committed in the main checkout. No
worktree was created. Every commit used `git commit -- <explicit path>` and touched only files under
`src/backend/logger/`. No Phase 85 file and none of the concurrent session's uncommitted files were
staged, edited or reverted.

## Fixed Issues

### WR-13: No test proves the transport wait gets only what is left of the one deadline

**Files modified:** `src/backend/logger/__tests__/forwarder.test.ts`
**Commit:** 2a3d6d6ed
**Applied fix:** Added a `describe` block with two tests. They share a `bothLegs()` fixture: a writer
link that settles at 1,500 ms, plus a queued frame whose write callback is never called. Both legs of
`flush` run in sequence: the chain wait, then the transport wait.

- **Both legs together end at `LOG_FLUSH_TIMEOUT_MS`.** This is the review's suggested test. `flush`
  is still pending at 1,999 ms and resolves by 2,001 ms.
- **A wall-clock step back during the chain wait does not stretch the transport wait.** The clock
  steps back 60 s at 1,000 ms, and the test expects the same 2,001 ms result.

This differs from the review in one way. The review suggested stepping the clock at 1,500 ms, inside
the transport wait. A step there cannot fail any code, because the transport timer is already armed
with its delay. The step is moved into the chain wait instead. The transport leg computes what is
left of the deadline after that point, which is where a wall-clock regression would show.

**Mutation probes.** Each mutation was applied to `forwarder.ts` and then restored by editing the line
back. No `git checkout`, `restore` or `stash` was used. Afterwards `git diff src/backend/logger/forwarder.ts`
is empty.

- `:438` changed to `const left = this.#flushTimeoutMs`: both new tests fail (`flushed` is still false
  at 2,001 ms).
- The transport leg moved to the wall clock (`wallDeadline = Date.now() + ...` taken at entry, and
  `left = Math.max(0, wallDeadline - Date.now())`): only the step-back variant fails. The WR-11 test,
  the WR-12 test and the first WR-13 test all pass on this mutation, so the variant is the only test
  that pins this half of WR-12's "cannot stretch either wait".

### IN-14: The IN-11 cost and rationale ignore the fatal guard's 1,500 ms cap

**Files modified:** `src/backend/logger/index.ts`
**Commit:** d69f19327
**Applied fix:** Doc only. Added a paragraph to the `logErrorSettled` doc. It says that on the fatal
path the guard races this promise against `UNCAUGHT_FLUSH_CAP_MS` (1.5 s, `sidecar/processGuards.ts`)
and then exits. So on that path:

- the full 2 s never happens;
- held lines that settle after 1.5 s are lost;
- a link that never settles uses the guard's whole window. The fatal entry then reaches stdout only
  through the 50 ms tick, and its write callback is never awaited.

These facts were checked against `processGuards.ts:102` and `:352-363`, read only.
`processGuards.ts` is unchanged. Making the two bounds agree is still out of scope.

### IN-13: The `logInfoSettled` doc still names a call site that does not exist

**Files modified:** `src/backend/logger/index.ts`
**Commit:** d3cdf6944
**Applied fix:** Doc only. The claim about "the `logInfo` send listener's call-site guard" was replaced
with the fact: there is no production caller today. The function is kept as the `logInfo` sibling and
is listed in `meta/logSecretGate.ts`. The IN-11 coupling note now reads as the cost a future caller
would pay. A grep of `src/` and `meta/` confirmed that the only non-test hits are the definition, the
`trackLogSettle` doc, the export, and `meta/logSecretGate.ts:74`. Whether to remove the export is
still a separate scope decision.

IN-13 and IN-14 edit different doc blocks (`logInfoSettled` and `logErrorSettled`), so each has its
own commit.

## Verification

These gates ran in the main checkout. They can be reproduced from the tree at `d3cdf6944`.

- `npx jest src/backend/logger`: 6 suites, 129 tests pass. That is 127 plus the 2 new WR-13 tests. The
  suites were run after each commit.
- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output. Its `--listFilesOnly` output includes the
  `src/backend/logger/` files.
- `npx prettier --check src/backend/logger/__tests__/forwarder.test.ts` and `npx prettier --check
  src/backend/logger/index.ts`: clean.
- `git diff src/backend/logger/forwarder.ts`: empty after the mutation probes.
- `git status --short src/backend/logger`: clean after the last commit.

---

_Fixed: 2026-11-22T04:30:03Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
