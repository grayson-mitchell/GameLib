---
status: resolved
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
result: issue
reported: "steam guard code is not being recognised"
detail: "Error message says 'invalid code'. Guard type: EMAIL SteamGuard code."
severity: major
resolution: "Fixed in plan 01-04 (commits febb573, 2c642a2, e90536d, merged 3e4863d). Email codes are 5-char alphanumeric; guard input no longer assumes numeric, code is normalized (trim + uppercase + whitespace strip) on the frontend and as defense-in-depth in backend submitSteamGuardCode; messaging now guard-type aware. 136/136 steam tests pass. NEEDS HUMAN RE-TEST with a real email SteamGuard code to confirm end-to-end."

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
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Submitting a valid 5-digit SteamGuard code completes credential login and shows the logged-in Runner tile"
  status: failed
  reason: "User reported: steam guard code is not being recognised. Error message displays 'invalid code'. Guard type is EMAIL SteamGuard (not mobile authenticator)."
  severity: major
  test: 2
  root_cause: "Email SteamGuard codes are 5-character ALPHANUMERIC (uppercase letters + digits), but the guard input assumes numeric TOTP-style codes. SteamLogin/index.tsx uses inputMode='numeric', '5-digit' framing, and performs NO trim()/toUpperCase() normalization before submit. The alphanumeric email code is forwarded verbatim (transport + steam-session are provably correct — steam-session auto-selects EAuthSessionGuardType.EmailCode and sends the code unmodified) and Steam rejects it as InvalidLoginAuthCode (65), surfaced as the generic 'invalid code'. The email path was never implemented for alphanumeric input nor tested (all fixtures use numeric '12345')."
  artifacts:
    - path: "src/frontend/screens/Login/components/SteamLogin/index.tsx"
      issue: "Guard input (lines ~387-401) uses inputMode='numeric' + '5-digit' framing; no case/whitespace normalization before steamSubmitGuard; error message (~199-213) is authenticator-specific, not guard-type aware"
    - path: "src/backend/storeManagers/steam/user.ts"
      issue: "submitSteamGuardCode (~387-425) is correct but is the natural place for defense-in-depth normalization (trim + uppercase)"
    - path: "src/backend/storeManagers/steam/__tests__/user.test.ts"
      issue: "Guard fixtures (~541-578) are numeric-only ('12345'/'99999'); no alphanumeric email-code coverage masked the gap"
  missing:
    - "Treat guard code as alphanumeric: drop inputMode='numeric' and '5-digit' framing in the input"
    - "Normalize code with .trim().toUpperCase() (in the onChange/submit handler and/or backend submitSteamGuardCode as defense-in-depth)"
    - "Make the SteamGuard error message guard-type aware ('email or authenticator code')"
    - "Add a regression test exercising an alphanumeric email code (e.g. 'KQM4F') through the EmailCode path"
  debug_session: .planning/debug/email-steamguard-code-rejected.md
  specialist_hint: react
  status_resolved: "Fixed in plan 01-04 (merge 3e4863d). Frontend + backend normalization, guard-type-aware messaging, alphanumeric EmailCode regression tests. 136/136 steam tests pass. Pending human re-test with a real email code."
