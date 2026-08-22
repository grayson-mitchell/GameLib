---
quick_id: 260823-amg
slug: gates-measuring-the-wrong-property
created: 2026-08-23
status: complete
---

# Fix 34.2 gap-cycle-4 WR-05, WR-07, WR-08 — gates measuring the wrong property

Three findings, each a gate that runs, passes, and does not measure the property
its own prose claims. All three verified live against the tree on 2026-08-23.

## WR-07 — the containment precondition checks one half of a two-half mechanism

`src/backend/jest.setupContainment.ts`. The "REFUSING TO RUN" block validates
`require('os').homedir()`, `require('node:os').homedir()`, and
containmentRoot-inside-realTmpRoot. The module docstring presents the mechanism as
TWO halves; the second is the eight `process.env` assignments. Delete any one and the
precondition still passes for every backend suite. The only other enforcement is
`testContainment.test.ts`'s text gate, which CR-01 showed a block comment can satisfy.

**Fix:** assert all eight expected env values in the same precondition block, naming
the offending keys in the throw.

## WR-08 — three independent conditions, none requiring the assertion inside the loop

`src/backend/__tests__/longRunningChannels.test.ts`. `hasBehavioralRustTestModule`
ANDs three region-wide facts. An empty loop plus an unrelated assertion satisfies all
three.

**Fix:** extract the loop body by brace matching and require the assertion inside it.
The review's own prescribed regex is rejected — its lazy `[\s\S]*?` crosses the loop's
closing brace, so it passes the reversed rearrangement.

## WR-05 — the file's stated evidentiary basis is false

`src/backend/sidecar/__tests__/structuralContainment.test.ts` claims zero `jest.mock`
calls in its module graph; a top-level import of `backend/jest.setupContainment` makes
that false, and the RED proof fell from 5-of-6 to 1-of-12.

**Fix (review option a — restore the property, do not weaken the claim):** capture the
real home in `globalSetup` as `GAMELIB_JEST_REAL_HOME`, drop the import, read both
values from `process.env`, re-measure the RED proof by hand, and add a self-gate that
walks the file's own import graph so the prose claim becomes automatically enforced.

## Gates

- RED proof for each finding individually, with the command and observed failure recorded.
- Every new negative assertion proven non-vacuous in both directions.
- Concurrent session's working-tree entries unchanged after every commit.
