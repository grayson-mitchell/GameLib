---
phase: 88-launch-pipeline
plan: 12
subsystem: known-fix-shims
tags: [knownfix, rustinvoke, shim, schedule, launch-overrides, remote-fixes, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 02
    provides: the launchrust shim directory and the RUST_KNOWNFIX_ prefix in the shim schedule's discovery, rowsDueIn, the roadmap-derived deletedBy rule
  - phase: 88-launch-pipeline
    plan: 09
    provides: the knownfix_launch_overrides op in gamelib-knownfix (strict object decode, checked exeOverride)
  - phase: 88-launch-pipeline
    plan: 11
    provides: the knownfix_fetch_remote op (GameLib's feed, then Heroic's on a 404, answers null)
provides:
  - rustInvoke channels RUST_KNOWNFIX_LAUNCH_OVERRIDES (knownfix_launch_overrides) and RUST_KNOWNFIX_FETCH_REMOTE (knownfix_fetch_remote) with zod args, generated serde decode, rust_dispatch arms and knownfix_dispatch::rpc_knownfix_launch_overrides / rpc_knownfix_fetch_remote
  - src/backend/launchrust/knownFixes.ts with the shims readKnownFixLaunchOverrides and fetchRemoteKnownFixes, each one returned typed requestRustInvoke call and each a schedule row
  - src/backend/knownFixLaunchReply.ts, settleKnownFixLaunchOverrides, the narrowing of the untyped launch-overrides answer
  - gog, legendary and nile launch() reading known-fix launch overrides from Rust, and the download manager fetching remote fixes from Rust
affects: [88-13, 88.1, 91, 92, 93]

actuals:
  tokens: 6729
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 9be83424f849f78441b37b8b30037f077cee5003
plan_head_after: 6340fa3be913ef9b6f15e2ba0fc410ef50d7611f

tech-stack:
  added: []
  patterns:
    - "a shim whose answer is untyped is narrowed by a sibling outside the shim directory, not by a cast in the shim: checkShimShape unwraps only parentheses and await, so the one returned call stays bare and the caller wraps it in settleKnownFixLaunchOverrides"
    - "an Option field that the TS side may leave unset is `z.string().nullable().optional()`: the generated serde struct takes it as Option<String>, the crate's own #[serde(default)] agrees, and a missing key is the same as null"
    - "a shell rustInvoke arm over a context is split into `<op>_over(ctx: Option<&Arc<Ctx>>, args)` and a one-line arm that passes the installed context, so a test drives not-ready and decode over its own context"

key-files:
  created:
    - src/backend/launchrust/knownFixes.ts
    - src/backend/launchrust/__tests__/knownFixes.shims.test.ts
    - src/backend/knownFixLaunchReply.ts
    - src/backend/__tests__/knownFixLaunchReply.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/knownfix_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts

key-decisions:
  - "Both channels take one strict object, not positional arguments: the Rust ops decode `{appName, runner, installPath}` and `{appName, runner}` with deny_unknown_fields, so the zod tuple is a one-element tuple holding a `.strict()` object (the shape the wiki and engine ops already use), and the shim test pins that the arguments parse against it"
  - "Both channels stay bounded by RUST_INVOKE_TIMEOUT_MS (neither is in UNBOUNDED_RUST_CHANNELS): a launch-overrides read is a disk read and the fetch is at most two 10 s requests. The 88-10 note about placing the two env ops in the unbounded list does not apply to this plan, which wires neither of them"
  - "The launch-overrides shim resolves `unknown` and `settleKnownFixLaunchOverrides` turns a rejection or an odd reply into a warning and `{launchArgs: []}`, because the TS function it replaces never threw and a failed known-fix read must not fail a launch (Rule 2). Rust answers `exeOverride: null`, which the settle step reads as absent"
  - "The schedule row for readKnownFixLaunchOverrides is deletedBy 92 (legendary leaves in 91, gog and nile in 92) and the fetch row is deletedBy 93, as the plan names; both list the same four importers because the importer check is per file"
  - "The Steam bridge's own reader (bridgeKnownFixes.ts) still imports the TS knownFixLaunch.ts: the plan flips only the three managers and the download manager, so the TS module and its oracle stay until the bridge plan"

patterns-established:
  - "Phase 88 schedule rows live in the same SCHEDULE as 87's but the 87 survivor table (engineWinePortComplete) compares only rows outside src/backend/launchrust/, so each 88 plan adds its rows without rewriting a table that records Phase 87's final list"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "The gog, legendary and nile launch() read known-fix launch overrides from Rust through one scheduled shim; the launch never fails on a rejected or malformed answer"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixes.shims.test.ts#readKnownFixLaunchOverrides"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/knownFixLaunchReply.test.ts"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts#every shim and resolver row has the shape it claims and sends its row channel"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shell answers knownfix_launch_overrides and knownfix_fetch_remote: decode first with a fixed-literal rejection that never echoes input, not-ready before install, the crate's strict decode behind it"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell knownfix (10 passed): launch_overrides_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, fetch_remote_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, launch_overrides_answers_the_launch_args_and_a_checked_exe_override_over_a_context"
        status: pass
      - kind: integration
        ref: "pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "The download manager fetches remote known fixes from Rust through a scheduled shim, keeping its fire-and-forget call and rejection log, and no longer imports knownFixesFetcher"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/downloadmanager/__tests__/utils.test.ts (a rejecting fetcher never fails the install; the fetch is handed deps carrying requestRustInvoke)"
        status: pass
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixes.shims.test.ts#fetchRemoteKnownFixes"
        status: pass
    human_judgment: false
  - id: D4
    description: "The known-fix launch-override and remote-fetch calls work in the running app against a real fixes folder (a game with a seeded fix launches with its launchArgs; an install fetches its remote fix)"
    verification: []
    human_judgment: true
    rationale: "No test starts the shell with the sidecar and launches a managed game; the dispatch is covered at each seam (shim, schema, shell arm, crate) but not end to end in a live app"

duration: 55min
completed: 2026-11-24
status: complete
---

# Phase 88 Plan 12: Known-fix shims and the first TS callers on Rust Summary

**Two sidecar-to-Rust known-fix channels (`knownfix_launch_overrides`, `knownfix_fetch_remote`) behind scheduled shims in `launchrust/knownFixes.ts`, with gog, legendary and nile `launch()` and the download manager's install-time fetch flipped onto them**

## Performance

- **Duration:** about 55 min
- **Completed:** 2026-11-24
- **Tasks:** 2
- **Files modified:** 18 (4 created, 14 modified)

## Accomplishments

- `readKnownFixLaunchOverrides` is async over `RUST_KNOWNFIX_LAUNCH_OVERRIDES`; the three managers `await` it inside `launch()` with their own `this.deps`. A game's known-fix `launchArgs` and checked `exeOverride` now come from `gamelib-knownfix`, so Lane B's 91 has its launch-override path in Rust.
- `fetchRemoteKnownFixes` is a shim over `RUST_KNOWNFIX_FETCH_REMOTE`; `downloadFixesFor` keeps its fire-and-forget call and the same rejection log, now over `RustInvokeDeps`.
- D-19 wiring for both channels: constants and list in `sidecarTransport.ts`, zod args in `rustInvoke.ts`, `ipc_contract.rs` regenerated, `rust_dispatch.rs` arms into `knownfix_dispatch.rs`. Each arm decodes first (a bad call is the same fixed `<op>:bad-args` literal before and after install, never echoing the value), then answers `<op>:not-ready` before install, then runs the op through the crate's `dispatch_sync`. No sidecar fallback exists.
- Two schedule rows (`deletedBy` 92 and 93). After this plan the managers and the download manager no longer import `knownFixLaunch.ts` or `knownFixesFetcher.ts`.

## Task Commits

1. **Task 1: Tracer, `readKnownFixLaunchOverrides` from the three managers through rustInvoke to the Rust op** - `739829bb0` (feat)
2. **Task 2: `fetchRemoteKnownFixes` shim and the download manager flip** - `6340fa3be` (feat)

The tracer gate ran in auto mode with the tracer's `<verify>` re-run end to end before expansion (shell tests, `check:ipc-contract`, the whole `src/backend` jest tree, `src/common`, `codecheck`, prettier, eslint on the touched files); it passed and expansion went ahead.

## Files Created/Modified

- `src/backend/launchrust/knownFixes.ts` - the two shims, each one returned `requestRustInvoke` call
- `src/backend/knownFixLaunchReply.ts` - `settleKnownFixLaunchOverrides`: awaits the shim, narrows the answer, never throws
- `src-tauri/src/knownfix_dispatch.rs` - `rpc_knownfix_launch_overrides`, `rpc_knownfix_fetch_remote` and their testable `_over` bodies, with 3 new shell tests
- `src-tauri/src/rust_dispatch.rs` - the two arms; `src-tauri/src/ipc_contract.rs` - regenerated
- `src/common/types/sidecarTransport.ts`, `src/common/types/ipc/rustInvoke.ts` - the two channels and their strict object args
- `src/backend/storeManagers/{gog,legendary,nile}/games.ts` - import from `launchrust/knownFixes`, `await settleKnownFixLaunchOverrides(...)`
- `src/backend/downloadmanager/utils.ts` and its test - the fetch over `RustInvokeDeps`
- `src/backend/__tests__/engineWineShimSchedule.test.ts` - two rows and the shared importer list

## Decisions Made

See `key-decisions` above. The ones to carry forward: both channels take one strict object; both stay under the 60 s bound; the launch-overrides answer is narrowed outside the shim so a failed known-fix read never fails a launch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Narrowing and failure handling for the launch-overrides answer**
- **Found during:** Task 1
- **Issue:** The plan has the managers `await` a shim "returning the typed `{ launchArgs, exeOverride? }` promise". `requestRustInvoke` resolves `unknown`, and `checkShimShape` accepts only a bare returned call (it unwraps parentheses and `await`, not `as`), so the shim cannot carry the type. The old TS function never threw (a bad file or an unverifiable override was a log line and the launch went on with defaults), whereas an unguarded `await` of a rustInvoke call would turn a not-ready shell, a timeout or a refused argument into a failed launch in three managers.
- **Fix:** Added `settleKnownFixLaunchOverrides(appName, pending)` in `src/backend/knownFixLaunchReply.ts`, outside the shim directory so it is not a schedule row. It narrows the reply (reading Rust's `exeOverride: null` as absent), and on a rejection or a wrong-shaped reply logs a warning and returns `{launchArgs: []}`. The three call sites are `await settleKnownFixLaunchOverrides(id, readKnownFixLaunchOverrides(this.deps, ...))`.
- **Files modified:** `src/backend/knownFixLaunchReply.ts`, `src/backend/__tests__/knownFixLaunchReply.test.ts` (both new), the three `games.ts`
- **Verification:** `knownFixLaunchReply.test.ts` (11 tests: good reply, null override, rejection, eight odd replies)
- **Committed in:** `739829bb0`

**2. [Rule 3 - Blocking] Three censuses and the 87 survivor table pinned counts this plan changes**
- **Found during:** Task 1 (full `src/backend` jest run)
- **Issue:** `tauriShellSource.test.ts` pins the `rust_dispatch.rs` arm count (189) and the list of arms new since 34.1; `rustInvokeSchemas.test.ts` pins `RUST_INVOKE_CHANNELS` at 189; `engineWinePortComplete.test.ts` compares the hand-written 78-row Phase 87 survivor table with the whole `SCHEDULE`, so any 88 row read as an extra.
- **Fix:** Counts moved 189 -> 190 -> 191 with the usual per-plan comment lines, the two new arm names added to the arm list with their PROVEN note, and the survivor comparison now covers the rows outside `src/backend/launchrust/` (Phase 88's rows are pinned by `engineWineShimSchedule.test.ts`).
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts`, `src/backend/__tests__/engineWinePortComplete.test.ts`
- **Verification:** `pnpm exec jest src/backend`: 600 suites passed, 14171 tests
- **Committed in:** `739829bb0`, `6340fa3be`

**3. [Rule 3 - Blocking] The plan's cargo verify command cannot print a passing count for `rust_dispatch`**
- **Found during:** Task 1
- **Issue:** `cargo test --bin gamelib-shell rust_dispatch` matches no test (0 passed); `rust_dispatch.rs` has no test module and its exhaustive `match` is checked by the compiler. The plan's `fails_when` names "0 passed" as a failure.
- **Fix:** Ran the whole shell binary instead (`cargo test --bin gamelib-shell`: 880 passed, 0 failed) plus `cargo test --bin gamelib-shell knownfix` (10 passed). The arm count and arm names are pinned by `tauriShellSource.test.ts`.
- **Files modified:** none
- **Verification:** the two cargo runs above

**4. [Rule 1 - Bug] Plan's argument shape and generated decode**
- **Found during:** Task 1
- **Issue:** The plan describes "a zod tuple (appName string, runner enum, installPath string or null)". The Rust op takes one object, so a three-element tuple would be refused. Separately, the generated struct has no `deny_unknown_fields` and requires `installPath`.
- **Fix:** One-element tuple holding a `.strict()` object, `installPath: z.string().nullable().optional()` (the crate's `#[serde(default)]` takes an absent key as null); the shell arm adds an arity check, and the crate's own strict decode rejects an unknown key, which the shell test pins.
- **Files modified:** `src/common/types/ipc/rustInvoke.ts`, `src-tauri/src/knownfix_dispatch.rs`
- **Committed in:** `739829bb0`

---

**Total deviations:** 4 auto-fixed (1 Rule 2, 2 Rule 3, 1 Rule 1)
**Impact on plan:** One extra small module and its test (`knownFixLaunchReply.ts`) beyond the plan's file list; everything else is the plan's shape. No scope creep.

## Issues Encountered

- `cargo clippy -p gamelib-shell --all-targets -- -D warnings` reports errors that already exist at HEAD in `main.rs`, `login_window/*`, `single_instance.rs`, `store_embed/state.rs` and `wake_lock.rs`; none are in `knownfix_dispatch.rs` or `rust_dispatch.rs` (one clippy finding in this plan's new test, `cloned_ref_to_slice_refs`, was fixed). `cargo fmt -p gamelib-shell --check` is dirty only in the generated `ipc_contract.rs`, as before this plan; `knownfix_dispatch.rs` is rustfmt-clean.
- `readKnownFixLaunchOverrides` is also imported by `src/backend/storeManagers/steam/bridgeKnownFixes.ts` from the TS module (sync). The plan does not flip the bridge, so that import and `knownFixLaunch.ts` with its oracle stay.

## Known Stubs

None.

## Threat Flags

None. T-88-31 (tampering through rustInvoke args) is mitigated as planned: strict zod on the TS side, generated decode plus arity check in the arm, the crate's `deny_unknown_fields` decode and name bound behind it, and rejections that are fixed literals the shell tests assert never contain the input. T-88-32 (a hung call blocking a launch) is mitigated by leaving both channels under the 60 s `RUST_INVOKE_TIMEOUT_MS` and by the settle step turning a timeout into "no overrides". T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-13 can add the launcher and bridge shims in the same `launchrust/knownFixes.ts` (the two overlay env ops, `knownfix_profile_overlay_env` and `knownfix_resolve_overlay_env`, still need their own shims and a place in `UNBOUNDED_RUST_CHANNELS`, since an overlay install may take the full 120 s).
- Each new shim row must list every importer of `launchrust/knownFixes.ts` (the importer check is per file); `KNOWN_FIX_SHIM_IMPORTERS` in `engineWineShimSchedule.test.ts` is where that list lives.
- A live-app check of a managed game launching with a seeded known fix has not been done (D4 above).

## Self-Check: PASSED

- Created files present: `src/backend/launchrust/knownFixes.ts`, `src/backend/launchrust/__tests__/knownFixes.shims.test.ts`, `src/backend/knownFixLaunchReply.ts`, `src/backend/__tests__/knownFixLaunchReply.test.ts`.
- Commits `739829bb0` and `6340fa3be` are ancestors of HEAD.
- Acceptance: `grep -c RUST_KNOWNFIX_LAUNCH_OVERRIDES sidecarTransport.ts` = 2; no `from 'backend/knownFixLaunch'` in gog, legendary or nile (0); `grep -c knownFixesFetcher downloadmanager/utils.ts` = 0; two schedule rows for `launchrust/knownFixes.ts`; shell tests for not-ready and fixed-literal wrong-arity pass.
- Plan verification: `cargo test --bin gamelib-shell` 880 passed; `pnpm check:ipc-contract` up to date; `pnpm exec jest src/backend` 600 suites passed; `pnpm codecheck` clean; prettier clean on every written path.
