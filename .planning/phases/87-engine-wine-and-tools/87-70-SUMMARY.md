---
phase: 87-engine-wine-and-tools
plan: 70
subsystem: engine-bottles
tags: [bottles, removal, uninstall, rustinvoke, shim-schedule, svc-02, gap-closure, f5]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-66 crate op engine_bottle_remove_per_game (strict request, four outcomes) and the 87-59 finding F5"
provides:
  - "rustInvoke channel engine_bottle_remove_per_game: RUST_ENGINE_BOTTLE_REMOVE_PER_GAME, engineOpRequest entry, regenerated ipc_contract.rs, RustInvokeChannel arm, rpc_bottle_remove_per_game in engine_dispatch"
  - "removeGameBottle shim (enginewine/bottles.ts), one typed call, a scheduled D-15 survivor (deletedBy 98)"
  - "uninstaller removePrefix routes a non-Steam game's own per-game bottle to Rust first; refusal and failure push the remove-bottle notice; the shared default prefix is never deleted when the game has no bottle of its own"
affects: [87-67 uninstall dialog control, 87-69 re-run item 7, Phase 91/92 (the generic uninstaller still serves every non-Steam runner)]

actuals:
  tokens: 14000
  tasks: 2
  commits: 3

plan_head_before: ad8a995eb1295b0f6a885e5838c7619d510640eb
plan_head_after: a3a7fd647ac78b1978ff27cb7727ce41f7833d10
commits: 3

tech-stack:
  added: []
  patterns:
    - "A shim lands with its only caller and its schedule and survivor rows in one commit, so the schedule, survivor and dead-code gates are never red"
    - "The caller builds the guard inputs once (guardInputs) and both removal routes use the same values"
    - "A crate reason outside the notice's closed vocabulary reads as bad-reply rather than widening the IPC schema"

key-files:
  created: []
  modified:
    - src-tauri/src/engine_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/enginewine/bottles.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/utils/__tests__/uninstaller.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts

key-decisions:
  - "deletedBy 98 for removeGameBottle: no ROADMAP section names src/backend/utils/uninstaller.ts (Phase 91 ports Epic and Phase 92 GOG, Amazon and sideload, each only as 'uninstall a game'), and the generic uninstaller serves every non-Steam runner, so the join phase is the honest owner; the reason is written in the schedule row's comment"
  - "The op is asked for every game that reaches removePrefix (a non-Steam runner), even when no winePrefix is stored: the crate rule is the single source for 'has its own bottle', and TS does not duplicate it as a short-circuit"
  - "The default prefix is compared with deps.config.getSettings().winePrefix (the global config the dialog compares via requestGameSettings('default')); an empty winePrefix (Windows) never matches"
  - "Crate reasons in-use and unsafe-name are not in REMOVAL_REASONS, so the remove-bottle notice carries bad-reply for them; widening the closed vocabulary touches the IPC schema, wire-parity tests and the renderer and is out of this plan"
  - "removePrefix now returns a small PrefixRemoval {kind, outcome, reason?, otherKey?} (not GuardedRemoval) so the one caller can name the notice kind"

requirements-completed: [SVC-02]

duration: about 15 min
completed: 2026-11-25
---

# Phase 87 Plan 70: The uninstall removes a non-Steam game's own bottle through Rust, and never the shared default prefix Summary

**`removePrefix` now asks `engine_bottle_remove_per_game` first (stored settings plus the same known installs, self key and protected roots the prefix guard uses): `removed` ends the removal, `refused` and `failed` push the `remove-bottle` notice, `not-bottle-backed` falls through to the stored-prefix removal, except that a stored prefix equal to the shared default is kept and one fixed line is logged.**

## Accomplishments

- **Task 1 (tracer, `e405534f7`).** The op is reachable over rustInvoke: the constant and its list entry, the `engineOpRequest` mapping, the regenerated `ipc_contract.rs` (+16 lines; `ipcSchemaSnapshot.json` is unchanged), the `RustInvokeChannel::EngineBottleRemovePerGame` arm and `rpc_bottle_remove_per_game` in `engine_op_arms!`. The arm test list covers bad-args (zero, one non-object, two arguments) and `not-ready` before install. A shell test builds a FakeHome context, seeds the game's bottle and a sibling, sends the channel's frame through `gamelib_engine::dispatch_sync` (what the arm does over the installed context) and sees `{outcome: "removed"}`, the bottle gone and the sibling intact. It also asserts the channel name resolves through the generated `RustInvokeChannel::from_name`. On a non-macOS host it asserts `not-bottle-backed` and the bottle kept, because the crate answers that off macOS.
- **Task 2 RED (`07095bfbf`).** Ten uninstaller cases written first (nine failed on behaviour): the op is called once with `{runner, appName, stored, knownInstalls, selfKey, protectedRoots}` and `removed` skips the prefix delete; `not-bottle-backed` with a custom prefix removes it as before; with the default prefix deletes nothing and logs one fixed line; `refused` pushes the `remove-bottle` notice with the reason and `otherTitle`; a crate-only reason reads `bad-reply`; `failed` pushes a failed notice; a rejected call is logged with fixed text (no path or error text), reads as failed `rust-invoke-failed` and does not undo the uninstall; an unreadable reply reads failed `bad-reply`; a Steam game never reaches the op. The existing pre-flight / prefix-guard tests answer the new channel through a local wrapper over `fakeSafetyRustInvoke` (`not-bottle-backed`), and the call-order expectation gained the op.
- **Task 2 GREEN (`a3a7fd647`).** `removeGameBottle` in `enginewine/bottles.ts` (one returned typed call), the `removePrefix` route, the schedule row (`shape: 'shim'`, channel `RUST_ENGINE_BOTTLE_REMOVE_PER_GAME`, `callers: BOTTLES_SHIM_IMPORTERS`, `deletedBy: 98`), `src/backend/utils/uninstaller.ts` added to `BOTTLES_SHIM_IMPORTERS`, and the `EXPECTED_SURVIVORS` row (77 to 78, floor and length) with a comment naming the user's 2026-11-24 gap decision 5 (F5) as the authority extending the D-22/D-23/D-24 survivor list.

## Verification

- `cargo test --bin gamelib-shell engine_dispatch`: 33 passed (includes the new channel test and the arm test with the new row); `rustfmt --edition 2021 --check` clean; `pnpm check:ipc-contract` up to date.
- `pnpm exec jest` over `uninstaller.test.ts`, `engineWineShimSchedule.test.ts`, `engineWinePortComplete.test.ts`: 3 suites, 406 tests passed. `pnpm codecheck`, `pnpm lint` (production and tests ceilings PASS) and `pnpm find-deadcode` (310 baselined findings, PASS) pass.
- Prettier: every written TS path reported `ignored: false` and `--check` passes (`ipc_contract.rs` is generated and owned by `check:ipc-contract`).
- Acceptance: `RUST_ENGINE_BOTTLE_REMOVE_PER_GAME` x2 in sidecarTransport.ts; `rpc_bottle_remove_per_game` x2 in engine_dispatch.rs (more after the added test and arm); `name: 'removeGameBottle'` x1; `uninstaller.ts` in `BOTTLES_SHIM_IMPORTERS` x1.

## Deviations from Plan

None that change scope. Notes:

- **The plan's `cargo test --bin gamelib-shell rust_dispatch` filter matches no test** (0 run; the `fails_when` names "a cargo filter prints 0 passed"). `rust_dispatch.rs` has no tests of its own: its arm is a one-line delegation to the `engine_dispatch` arm and is compile-checked by the exhaustive `match` over the generated enum. The arm is covered by the `engine_dispatch` filter (33 passed). Not a defect of the work; the plan's command line should drop that filter.
- **Task 1 is one commit** (tracer: test and implementation together), so its test was green on first run; the RED-before-GREEN split is Task 2's.
- **The shell test calls `dispatch_sync` over a context of its own** rather than the arm: `engine_ctx()` is a process-wide `OnceLock` that a unit test cannot install. This is what the arm does after its global lookup; the arm's bad-args and not-ready behaviour is the arm test's job.
- **[Rule 1 - lint] `pnpm lint` error in my own test** (`unknown | Error` union, `no-redundant-type-constituents`) fixed before the GREEN commit by typing the helper's argument `unknown`; the helper's async arrows were also made promise-returning to add no `require-await` warnings.
- **The RED commit leaves the uninstaller suite red by design** (TDD); the schedule, survivor and dead-code gates were green at every commit, since the shim and its rows landed together in the GREEN commit.

## Parity note (from 87-66): post-cxbottle guard re-check

The Rust op has no re-check of the guard after `cxbottle --delete` (the TS bridge route's WR-09). **Parity is not needed for this route.** After `cxbottle --delete --force` the directory is normally gone, so a late objection cannot un-delete anything, and the op's final guarded `remove_tree` re-checks whatever is left before deleting it. The caller here adds no deletion of its own after the op answers `removed`. If WR-09 is ever wanted on the Rust side it is a change to the crate op (87-66's file), not to this route.

## Known gaps carried to later plans

- **`in-use` and `unsafe-name` read as `bad-reply` in the notice.** A refusal because the game is running in the bottle shows the generic reason. Adding `in-use` to `REMOVAL_REASONS` touches `common/types/safety.ts`, the removal-refused IPC schema, `safetyWireParity.test.ts` and the renderer message; suited to 87-67 (the dialog control), which already touches the renderer side.
- **The pre-flight prefix check in `uninstallGameCallback` is unchanged**: it still runs the `prefix` guard on the stored `winePrefix` before the uninstall, for every non-Steam game, including one that has its own bottle. Whether that pre-flight verdict is right for a bottle-backed game is for the live re-run (item 7), not decided here.
- **The shared-default-prefix rule is now enforced in the backend as well as in the dialog**; the dialog control is 87-67.

## Threat model

| Threat | Disposition | Where |
|--------|-------------|-------|
| T-87-132 channel arguments | mitigated | the crate's request is `deny_unknown_fields`; the contract is regenerated and checked; no path or bottle name is an argument |
| T-87-133 default prefix deleted for a game with no bottle | mitigated | `removePrefix` keeps a stored prefix equal to the global default and logs one fixed line (uninstaller test) |
| T-87-134 refusal the user never sees | mitigated | refused and failed outcomes push the `remove-bottle` notice (uninstaller tests) |
| T-87-SC package installs | accepted | no new dependency (`zod` was already in use) |

## Known Stubs

None.

## Threat Flags

None: no new endpoint, auth path or file access outside the plan's threat model. The new channel is the one the model lists.

## Self-Check: PASSED

- All ten files in `key-files.modified` exist and are in the plan's range (`git diff --stat ad8a995eb..a3a7fd647`).
- Commits `e405534f7`, `07095bfbf` and `a3a7fd647` are ancestors of HEAD.
- `commits: 3` is measured from the persisted ledger (`ad8a995eb..a3a7fd647`).
