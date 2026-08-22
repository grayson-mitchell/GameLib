---
quick_id: 260823-amg
slug: gates-measuring-the-wrong-property
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary

Three of 34.2 gap cycle 4's findings closed. Each was a gate that ran, passed,
and measured something other than the property its own prose claimed.

| Finding | Commit | RED proof |
|---|---|---|
| WR-07 | `13b394ece` | Commenting out the `XDG_CACHE_HOME` assignment fails the suite at import time naming that key. |
| WR-08 | `2fd9308c2` | Reverting the predicate fails exactly the two new negative self-tests and nothing else. |
| WR-05 | `9c8a29b48` | Reintroducing the offending import fails exactly one test — the new gate. |

## What each fix changed

**WR-07** — `jest.setupContainment.ts`'s `REFUSING TO RUN` precondition now checks
all eight `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`XDG_*` values, naming the
offending keys. Expected values are spelled out a second time rather than captured
into constants at assignment time, which would have made the comparison
tautological.

**WR-08** — the `LONG_RUNNING_CHANNELS` loop body is extracted by brace matching
and the `assert_eq!` required inside it. Both rearrangement orders and a
format-string-brace positive control are pinned.

**WR-05** — `structuralContainment.test.ts` no longer imports
`backend/jest.setupContainment`. Both values arrive through `process.env`, with the
real home captured by `globalSetup` in the parent process where no mock can exist.
A new describe block walks the file's static import graph transitively and fails if
any file in it registers a mock, so the prose claim is now executable.

## Two corrections to the review

- **WR-08's prescribed regex is holed the same way it reports.** The lazy
  `[\s\S]*?` crosses the loop's closing brace, so it accepts the reversed
  arrangement. Measured. Applying it verbatim would have closed the finding in
  appearance only.
- **WR-08's literal counter-example does not reproduce.** It carries one
  `timeout_for` reference, so it fails the old predicate on the `>= 2` count rather
  than on the structural hole. Pasted in as-is it would have produced a self-test
  that passes against the old predicate too.

## Found while working

- **Test 8 of `structuralContainment.test.ts` passes with containment disabled.**
  `userInfo().homedir === homedir()` holds trivially when neither is redirected.
  Not vacuous — it catches a mock that redirects one and not the other — but it
  cannot detect the mechanism being absent. Test 8b carries that weight. Recorded
  in the file's docstring; left alone as outside WR-05's scope.
- **The WR-05 gate's search must be comment-stripped.** Without it both files in
  the graph are reported and the gate is unpassable — which pressures the next
  person into bending the check rather than fixing the property.

## Gates

Backend 175/175 suites, 4037 passed. `tsc --noEmit` clean, eslint 0 errors
(severity 2), prettier clean on all six changed files. `pnpm planning-gates` 6/6.
`git diff --exit-code src/backend/jest.config.js` clean after the manual RED proof.
The concurrent session's 18 working-tree entries untouched throughout.

Gap cycle 4 now stands at **8 open**, all in test/gate code.
