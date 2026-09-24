---
phase: quick-260924-g7r
plan: 01
subsystem: frontend/Library
tags: [steam, threat-model, T-34.11-12]
dependency-graph:
  requires: [selectVisibleSteamLibrary]
  provides: [resolveSteamVisibility, steamVisibility-memo]
  affects: [Library/index.tsx connectedStores, Library/index.tsx makeLibrary]
tech-stack:
  added: []
  patterns: [single-resolver-memo-feeding-two-consumers]
key-files:
  created: []
  modified:
    - src/frontend/screens/Library/steamLibraryVisibility.ts
    - src/frontend/screens/Library/index.tsx
    - src/frontend/screens/Library/__tests__/steamLibraryVisibility.test.ts
    - src/frontend/screens/Library/__tests__/connectedStoresParity.test.ts
    - .planning/todos/completed/2026-09-24-steam-facet-row-can-outlive-its-grid-games-reopening-t-34-11-12.md
decisions:
  - "Option 2 (share one predicate) taken per the todo, verbatim per the locked plan design."
  - "steamVisibility memo reshaped to a block-bodied arrow function (not the plan's illustrative one-line-return form) so functionRegion's brace-counting can extract the whole call for the wiring test -- functionally identical, same dep array."
metrics:
  duration: "~45 min"
  completed: 2026-09-24
---

# Phase quick-260924-g7r Plan 01: Share one Steam visibility predicate Summary

One-liner: `resolveSteamVisibility` now backs a single `steamVisibility` memo that both the Store
facet panel and the Games grid read, closing the reopened T-34.11-12 Steam divergence where an
expired session with zero installed games advertised a permanently-0 Steam row.

## What shipped

- **Task 1** — `resolveSteamVisibility` added to `steamLibraryVisibility.ts`, delegating `games` to
  the untouched `selectVisibleSteamLibrary` and computing
  `storeConnected = Boolean(steamUsername) && (steamSyncStatus !== 'failed' || games.length > 0)`.
  Commit `40c8654ac`.
- **Task 2** — `index.tsx` now computes one `steamVisibility` memo; `connectedStores` and
  `makeLibrary` both read `steamVisibility.storeConnected` on single lines (parity-regex-safe).
  Both prose blocks rewritten. Commit `1544e7d56`.
- **Task 3** — Full outcome matrix (24-cell cross product) plus a named
  `failed && storeConnected ⇒ games.length > 0` invariant test and a red-proof against the pre-fix
  `Boolean(steamUsername)`-alone predicate, all in `steamLibraryVisibility.test.ts`. The four wiring
  assertions Task 2 broke were repaired (re-pointed at the new memo), not deleted. Commit `0f4103f4e`.
- **Task 4** — Steam pinned to `steamVisibility.storeConnected` by name in
  `connectedStoresParity.test.ts`, plus the header's second-failure-mode prose. Commit `b01667f3b`.
- **Task 5** — Todo closed: `pending/` → `completed/`, `status: RESOLVED`, `## Resolution` section
  recording option 2 taken, option 3 explicitly declined (not deferred), the todo's own UX
  objection measured false, the parent live-gate prerequisite already satisfied, and the honest
  statement that the expired-plus-zero-installed state itself was never observed live. Commit
  `c4cac2374`.

## Verify output (actual, not paraphrased)

1. `pnpm codecheck` — clean, no output (tsc + tsc -p tsconfig.meta.json both exit 0).
2. `pnpm lint` — `638 problems (0 errors, 638 warnings)`, `production: PASS | tests: PASS`. Both
   ceilings (SRC 1124, TESTS 638) held exactly, no new warnings attributed to any of the four
   touched source/test files across three separate lint runs (after Task 2, Task 3, and the final
   combined run).
3. `npx jest --selectProjects Frontend --testPathPattern 'Library/__tests__/(steamLibraryVisibility|connectedStoresParity)'`
   → `Test Suites: 2 passed, 2 total`, `Tests: 55 passed, 55 total` (baseline was 26; strictly
   greater, as required).
4. `npx jest --selectProjects Frontend --testPathPattern 'Library/__tests__/steamLibraryVisibility' -t 'failed'`
   → `Tests: 35 skipped, 13 passed, 48 total` — the failed-session rows actually ran, not 0 matched.
5. `npx prettier --check` over all four touched source/test files → `All matched files use
   Prettier code style!`.
6. `pnpm planning-gates` → `12/12 planning gates passed.`
7. `git show :.planning/todos/completed/...md | grep -c 'Option 2 taken'` → **1** (non-zero — see
   the git-mv-trap section below).
8. `git show :.planning/todos/completed/...md | grep -c 'SteamSyncNotice'` → **1**.

## The `git mv` trap check (hard rule 2)

Followed the mandatory order: edited the pending file in place, `git add`, `git mv` to
`completed/`, then verified staged content BEFORE committing:

```
git show :.planning/todos/completed/2026-09-24-steam-facet-row-can-outlive-its-grid-games-reopening-t-34-11-12.md | grep -c 'Option 2 taken'
```

Result: **1** (non-zero, confirms the edits were not dropped by `git mv`).

## Deviations from Plan

### Auto-fixed / adjusted issues

**1. [Rule 1 — necessary shape correction] `steamVisibility` memo reshaped to a block body**
- **Found during:** Task 3, while implementing the plan's own instruction to use
  `functionRegion(librarySource, 'const steamVisibility = useMemo(')` and assert the extracted
  region contains `resolveSteamVisibility(`.
- **Issue:** The plan's illustrative Task 2 snippet wrote the memo as
  `useMemo(() => resolveSteamVisibility({...}), [...])` — an expression-bodied arrow. `functionRegion`
  brace-counts from the *first* `{` after the start needle; for that shape the first `{` is the
  object literal's opening brace, so the extracted region excludes the literal text
  `resolveSteamVisibility(` (it sits before the brace). The plan's own required assertion
  (`the memo contains resolveSteamVisibility(`) could not be satisfied against that shape using the
  helper the plan named.
- **Fix:** Reshaped the memo to `useMemo(() => { return resolveSteamVisibility({...}) }, [...])` —
  a block-bodied arrow, matching the existing `makeLibrary` `useCallback` idiom already extracted by
  the same helper in this file. Functionally identical: same inputs, same output, same dependency
  array. `pnpm codecheck` and `npx prettier --check` both clean after the change.
- **Files modified:** `src/frontend/screens/Library/index.tsx` (within Task 3's commit, since the
  test being written required it).
- **Commit:** `0f4103f4e`.

### None else

Every other line of the plan (the `resolveSteamVisibility` signature, the `storeConnected` formula,
the ONE-LINE push/showSteam-assignment shapes the parity regexes require, the full outcome matrix,
the red-proof, the wiring repair, the parity pin, and the todo's Resolution content) was implemented
verbatim as specified.

## Unresolved finding — NOT auto-fixed, reporting per hard rule 4

Running the plan's own verification step 4 (`npx jest --selectProjects Frontend` — full suite, "no
collateral damage to the other 170 Frontend suites") surfaced ONE failing pre-existing test file
that is **not** in this plan's `files_modified`, not mentioned anywhere in the plan text, and not
covered by hard rule 5's narrow repair exception (which is scoped explicitly to the four wiring
assertions in `steamLibraryVisibility.test.ts`):

```
FAIL src/frontend/screens/Library/__tests__/libraryHookStaleness.test.ts
  makeLibrary's dependency array complete (WR-01)
    ✕ Test H (non-vacuity): extracted read set exactly 12 members contains epic.username
    expect(received).toHaveLength(expected)
    Expected length: 12
    Received length: 10
    Received array: ["epic.username","epic.library","gog.username","gog.library",
      "amazon.user_id","amazon.library","zoom.enabled","zoom.username","zoom.library",
      "sideloadedLibrary"]
```

Full-suite result: `Test Suites: 1 failed, 171 passed, 172 total` / `Tests: 1 failed, 2888 passed,
2889 total`.

**Why this happened:** `libraryHookStaleness.test.ts` (from an unrelated prior quick task,
`4ba13c636`, "close WR-01/WR-05/WR-09 review findings") hardcodes a `KNOWN_READS` list of 12
identifiers it expects to find as literal substrings inside `makeLibrary`'s body text, including
`steam?.username` and `steam?.library`. Task 2 of this plan legitimately moved both of those reads
out of `makeLibrary` and into the new `steamVisibility` memo — per the locked design, `makeLibrary`
now reads `steamVisibility.storeConnected` and `steamVisibility.games` instead. That is exactly
correct per this plan's objective, but it makes this OTHER gate's hardcoded count of 12 stale (now
factually 10), and that gate is not aware `steamVisibility` is the memo's own dependency array
entry that replaces the two it used to look for directly.

**What I did NOT do:** I did not modify `libraryHookStaleness.test.ts`. Hard rule 5 states plainly
that "the single exception is the four wiring assertions Task 3 explicitly instructs you to
RE-POINT... repair those, never delete them" — this file's assertions are not that exception, and
touching a gate outside the plan's declared scope without operator sign-off is exactly what hard
rule 4 says to stop and report instead of quietly working around.

**Net effect:** Tasks 1-5 as written in the plan are all complete, committed, and individually
verified per their own `<verify>` blocks (all passing). The plan's own overall verification item 4
("no collateral damage to the other 170 Frontend suites") is **not fully satisfied** — one suite,
outside this plan's scope, now fails because a legitimate consequence of the locked design. This
needs an operator decision: either authorize a repair of `libraryHookStaleness.test.ts`'s
`KNOWN_READS`/expected-count to reflect the new memo-based shape (mirroring the Task 3 repair
pattern), or accept it as a follow-up item.

## Self-Check: PASSED

All five modified/created files confirmed present on disk; all five task commits (`40c8654ac`,
`1544e7d56`, `0f4103f4e`, `b01667f3b`, `c4cac2374`) confirmed present in `git log --oneline --all`.
