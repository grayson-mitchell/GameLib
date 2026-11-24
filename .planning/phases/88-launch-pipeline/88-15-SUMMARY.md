---
phase: 88-launch-pipeline
plan: 15
subsystem: known-fix-steam-library
tags: [knownfix, rustinvoke, shim, twin, schedule, report, steam-library, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 11
    provides: the knownfix_report_detected op in gamelib-knownfix (all gates, one 8 s POST, the steam_known_fix_reports store, outcome words)
  - phase: 88-launch-pipeline
    plan: 12
    provides: the launchrust/knownFixes.ts shim file, the channel wiring pattern, KNOWN_FIX_SHIM_IMPORTERS
  - phase: 88-launch-pipeline
    plan: 13
    provides: knownFixTwins.ts with readKnownFixes and readKnownFixProfile, KNOWN_FIX_TWIN_IMPORTERS
provides:
  - rustInvoke channel RUST_KNOWNFIX_REPORT_DETECTED (knownfix_report_detected), bounded, with strict zod args, generated serde decode, a rust_dispatch arm and knownfix_dispatch::rpc_knownfix_report_detected
  - shim reportDetectedFix(deps, fix, enabled) and type DetectedFix in launchrust/knownFixes.ts (seventh shim row, deletedBy 97)
  - bridgeInstallState.ts and library/macArch.ts reporting detected fixes through the shim, fire-and-forget with a logged rejection
  - drmKnownFix, macArchKnownFix, gameLaunchOverlay and bridge/sharedRedistInstall reading through the knownFixTwins file
affects: [88-16, 97, 98]

actuals:
  tokens: 12700
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 61aacb7bb21065f3fbc095c977c147424b11665a
plan_head_after: d2bb834a3b570b30f776e21d46f55bef86260324

tech-stack:
  added: []
  patterns:
    - "a fire-and-forget shim call whose caller must not throw: the call sites use `void shim(...).catch(log)`, so a test that module-mocks the shim must make it resolve in a beforeEach (resetMocks wipes a factory implementation, and an unset mock answers undefined, which has no .catch)"
    - "an opt-in flag crosses to Rust as a boolean the caller computed (`shareDetectedFixes === true`), so config stays TS until 98 and Rust reads no settings file"

key-files:
  created: []
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/knownfix_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/backend/launchrust/knownFixes.ts
    - src/backend/launchrust/__tests__/knownFixes.shims.test.ts
    - src/backend/storeManagers/steam/bridgeInstallState.ts
    - src/backend/storeManagers/steam/library/macArch.ts
    - src/backend/storeManagers/steam/drmKnownFix.ts
    - src/backend/storeManagers/steam/macArchKnownFix.ts
    - src/backend/storeManagers/steam/gameLaunchOverlay.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
    - src/backend/storeManagers/steam/__tests__/library.installedMap.test.ts
    - src/backend/storeManagers/steam/__tests__/library.installRoot.test.ts
    - src/backend/storeManagers/steam/__tests__/library.macArch.test.ts
    - src/backend/storeManagers/steam/__tests__/library.resumeBreadcrumbs.test.ts
    - src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts
    - src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts
    - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts

key-decisions:
  - "The report channel stays bounded (one 8 s POST in the crate, under the 60 s RUST_INVOKE_TIMEOUT_MS): it is not in UNBOUNDED_RUST_CHANNELS and dialogOptionForwarding's EXPECTED did not change"
  - "`enabled` is computed at each call site as `deps.config.getSettings().shareDetectedFixes === true`, exactly as knownFixReportDeps.isEnabled did; Rust receives the boolean and answers `disabled` before any other gate that touches the relay"
  - "The rejection log is `SteamGame: known-fix report failed for appId <id>` (bridgeInstallState) and `Steam: known-fix report failed for appId <id>` (macArch): the app id only, never the rejection text, so a transport message can never carry a URL into gamelib.log (prohibition 1)"
  - "DetectedFix is defined in the shim file from the key and op types of common/knownFixReport, so the TS backend/knownFixReport.ts that 88-16 deletes is not its source"
  - "The twins file already exported KnownFixPathsDeps and KnownFixLocalPathsDeps (88-13); nothing was added there"

patterns-established:
  - "A schedule row's callers list is per file, so every new importer of a shim or twin file is added to the one shared list, never to a single row"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "A detected Mach-O or CEG fix is reported from the Steam library through one scheduled shim to the Rust report op; `enabled` is the caller's shareDetectedFixes setting fact and a rejected call is a logged warning that never fails an install or launch"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixes.shims.test.ts#reportDetectedFix (the Steam library, 88-15)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/library.macArch.test.ts (a '32' verdict reports macArch add, a curated '32' contradicted by '64' reports remove, the share setting reaches the shim as true, a rejection is logged with the app id only, a never-settling shim still resolves)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/games.test.ts (CEG report on install and launch, forced bridge still reports, the share setting reaches the shim as true, a rejection is logged with the app id only)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/engineWineShimSchedule.test.ts#every shim and resolver row has the shape it claims and sends its row channel"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shell answers knownfix_report_detected: decode first with a fixed-literal rejection that never echoes input, not-ready before install, the crate's strict decode and closed sets behind it, and no post when the caller has not opted in"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell (888 passed): report_detected_answers_not_ready_before_install_and_rejects_a_bad_call_with_a_fixed_literal, report_detected_posts_nothing_when_the_caller_has_not_opted_in"
        status: pass
      - kind: integration
        ref: "pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Steam library's synchronous known-fix readers (drmKnownFix, macArchKnownFix, gameLaunchOverlay, sharedRedistInstall) read through the vector-pinned twins, and nothing outside the TS known-fix modules, their oracles and their own tests imports or mocks a backend/knownFix* module"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts, macArchKnownFix.test.ts, macArchKnownFixRouting.test.ts and bridge/__tests__/sharedRedistInstall.test.ts (mocks moved to backend/launchrust/knownFixTwins, expectations unchanged)"
        status: pass
      - kind: unit
        ref: "src/backend/launchrust/__tests__/knownFixTwins.vectors.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "An opted-in Mac user's detected fix reaches the relay in the running app, and an opted-out user's does not"
    verification: []
    human_judgment: true
    rationale: "No test starts the shell with the sidecar, installs a game whose Mach-O check yields '32', and watches the relay; the dispatch is covered at each seam (shim, schema, shell arm, crate golden) but not end to end in a live app"

duration: 35min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 15: Steam known-fix report shim and library twins Summary

**The Steam library's two detected-fix report hooks now reach Rust through one bounded `knownfix_report_detected` channel and a scheduled `reportDetectedFix` shim (opt-in boolean computed by the caller, rejection logged with the app id only), and its four synchronous known-fix readers import the vector-pinned twins, so no non-test file outside the TS known-fix modules imports one**

## Performance

- **Duration:** about 35 min
- **Completed:** 2026-11-25
- **Tasks:** 2 (a tracer and an import move)
- **Files modified:** 27 (0 created, 27 modified)

## Accomplishments

- `reportDetectedFix(deps, fix, enabled)` over `RUST_KNOWNFIX_REPORT_DETECTED`, with `DetectedFix` exported as a type. The shell arm decodes first (a fixed `knownfix_report_detected:bad-args` literal before and after install, never echoing the sidecar's value), then answers `:not-ready` before install, then runs the crate op, which parses `key`, `op` and `detector` against their closed sets again.
- `bridgeInstallState.persistBridgeDrmSignal` (CEG detector) and `library/macArch.applyMacArchVerdict` (Mach-O detector, add and remove) call `void reportDetectedFix(deps, fix, deps.config.getSettings().shareDetectedFixes === true).catch(...)`. The CEG hook still fires before the forced-bridge return (Pitfall 6).
- The channel is bounded (the crate's one 8 s POST), so it is not in `UNBOUNDED_RUST_CHANNELS`. Census counts moved 195 to 196 (`rustInvokeSchemas.test.ts`, `tauriShellSource.test.ts` with the arm list entry and PROVEN note).
- Seven shim rows for `launchrust/knownFixes.ts` (the new one deletedBy 97); both Steam call-site files joined `KNOWN_FIX_SHIM_IMPORTERS`, and the four Task 2 modules joined `KNOWN_FIX_TWIN_IMPORTERS`.
- `drmKnownFix`, `macArchKnownFix`, `gameLaunchOverlay` and `bridge/sharedRedistInstall` import `readKnownFixes` / `readKnownFixProfile` and the deps types from `backend/launchrust/knownFixTwins`; the four tests' imports and mocks moved with unchanged expectations.
- Eleven Steam tests (the nine plus `drmKnownFix`, `macArchKnownFix` and friends) no longer mock `backend/knownFixReport` or `backend/knownFixes`. New cases pin the share setting reaching the shim as `true`, a rejection being logged with only the app id, and the shim's argument shape (including that nothing beyond the five fields can cross).

## Task Commits

1. **Task 1: Tracer, a detected macArch fix reported from the Steam library through the report shim to Rust** - `ec472c0d1` (feat)
2. **Task 2: The Steam library's synchronous readers on the twins** - `d2bb834a3` (refactor)

The tracer gate ran in auto mode: the tracer's `<verify>` was re-run end to end (the whole shell binary, `check:ipc-contract`, the shim, schedule, census and forwarding tests, the whole steam jest tree, `codecheck`, prettier) and passed before Task 2 started. Tracer verified end-to-end, expanding.

## Files Created/Modified

- `src/common/types/sidecarTransport.ts`, `src/common/types/ipc/rustInvoke.ts` - the channel and its strict object args (closed `key`, `op`, `detector` sets, boolean `enabled`)
- `src-tauri/src/knownfix_dispatch.rs`, `rust_dispatch.rs`, `ipc_contract.rs` - the arm (with 2 new shell tests) and the regenerated contract
- `src/backend/launchrust/knownFixes.ts` and its shims test - the shim, `DetectedFix` and five cases
- `src/backend/storeManagers/steam/bridgeInstallState.ts`, `library/macArch.ts` - the two report call sites
- `src/backend/storeManagers/steam/{drmKnownFix,macArchKnownFix,gameLaunchOverlay}.ts`, `bridge/sharedRedistInstall.ts` - the twin imports
- `src/backend/__tests__/engineWineShimSchedule.test.ts`, `tauriShellSource.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts` - the row, the importer lists and the counts
- eleven Steam tests - mocks and imports moved to the shim and twin paths

## Decisions Made

See `key-decisions` above. The ones to carry forward: the report channel is bounded and `enabled` is a caller-computed boolean; the rejection log carries the app id only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocked shims must resolve in the tests that reach the call sites**
- **Found during:** Task 1 (the steam jest tree)
- **Issue:** The old call sites never returned anything, so the tests mocked `reportDetectedFix` with a bare `jest.fn()`. The new call sites chain `.catch` on the shim's promise, and `resetMocks` wipes a factory implementation, so the mock answered `undefined` and `applyMacArchVerdict` threw a TypeError (it crashed the jest worker in `library.macArch.test.ts`).
- **Fix:** `games.test.ts` and `library.macArch.test.ts` set `mockResolvedValue('disabled')` in a file-level `beforeEach`. The five mock-only library tests never reach a call site and keep the bare mock.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/games.test.ts`, `library.macArch.test.ts`
- **Verification:** `pnpm exec jest src/backend/storeManagers/steam`: 193 suites passed
- **Committed in:** `ec472c0d1`

**2. [Rule 3 - Blocking] The shell test set and the census pinned counts this plan changes**
- **Found during:** Task 1
- **Issue:** `tauriShellSource.test.ts` pins the `rust_dispatch.rs` arm count (195) and the list of arms new since 34.1, and `rustInvokeSchemas.test.ts` pins `RUST_INVOKE_CHANNELS` at 195.
- **Fix:** Counts to 196 with the per-plan comment line, and `knownfix_report_detected` added to the arm list with a PROVEN note.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts`
- **Committed in:** `ec472c0d1`

**3. [Rule 3 - Blocking] The plan's cargo verify command cannot print a passing count for `rust_dispatch`**
- **Found during:** Task 1
- **Issue:** `cargo test --bin gamelib-shell rust_dispatch` matches no test, as 88-12 to 88-14 found.
- **Fix:** Ran the whole shell binary (888 passed, 0 failed, 2 ignored) plus `cargo test --bin gamelib-shell knownfix` (18 passed).

**4. [Plan deviation] Task 2's acceptance grep, read literally, still matches the shims and twins**
- **Issue:** `git grep -lE "from '[./a-z]*knownFix[A-Za-z]*'" ...` prints 38 files, not nothing: the character class `[./a-z]*` accepts the `backend/launchrust/` prefix, so every importer of the new shims and twins matches (and so do the surviving oracles, which are under `src/backend/__tests__/oracle/`, and the surviving `knownFixLaunchReply`). The criterion's stated intent is that no caller imports a TS known-fix module.
- **Check run instead:** the same pattern with `launchrust/knownFix*`, the oracle directory and `knownFixLaunchReply` excluded prints only three `common/knownFixOverlayCatalogue` imports (a `common` module that is not one of the eight), and a second grep for relative `./knownFix*` and `../knownFix*` imports finds only `knownFixLaunchReply`. Nothing outside the eight modules, the oracles and their own tests imports or mocks `backend/knownFix*`.
- **Files modified:** none

**5. [Plan deviation] The twins' two deps types needed no change**
- **Issue:** Task 2 says to export `KnownFixPathsDeps` and `KnownFixLocalPathsDeps` from the twins file as types. 88-13 had already exported both as interfaces there, byte-identical in shape to the TS originals.
- **Fix:** none needed.

---

**Total deviations:** 5 (3 Rule 3, 2 plan-level)
**Impact on plan:** one beforeEach line in two tests; otherwise the plan's shape. No scope creep.

## Issues Encountered

- A BSD `sed -E -i` with no backup suffix left two `-E` files next to the test files; they were removed before the first commit and never staged.
- `cargo clippy -p gamelib-shell -D warnings` and `rustfmt --check` on the generated `ipc_contract.rs` already fail at HEAD on unrelated files, as noted in the plan's repo notes; `knownfix_dispatch.rs` is rustfmt-clean.
- `BridgeKnownFixDeps.aborts` (noted unread by 88-14) was left alone: it is outside this plan's files.

## Known Stubs

None.

## Threat Flags

None. T-88-37 (an opt-in report leaving the machine) is mitigated as planned: `enabled` is `shareDetectedFixes === true` at each call site, the shell test pins that an opted-out call posts nothing, and the crate's report golden replays the disabled outcome. T-88-38 (a silently swallowed report failure) is mitigated: both call sites keep a logged `.catch` naming the app id only, with a test per site that a rejection is logged, carries no transport text and does not fail the install or launch. T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-16 can delete the TS known-fix modules and their oracles: no non-test file outside them imports a `backend/knownFix*` module any longer (`knownFixLaunchReply.ts` is a surviving module, not one of them).
- 97 deletes the `reportDetectedFix` row with the bridge's TS known-fix application, and the Steam library call sites go with config in 98.
- A live-app check that an opted-in Mac user's detected fix reaches the relay has not been done (D4 above).

## Self-Check: PASSED

- Modified files present: every file listed under key-files exists on disk (`git diff --name-only 61aacb7bb HEAD` lists 27, all tracked).
- Commits `ec472c0d1` and `d2bb834a3` are ancestors of HEAD; `git rev-list --count` from the recorded base is 2.
- Acceptance, Task 1: `git grep -l -e "from 'backend/knownFixReport'" -e "jest.mock('backend/knownFixReport'" -- src/backend/storeManagers/steam` prints nothing (rc 1); the schedule holds seven rows for `launchrust/knownFixes.ts`.
- Acceptance, Task 2: see deviation 4 (the literal grep over-matches; the intent holds).
- Plan verification: `cargo test --bin gamelib-shell` 888 passed; `pnpm check:ipc-contract` up to date; `pnpm exec jest src/backend src/common` 15030 passed (624 suites); the schedule and twin-vectors tests pass; `pnpm codecheck` clean; `pnpm lint` 0 errors; prettier clean over every touched file.
