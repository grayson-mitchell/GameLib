---
phase: 62-module-boundaries-and-decomposition
plan: 04
subsystem: testing
tags: [sidecar, tauri, parity, jest]
requires: [62-01, 62-02]
provides:
  - TS<->Rust transport constant parity test (D-12)
affects: [main.rs split plans]
key-files:
  created:
    - src/backend/sidecar/__tests__/transportParity.test.ts
  modified:
    - src-tauri/src/sidecar.rs
key-decisions:
  - "Rust mirrors located by `// transport-mirror: NAME` markers over all src-tauri/src/*.rs, so the test survives the main.rs split"
requirements-completed: [D-12]
duration: 10min
completed: 2026-11-06
---

# Phase 62 Plan 04: Transport parity test Summary

Jest test pinning four Rust consts, the `rustInvoke` kind and the 37 `dispatch_rust_channel` arms to their TS counterparts, found by marker comment, no cargo.

## Commits
- ddd9d50b6: chore(62-04) five transport-mirror markers in sidecar.rs (comment-only diff)
- see git log: test(62-04) transportParity.test.ts

## Deviations
- `RUST_INVOKE_KIND` is not a Rust const; it is `kind == Some("rustInvoke")`, so the extractor takes the first string literal on the line after the marker for that one.
- Drift proofs run: `"frontend_message"` -> `"frontend_messagex"` and `"keyring_get"` -> `"keyring_getx"` each failed the test; both reverted.

## Deferred
- `tauriShellSource.test.ts` `.title(format!` assertion fails against store_embed.rs; pre-existing, logged in deferred-items.md.

## Verification
transportParity 5/5, codecheck, depcruise --ignore-known, boundaryRatchet (136/65), prettier all green.

## Self-Check: PASSED
