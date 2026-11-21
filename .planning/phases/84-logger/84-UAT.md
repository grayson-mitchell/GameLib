---
status: testing
phase: 84-logger
source: [84-VERIFICATION.md]
started: 2026-11-21T09:40:00Z
updated: 2026-11-21T09:40:00Z
---

## Current Test

number: 1
name: Windows and unix CI legs
expected: |
  All three rust-test.yml legs and test.yml green on a pushed head
awaiting: user response

## Tests

### 1. Windows and unix CI legs (Windows rotation with a held .old, Windows paths, unix 0600 on CI, win32 clippy ceiling, jest on ubuntu)
expected: All three rust-test.yml legs and test.yml green on a pushed head
result: [pending]

### 2. Live smoke:exit-check
expected: `pnpm smoke:exit-check` in live mode reports PASS against a running app quit with Cmd+Q
result: [pending]

### 3. Accept or amend the two live-contract defects recorded by 84-11 (UAT item 4 header premise; item 7 crate-origin wording)
expected: Item 4: the contract names the header a GOG launch really writes, or picks a runWineCommand path. Item 7: the origin rule excludes the three `[steam*] rust <channel>` templates. Neither changes a Phase 84 code path
result: [pending]

### 4. Triage the 11 open code-review findings in 84-REVIEW-DISPOSITION.md (WR-01..WR-07, IN-01..IN-04)
expected: Each set to fixed, skipped or deferred. WR-02 (raw CR/LF on shell and crate-bridge lines, now in the uploaded file) and WR-03 (store persist can truncate the live file before Phase 85 widens it) are the two the reviewer flags as needing a fix before the next phase
result: [pending]

### 5. Accept that delete-uploaded has no UI control
expected: Criterion 2's "from the UI" is read as met for upload and show-in-folder (live) and for delete-uploaded by the localhost round-trip test, because the delete button was already commented out before Phase 84 and dpaste.com has no delete endpoint
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
