---
phase: quick-261128-7wv
plan: 01
subsystem: shortcuts / windows known folders
tags: [windows, registry, RegGetValueW, rustInvoke, shortcuts, cloud-saves]
requires: []
provides:
  - "gamelib-shortcuts registry::ShellFolderSource seam, Win32ShellFolders (RegGetValueW), ShellFolderMiss, read_windows_shell_folder_from"
  - "rustInvoke channel windows_shell_folder_read (raw unexpanded Desktop/Personal value or null)"
  - "TS readWindowsShellFolder native-first with reg.exe fallback"
affects: [shortcuts_exist, shortcuts_add, shortcuts_remove, save_sync Documents path]
tech-stack:
  added: ["windows-sys 0.61 (cfg(windows) dependency of gamelib-shortcuts; already locked, no new crate)"]
  patterns: ["injected native source with reg.exe fallback", "one shared accept pipeline for both read paths"]
key-files:
  created: []
  modified:
    - src-tauri/crates/gamelib-shortcuts/src/registry.rs
    - src-tauri/crates/gamelib-shortcuts/src/ctx.rs
    - src-tauri/crates/gamelib-shortcuts/src/exists.rs
    - src-tauri/crates/gamelib-shortcuts/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/shortcuts_dispatch.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
    - src/backend/sidecar/knownFolders.ts
    - src/backend/sidecar/__tests__/knownFolders.test.ts
    - src/backend/save_sync.ts
decisions:
  - "ShellFolderSource::read takes the typed WindowsShellFolder, so only Desktop and Personal can ever be read"
  - "A rejected native answer does not fall back to reg.exe (same data, only mangled); the fallback is for no native answer"
  - "A Desktop miss logs one fixed-phrase line per ShellFolderMiss variant and never the value or path (T-28-04)"
metrics:
  tasks: 3
  completed: 2026-11-28
status: complete
commits: 3
plan_head_before: c8dd0b0b368351de8d9a9a5dea60aebd312829d9
plan_head_after: abf105efd84152f434687d4f31e9065e0981a864
actuals:
  tasks: 3
  commits: 3
---

# Quick 261128-7wv: Windows Desktop and Documents folder read via RegGetValueW

The Windows `User Shell Folders` values (Desktop in Rust, Documents in TS) are now read through `RegGetValueW`
(UTF-16) in the Rust shell, with `reg.exe` kept as the fallback. A redirected path with characters outside the
console code page is no longer turned into U+FFFD, rejected and dropped without a word.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | `8f2bc794c` | `ShellFolderSource` seam, `Win32ShellFolders` (RegGetValueW), shared accept pipeline, `ShellFolderMiss` and the one-line Desktop diagnostic, shell wiring under `cfg(windows)` |
| 2 | `cb43bf5f9` | rustInvoke channel `windows_shell_folder_read` (zod strict enum, generated serde args, `shell_folder_read_with`), count 223 to 224 |
| 3 | `abf105efd` | TS `readWindowsShellFolder` asks the channel first, `SaveSyncDeps.requestRustInvoke?`, new native-first test cases |

## Verification run

- `cargo test -p gamelib-shortcuts`: all green, goldens and fixtures unedited (`git diff HEAD -- tests` empty), including
  the real-registry read of `Desktop` and `Personal` on this Windows host.
- `cargo clippy -p gamelib-shortcuts --all-targets -- -D warnings`, `cargo fmt -p gamelib-shortcuts --check` and
  `rustfmt --edition 2021 --check` on the two shell files: clean.
- `cargo test --bin gamelib-shell shortcuts_dispatch::`: 24 passed.
- Cargo.lock diff: one added line (`windows-sys 0.61.2` under gamelib-shortcuts).
- `pnpm check:ipc-contract`, `pnpm -s codecheck`: pass.
- Jest: `rustInvokeSchemas`, `tauriShellSource`, `rustChannelAllowlist`, `shortcutsChannelParity`, `rustInvokeChannel`
  (560 tests) and `knownFolders`, `runnerMiscFlows`, `getDefaultLegendarySavePathRefresh`, `testContainment` (98 tests): pass.
- eslint adds no new warning (the two remaining in `save_sync.ts` lines 71 and 74 are pre-existing); prettier clean on
  every `.ts` path written. `pnpm planning-gates`: 12/12.
- `src/common/types/ipc/ipcSchemaSnapshot.json` did not change on regeneration (it holds no rustInvoke entries), so it is not in any commit.

## Deviations from Plan

None. The plan was executed as written. Notes:

- The exists.rs test that seeds a real Desktop link under a native path is `#[cfg(windows)]`: a Windows path
  (backslashes, drive letters) is only a usable directory on Windows. The cross-platform proof of the native path is in
  the `registry` tests, which touch no filesystem.
- `rustfmt` reformatted one `for bad in [...]` array in the new shell test; the committed form is the formatted one.

## For the orchestrator's docs commit

- The todo move is staged (`git mv`) but NOT committed:
  `.planning/todos/pending/2026-11-24-windows-desktop-registry-path-outside-console-code-page-is-dropped.md` to
  `.planning/todos/completed/` (same name), with a `## Resolution` section appended (unstaged edit on top of the rename).
- This SUMMARY and STATE.md are not committed by this run.

## Notes for later

- The TS `'Desktop'` arm of `readWindowsShellFolder` now also benefits from the native read, though no live TS caller asks
  for Desktop (the Desktop shortcut is written in Rust).
- The sibling todo `2026-11-24-windows-desktop-registry-expansion-applies-percent-pairs-in-reg-sz-values.md` stays open.
  It needs the registry value type (REG_SZ vs REG_EXPAND_SZ), which the native source does not carry: that fix needs
  `RegGetValueW`'s type out-parameter threaded through `ShellFolderSource`.
- A real non-ASCII redirected Desktop was not live-tested; the proof is fake-source unit tests plus the real-registry read.

## Known Stubs

None.

## Threat Flags

None. The new rustInvoke channel is the one in the plan's threat model (T-7wv-03), restricted to two names.

## Self-Check: PASSED

- Commits `8f2bc794c`, `cb43bf5f9`, `abf105efd` exist in `git log`.
- All listed key files exist; the staged todo rename is present in the index.
