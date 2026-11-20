---
status: complete
quick: 261030-sqq
commit: d0a66c8ef
---

# 261030-sqq Summary

Humble Keys: owned rows now show the "Owned on Steam" badge on `gift-only` and on `claim-and-gift` rows.

- `gift-only` renders `{ownedBadge}` then the gift action row (same fragment shape as `settled`).
- `claim-and-gift` (scope amendment) renders `{ownedBadge}` ahead of the action row; the row is still omitted when there is neither claim nor gift content.
- resolveKeyScenario item 5 comment extended; short comments added on both cases.
- Tests: new describe "owned rows show the ownership badge whatever action is offered (261030-sqq)", 6 tests.

## Verification
- RED before fix: 4 of 6 failed (Test B and the non-owned guard passed, as intended).
- Whole file after fix: 107/107 passed.
- Mutation proof: reverting the gift-only `{ownedBadge}` fails 3 tests (A, C, D); reverting the claim-and-gift `{ownedBadge}` fails 1 test (owned REVEALED, no actions). Restored: 107/107.
- `pnpm codecheck` passed; scoped eslint passed; prettier --check clean (`--file-info` ignored:false for both).
- Audit: no pre-existing test asserted badge absence on these rows.

## Deviations
None beyond the orchestrator's scope amendment (claim-and-gift badge).
