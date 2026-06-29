# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## email-steamguard-still-invalid — credential guard_required branch missing authenticated listener causes DeviceConfirmation auto-cancel
- **Date:** 2026-06-29
- **Error patterns:** invalid code, Login attempt has been canceled, submitSteamGuardCode, EResult, guard_required, DeviceConfirmation, steam guard, credential login, _pollingCanceled
- **Root cause:** startCredentialLogin returned guard_required without attaching an 'authenticated' listener on the session. For accounts with DeviceConfirmation (type 4) in validActions, steam-session auto-starts polling via setImmediate(_doPoll) inside _processStartSessionResponse. When polling fires 'authenticated' (phone push approval or DeviceConfirmation poll response), steam-session internally calls cancelLoginAttempt() setting _pollingCanceled=true. With no 'authenticated' listener, finishAuth was never called and the user was not logged in. Subsequent submitSteamGuardCode hit _verifyStarted() → _pollingCanceled===true → synchronous throw "Login attempt has been canceled". Confirmed from real-environment [DIAG2] log capture: validActions=[type:3, type:4], no 'error' event during the wait, 34s gap then throw. Two prior fixes were insufficient: (1) casing normalization (01-04, commit 3e4863d) and (2) loginTimeout=180000 — both retained as defense-in-depth but neither addressed the root cause.
- **Fix:** Attach session.once('authenticated'/'error'/'timeout') in the guard_required branch of startCredentialLogin BEFORE returning to the frontend. 'authenticated' handler calls finishAuth and _settleCredSession('done'). 'error' handler logs real EResult and calls _settleCredSession('error'). submitSteamGuardCode uses _waitForCredSession() (shared settle, no duplicate listeners). Added pollCredentialLogin() backend method + frontend 2s credPollInterval for out-of-band DeviceConfirmation phone-approval completion path.
- **Files changed:** src/backend/storeManagers/steam/user.ts, src/backend/main.ts, src/common/types/ipc.ts, src/preload/api/steam.ts, src/frontend/screens/Login/components/SteamLogin/index.tsx, src/backend/storeManagers/steam/__tests__/user.test.ts
---

