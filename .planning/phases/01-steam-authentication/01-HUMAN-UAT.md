---
status: partial
phase: 01-steam-authentication
source: [01-VERIFICATION.md]
started: 2026-06-27T00:00:00.000Z
updated: 2026-06-27T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. QR code login end-to-end
expected: Clicking the Steam tile → /loginweb/steam → QR tab shows a scannable code → scanning with Steam mobile app logs in and shows "Logged in as {username}" on the Runner tile
result: [pending]

### 2. Username/password + SteamGuard login
expected: Credentials tab accepts username/password → triggers SteamGuard prompt for code → submitting 5-digit code completes login and shows logged-in Runner tile
result: [pending]

### 3. Logout flow
expected: Clicking Log Out on the Steam Runner tile calls steamLogout, clears session, and returns to the unauthenticated tile state
result: [pending]

### 4. Steam client not-installed warning
expected: On a machine without Steam installed, the /loginweb/steam screen shows a warning with a "Download Steam" button linking to store.steampowered.com/about/ and a "Return to Login" button
result: [pending]

### 5. Steam tile visual rendering
expected: The Steam Runner tile is always visible on the Manage Accounts screen with the Steam (fa-brands) icon, correct label, and no experimental-feature gate
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
