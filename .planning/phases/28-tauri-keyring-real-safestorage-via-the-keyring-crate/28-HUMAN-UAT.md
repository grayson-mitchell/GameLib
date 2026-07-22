---
status: partial
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
source: [28-VERIFICATION.md, 28-PROOF.md]
started: 2026-07-22
updated: 2026-07-22
blocked_by: no login channel in the Tauri build (D-02/D-03) — port lands in a later phase
---

## Current Test

[blocked — see Gaps]

## Tests

### 1. `openExternal` frame reaches Steam from the Tauri build (REQ-28-05)
expected: With a signed-in library in the Tauri build, launching a Steam game opens Steam via
`steam://rungameid/{appId}`. Before Phase 28 the frame was silently dropped in the Rust reader
thread (`src-tauri/src/main.rs`); plan 28-02 fixed the drop, but the fix has never been exercised
end-to-end on hardware.
result: [pending — NOT VERIFIED]
blocker: The Tauri build starts signed-out by design (D-02/D-03) and no login channel is wired,
so no game is launchable. This cannot be tested until the phase that ports the login channel
lands. Verified in code and by unit coverage only.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 1

## Gaps

- **REQ-28-05 `openExternal` end-to-end** — structurally blocked, not a defect. Re-run this item
  as soon as the Tauri build can sign in. Tracked as verification gap 2 in 28-VERIFICATION.md.

## Hardware verification already completed this phase

Recorded in 28-PROOF.md; listed here so an auditor does not re-request them:

- REQ-28-01 — real Keychain round-trip, byte-identical. PASS.
- REQ-28-06 — user clicked Deny; produced
  `PlatformFailure(Error { code: -128, message: "User canceled the operation." })`.
  Closes RESEARCH Assumption A1: the variant is `PlatformFailure`, NOT `NoStorageAccess`.
  Consequence: a denial cannot be distinguished from a broken keychain by variant alone —
  callers must inspect OSStatus -128. PASS.
- REQ-28-07 — fresh Keychain prompt after each rebuild, across two independent
  seed→rebuild→verify cycles. D-08's accepted friction, confirmed. PASS.
- REQ-28-02 — with a real signed-in baseline (818 bytes, md5
  958bf6829589f20a8de935ebf7c2502b, 378 library entries), the Electron store was byte-identical
  after all Tauri launches and after a full 826-test suite run. PASS.
