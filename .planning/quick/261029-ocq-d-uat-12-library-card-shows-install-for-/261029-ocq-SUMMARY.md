# Quick 261029-ocq: D-UAT-12 library card Resume Install Summary

The library card now reads "Resume Install" (tooltip, context menu, status text) for an incomplete Steam install, driven by a pure `isSteamIncompleteCard` predicate over the `statusContext` that `hasStatus` already returns.

## Commits
- c288ad64f: test, predicate and 9-case unit test
- e704b397e: fix, GameCard wiring (tooltip, context-menu label, grid pill and list info)
- 52d3bd1f5: docs, todo moved to completed/ with Resolution; D-UAT-12 in 21-UAT.md records the code fix

## Verification
- jest steamIncompleteCard: 9/9 pass
- tsc --noEmit: clean
- eslint on touched files: 0 errors, 4 warnings, all pre-existing in index.tsx (handleUpdate / useEffect area), none new
- prettier --check: clean on touched code files
- pnpm planning-gates: 12/12 pass

## Deviations
- [Rule 1] The initial predicate type `Runner | string` tripped `no-redundant-type-constituents`; changed to `string | undefined` (folded into e704b397e).
- The test and predicate were written together rather than a strict RED commit first.

## Status
Code fix only; not live re-tested on Windows. D-UAT-12 stays MINOR open pending re-test.
