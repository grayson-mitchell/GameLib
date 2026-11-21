---
status: testing
phase: 83-native-seam-gamelib-core-and-process-shutdown-contract
source: [83-VERIFICATION.md]
started: 2026-11-21T04:10:00Z
updated: 2026-11-21T04:10:00Z
---

## Current Test

number: 1
name: Live item 1 residue (G-83-11-1): Force Quit with a real watchdog/nettop running, after snapshot within 5 s
expected: |
  No watchdog sh, no nettop, no reaper, no sidecar group member, no Rust helper within 5 s; steam:// game alive; `[reaper] parent gone: signalled ` in the transcript. Alternative the contract owner may choose: record that the watchdog/nettop sub-check is dropped (see 83-VERIFICATION.md).
awaiting: user response

## Tests

### 1. Live item 1 residue (G-83-11-1): Force Quit with a real watchdog/nettop running, after snapshot within 5 s
expected: No watchdog sh, no nettop, no reaper, no sidecar group member, no Rust helper within 5 s; steam:// game alive; `[reaper] parent gone: signalled ` in the transcript. Alternative the contract owner may choose: record that the watchdog/nettop sub-check is dropped (see 83-VERIFICATION.md).
result: [pending]

### 2. Live item 3 residue (G-83-11-2): compare the nav shell's version link with the About dialog Version, and capture the browser's pre-redirect URL for the machine-translation report link
expected: Nav shell version equals About `Version:` equals package.json (0.8.0); report link targets the GameLib GitHub new-issue URL (or the sign-in redirect is accepted as the observation)
result: [pending]

### 3. Windows and Linux live runs of the quit/kill gate (optional, recorded for completeness)
expected: No orphaned helper after a graceful quit and after killing GameLib on a real build
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
