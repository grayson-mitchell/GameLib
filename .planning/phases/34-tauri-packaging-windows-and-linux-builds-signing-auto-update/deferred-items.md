# Deferred Items — Phase 34

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(pre-existing issues in files untouched by the current plan are not auto-fixed).

## 34-01: Pre-existing `library.ts` leaked-timer jest crash

**Found during:** Task verification (`pnpm test:ci` full-suite run).

**Symptom:** After the full backend jest suite completes (all suites report PASS/FAIL and their
assertions finish), a leftover `setTimeout` from `pollInstallOnce` fires after test teardown and
throws `TypeError: Cannot read properties of undefined (reading 'map')` at
`src/backend/storeManagers/steam/library.ts:1153` (`readAcfState` → `getSteamLibraries()` resolved
`undefined`, called post-mock-teardown), crashing the Node process with exit code 1.

**Scope:** Confirmed unrelated to this plan — `library.ts` is not in `files_modified` for 34-01,
the crash reproduces identically with or without the four new Wave-0 test files present (verified
by running `src/backend`'s jest project directly), and it already exists as a documented,
previously-known issue (project memory: "known separate library.ts leaked-timer jest exit-1",
first noted 2026-07-19 in the Steam install slow-start outcome entry).

**Action:** Not fixed (out of scope, Rule 1/3 do not apply — this is a pre-existing issue in a
file this plan never touches). No regression introduced by 34-01. Left for a future
plan/debug session that owns `library.ts`'s timer lifecycle.
