# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## email-steamguard-still-invalid — credential session auto-canceled before email SteamGuard code submitted
- **Date:** 2026-06-29
- **Error patterns:** invalid code, Login attempt has been canceled, submitSteamGuardCode, EResult, steam guard, email guard, SteamGuard, credential login
- **Root cause:** startCredentialLogin never set loginTimeout on the LoginSession, so it inherited steam-session's 30 s default. Email SteamGuard retrieval reliably exceeds 30 s; steam-session auto-cancels polling at that threshold (LoginSession.js:486-488). submitSteamGuardCode then throws synchronously "Login attempt has been canceled" (LoginSession.js:278-279), surfaced as the generic "invalid code" error. The QR path correctly set loginTimeout = 120000 but the credential path was missing it.
- **Fix:** Set session.loginTimeout = 180000 in startCredentialLogin immediately after new LoginSession() and before session.startWithCredentials(). Must be set before startWithCredentials() — steam-session throws if loginTimeout is changed after polling starts (LoginSession.js:107).
- **Files changed:** src/backend/storeManagers/steam/user.ts, src/backend/storeManagers/steam/__tests__/user.test.ts
---

