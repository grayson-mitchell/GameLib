---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 05
subsystem: infra
tags: [rust, tauri, rustinvoke, safety, fail-closed, ipc-contract, zod, known-installs, test-utils]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-02 assertAtOrAboveFloor census helper; 82-03 gamelib-safety crate (dispatch ops, wire types), gamelib-testutil FakeHome, src/common/types/safety.ts"
provides:
  - "Shell wiring for safety_check_removal and safety_remove_tree: safety_dispatch.rs arms, generated ipc_contract.rs, zod tuples, RUST_SAFETY_* constants on the rustInvoke allowlist, parity test"
  - "src/backend/safety/rustSafety.ts: checkRemoval, removeTree, guardedRemoveTree, firstBlockingItem; the only catch around a safety rustInvoke"
  - "src/backend/safety/knownInstalls.ts: collectKnownInstalls, knownInstallKey, titleForKnownKey (cross-store, D-16)"
  - "src/backend/safety/protectedRoots.ts: protectedRootsFor (settings and app paths only)"
  - "src/backend/testUtils/rawRecursiveDeletes.ts: findRawRecursiveDeletes, scanGuardedFiles for the per-plan raw-delete gates"
  - "src/backend/testUtils/fakeSafetyRust.ts: fakeSafetyRustInvoke, a jest.mock-free transport fake"
affects: [82-06, 82-07, 82-08, 82-09, 82-11, 83-gamelib-core]

actuals:
  tokens: 14000
  tasks: 2
  commits: 3
plan_head_before: 9911ffcfbe1a379de478fb722269f40615f0495d
plan_head_after: 0f1c165d98302978f91d3f4152b4fa7dd6d2e0d3

tech-stack:
  added: []
  patterns:
    - "One adapter owns the rustInvoke catch: rejection, timeout or malformed reply becomes unknown (check) or failed (remove); call sites add no catch"
    - "A reply is trusted only if it answers the request: one item per target in request order, overall equal to the Kleene fold of the items, outcome agreeing with the verdict"
    - "Test fake with closure state only, deletes confined to the OS temp dir"

key-files:
  created:
    - src-tauri/src/safety_dispatch.rs
    - src/backend/safety/rustSafety.ts
    - src/backend/safety/knownInstalls.ts
    - src/backend/safety/protectedRoots.ts
    - src/backend/safety/__tests__/rustSafety.test.ts
    - src/backend/safety/__tests__/knownInstalls.test.ts
    - src/backend/safety/__tests__/protectedRoots.test.ts
    - src/backend/__tests__/safetyChannelParity.test.ts
    - src/backend/testUtils/rawRecursiveDeletes.ts
    - src/backend/testUtils/fakeSafetyRust.ts
    - src/backend/testUtils/__tests__/rawRecursiveDeletes.test.ts
    - src/backend/testUtils/__tests__/fakeSafetyRust.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/main.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/safety.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - meta/genIpcContract.ts
    - meta/__tests__/genIpcContract.test.ts

key-decisions:
  - "The adapter validates a reply against the request, not just its shape: item count and ids must match the targets and overall must equal the fold of the items, else bad-reply. A shape-valid reply with overall yes over a no item can never read as permission"
  - "genIpcContract learned anyOf [X, null] as Option<X>, so knownInstalls: null (an unreadable list, which the crate answers as unknown) survives the zod/serde boundary instead of being forced to an empty array"
  - "Sideload known-install path is dirname(install.executable) because sideload entries carry no install_path; for a macOS .app sideload that is the Contents/MacOS folder inside the bundle"
  - "The raw-delete detector blanks comments in place instead of using stripSourceComments, which drops whole lines (shifting reported line numbers) and leaves trailing // comments in the text (false positives)"

patterns-established:
  - "Safety adapter failures use the SAFETY_ADAPTER_REASONS pair (rust-invoke-failed, bad-reply); a Rust reply may never carry those, so an adapter-only reason arriving on the wire is itself a bad-reply"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "safety_check_removal and safety_remove_tree reachable from the sidecar: shell arms, generated contract, zod tuples, allowlist, parity pin"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell safety (safety_channels_are_gamelib_safety_app_ops, safety_check_removal_arm_refuses_a_nested_known_install)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/safetyChannelParity.test.ts; src/backend/__tests__/tauriShellSource.test.ts; src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts; pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fail-closed TS adapter: rejection, timeout, sync throw and malformed reply read as unknown (check) or failed (remove); guardedRemoveTree never requests the remove channel without a yes"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/safety/__tests__/rustSafety.test.ts (21 cases incl. rejection, 9 malformed-check shapes, removeTree rejection and malformed, never-remove-without-yes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "collectKnownInstalls is cross-store, excludes the caller's key, and returns null when any manager throws; protectedRootsFor uses settings and app paths only"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/safety/__tests__/knownInstalls.test.ts; src/backend/safety/__tests__/protectedRoots.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Raw-delete detector and safety fake transport for the per-plan gates and guard-site tests"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/testUtils/__tests__/rawRecursiveDeletes.test.ts; src/backend/testUtils/__tests__/fakeSafetyRust.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real request round trip through the running sidecar and shell (live rustInvoke), as opposed to the shell arm called in-process"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "Not attempted here: the shell test calls rpc_safety_check_removal in-process and the TS tests use injected transports. Plans 82-07 to 82-09 exercise the live path at the first guarded call site."

duration: 40min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 05: Safety wiring and the fail-closed sidecar adapter Summary

**The sidecar can now ask the Rust gamelib-safety crate whether a removal is safe and perform it, through one adapter that turns every failure mode (rejection, timeout, malformed or inconsistent reply) into unknown or failed, plus the known-installs, protected-roots, raw-delete detector and fake transport that guard sites need.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-11-20T08:07Z
- **Tasks:** 2 (tracer, auto)
- **Files modified:** 24 (12 created, 12 modified)

## Accomplishments

- Shell: `safety_dispatch.rs` (two arms validating the generated Args, then `gamelib_safety::dispatch`, no logging), two one-line router arms, regenerated `ipc_contract.rs`, `gamelib-safety` dependency and a `gamelib-testutil` dev-dependency (Cargo.lock gained dependency edges only; `cargoFeatures.test.ts` unchanged and green).
- TS contract: `RUST_SAFETY_CHECK_REMOVAL`/`RUST_SAFETY_REMOVE_TREE`, `RUST_SAFETY_CHANNELS`, `RustSafetyChannel`, allowlist entries, strict zod tuples; `safetyChannelParity.test.ts` pins OPS == constants == arms with anti-vacuity.
- `rustSafety.ts`: the only catch around a safety call. A reply is accepted only if it answers the request (one item per target in order, overall equal to the fold of the items, outcome consistent with the verdict).
- `collectKnownInstalls` across legendary, gog, nile, sideload and steam; `protectedRootsFor`; `findRawRecursiveDeletes`/`scanGuardedFiles`; `fakeSafetyRustInvoke`.

## Task Commits

1. **Task 1 (tracer): safety_check_removal/safety_remove_tree end to end with the fail-closed adapter** - `0f01dd5c3` (feat)
2. **Task 2: known installs, protected roots, raw-delete detector, safety fake** - `0f1c165d9` (feat)

Tracer gate: the Task 1 `<verify>` chain (cargo test safety filter, rustfmt on the two arm files, `check:ipc-contract`, jest for parity/tauriShellSource/cargoFeatures/rustSafety, `codecheck`, `backend-di-ceilings`, prettier file-info and check) passed before expansion. Tracer verified end-to-end, expanded.

`commits: 3` is the measured `rev-list` count over `plan_head_before..HEAD`; one of the three (`4b5e9d6aa`, quick-261120-st3) is another session's commit that landed on main in between. This plan's own commits are `0f01dd5c3` and `0f1c165d9`.

## Per-manager path field (research assumption A9, pinned in knownInstalls.test.ts)

| Runner | Path source |
|--------|-------------|
| legendary, gog, nile, steam | `install.install_path` |
| sideload | no `install_path`; `dirname(install.executable)` |

An installed entry whose path cannot be resolved (empty `install_path`, or a non-sideload entry carrying only an executable) is skipped rather than guessed. For a macOS `.app` sideload the derived folder is `Contents/MacOS` inside the bundle, which is also what `SideloadGame.uninstall` removes today; a target of the bundle itself still reads as nested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generator could not express a nullable array**
- **Found during:** Task 1 (`pnpm gen:ipc-contract`)
- **Issue:** `knownInstalls: z.array(...).nullable()` emits JSON Schema `anyOf [X, null]`, which `meta/genIpcContract.ts` rejected. `null` must cross the boundary because the crate answers it as `unknown`; coercing to `[]` would read as "no other installs".
- **Fix:** the emitter maps exactly `anyOf [X, {type:'null'}]` to `Option<X>`; any other `anyOf` still throws. Test added in `genIpcContract.test.ts`.
- **Files modified:** `meta/genIpcContract.ts`, `meta/__tests__/genIpcContract.test.ts`
- **Commit:** `0f01dd5c3`

**2. [Rule 2 - Missing critical] Adapter hardened beyond shape validation**
- **Found during:** Task 1 (adapter design)
- **Issue:** a shape-valid reply could still be permissive (overall `yes` over a `no` item, fewer items than targets, `removed` with a non-yes overall).
- **Fix:** `answersRequest` plus an outcome/verdict agreement check; failures read as `bad-reply`. Tests cover each case.
- **Files modified:** `src/backend/safety/rustSafety.ts`, `rustSafety.test.ts`
- **Commit:** `0f01dd5c3`

**3. [Rule 3 - Blocking] Counts pinned by other tests**
- **Found during:** Task 1 verification
- **Issue:** `tauriShellSource.test.ts` (flat router 117 -> 119 arms) and `rustInvokeSchemas.test.ts` (117 -> 119 channels) pin the channel count; `SHELL_SOURCE_FILES`/`SHELL_SOURCE_PARTS` in `main.rs` must name every shell module.
- **Fix:** updated the counts and added `safety_dispatch.rs` to both lists; added a safety-request schema case (null known installs survive, drift and a bad kind are rejected).
- **Commit:** `0f01dd5c3`

**4. [Rule 3 - Blocking] knip and lint on new exports and a store literal**
- **Issue:** `RustSafetyChannel` had no consumer (knip ratchet) and `runner === 'sideload'` is forbidden by lint.
- **Fix:** `rustSafety.ts` types its channel parameter with `RustSafetyChannel`; `knownInstalls.ts` uses `isStore({ runner }, 'sideload')`. Removed the now-stale `@public` tags from `safety.ts` types this plan consumes (the four not yet consumed keep them, with an accurate justification).
- **Commits:** `0f01dd5c3`, `0f1c165d9`

**5. [Plan variance, informational] Comment handling in the detector**
- The plan said to strip comments with `stripSourceComments`. That helper drops whole lines (so reported line numbers shift) and leaves trailing `//` comments in the text. The detector blanks comments in place instead; recorded in the key decisions and covered by tests (multi-line block comment keeps later line numbers, a trailing comment is ignored).

---

**Total deviations:** 4 auto-fixed (2 blocking-generator/test pins, 1 missing-critical, 1 lint/ratchet), 1 informational
**Impact on plan:** None on scope; the generator change is small, covered by a test, and rejects every `anyOf` it does not recognise.

## Issues Encountered

- `moduleStateCensus.test.ts` is red on `X86_NULL_OBJECT_VERSION_SET` at `shimCoverage.ts:515`, the known pre-existing failure from another session's commit; none of this plan's files appear in the census output.
- `src-tauri/src/main.rs` is not rustfmt-clean as a crate (the plan noted this), so the two new tests there were hand-matched to rustfmt style; `rustfmt --check` reports differences only in the generated `ipc_contract.rs`.
- Detector limits, documented in its header: an aliased import (`rmSync as drop`), a DI'd fs facade (`deps.fs.rmSync`), `rimraf` and fs-extra `remove` are not flagged.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the two rustInvoke channels the plan's threat model (T-82-13..16) already covers: strict zod tuples and `deny_unknown_fields` on the way in, closed-set reasons and caller ids on the way out, no logging in the arm (pinned by `safetyChannelParity.test.ts`).

## Next Phase Readiness

- Guard sites in 82-07/08/09 can build a full `SafetyRequest` from `collectKnownInstalls` and `protectedRootsFor`, call `guardedRemoveTree`, and test it with `fakeSafetyRustInvoke`; per-plan raw-delete gates can use `scanGuardedFiles(paths, floor)`.
- The live sidecar-to-shell round trip has not been exercised; the first guarded call site is where it will first run.
- Carried from 82-03: the D-22 exec-bit rule over-refuses native Linux sideload folders with helper scripts; refusal wording in 82-07/08 should say so.

## Self-Check: PASSED

All created files exist on disk, commits `0f01dd5c3` and `0f1c165d9` are ancestors of HEAD, and the verification chain was re-run green: `cargo test --bin gamelib-shell safety` (2 passed), `pnpm check:ipc-contract`, jest over parity/tauriShellSource/cargoFeatures/rustInvokeSchemas/genIpcContract and the five new suites (68 tests), `pnpm codecheck`, `pnpm backend-di-ceilings`, `pnpm find-deadcode`, `pnpm boundaries`, prettier file-info and check over every TS path written. Acceptance greps: `safety_check_removal` in sidecarTransport.ts 3, `RustInvokeChannel::Safety` in rust_dispatch.rs 2, tauriShellSource 1, `SafetyCheckRemoval` in ipc_contract.rs 12, catch in rustSafety.ts 3, logging calls in safety_dispatch.rs 0, `collectKnownInstalls` exports 1, `jest.mock` in the two named tests 0.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*
