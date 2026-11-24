---
phase: 94-humble-bundle-and-shortcuts
plan: 11
subsystem: backend
tags: [rust, shortcuts, tracer, sanitize-filename, win32-path, reg-exe, resolver, d-12, d-20, d-21, pitfall-9]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-02 gamelib-shortcuts crate skeleton and dispatch contract; 94-03 survivor schedule; 94-05 sanitize, paths and exists goldens; 94-07 windows/reg goldens
provides:
  - gamelib_shortcuts::{sanitize, paths, registry, exists, testing} and the op shortcuts_exist
  - ShortcutPaths, ShortcutsLog, ShortcutsCtx::{with_paths, with_proc, with_expand_env, with_log, note}, ExistArgs
  - src-tauri/src/shortcuts_dispatch.rs (install, shortcuts_ctx, rpc_shortcuts_exist) and the RustInvokeChannel::ShortcutsExist arm
  - RUST_SHORTCUTS_EXIST and RUST_SHORTCUTS_CHANNELS in sidecarTransport.ts, with the rustInvoke args schema
  - src/backend/sidecar/shortcutsResolvers.ts (resolveShortcutsExists, registerShortcutsResolvers) and its schedule row
  - tests/golden_paths.rs (replays every sanitize, paths, exists and windows/reg golden)
affects: [94-14, 94-15, 94-22, 94-30]

requirements-completed: []

actuals:
  tokens: 29500
  tasks: 2
  commits: 2

plan_head_before: aa48ee06240953397b413d826e9904cfdc544466
plan_head_after: 1c0b4bca7f7eef4779686a98e954759d1c1a95eb

tech-stack:
  added: []
  patterns:
    - "a JS-library port works on UTF-16 code units (sanitize_utf16) so a lone surrogate and the 255-byte cut behave as in Node, with a &str convenience over it"
    - "the golden JSON is read leniently: lone-surrogate escapes (which serde_json refuses) become U+FFFD in text fields, and the exact code units are compared from the units arrays"
    - "Node path.win32 isAbsolute and normalize are hand-ported on u16 so the registry replay behaves the same on every host the goldens run on"
    - "a presence test is injected (shortcuts_exist_at) so the win32 oracle's existsSync spy over the synthetic Z: Desktop is replayed exactly"
    - "a read-only tracer: the TS handle is deleted in the same commit as the resolver, and every census that counted it moves down by one"

key-files:
  created:
    - src-tauri/crates/gamelib-shortcuts/src/{sanitize,paths,registry,exists,testing}.rs
    - src-tauri/crates/gamelib-shortcuts/tests/golden_paths.rs
    - src-tauri/src/shortcuts_dispatch.rs
    - src/backend/sidecar/shortcutsResolvers.ts
    - src/backend/sidecar/__tests__/shortcutsResolvers.test.ts
    - src/backend/__tests__/shortcutsChannelParity.test.ts
    - .planning/todos/pending/2026-11-24-windows-desktop-registry-expansion-applies-percent-pairs-in-reg-sz-values.md
    - .planning/todos/pending/2026-11-24-windows-desktop-registry-path-outside-console-code-page-is-dropped.md
    - .planning/todos/pending/2026-11-24-shortcut-title-that-sanitizes-to-empty-gives-a-stem-less-file-name.md
  modified:
    - src-tauri/crates/gamelib-shortcuts/src/{lib,ctx}.rs
    - src-tauri/src/{main,rust_dispatch,ipc_contract}.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/sidecar/{handlers,shortcutsFlowRegistration}.ts
    - src/backend/shortcuts/__tests__/oracle/pathsExists.oracle.test.ts

key-decisions:
  - "The oracle now calls the exported shortcutsExistOnDisk directly instead of the registered handle, because the handle is gone: the exists goldens still compare green against the TypeScript predicate they were recorded from, and 94-22 deletes both with the add and remove handlers."
  - "shortcuts_exist carries title as an optional field: the resolver passes undefined for the library's empty sentinel and JSON drops the key, which Rust reads as no title (false without a lookup). An empty title is the same answer."
  - "The Linux Desktop folder and the Windows %VAR% environment are snapshotted once at install; the TS read user-dirs.dirs on every call. A user who moves their Desktop while GameLib runs needs a restart."
  - "ShortcutsCtx.proc is an Option: headless, a Windows op has no Desktop path (the same answer as a failed query) instead of failing."
  - "The log line for a title-less game carries no app name or runner (T-28-04); the TS warning named them."

patterns-established:
  - "a resolver's census footprint: flowRegistrationCensus, invokeReturnValueSweep, runnerSliceRegistration, the owner-less allowlist in ipcDomainCensus, the router arm count in tauriShellSource and the schema count in rustInvokeSchemas each move by exactly one"

requirements: [SVC-05]
duration: 37min
completed: 2026-11-24
---

# Phase 94 Plan 11: shortcutsExists tracer Summary

**A renderer `shortcutsExists` call is now answered by Rust through one TypeScript resolver that supplies the game's title; the sanitize port, the per-OS paths, the presence rule and the hidden `reg.exe` Desktop read replay every recorded TypeScript golden.**

## What was built

- **Task 1 (tracer, macOS path end to end).** `sanitize.rs` is a hand port of npm `sanitize-filename` on UTF-16 units (illegal and control characters, dots-only names, Windows reserved names with the JS `.` rule, trailing dots and spaces, the 255-byte cut on a segment boundary where a lone surrogate costs three bytes). `paths.rs` is `shortcutFiles`: Linux and Windows build their strings by concatenation as the TS template literals do, macOS joins under the home, and a Windows Desktop with no registry answer is `None`, never `<home>\Desktop`. `exists.rs` counts a path present when it exists or is a symlink (a dangling Desktop link counts). `shortcuts_dispatch.rs` builds the one `ShortcutsCtx` after the store host opens (`SystemClock`, the global shutdown, `SpecProcRunner`, home, app data, icon folder, `current_exe()`, `current_dir()`; nothing spawned) and `rpc_shortcuts_exist` answers `<op>:not-ready` before install. `resolveShortcutsExists` reads the title as a `const`, makes the one `requestRustInvoke(RUST_SHORTCUTS_EXIST, ...)` call, and `registerShortcutsResolvers` installs the handle; the TS `shortcutsExists` handle is deleted in the same commit.
- **Task 2.** `registry.rs` runs `reg.exe query` as a labelled `shortcuts-reg` helper with a 5 s timeout and `hide_window: true`, parses `REG_SZ` and `REG_EXPAND_SZ` with the JS `\s` and `.` classes spelled out, expands `%VAR%` from the shell-supplied environment, and accepts only an absolute path without U+FFFD, normalised with a hand port of Node `path.win32.normalize`. `exists.rs` calls it on Windows. `paths.rs` gained `parseUserDirs` and the exported-variable rule for the Linux Desktop folder; the shell supplies both and the Windows expansion environment. Three copied-quirk todos were filed.

## Evidence

- `golden_paths.rs` replays 72 sanitize, 84 paths, 58 exists and the 23 `windows/reg-*` goldens (manifest count and floor asserted for every slice, reg subset at least 20). Mutating the 255 limit or the reg timeout turns the replay red.
- The win32 exists cases replay with the registry answer injected: the scripted `reg.exe` answers the synthetic Desktop (or a non-zero exit), the Desktop `.lnk` under it is answered by the same kind of presence spy the oracle used, and the registry stage is asserted to return exactly `Z:\GameLibOracle\Desktop` for the registry cases.
- Reg replay also pins the spawn: program, argv, 5000 ms, `hide_window`, no env change, no cwd, no stdin, one spawn per call.
- 36 crate unit tests, 4 golden tests, 8 shell tests (`shortcuts_dispatch::tests`: not-ready, false then true on a fake home, no title, a dangling Desktop link, fixed `bad-args` literal that never echoes the input, app data and expansion rules, the Linux Desktop rule).
- `tauriShellSource`, `rustInvokeSchemas`, `ipcDomainCensus`, `flowRegistrationCensus`, `invokeReturnValueSweep`, `runnerSliceRegistration`, `humbleShortcutsShimSchedule` (36 tests), the new `shortcutsChannelParity` and `shortcutsResolvers` tests, and the 94-05 oracle compare run (all 228 oracle and redaction tests) pass. `cargo test --bin gamelib-shell`: 811 passed.

## Counts that moved (measured after the change, Phase 87 moves the same totals on main)

| Pin | Before | After |
|---|---|---|
| flowRegistrationCensus `shortcutsFlowRegistration.ts` invoke | 6 | 5 |
| invokeReturnValueSweep `shortcuts` / total | 6 / 27 | 5 / 26 |
| runnerSliceRegistration handle-kind, `SHORTCUTS_CHANNELS`, per-module, total | 41, 7, 11/7/11/8/6, 43 | 40, 6, 11/6/11/8/6, 42 |
| ipcDomainCensus owner-less allowlist | 71 | 72 (`Async:shortcutsExists`) |
| tauriShellSource router arms | 188 | 189 |
| rustInvokeSchemas / `RUST_INVOKE_CHANNELS` | 188 | 189 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The schedule rows landed in Task 1, not Task 2**
- **Found during:** Task 1 (the schedule discovers every export of `shortcutsResolvers.ts` and every `RUST_SHORTCUTS_*` call, so the resolver turns it red the moment it exists)
- **Fix:** added the `resolveShortcutsExists` resolver row with `wiring: ['registerShortcutsResolvers']` in the Task 1 commit. Task 2's acceptance grep (`name: 'resolveShortcutsExists'` count 1) holds.
- **Commit:** 8ef47ce13

**2. [Rule 1 - Bug] The 94-05 oracle drove the deleted handle**
- **Found during:** Task 1 (pathsExists.oracle.test.ts failed all 58 exists cases)
- **Fix:** exported `shortcutsExistOnDisk` (documented, `@public`) and the oracle calls it directly; goldens unchanged and the compare run is green.
- **Files modified:** src/backend/sidecar/shortcutsFlowRegistration.ts, src/backend/shortcuts/__tests__/oracle/pathsExists.oracle.test.ts
- **Commit:** 8ef47ce13

**3. [Rule 3 - Blocking] Tests that exercised the deleted handle**
- `shortcutsExistsFallback.test.ts` kept only the 260905-mv5 premise re-verification (code still TypeScript); its handler cases moved to the Rust goldens and `shortcutsResolvers.test.ts`. `shortcutsFlows.test.ts` lost `shortcutsExists` from its registration table and gained a not-registered assertion.

**4. [Rule 2 - missing coverage] Extra files outside `files_modified`**
- `src/common/types/ipc/rustInvoke.ts` (the args schema the contract generator requires for every channel), `ipcDomainCensus.test.ts`, `rustInvokeSchemas.test.ts`, `tauriShellSource.test.ts` (the counts above), plus `shortcutsChannelParity.test.ts` (ops, channels and shell arms held together as later plans add ops) and a `RUST_SHORTCUTS_CHANNELS` list ("the wiki constant's two lists").

**5. [Rule 3 - environment] The shell test build needs gitignored placeholders**
- `cargo test --bin gamelib-shell` fails in tauri-build without `src-tauri/binaries/gamelib-sidecar-<triple>.exe` and the `build/` resources (documented in the main checkout's debug note `rust-test-ci-missing-sidecar`). Empty placeholders were created in this worktree, all gitignored; nothing committed.

**6. Task 2 `tdd="true"`:** the replay goldens and the implementation were written together and committed once, so there is no separate RED commit. The replays were run red against mutations (255 limit, reg timeout) to show they discriminate.

## Divergences from the TypeScript worth knowing

- A title holding a lone UTF-16 surrogate cannot cross JSON into Rust (`serde_json` refuses the escape), so it answers `shortcuts_exist:bad-args`; the TS sanitized it. The sanitize port itself handles lone surrogates (`sanitize_utf16`, replayed by the goldens).
- The Linux Desktop folder is read once at install (see key-decisions).
- The TS warning for a title-less game named the app name and runner; the Rust line is fixed text.

## Windows-only failures (not introduced here)

- `shortcutsFlows.test.ts`: the `containment — knownFolder(desktop)` test fails on this Windows host (documented in memory: "desktop knownFolder resolves under real home"); CI is ubuntu.
- `humblePortComplete` (`noRollbackFlag`) and `infoPortComplete` (`no non-test file names the oracle recorder`) fail on `src/backend/testUtils/humbleOracle/wireRecorder.ts`, a 94-06 file I did not touch (it names `GAMELIB_HUMBLE_ORACLE` and `recordedCaseDir`). Logged in deferred-items.md.
- `bootSourceShape`, `bootstrap`, `appRootResolution`, `devSecretVault`, `installFlows`, `structuralContainment` and `testContainment` fail in `src/backend/sidecar` on CRLF and containment, as the baseline note records.
- `cargo fmt -p gamelib-shell --check` and `cargo clippy -p gamelib-shell -D warnings` have pre-existing findings in untouched shell files and the generated `ipc_contract.rs`; `shortcuts_dispatch.rs` is clean in both.

## Verification

- `cargo test -p gamelib-shortcuts` 36 + 4 passed; `cargo clippy -p gamelib-shortcuts --all-targets -- -D warnings` clean; `cargo fmt -p gamelib-shortcuts --check` clean.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode` (310 baselined, unchanged), `pnpm planning-gates` 12/12; prettier clean over every TS file written; eslint 0 errors (the warnings in `shortcutsFlowRegistration.ts` and `handlers.ts` are pre-existing).
- Not run: `state.advance-plan`, `requirements.mark-complete` (SVC-05 completes at the end of the phase).

## Known Stubs

None.

## Threat Flags

None. T-94-20 (title into a path) is mitigated by the sanitize port pinned to the npm vectors and joins only under shell-supplied roots; T-94-21 (reg.exe) by a `SpawnClass::Helper` spawn through `SpecProcRunner`, 5 s, hidden, reaped on shutdown. No new network surface; one new rustInvoke channel whose args are validated by the zod schema, the generated struct and the crate.

## Self-Check: PASSED

- sanitize.rs, paths.rs, registry.rs, exists.rs, testing.rs, golden_paths.rs, shortcuts_dispatch.rs, shortcutsResolvers.ts, shortcutsResolvers.test.ts, shortcutsChannelParity.test.ts and the three todos: present
- commits 8ef47ce13 and 1c0b4bca7 present
- `grep -c "'shortcutsExists'"` is 0 in shortcutsFlowRegistration.ts and runnerSliceRegistration.test.ts; `RUST_SHORTCUTS_EXIST` count 3 in sidecarTransport.ts; `hide_window = true` in registry.rs
