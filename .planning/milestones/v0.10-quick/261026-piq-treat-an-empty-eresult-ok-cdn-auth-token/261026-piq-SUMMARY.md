---
phase: quick-261026-piq
plan: 01
status: complete
commits: [7ed900ec8, 472805bbc]
---

# Quick 261026-piq: eresult=OK empty CDN auth token cached as "no token required"

A clean eresult=OK, empty-token GetCDNAuthToken reply now resolves `''` and is cached for `CDN_AUTH_NO_TOKEN_TTL_MS` (30 min), with one info line and no warning, stack or cooldown. Direction 2 of the original todo was split into a new live-gate todo.

## Commits
- 7ed900ec8 fix: cdnAuth.ts and cdnAuth.test.ts (no-token cache, tests A-E)
- 472805bbc docs: new pending todo, original todo moved to completed with `status: RESOLVED` and a Resolution section

## Verify results
- `pnpm jest --selectProjects Backend` for cdnAuth, depotPrimitives and depot tests: 3 suites, 323 tests pass. The RED run was confirmed first, with Test D failing as expected.
- `pnpm codecheck`: clean.
- `npx prettier --check` on both src files: pass.
- `pnpm planning-gates`: 12/12 pass. The severity/platform/ready ordering check on the new todo passes.
- `graphify update .` ran.

## Notes
- The first RED run (before implementation) ignored the path argument and ran the whole Backend project. It showed 3 failed suites and 5 failed tests, including an unrelated `dxvkInstallRemove` ENOTEMPTY failure. The cause is unknown and it was not investigated, since it is out of scope. The later targeted run of the three plan suites passed in full.
- Planning-time log numbers were re-verified against the 10-23 log, which still exists: 65 empty-token lines, 28 of them for 200511, and the @760s stats line.

## Deviations
None.
