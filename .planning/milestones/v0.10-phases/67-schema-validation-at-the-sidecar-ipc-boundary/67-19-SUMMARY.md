---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 19
subsystem: ipc
tags: [ipc, allow-list, tauri-relay, generator]
requires: [67-18, 67-11]
provides: [RENDERER_CHANNELS, is_renderer_channel, IPC_INVALID_CHANNEL_MARKER, relay_channel_verdict]
key-files:
  created:
    - src/backend/sidecar/__tests__/rendererAllowList.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/relay_commands.rs
    - src/frontend/bootErrorSurface.ts
    - src/frontend/__tests__/bootErrorSurface.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
decisions:
  - "The allow-list is computed from channelSchemas (the inbound-keyed map) only, never collidingPushSchemas, filtered to caller renderer and kind invoke|send. A push that shares a name with an inbound channel lives in collidingPushSchemas, so the push never opens or removes the renderer direction; a name is on the list only because of its invoke/send entry. Push-only names are absent (test asserts it)."
  - "echo_channel keeps printable ASCII only (others become ?) and cuts to 64 chars, so a hostile name yields an error under 200 bytes regardless of multibyte input."
  - "RENDERER_CHANNELS is byte-sorted for binary_search; the test checks byte order, not just JS sort."
metrics:
  completed: 2026-11-08
requirements: [V67-E]
---

# Phase 67 Plan 19: Renderer channel allow-list in the Rust relay

The generator now emits a sorted `RENDERER_CHANNELS` (245 names) and `is_renderer_channel`, and `sidecar_invoke` / `sidecar_send` refuse anything else before the pipe with `[GAMELIB_IPC_INVALID_CHANNEL] channel not allowed: <truncated>`. `sidecar_send` also logs the truncated name through `shell_eprintln!`. `sidecar_store_snapshot` and `open_external` are untouched.

## Commits
- 9c5821052 generator + RENDERER_CHANNELS + rendererAllowList test
- 6894a58c3 relay enforcement, Rust tests, bootErrorSurface marker

## Verification
- genIpcContract 22/22, rendererAllowList 6/6 (preload surface found, TS computation equals the generated Rust list, byte-sorted, excluded names absent, push-only names absent), bootErrorSurface 4/4, testContainment 55/55.
- `cargo test --bin gamelib-shell`: 429 passed, including the four `ipc_contract_relay_*` tests. `pnpm check:ipc-contract`, `pnpm codecheck`, prettier on all touched TS: green.
- Full Meta project (minus Wine harness): only the known genI18nGateScope A-17 and logSecretGate failures. Frontend project: 301/301 suites. Backend `src/backend/sidecar`: only known failures plus those under Deferred.

## Deviations from Plan
- [Rule 3] Added `rendererAllowList.test.ts` to STRUCTURALLY_CONTAINED_SUITES in testContainment.test.ts (required by repo convention).

## Deferred Issues
`src/backend/__tests__/loginChromeCssInjection.test.ts` (2) and `tauriShellSource.test.ts` (Plan 08 tests 1 and 2) fail: they search main.rs for `RustInvokeChannel::HumbleLoginOpen => {`, but 67-10/67-11 moved that arm to `store_embed.rs`. Not caused by this plan (no overlap in files); the test's `loadMainRsCode` needs to read store_embed.rs too.

## Self-Check: PASSED
