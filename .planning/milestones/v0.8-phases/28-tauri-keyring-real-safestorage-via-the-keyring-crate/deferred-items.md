# Deferred Items — Phase 28

## 28-03: `library.ts` leaked-timer Jest crash (out of scope)

`npm run test:ci` (full suite) crashes AFTER all suites report `PASS` (0 `FAIL` lines) with:

```
TypeError: Cannot read properties of undefined (reading 'map')
    at readAcfState (src/backend/storeManagers/steam/library.ts:1147:56)
    at pollInstallOnce (src/backend/storeManagers/steam/library.ts:1300:20)
    at Timeout._onTimeout (src/backend/storeManagers/steam/library.ts:1518:9)
```

This is a pre-existing leaked `setTimeout` in `library.ts`'s install-poll loop that
fires after a test file's mocks have already been torn down (unrelated to Steam auth
or token storage). Already tracked in project memory ("known separate library.ts
leaked-timer jest exit-1", first observed 2026-07-19, predates this phase).

Verified out of scope for 28-03: reproduces identically with `HEAD` at
`cdd71a9c` (28-03's own commits already applied) — this plan's changes are confined
to `src/backend/storeManagers/steam/{tokenStore.ts,user.ts}` and the new
`__tests__/tokenStore.test.ts`, none of which touch `library.ts` or its install-poll
timer. Every individual test suite, including `user.test.ts` and `tokenStore.test.ts`,
passes cleanly when run in isolation.

Not fixed here per the Scope Boundary rule (only auto-fix issues directly caused by
the current task's changes). Should be addressed by whichever phase next touches
`library.ts`'s install-poll lifecycle, or by a dedicated `/gsd-debug` session.
