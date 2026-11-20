---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 06
subsystem: ipc
tags: [zod, codegen, rust, rustInvoke, typing]
requires: [genIpcContract, rustInvokeArgs-stub]
provides: [rustInvokeArgs-44, RustInvokeArgsOf, typed-requestRustInvoke, Args-structs]
affects: [67-08, 67-10, 67-11, 67-19]
key-files:
  modified:
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/platform/index.ts
    - src/backend/scanners/rustScan.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/sidecar/__tests__/humbleLoginFlows.test.ts
    - src/backend/sidecar/__tests__/storeEmbedFlows.test.ts
  created:
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
decisions:
  - "Plain z.object (non-strict) for rustInvoke objects; .optional()/.nullable() map to serde Option"
  - "Keyring arms use x-error-prefix 'keyring'; every other channel keeps its channel-name family"
  - "wake_lock_start kind stays z.string(); Rust owns the two-value rejection and its error"
metrics:
  completed: 2026-11-08
requirements: [V67-E]
---

# Phase 67 Plan 06: rustInvoke schemas and typed call sites Summary

All 44 `rustInvoke` channels now have a zod args tuple in `rustInvoke.ts` (`satisfies Record<RustInvokeChannel, z.ZodTuple>`), `ipc_contract.rs` carries 44 generated `<Channel>Args` structs with `from_args`, and `requestRustInvoke<C>` types its args from `RustInvokeArgsOf<C>` (type-only import, no runtime re-check).

## Commits
- ea07d4f95: 44 schemas, regenerated `ipc_contract.rs`, `rustInvokeSchemas.test.ts`, testContainment classification
- 7be9cb0bf: generic `requestRustInvoke`, dialog option typing, `invokeScan` cast, two sanity-test casts

## Verification
- `rustInvokeSchemas` (49 tests), `storeEmbedWireContract`, `rustInvokeChannel`: green. Flow suites `storeEmbedFlows`, `humbleLoginFlows`, `clipboardFlows`, `scanChannelParity`: green.
- `pnpm codecheck` exit 0; `pnpm check:ipc-contract` exit 0; `grep -c "fn from_args" ipc_contract.rs` = 44.
- `cargo test --bin gamelib-shell`: 421 passed, 0 failed (same as the 67-03 figure).
- prettier --check clean on every written prettier-parsed file (`ipc_contract.rs` has no parser).
- Wider `src/backend/(sidecar|platform|scanners)` jest run: 88/91 suites pass; the 3 failures are not caused by this plan (see Deferred).

## x-rust-value uses
none (`grep -c "x-rust-value" src/common/types/ipc/rustInvoke.ts` = 0).

## Schema vs arm disagreements (arm behaviour wins; no Rust changed)
- `humble_login_open`: arm treats `visible` as optional (`unwrap_or(false)`); zod forbids a required element after an optional one, so `visible` is required. The sidecar always sends it.
- `humble_reveal_post`: arm accepts a missing or null `csrfToken`; schema is `string | null` (required position). Sidecar always sends `?? null`. The existing Rust test "short args slice is missing, not a panic" will differ once 67-10 swaps in `from_args`.
- `humble_login_cookies*`: `names` is read leniently (non-array = empty, non-strings skipped); schema is `string[]`, so `from_args` is stricter. Sidecar always sends an array.
- `dialog_open`/`dialog_save`: the arms tolerate `null`/absent options. Schemas take an object, so call sites send `options ?? {}` (was `null` when undefined); Rust reads identically. Only wire change in the plan.
- `wake_lock_start`: arm rejects any value but the two Electron kinds with its own error; schema is `z.string()` to keep that error family.
- `dialog_message.kind`: arm maps unknown strings to Info; schema is `z.string()`.
- Keyring: `slot` optional (Rust defaults an absent slot to `steam-refresh-token`); `keyring:unknown-slot` stays Rust-side.
- `tray_set_icon`: arm treats unknown variants as Auto; schema is the 3-value enum (matches `TrayIconVariant`).

## Field-suffixed error families (input for 67-10 `x-field-errors`)
Confirmed by `grep -n 'bad-args:' src-tauri/src/store_embed.rs`:
- `store_embed_open:bad-args:{url|x|y|w|h|storeKey|homeUrl}` (plus `:bad-url:*`, `:bad-home-url:*` parse errors, and bare `store_embed_open:bad-args` for a non-object)
- `store_embed_set_bounds:bad-args:{x|y|w|h}`
- `store_embed_navigate:bad-args:url` (plus `store_embed_navigate:bad-url:*`)
Generated `from_args` for these emits only the bare `:bad-args`.

## Deviations from Plan
- [Rule 3] `testContainment.test.ts` (set-equality tripwire) needed `rustInvokeSchemas.test.ts` classified; added.
- [Rule 3] `humbleLoginFlows.test.ts` / `storeEmbedFlows.test.ts` call `requestRustInvoke('not_a_real_channel' as never, [])`; with the generic signature the args became `never`, so they pass `[] as never`.
- Plan's verify list names `abandonedInvokeAttribution`, `longRunningChannels`, `keyringDiagPersistence`, which do not exist in this tree; ran the full sidecar/platform/scanners jest tree instead.
- `invokeScan` uses a single `as RustInvokeArgsOf<C>` (TS cannot resolve the generic indexed access); not an `as unknown as` cast.
- Prettier reformatted `rustScan.ts` only; the other written files were already clean.

## Deferred (out of scope, pre-existing)
- `testContainment` still lists `ipcSchemaCoverage.test.ts` and `ipcValidation.test.ts` as unclassified (added by earlier 67 plans).
- `steamFocusRefreshWire` T-A "stripped source declares the const": `SHELL_WINDOW_FOCUSED` moved out of `main.rs` in 67-03.
- `sidecarRejectionGuard.test.ts` failed in the wide run; not touched by this plan's files.

## Known Stubs
None.

## Self-Check: PASSED
