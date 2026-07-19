---
status: complete
phase: 01-steam-authentication
source: [01-VERIFICATION.md, quick/260629-9ly-fix-qr-login-library-race]
started: 2026-06-27T00:00:00.000Z
updated: 2026-06-29T00:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. QR code login end-to-end (+ library appears without reload)
expected: Clicking the Steam tile → /loginweb/steam → QR tab shows a scannable code → scanning with Steam mobile app logs in, the Runner tile updates to "Logged in as {username}" (real persona name, NOT "Steam User"), AND Steam games appear in the unified library grid WITHOUT a reload/restart
result: pass
note: "User confirmed library appeared without reload (validates quick task 260629-9ly QR-login library race fix)"

### 2. Username/password + SteamGuard login
expected: Credentials tab accepts username/password → triggers SteamGuard prompt for code → submitting 5-character (alphanumeric email OR numeric authenticator) code completes login and shows logged-in Runner tile
result: pass
note: |
  Three-pass fix history (for accurate record):
  Pass 1 (01-04, merged 3e4863d) — INSUFFICIENT: Added trim().toUpperCase() normalization (frontend + backend). Confirmed live on a fresh build (input uppercases). Error unchanged.
  Pass 2 (debug session, first round) — loginTimeout=180000 fix applied. Human rebuilt and re-tested (2026-06-29 ~20:56). SAME error. loginTimeout was INSUFFICIENT.
  Pass 3 (debug session email-steamguard-still-invalid, [DIAG2] capture + confirmed root cause, 2026-06-29) — HUMAN VERIFIED PASS.
  TRUE ROOT CAUSE: Account has DeviceConfirmation (type 4) + DeviceCode (type 3). Steam-session auto-starts DeviceConfirmation polling (setImmediate(_doPoll)) when type 4 is in allowedConfirmations. Polling fires 'authenticated' (phone push), cancelLoginAttempt() sets _pollingCanceled=true. No 'authenticated' listener was attached in the guard_required branch so finishAuth() never ran and submitSteamGuardCode() threw "Login attempt has been canceled". NOT casing, NOT idle loginTimeout, NOT a QR session race.
  Fix (commit 9ae8625): attach session.once('authenticated'/'error'/'timeout') in guard_required branch of startCredentialLogin; submitSteamGuardCode waits on _waitForCredSession(); added pollCredentialLogin() + frontend steamPollCredential 2s poll for out-of-band phone-approval completion.
  Human verified 2026-06-29: Path A (typed DeviceCode) completes credential login — Runner tile shows persona.

### 3. Logout flow
expected: Clicking Log Out on the Steam Runner tile calls steamLogout, clears session, and returns to the unauthenticated tile state
result: pass

### 4. Steam client not-installed warning
expected: On a machine without Steam installed, the /loginweb/steam screen shows a warning with a "Download Steam" button linking to store.steampowered.com/about/ and a "Return to Login" button
result: pass

### 5. Steam tile visual rendering
expected: The Steam Runner tile is always visible on the Manage Accounts screen with the Steam (fa-brands) icon, correct label, and no experimental-feature gate
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Submitting a valid 5-character SteamGuard code completes credential login and shows the logged-in Runner tile"
  status: resolved
  test: 2
  root_cause: "startCredentialLogin returned guard_required without attaching an 'authenticated' listener. For accounts with DeviceConfirmation (type 4) + DeviceCode (type 3), steam-session auto-starts DeviceConfirmation polling (setImmediate(_doPoll)). Polling fires 'authenticated' silently → cancelLoginAttempt() → _pollingCanceled=true. submitSteamGuardCode then threw 'Login attempt has been canceled' from _verifyStarted(). Confirmed via [DIAG2] log capture (2026-06-29 21:13). NOT casing, NOT idle loginTimeout, NOT a QR session race."
  fix: "Attach session.once('authenticated'/'error'/'timeout') in guard_required branch before returning to frontend. submitSteamGuardCode uses _waitForCredSession() (shared settle). Added pollCredentialLogin() + frontend 2s credPollInterval for out-of-band DeviceConfirmation phone-approval path."
  debug_session: .planning/debug/resolved/email-steamguard-still-invalid.md
  commits:
    - "9ae8625 — guard-time listener fix (the real fix)"
    - "3e4863d — normalization fix 01-04 (confirmed insufficient, retained as defense-in-depth)"
