---
status: fixing
slug: email-steamguard-still-invalid
trigger: "Email Steam Guard credential login still fails with 'invalid code' after the 01-04 normalization fix — confirmed on a fresh build (input visibly uppercases) by real human re-test on 2026-06-29."
created: 2026-06-29
updated: 2026-06-29T23:00:00Z
supersedes: email-steamguard-code-rejected.md
---

# Debug: Email Steam Guard still 'invalid code' after normalization fix

## Symptoms

- **Expected:** Entering the correct emailed 5-char Steam Guard code on the credential login path completes login and shows the logged-in Runner tile.
- **Actual:** Submitting the correct emailed code shows the same generic "invalid code" error. Login never completes.
- **Errors:** UI shows generic "invalid code". The REAL steam-session error was swallowed — only logged in the backend at `src/backend/storeManagers/steam/user.ts` catch block and 'error' handler. The actual EResult was missing from those log lines.
- **Timeline:** Present since the credential+SteamGuard path shipped (Phase 1). A prior fix (quick task 01-04, merged 3e4863d) added `trim().toUpperCase()` normalization (frontend + backend) on the hypothesis that email codes are alphanumeric and casing was the issue. That fix did NOT resolve it.
- **Reproduction:** Credential login (username/password) → Steam Guard prompt → enter the emailed code → "invalid code". Guard type is EMAIL (user receives an email code, not using mobile authenticator as primary). Reproduces every attempt.

## Critical constraints for this investigation

- **The 01-04 normalization fix is CONFIRMED RUNNING and CONFIRMED INSUFFICIENT.** User re-tested on a fresh build; the input visibly uppercases as they type (proves new frontend code is live) and the error is unchanged. **Do NOT re-propose casing / whitespace / alphanumeric-input fixes.** That avenue is eliminated.
- **No agent can reproduce a real Steam login.** The previous diagnosis (`email-steamguard-code-rejected.md`) was static-code-only and reached the WRONG conclusion. This session MUST NOT repeat that. The required first move is to **add targeted diagnostic logging** to the credential + guard path, have the human reproduce once, and diagnose from the REAL captured log data.

## Eliminated

- hypothesis: "Email codes are alphanumeric and the numeric-only input / missing case normalization caused rejection"
  evidence: "01-04 added trim().toUpperCase() on frontend (onChange + submit) and backend (submitSteamGuardCode). Verified live (input uppercases). Error unchanged. ELIMINATED."

- hypothesis: "Session-lifecycle race — startCredentialLogin called more than once, email bound to superseded session"
  evidence: "[DIAG] log shows 'session=matches (no race)' — this.session at submitSteamGuardCode time is the same object captured at guard_required time. ELIMINATED."

- hypothesis: "Guard-type mismatch — validActions shows DeviceCode, wrong type submitted"
  evidence: "Not surfaced in [DIAG] logs; and steam-session auto-selects type internally. Not the cause. ELIMINATED."

- hypothesis: "Code expiry / rate-limit"
  evidence: "EResult=unknown, message='Login attempt has been canceled' does not match Expired or RateLimitExceeded. ELIMINATED."

- hypothesis: "Credential LoginSession loginTimeout not set — inherits 30 s default — email retrieval exceeds 30 s — steam-session auto-cancels"
  evidence: "Added session.loginTimeout = 180000 to startCredentialLogin() before startWithCredentials(). Human rebuilt and retested (2026-06-29 ~20:56). SAME error on two attempts ~15 s apart. 180 s is ample for email retrieval so idle-timeout is not the trigger. cancelLoginAttempt() must have been called externally or via an internal poll error. ELIMINATED as sufficient fix."

## Evidence

- timestamp: 2026-06-29 — Human re-test on fresh build: input uppercases (new code live), correct emailed code still rejected as "invalid code". Normalization hypothesis eliminated.

- timestamp: 2026-06-29 — Frontend audit (SteamLogin/index.tsx): handleGuardSubmit sets loading=true before IPC call; the submit button is disabled={guardCode.length < 5 || loading}. No path for double-submission via button click. No useEffect watches credentials step to re-trigger startCredentialLogin.

- timestamp: 2026-06-29 — Backend instrumentation added (user.ts): invocation counter, startWithCredentials response, normalized code length + session identity check, real EResult in 'error' handler + catch block.

- timestamp: 2026-06-29 — Human reproduction on instrumented build. Captured [DIAG] output:
  - "[DIAG] submitSteamGuardCode: normalized length=5, session=matches (no race)"
  - "Steam: [DIAG] submitSteamGuardCode FAILED (sync throw): EResult=unknown, message=Login attempt has been canceled, raw=Error: Login attempt has been canceled"

- timestamp: 2026-06-29 — Source analysis of steam-session: LoginSession.js:486-488 auto-cancels when totalPollingTime >= this.loginTimeout by calling this.cancelLoginAttempt(). Default loginTimeout = 30000ms (LoginSession.js:93). When _pollingCanceled === true, submitSteamGuardCode throws synchronously at LoginSession.js:278-279 with "Login attempt has been canceled".

- timestamp: 2026-06-29 — loginTimeout hypothesis: QR path sets loginTimeout = 120000; credential path never set it → inherits 30 s default → email exceeds 30 s → auto-canceled. Fix applied: session.loginTimeout = 180000 in startCredentialLogin.

- timestamp: 2026-06-29 (20:55-20:56) — Human re-test on build with loginTimeout=180000. SAME error on two attempts 15 s apart: "Login attempt has been canceled". loginTimeout fix was NOT sufficient. Two back-to-back failures ~15 s apart confirm session was already canceled BEFORE the first submit attempt, not from a timeout.

- timestamp: 2026-06-29 — Source analysis: "Login attempt has been canceled" is thrown at LoginSession.js:278-279 ONLY when _pollingCanceled === true. Three code paths set _pollingCanceled: (1) loginTimeout auto-cancel at line 488 — ELIMINATED by 180s; (2) cancelLoginAttempt() called externally (startQRLogin replaces this.session → cancels previous session); (3) internal poll error at line 500 — catch block calls cancelLoginAttempt() if poll request fails. Must be (2) or (3).

- timestamp: 2026-06-29 — Critical gap found: startCredentialLogin returns { status: 'guard_required' } early WITHOUT attaching 'error' or 'timeout' listeners on the credential session. If steam-session fires an 'error' event during the guard-waiting period (e.g. internal poll error at LoginSession.js:499-502), it silently cancels the session with _pollingCanceled=true. No log entry would exist for this. [DIAG2] instrumentation added to expose this.

- timestamp: 2026-06-29 — [DIAG2] instrumentation added to src/backend/storeManagers/steam/user.ts: (1) monotonic nonce on every session creation logged at startQRLogin ENTRY and startCredentialLogin ENTRY; (2) _diagNonce tagged on session object so submitSteamGuardCode can detect session replacement; (3) validActions + allowedConfirmations logged from startWithCredentials response; (4) 'error' and 'timeout' diagnostic listeners attached on credential session BEFORE startWithCredentials and BEFORE the guard-required early return; (5) sessionNonce + elapsedMs logged at submitSteamGuardCode entry. TypeScript: 0 errors.

- timestamp: 2026-06-29 (21:13) — CONFIRMED ROOT CAUSE from [DIAG2] logs + user confirmation:
  Captured log lines:
    21:13:01 [DIAG2] startCredentialLogin ENTRY nonce=2 replacingSession=yes
    21:13:02 [DIAG2] startWithCredentials response: actionRequired=true validActions=[{"type":3},{"type":4}] allowedConfirmations=undefined
    21:13:02 Steam Guard required for credential login
    21:13:36 [DIAG2] submitSteamGuardCode sessionNonce=2 elapsedMs=35800
    21:13:36 [ERROR] Steam guard code submission failed: EResult=unknown, message=Login attempt has been canceled
  Key observations:
    (1) No [DIAG2] 'error' event between 21:13:02 and 21:13:36 — poll-error hypothesis B is ruled out; no 'error' event was emitted.
    (2) No second startQRLogin ENTRY — orphaned-QR hypothesis A is ruled out; sessionNonce stayed at 2.
    (3) validActions=[type:3 (DeviceCode), type:4 (DeviceConfirmation)] — user confirmed account uses the Steam Mobile Authenticator, NOT email.
    (4) DeviceConfirmation (type 4) is present → steam-session auto-calls setImmediate(_doPoll) inside _processStartSessionResponse (LoginSession.js:432). Polling starts automatically.
    (5) _doPoll returns refreshToken when phone approves → authenticated fires → cancelLoginAttempt() → _pollingCanceled=true (LoginSession.js:529). Our [DIAG2] 'error'/'timeout' handlers were NOT triggered because this is the normal authenticated path, not an error path.
    (6) No 'authenticated' listener was registered for the guard_required path → finishAuth never called → user is NOT logged in.
    (7) submitSteamGuardCode → _verifyStarted() → _pollingCanceled===true → throws "Login attempt has been canceled".
  ROOT CAUSE: The credential session has no 'authenticated' listener registered during the guard-waiting period. When DeviceConfirmation polling fires 'authenticated' (either via phone approval or future polls), the session is marked done+canceled but finishAuth is never called, and _pollingCanceled prevents subsequent submitSteamGuardCode. The fix: register 'authenticated'/'error'/'timeout' on the credential session in the guard_required branch (BEFORE returning to frontend), mirroring the QR flow.

## Current Focus

hypothesis: "CONFIRMED: DeviceConfirmation auto-polling fires 'authenticated' during the 34-second guard-code waiting period. No 'authenticated' listener is attached in the guard_required path → finishAuth not called → _pollingCanceled=true → submitSteamGuardCode throws 'Login attempt has been canceled'."
test: "Fix implemented: attach persistent 'authenticated'/'error'/'timeout' listeners in guard_required branch + add pollCredentialLogin() for out-of-band frontend coordination."
expecting: "After fix, DeviceCode submission (typed code) works because session is not prematurely canceled. DeviceConfirmation phone approval also completes login out-of-band via the new 'authenticated' listener."
next_action: "CHECKPOINT — ask human to rebuild, reproduce credential login, and confirm login completes via either typed code OR phone approval."

## Resolution

root_cause: "startCredentialLogin returns { status: 'guard_required' } early for accounts with DeviceConfirmation (type 4) + DeviceCode (type 3) without attaching an 'authenticated' listener. steam-session auto-starts DeviceConfirmation polling (setImmediate(_doPoll)) when type 4 is in allowedConfirmations. When polling fires 'authenticated' (phone approves), cancelLoginAttempt() is called internally — _pollingCanceled=true, finishAuth never runs. submitSteamGuardCode then throws 'Login attempt has been canceled' from _verifyStarted(). Confirmed from [DIAG2] logs: no 'error' event (rules out poll-error), no second QR session (rules out orphaned-QR), DeviceConfirmation present, 34s silence then synchronous throw."

fix: "Attach session.once('authenticated', ...) in startCredentialLogin guard_required branch that calls finishAuth and settles credSessionState. Attach 'error' and 'timeout' with [DIAG3] logging. Remove duplicate listener registration from submitSteamGuardCode; replace with _waitForCredSession(). Add pollCredentialLogin() for frontend out-of-band completion (DeviceConfirmation phone approval path). Frontend polls steamPollCredential while on credentials-2 step."

verification: "PENDING human re-test"

files_changed:
  - src/backend/storeManagers/steam/user.ts
  - src/backend/main.ts
  - src/common/types/ipc.ts
  - src/preload/api/steam.ts
  - src/frontend/screens/Login/components/SteamLogin/index.tsx
  - src/backend/storeManagers/steam/__tests__/user.test.ts
