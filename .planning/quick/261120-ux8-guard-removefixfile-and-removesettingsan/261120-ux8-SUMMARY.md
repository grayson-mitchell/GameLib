---
phase: quick-261120-ux8
plan: 01
subsystem: backend-uninstall-safety
tags: [safety, uninstall, path-traversal, ipc-schema, rust-guard]
requires:
  - phase 82 guardedRemoveTree / gamelib-safety crate
provides:
  - removeFixFile and removeSettingsAndLogs deleting through the Rust guard with app-data targets
  - plainNameArg() IPC validator, applied to the uninstall channel
affects:
  - src/backend/utils/uninstaller.ts
  - src/common/types/ipc/install.ts
tech-stack:
  added: []
  patterns: [app-data target with per-site trustRoot, closed-set log-only refusal]
key-files:
  created: []
  modified:
    - src/backend/utils/uninstaller.ts
    - src/backend/utils/__tests__/uninstaller.test.ts
    - src-tauri/crates/gamelib-safety/tests/adversarial.rs
    - src/common/types/ipc/schemaTypes.ts
    - src/common/types/ipc/install.ts
    - src/backend/sidecar/__tests__/ipcSchemas/install.test.ts
    - .planning/todos/completed/2026-11-20-uninstall-file-deletes-trust-renderer-appname.md
decisions:
  - "Refusal at these two sites is a closed-set warning line only, no toast and no new RemovalRefusalKind"
  - "existsSync pre-filter before the guard: no rustInvoke when no candidate file exists"
  - "No selfKey on these requests (resetHeroic shape)"
status: complete
commits: 3
plan_head_before: e6839cfb9356fa967a9915edfe9dce6342eb281c
plan_head_after: f747e126e2cd0c97694840c0c867fd4f48932dde
actuals:
  tokens: 30000
  tasks: 3
  commits: 3
completed: 2026-11-20
---

# Quick 261120-ux8: Guard removeFixFile and removeSettingsAndLogs Summary

Both uninstall file deletes now go through the shared Rust guard with `app-data` targets under per-site trust roots, so a renderer `appName` such as `../config` is refused (`outside-trust-root`) instead of deleting GameLib's own `config.json`; the `uninstall` IPC also rejects non-plain-name appNames.

Note on `commits`: `git rev-list` over the ledger range reports 4 because a concurrent plan commit (`c4e51620d feat(82-08)`) landed in the same range. This plan's own commits are 3.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 (tracer) | 20043cf5e | removeFixFile through guardedRemoveTree (app-data, trustRoot fixesPath) plus the crate row |
| 2 | 4e920290d | removeSettingsAndLogs through the same guard (one request, three targets, trustRoot gamesConfigPath) |
| 3 | f747e126e | plainNameArg() on the uninstall IPC, todo moved to completed with resolution |

## What changed

- `uninstaller.ts`: new private helper `removeAppDataFiles` (existsSync pre-filter, one `guardedRemoveTree` request, one closed-set `logWarning` on non-removed). Both exported/internal deletes are async and awaited in `uninstallGameCallback`. The file no longer performs any raw file delete (`rmSync` import removed).
- `adversarial.rs`: `app_data_file_outside_its_trust_root_is_refused_and_kept` (refused with `OutsideTrustRoot`, file survives check and remove).
- `schemaTypes.ts` / `install.ts`: `plainNameArg()` rejects `/`, backslash, NUL, `.` and `..`; applied to the `uninstall` tuple only.
- Todo `2026-11-20-uninstall-file-deletes-trust-renderer-appname` closed with `resolved`/`resolution` and a Resolution section.

## Verification

- `uninstaller.test.ts` + `nonSteamDeleteGate.test.ts` + `ipcSchemas/install.test.ts`: 129 passed. New `261120-ux8` tests in uninstaller.test.ts: 8 (4 fix-file, 4 settings). RED was observed before each implementation (new tests failed, then passed).
- `cargo test -p gamelib-safety -p gamelib-testutil`: all pass (including both `app_data_file_*` rows); `cargo clippy -p gamelib-safety --all-targets -D warnings` and `cargo fmt --check` clean.
- `pnpm backend-di-ceilings`, `pnpm find-deadcode`, scoped `prettier --check` (all paths confirmed not-ignored first) pass. `pnpm codecheck` shows no errors in files this plan touched.
- `pnpm planning-gates`: 11/12; `state-sdk-field-anchor-gate.py` fails on `.planning/STATE.md` (a file this plan did not touch). `todo-frontmatter-gate.py` passes.

## Deviations from Plan

None to the plan's behaviour. Implementation detail: the Task 2 settings change was drafted alongside Task 1; the Task 1 commit was cut with the settings site still on its original code (temporarily restored) so each commit holds exactly its task.

## Deferred Issues (pre-existing, out of scope)

- `pnpm codecheck` fails on `src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts` (`BottleRemovalDeps` / `SteamSafetyDeps` mismatches) from the concurrent, uncommitted Steam plan 82-08 work in the working tree.
- `eslint --max-warnings 0` on `uninstaller.ts` reports two `import-x/no-named-as-default-member` warnings for the existing `i18next.t(...)` calls (lines predate this plan).
- `state-sdk-field-anchor-gate.py` failing on STATE.md.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust-boundary surface; the change tightens existing ones.

## Self-Check: PASSED

- Commits 20043cf5e, 4e920290d, f747e126e exist on HEAD.
- Todo exists in `.planning/todos/completed/`, absent from `pending/`.
- Only plan paths were staged; unrelated dirty files (`public/locales/en/gamelib.json`, `.planning/state.json`, spike logs, steam files, dxvk-cache) were not committed.
