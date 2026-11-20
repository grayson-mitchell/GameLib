---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 11
subsystem: ipc
tags: [rust, codegen, zod, humble-login, exhaustive-match]
requires: [67-10]
provides: [all-44-rustInvoke-arms-on-generated-args, enum-exhaustive-dispatch]
key-files:
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/login_window.rs
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
    - src/backend/__tests__/keyringDiagPersistence.test.ts
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - src/backend/scanners/__tests__/scanChannelParity.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
  deleted:
    - src/backend/sidecar/__tests__/transportParity.test.ts
decisions:
  - "login_window_url_arg became login_window_parse_url(&str): only the https/URL semantic gate remains; arg extraction is the generated HumbleLoginOpenArgs::from_args"
  - "reveal_post_args / clear_storage_args kept as thin wrappers (from_args then semantic origin check, both collapsing to the single <arm>:bad-args) because tests and docs pin the names"
  - "Source-text pins locate arms through the RustInvokeChannel::<Variant> => { opener; a shared dispatch_arm_opener_name helper in main.rs tests and dispatchArmName in tauriShellSource.test.ts convert it to the wire name"
metrics:
  completed: 2026-11-08
requirements: [V67-E, V67-F]
---

# Phase 67 Plan 11: Humble-login arms and exhaustive enum dispatch Summary

The eight humble-login arms (and the login_window.rs helpers) now parse through generated `Humble*Args::from_args`, and `dispatch_rust_channel` is an exhaustive `match` on `RustInvokeChannel::from_name(channel)` with no wildcard arm. `transportParity.test.ts` is deleted. All 44 arms are on generated structs.

## Commits
- 1d17a7c58: eight humble arms, `login_window_parse_url`, per-arm pinned bad-args Rust tests
- de94fd551: enum-exhaustive dispatch, transportParity retired, source-text pins moved to the new arm shape

## Verification
- `cargo test --bin gamelib-shell`: 425 passed (424 -> 425 including the three new humble tests, which replaced two old url_arg tests).
- Mutation proof (recorded, reverted): deleting the `WakeLockStop` arm gives `error[E0004]: non-exhaustive patterns: RustInvokeChannel::WakeLockStop not covered`. This stands in for the plan's "add a dummy channel" form; it exercises the same compiler check without a throwaway regeneration.
- `pnpm check:ipc-contract` green. Prettier clean on all touched TS.
- Jest Backend: only known failures remain (steam games channel constants, bottle DRM_LAUNCH_FORM, macArch Intel, tauriShellSource `.title(`). Frontend/preload/meta suites that read Rust source pass.

## Deviations from Plan
1. **[Rule 3 - Blocking] Source-text pins** were broader than the plan listed: besides tauriShellSource, loginChromeCssInjection, keyringDiagPersistence, dialogOptionForwarding, scanChannelParity and three cargo tests in main.rs scanned the old `"name" => {` opener. All moved to the `RustInvokeChannel::Variant => {` opener. The keyring_available cargo pin builds its needle with `concat!` so SHELL_SOURCE (which includes main.rs itself) cannot self-match.
2. **Behaviour tightening, humble_login_open:** `visible` was previously leniently defaulted to false for a missing or non-bool value; the schema declares it required boolean (the TS seam always sends it), so it now returns `humble_login_open:bad-args`. Likewise `names` is a strict string array (non-string entries were silently dropped) and `csrf_token` must be present (null allowed). Callers conform and the sidecar zod boundary already enforced this.
3. **Error precedence:** user_agent bad-args now precedes the bad-url check in humble_login_open. Every string is byte-identical for its own bad input.
4. transportParity.test.ts removal also dropped its entry and doc paragraph in testContainment.test.ts.
5. rustInvokeChannel.test.ts needed no change (not edited, no prettier run).

## Known Stubs
None.

## Self-Check: PASSED
