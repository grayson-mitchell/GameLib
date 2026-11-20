---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 10
subsystem: ipc
tags: [rust, codegen, zod, store-embed]
requires: [67-08]
provides: [x-field-errors-generator-meta, 36-arms-on-generated-args]
key-files:
  modified:
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
decisions:
  - "x-field-errors tuple meta: single-object tuples emit from_args that returns <prefix>:bad-args for a missing/non-object arg and <prefix>:bad-args:<prop> for the first failing property in declared order; misuse (non-object or multi-element tuple, non-scalar property) throws naming the channel"
  - "Parse helpers store_embed_open_args/set_bounds_args/navigate_args kept as thin wrappers over from_args (names are pinned by tests and docs); only the URL semantic parsing stays in them"
metrics:
  completed: 2026-11-08
requirements: [V67-E]
---

# Phase 67 Plan 10: store_embed arms on generated Args Summary

The generator gained `x-field-errors`, and the ten `store_embed_*` arms now parse through generated `StoreEmbed*Args::from_args`. The three field-suffixed families (open: url/x/y/w/h/storeKey/homeUrl, set_bounds: x/y/w/h, navigate: url) are generated from the schema, with no hand-written `value.get(...)` ladder left.

## Commits
- 4172e17b4: generator x-field-errors, three tuples tagged, ipc_contract.rs regenerated
- 39ecf3143: arm migration plus per-suffix Rust tests

## Verification
- genIpcContract jest: 19 passed (6 new, incl. two `toThrow` misuse cases). `pnpm check:ipc-contract` green.
- `cargo test --bin gamelib-shell`: 424 passed (421 + 3 new per-suffix tests); wire-contract tests, including the positional-shape rejection, unmodified and green.
- Jest Backend (`src/backend`): only known failures (steam games channel constants, bottle DRM_LAUNCH_FORM, macArch Intel, tauriShellSource `.title(`). tauriShellSource pins and storeEmbedWireContract needed no change.
- prettier clean on the TS files touched (meta/genIpcContract.ts, its test, rustInvoke.ts). The task named tauriShellSource.test.ts and storeEmbedWireContract.test.ts for prettier; they were not modified so were not checked.

## Deviations from Plan
**1. Helpers kept, not deleted.** The plan allowed deleting unused helpers; the three are still called by arms, main.rs tests and doc pins, so they now wrap `from_args` instead.
**2. Error precedence nuance.** Previously `store_embed_open:bad-url` could fire before `bad-args:x` when both the url string and a later field were bad; now all field checks run first, then URL parsing. Each string is still byte-identical for its own bad input.
**3. Zero-arg arms** call `from_args(args)?` and ignore the result (extra args tolerated, matching 67-08).

## Known Stubs
None.

## Self-Check: PASSED
