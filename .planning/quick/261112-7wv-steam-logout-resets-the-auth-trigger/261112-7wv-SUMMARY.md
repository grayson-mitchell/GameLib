---
phase: quick-261112-7wv
plan: 01
status: complete
completed: 2026-11-12
commits: [d884e5c9c, 3798489db]
---

# Quick 261112-7wv: SteamUser.logout() resets the auth trigger

`SteamUser.logout()` now calls `this.deps.steamSession.authTrigger.resetSteamAuthTrigger()` right after `resetSignInState()` and before the first await (`clearToken`). A sign-out locks the keyring gate and drops any armed refresh logon grant.

## Tasks
1. Fix and regression tests (d884e5c9c). Two tests in user.test.ts: gate locked and grant cleared, and reset happens before a slow clearToken resolves. Both were confirmed RED before the fix.
2. Docs (3798489db). README loose-end sentence updated; 66.3-18-SUMMARY items annotated as fixed.

## Deviations
**[Rule 3 - Blocking]** The hand-rolled `mockSteamSession.authTrigger` in authSessionLifecycle.test.ts lacked `resetSteamAuthTrigger`, so 3 logout tests threw. Added `resetSteamAuthTrigger: jest.fn()` to that mock (file added to the commit).

## Verification
Steam suites plus steamAuthSessionPolicy: 4190 passed. tsc clean. Scoped prettier clean. backend-di-ceilings PASS.

## Self-Check: PASSED
