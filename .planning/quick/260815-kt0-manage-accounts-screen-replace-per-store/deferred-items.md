# Deferred Items — Quick Task 260815-kt0

Out-of-scope discoveries found during execution. Not fixed here per the executor's scope
boundary rule (only auto-fix issues directly caused by the current task's changes).

## 1. Pre-existing uncommitted WIP breaks `pnpm test:ci` — unrelated to this task

**File:** `src/backend/sidecar/__tests__/steamAuthFlows.test.ts`

At session start this file already carried an **uncommitted** modification (137 insertions,
git blame shows no owning commit) adding a `describe('Phase 34.13 install-form channels
(D-09/D-14/D-15)')` block that asserts `main.ts` registers `persistBottleWineVersion` and
`isSteamBottleEligible` IPC handlers delegating to `installFormIpc.ts` (committed separately
in `edbcc392e` — "feat(34.13-07): shared install-form IPC seam"). `main.ts` does not yet wire
those handlers, so 6 of that describe block's specs fail:

- `main.ts registers persistBottleWineVersion delegating to the shared seam (comment-stripped source gate)`
- `main.ts places isSteamBottleEligible inside the bottle block, between steamBottleStatus and steamClientSetupStart (placement gate)`
- (4 more in the same block, same root cause)

Result: `pnpm test:ci` reports **258 passed / 1 failed / 259 total suites** instead of the
plan's expected 258/258, and 6/5061 tests fail.

**Why this is out of scope for quick task 260815-kt0:** this task's `files_modified` list is
five Login/Runner/locale files; it never touches `src/backend/sidecar/`,
`src/backend/storeManagers/steam/`, or `main.ts`. The failing suite is Phase 34.13 Plan 07
follow-on work-in-progress, present in the working tree before this session started and
untouched by any commit in this task (`24bdd8707`, `0d54b16b7`).

**Verification the failure is pre-existing and independent:** `npx eslint`/`tsc --noEmit`/the
scoped `npx jest --selectProjects Frontend src/frontend/screens/Login` run (this task's own
files) are all clean; the only failing suite is the one carrying the unrelated dirty diff.

**Action:** left untouched, not committed, not reverted (reverting someone else's in-progress
work is destructive and out of this task's authority). Whoever owns Phase 34.13 plan 07/08
needs to either wire the two handlers into `main.ts` or update the test's expectations.
