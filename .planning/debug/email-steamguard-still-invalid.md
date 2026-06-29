---
status: resolved
slug: email-steamguard-still-invalid
trigger: "Email Steam Guard credential login still fails with 'invalid code' after the 01-04 normalization fix — confirmed on a fresh build (input visibly uppercases) by real human re-test on 2026-06-29."
created: 2026-06-29
updated: 2026-06-29T21:00:00Z
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

## Evidence

- timestamp: 2026-06-29 — Human re-test on fresh build: input uppercases (new code live), correct emailed code still rejected as "invalid code". Normalization hypothesis eliminated.

- timestamp: 2026-06-29 — Frontend audit (SteamLogin/index.tsx): handleGuardSubmit sets loading=true before IPC call; the submit button is disabled={guardCode.length < 5 || loading}. No path for double-submission via button click. No useEffect watches credentials step to re-trigger startCredentialLogin.

- timestamp: 2026-06-29 — Backend instrumentation added (user.ts): invocation counter, startWithCredentials response, normalized code length + session identity check, real EResult in 'error' handler + catch block.

- timestamp: 2026-06-29 — Human reproduction on instrumented build. Captured [DIAG] output:
  - "[DIAG] submitSteamGuardCode: normalized length=5, session=matches (no race)"
  - "Steam: [DIAG] submitSteamGuardCode FAILED (sync throw): EResult=unknown, message=Login attempt has been canceled, raw=Error: Login attempt has been canceled"

- timestamp: 2026-06-29 — Source analysis of steam-session: LoginSession.js:486-488 auto-cancels when totalPollingTime >= this.loginTimeout by calling this.cancelLoginAttempt(). Default loginTimeout = 30000ms (LoginSession.js:93). When _pollingCanceled === true, submitSteamGuardCode throws synchronously at LoginSession.js:278-279 with "Login attempt has been canceled".

- timestamp: 2026-06-29 — Confirmed root cause: QR path (user.ts) explicitly sets session.loginTimeout = 120000 before startWithQR(). Credential path creates LoginSession but NEVER sets loginTimeout → inherits 30s default → email retrieval reliably exceeds 30s → session auto-canceled → submitSteamGuardCode throws synchronously → surfaced as "invalid code" to the user.

## Current Focus

hypothesis: "CONFIRMED — credential session loginTimeout never set; inherits 30s default; email retrieval exceeds 30s; steam-session auto-cancels polling; submitSteamGuardCode throws 'Login attempt has been canceled'"
test: "Fix applied: session.loginTimeout = 180000 added to startCredentialLogin before startWithCredentials(). All [DIAG] instrumentation removed. Regression test added. 47/47 tests pass."
expecting: "Human re-test will confirm email SteamGuard code now completes login."
next_action: "RESOLVED — awaiting human re-test (Test 2 in 01-HUMAN-UAT.md)"

## Resolution

root_cause: "startCredentialLogin created a LoginSession without setting loginTimeout. The default is 30s (LoginSession.js:93). Email SteamGuard code retrieval + user input reliably exceeds 30s. steam-session auto-cancels polling at that threshold (LoginSession.js:486-488). submitSteamGuardCode then throws synchronously ('Login attempt has been canceled', LoginSession.js:278-279) because _pollingCanceled === true. This is surfaced to the user as the generic 'invalid code' error. The QR path correctly sets loginTimeout = 120000 but the credential path was never updated to match."

fix: "Set session.loginTimeout = 180000 in startCredentialLogin immediately after new LoginSession() and before session.startWithCredentials(), mirroring the QR path. Removed all [DIAG] instrumentation. Kept EResult/message logging in the 'error' handler and catch block as permanent clean improvements (non-[DIAG]) since the error was previously invisible. Added regression test asserting loginTimeout >= 120000 is set on the session before startWithCredentials() is called."

verification: "npm run codecheck: 0 TypeScript errors. npm test (steam/__tests__/user): 47/47 pass including new regression test 'sets loginTimeout >= 120000 on the credential session before startWithCredentials is called'. Fix committed."

files_changed:
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
