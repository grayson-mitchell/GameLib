---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 03
subsystem: tooling
tags: [codegen, rust, ipc, contract, ci]
requires: [zod-4-baseline]
provides: [genIpcContract, ipc_contract.rs, check:ipc-contract, rustInvokeArgs]
affects: [67-06, 67-08, 67-10, 67-11, 67-19]
key-files:
  created:
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
  modified:
    - package.json
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src/backend/sidecar/__tests__/transportParity.test.ts
    - src/backend/testUtils/tauriShellSource.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - .github/workflows/codecheck.yml
    - .husky/pre-commit
decisions:
  - "Generator at meta/genIpcContract.ts, one entry point with --check; no generated TS output (zod schemas are the TS source)"
  - "Generated module is excluded from the jest shell-source helper (GENERATED_MODULES) but included in main.rs cargo SHELL_SOURCE"
metrics:
  completed: 2026-11-08
requirements: [V67-E, V67-F]
---

# Phase 67 Plan 03: TS-to-Rust contract generator Summary

A project-owned emitter turns the TS transport constants, the 44-entry `RUST_INVOKE_CHANNELS` list and (from 67-06) zod arg tuples into the committed `src-tauri/src/ipc_contract.rs`, gated by `pnpm check:ipc-contract` in CI and a path-filtered pre-commit step.

## Commits
- 915fe3f17: generator core + tests + empty `rustInvokeArgs`
- 2753048c6: generated `ipc_contract.rs`, hand-written consts and markers removed, marker tests retired
- f2e51b160: CI step and pre-commit block

## What changed
- `renderIpcContract` / `rustTypeFor` / `renderArgsStruct` support string, integer, number, boolean, enum, const, optional/nullable, array, object; everything else throws with channel and JSON pointer. `x-rust-value: true` is the only way to get `serde_json::Value`. No `deny_unknown_fields` is ever emitted.
- Zod 4 copies `.meta({ title, 'x-error-prefix', 'x-rust-value' })` keys straight into the JSON Schema (asserted by a test), so no `z.registry()` fallback was needed.
- The output holds the five consts and `RustInvokeChannel` (44 variants, `ALL`, `from_name`, `as_str`). `sidecar.rs` uses `RUST_INVOKE_KIND`; all five `transport-mirror` markers are gone.
- `transportParity.test.ts` is down to 2 tests (dispatch-arm set + extractor self-test); retired by 67-11.

## Verification
- genIpcContract: 13 tests green. `pnpm codecheck` green. Prettier clean on all touched prettier-parsed files (`.rs` and `.husky/pre-commit` have no parser).
- `pnpm check:ipc-contract` exits 0. Mutation proof: editing `"frontend_message"` to `"frontend_messagX"` in `ipc_contract.rs` printed `::error::src-tauri/src/ipc_contract.rs is stale; run pnpm gen:ipc-contract` and exited 1 (pnpm ELIFECYCLE); regenerated to restore.
- `cargo test --bin gamelib-shell`: 421 passed, 0 failed (2 ignored). No pre-plan baseline taken (cold target in a fresh worktree); the run is fully green.
- Jest tauriShellSource + transportParity: 254/255. The one failure ("no WebviewWindowBuilder chain passes a STRING LITERAL to .title(", `.title(format!(...))` in `store_embed.rs`) is pre-existing: the file is unchanged and HEAD already contains that call.

## Deviations from Plan
- [Rule 3] Cargo main.rs `SHELL_SOURCE_FILES` / `SHELL_SOURCE` guard test failed on the new file; added `ipc_contract.rs` to both.
- [Rule 3] The jest shell-source helper auto-discovers `src-tauri/src/*.rs`, so the generated enum inflated `"tray_set_icon" =>` arm counts. Added exported `GENERATED_MODULES` to `src/backend/testUtils/tauriShellSource.ts` (excluded from the concatenation) and honoured it in the `mod x;` resolution test in `tauriShellSource.test.ts`.
- Fresh worktree needed `pnpm build:sidecar-sea` and `vite build` before cargo would compile (known, not a code change).
- CLI main is guarded with `JEST_WORKER_ID` rather than `require.main` (esbuild bundle precedent in `buildCrossoverIndex.ts`).

## Known Stubs
`rustInvokeArgs` is intentionally `{}`; 67-06 fills it, so no arg structs are emitted yet.

## Self-Check: PASSED
