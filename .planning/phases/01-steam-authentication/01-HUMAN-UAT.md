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
expected: Credentials tab accepts username/password → triggers SteamGuard prompt for code → submitting 5-digit code completes login and shows logged-in Runner tile
result: issue
reported: "steam guard code is not being recognised"
detail: "Error message says 'invalid code'. Guard type: EMAIL SteamGuard code."
severity: major

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
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
