---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 02
subsystem: steam-polling
status: complete
tags: [rust, rustinvoke, steam, adoption, zod, ipc-contract]
requires: [81-01]
provides:
  - steampoll_adoption_watch, steampoll_adoption_unwatch, steampoll_adoption_read on all four layers (crate, shell, TS transport, TS mirror)
  - Facade.adoption (AdoptionWatch) built in the crate facade
  - RUST_STEAMPOLL_ADOPTION_READ|UNWATCH|WATCH, zod schema adoptionWatchArgs, AdoptionReading type
affects: [81-03, 81-04, 81-05, 81-09]
tech-stack:
  added: []
  patterns: [one op per layer with per-op bad-args strings, ipc_contract.rs regenerated from the TS contract, block_on with wrong-thread error string instead of a panic]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-steampoll/src/dispatch.rs
    - src-tauri/crates/gamelib-steampoll/tests/dispatch.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/storeManagers/steam/pollRust/steamPollTypes.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/steamPollChannelParity.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/mockedFsSteamFiles.ts
decisions:
  - "zod string bounds on adoptionWatchArgs are refinements, not .regex()/.min()/.max(): genIpcContract rejects JSON Schema pattern and length keywords, so refine keeps zod strict while the generator sees plain strings"
  - "the generated shell arg structs carry no deny_unknown_fields; an unknown key is rejected by the crate's strict parse (same op-named bad-args string), which runs before any facade lookup"
metrics:
  tasks: 2
  files: 12
  completed: 2026-11-18
commits: 3
plan_head_before: 8182ed7652caed6bc6b9ab7001edd55fdd84bc73
plan_head_after: 610af158d5073e6ed57e36166baf6ea7d5a74dda
actuals:
  tokens: 40000
  tasks: 2
  commits: 3
---

# Phase 81 Plan 02: adoption ops on the rustInvoke contract Summary

The sidecar can now start, stop and query the 81-01 Rust adoption watch through `steampoll_adoption_watch`, `steampoll_adoption_unwatch` and `steampoll_adoption_read`, each present on the crate op table, the shell router and the TS transport and zod mirror, with malformed args answering the op's own `<op>:bad-args` and a read from inside a runtime answering `wrong-thread` instead of panicking.

## Commits

- 82dc32251: feat(81-02) steampoll_adoption_watch through crate, shell and TS transport (tracer)
- 610af158d: feat(81-02) steampoll_adoption_unwatch and steampoll_adoption_read on every layer

`commits: 3` is the measured `plan_head_before..HEAD` count. One of the three, `bee2fd4d5` (docs(47) ITAD coverage matrix), was committed by a concurrent session between the two task commits and is not this plan's; the plan itself made 2.

## What was built

- **Crate.** `Facade.adoption: AdoptionWatch` built in `build()` from the registry, outbox, platform and default Steam path. Three match arms: watch parses `AdoptionWatchArgs`, validates, answers `true`; unwatch parses `AppOnly` and answers whether the app was watched; read validates then `block_on`s `adoption.read` and answers the `AdoptionReading` JSON. OPS stays sorted. Tests in `tests/dispatch.rs` cover OPS membership, a watch round trip against the facade, bad-args (relative path, non-numeric appId, unknown field), unwatch true/false, the read shape, that a read registers nothing, and the in-runtime `wrong-thread` answer.
- **Shell.** `rpc_steampoll_adoption_{watch,unwatch,read}` and the one-line router arms; the channel enum, name maps and `SteampollAdoption{Watch,Read,Unwatch}Args` structs came from `pnpm gen:ipc-contract`, not by hand (`ipc_contract.rs` is `@generated`). Shell unit tests assert the structs accept the zod-shaped objects and that malformed or unknown-key args answer the op's bad-args.
- **TS.** Three transport consts in both channel lists, the strict `adoptionWatchArgs` schema (read and watch) and `pollAppArg` (unwatch), `STEAMPOLL_OPS` entries, the `AdoptionReading` interface, the `mockedFsSteamFiles` op entries, and updated arm and channel count literals.

## Verification

`cargo test -p gamelib-steampoll --test dispatch` (13 passed), `cargo clippy -p gamelib-steampoll --all-targets -D warnings` clean, `cargo fmt -p gamelib-steampoll --check` clean, `cargo test --bin gamelib-shell steampoll` (16 passed), `rustfmt --check src/steampoll_dispatch.rs` clean, `pnpm check:ipc-contract` fresh, `pnpm codecheck` clean, prettier clean on every touched TS file (none prettier-ignored). Jest: steamPollChannelParity, rustInvokeSchemas and the whole tauriShellSource file (289) pass, including the two arm-count tests the plan expected to be red; the localFiles directory passes except one pre-existing failure (below). The `-t 'steampoll'` run selects the 3 lifecycle tests.

## Deviations from Plan

**1. [Rule 3 - Blocking] zod string bounds became refinements.** The plan specified `z.string().regex(...)`, `.min(1).max(4096)`, `.max(1048576)`. `genIpcContract` fails on JSON Schema `pattern` (and has no length keywords), so `pnpm gen:ipc-contract` could not run. The bounds are now `.refine()` calls, which zod enforces and the generator ignores. The number bounds (`steamPid` 0..4294967295, finite `recordedAtMs`) stay as written. The crate's `validate_watch_args` still enforces everything (T-81-06 intact at the TS and crate layers).
- **Files:** src/common/types/ipc/rustInvoke.ts
- **Commit:** 82dc32251

**2. [Rule 3 - Blocking] Shell structs are generated, not hand-written.** The plan described hand-written `SteampollAdoptionWatchArgs` with `deny_unknown_fields` and `installAppFallback` defaulting to false, and a read that reuses the watch struct. `ipc_contract.rs` is `@generated` from the TS contract (DO NOT EDIT), so the structs are generator output: no `deny_unknown_fields`, `installAppFallback: Option<bool>` with `#[serde(default)]`, and a separate `SteampollAdoptionReadArgs`. Unknown keys are therefore refused one layer down, by the crate's strict parse, with the same op-named bad-args; the shell test asserts that observable behaviour.
- **Files:** src-tauri/src/ipc_contract.rs, src-tauri/src/steampoll_dispatch.rs
- **Commits:** 82dc32251, 610af158d

**3. [Rule 3 - Blocking] Count literals in two more tests.** `steamPollChannelParity.test.ts` (`OPS` length) and `rustInvokeSchemas.test.ts` (`RUST_INVOKE_CHANNELS` length) pin the totals, so they had to be raised (24 to 27, 112 to 115). The plan's "passes without edits" was about the drift comparison, not these literals. The `tauriShellSource` arm-count test was raised as planned (112 to 115) and passes.

**4. [Rule 2 - dead-code gate] `AdoptionReading` tagged `@public`.** `pnpm find-deadcode` flagged the new export as unused until 81-03 consumes it; tagged `@public` with that justification, as `STEAMPOLL_OPS` already is.

**5. [Doc] Module docs.** Updated the channel count and "three async ops" wording in `dispatch.rs` and `steampoll_dispatch.rs` headers.

TDD: RED observed for both tasks (compile error for `facade.adoption`; failing OPS and `unknown-op` assertions) before the implementation.

## Deferred / pre-existing

- `acfUpdateReplay.test.ts` fails with `no oracle case acfUpdate/readLocalConfigBetaKey/playtime/10`. Reproduced with 81-02's mock edit reverted, so pre-existing; logged in `deferred-items.md`.
- `pnpm backend-di-ceilings` (3 files) and `pnpm find-deadcode` (`NativePortDataStyle`, `NativePortMac`) remain red as already logged by 81-01; nothing new from this plan.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model; T-81-06 is mitigated by the zod schema, the crate's `deny_unknown_fields` structs and `validate_watch_args` (the shell struct layer cannot enforce it, see deviation 2).

## Self-Check: PASSED

Both task commits (82dc32251, 610af158d) are ancestors of HEAD; every modified file listed above exists; acceptance greps met (dispatch.rs 6, rpc_steampoll_adoption_ 6, SteampollAdoption in rust_dispatch.rs 3, RUST_STEAMPOLL_ADOPTION_ in sidecarTransport.ts 9, steamPollTypes.ts 3).
