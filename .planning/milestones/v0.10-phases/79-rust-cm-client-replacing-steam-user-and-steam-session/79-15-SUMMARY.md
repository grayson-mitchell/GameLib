---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 15
subsystem: steam-cm
tags: [ipc, rustInvoke, typescript, contract]
requires: [79-14]
provides:
  - "24 RUST_STEAMCM_* channels in RUST_INVOKE_CHANNELS and RUST_STEAMCM_CHANNELS"
  - "strict zod arg schemas mirroring the Rust arg structs; regenerated ipc_contract.rs"
  - "16 channels exempt from the sidecar's generic 60 s cap"
  - "steamCmChannelParity test (shell-arm case skipped until 79-16)"
affects: [79-16]
key-files:
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
  created:
    - src/backend/__tests__/steamCmChannelParity.test.ts
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 15: TS channel contract for the Rust CM client

The TS side can address every Rust CM op (24 = OPS minus `steamcm_capture_anon_pics`), with strict arg schemas, a regenerated Rust enum, and a parity test.

## Commits

- 5af662a9d feat(79-15): channels, schemas, generated contract, timeout exemptions
- d11cc27f7 test(79-15): steamCmChannelParity

## Deviations from Plan

1. **[Rule 3] Existing count assertion.** `rustInvokeSchemas.test.ts` hard-coded 59 channels; updated to 83.
2. **Acceptance grep note.** `grep -c "= 'steamcm_"` finds 17, not 24, because prettier wraps long const lines onto two lines; all 24 constants exist (parity test asserts it).
3. The shell crate will not compile until 79-16 adds the match arms; this is the intended compile-error gate (not run here).

## Verification

check:ipc-contract, tsc, jest (sidecar + common + parity) and prettier pass. One run of `rustInvokeChannel.test.ts` failed once and passed on rerun (timing flake, unrelated).

## Known Stubs

None. The shell-arm parity case is `describe.skip` by design; 79-16 flips it.

## Self-Check: PASSED
