---
phase: quick-261106-ab1
plan: 01
status: complete
subsystem: src-tauri shell
tags: [refactor, rust, tauri, source-text-tests]
key-files:
  created:
    - src/backend/testUtils/tauriShellSource.ts
    - src-tauri/src/{sidecar,tray,terminate_veto,shell_state,relay_commands,clipboard,login_window,keyring_dispatch,wake_lock,store_embed,single_instance}.rs
    - src-tauri/src/wake_lock/{macos,windows,linux}.rs
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/store_embed_handoff_policy.rs
    - 15 jest/meta source-text readers
commits:
  - b62cf4172 refactor: route shell source-text tests through shared helper
  - df547170b refactor: split main.rs into sibling modules
  - 5f53f7f8e fix: list main.rs last so mod-tests slicing keeps module code in scope
---

# Quick 261106-ab1: split main.rs into modules

`src-tauri/src/main.rs` went from 20,324 to 7,886 lines. Eleven sections moved verbatim into sibling module files, and every source-text test now reads through one shared helper.

## What moved

| New file | Contents |
| --- | --- |
| sidecar.rs | contract mirror, lifecycle and stdout reader, spawn tail (3 chunks, original order) |
| tray.rs | tray icon, recent-games and settings surface, `dispatch_tray_launch`, inline `tray_settings_lock` |
| terminate_veto.rs | quit-via-sidecar routing, macOS app-menu quit, `macos_terminate_veto`, `terminate_reply_tests` |
| shell_state.rs, relay_commands.rs, clipboard.rs, keyring_dispatch.rs | their marked sections |
| login_window.rs | login window, `macos_invite_focus`, humble reveal/clear, pristine Epic webview |
| wake_lock.rs plus wake_lock/{macos,windows,linux}.rs | the inline mods became `#[path = "wake_lock/x.rs"] mod <original name>;`, with no rename |
| store_embed.rs | store/wiki embed, inline `linux_store_embed_layout` |
| single_instance.rs | deep-link argv helpers, Windows and Unix single-instance guards |

main.rs keeps the `shell_eprintln!` macro, the Builder/setup/`generate_handler!` wiring, `fn main`, the diag and panic-hook helpers, `mod tests`, and the unmarked block (`INVOKE_TIMEOUT`, `LONG_RUNNING_CHANNELS`, abandoned-id ring, keyring constants, `SidecarRpcRequest`).

The `mod x;` and `use x::*;` lines sit after the macro and the existing sibling mods. Placement choices where the plan was ambiguous:
- The quit-via-sidecar routing (`SIDECAR_QUIT_CHANNEL` to `quit_via_sidecar`) went into terminate_veto.rs next to the macOS quit items.
- `dispatch_tray_launch` went into tray.rs.

## Verification

- `cargo check --bin gamelib-shell`: clean, 1 warning (`observe_live_url` never used; its only callers are tests, so it is not new). Baseline was also 1 warning.
- `cargo test --bin gamelib-shell`: 420 passed, 0 failed, 2 ignored. Baseline was 419 passed, 2 ignored, plus the 1 new guard test. The test build has the same 2 snake-case warnings as before.
- `#[tauri::command]` count is still 7 (relay_commands.rs 4, main.rs 3). `generate_handler![...]` needed no `module::name` change, because the glob import brings in the `__cmd__` macros.
- Mechanical-move proof (sorted lines with `pub(crate)`/`pub(super)` stripped, before vs after) shows only these differences:
  - the new `mod`, `use x::*;`, `use super::*;` and `#[path]` lines;
  - 3 inline-mod `{`/`}` lines and blanks;
  - `include_str!` replacements;
  - the `SHELL_SOURCE`, `SHELL_SOURCE_FILES` and guard-test lines;
  - one `trim_start_matches("pub(crate) ")` edit and one extra `starts_with("pub(crate) fn ")` alternative in the `clear_default_data_store_cookies_for_domain` test.
- Jest, full suite: 5 failing suites, 5 failing tests, identical to the baseline set. None are caused by this change:
  - `themeTokens`
  - `macArchKnownFixRouting`
  - `tauriShellSource` (the WR-07 `.title(format!` test; I confirmed it fails the same way against the HEAD copy of the file)
  - `findDeadcode` (the `SteamLibraryRoute` used-in-module baseline entry)
  - `genI18nGateScope`
- Jest, the 17 source-text suites from Task 1, run alone: all green except that same WR-07 test. The 4 new helper-scope guard tests pass.
- Prettier is clean on the written TS paths. ESLint reports no errors on them. `tsc --noEmit` is clean.
- `graphify update .` exited 0.

## Visibility audit (step 6)

193 top-level items were given `pub(crate)` by a script that word-matches each name in every other shell `.rs` file, comments excluded. This covers Windows and Linux cfg-gated references that the macOS compiler cannot see. The item-to-referencing-file list is in the scratchpad (`audit1.txt`). Struct fields and methods were fixed from compiler errors. A second pass over fields and methods found only false positives from common names such as `new`, `default` and `as_str`; I checked the plausible ones by hand. No `super::super` paths and no `pub(super)` outside `tray_settings_lock::get` exist in the moved code.

## Deviations from plan

1. **[Rule 3 - blocking] Helper orders `main.rs` last, not first.**
   - The plan said `main.rs` first. Many tests take "production code" as everything before the first `mod tests {`.
   - With `main.rs` first, that slice dropped every module file, and 12 jest assertions failed (loginChromeCssInjection and tauriShellSource).
   - With `main.rs` last, the idiom keeps all module code and drops only the cargo test module.
   - The guard test (a) was changed to assert main.rs is listed last. This is not one of the plan's fix categories (a) to (c), so it is a design change to my own Task 1 helper; no assertion in any consumer test was altered.
2. **[Rule 3 - blocking] Pre-existing sibling `store_embed_handoff_policy.rs` reads `main.rs` via `include_str!`.** The plan did not list it. Two tests (`.on_new_window({` and `.on_download({`) failed once those hooks moved, so both `include_str!` calls now point at `store_embed.rs`. Both are positive positional checks, so no assertion was weakened.
3. **[Rule 1/3] Rust test `epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache`** matched `starts_with("fn clear_default_data_store_cookies_for_domain")` and the next top-level `fn` or `pub fn`. The function is now `pub(crate) fn`, so the matcher accepts that prefix. This is the Rust analogue of the plan's category (b).
4. **Test title renamed.** The `keyringTokenStore.test.ts` test title carried the literal `src-tauri/src/main.rs'` and tripped the new guard (d). It now reads "parsed live from the Rust shell source".
5. **Task 1 scope additions.** Unused-import and unused-const cleanups (`join`, `readFileSync`, `REPO_ROOT`) that ESLint required. Guard (d)'s allowlist also names the helper and the guard test file themselves, with reasons.
6. **Rust site split.** Of the 9 `include_str!("main.rs")` call sites, 4 (those with negative or count assertions, or unseen assertions) use `SHELL_SOURCE`. The 4 positive positional ones use their owning file (`relay_commands.rs` or `store_embed.rs`). The 9th, the cookie arms test, uses `SHELL_SOURCE`.

## Coverage limits (stated plainly)

- macOS: compiled and tested locally.
- Windows: not compiled here. It is covered only by the CI `rust-test.yml` (windows-latest) after push, plus the grep audit.
- Linux-cfg code (`linux_wake_lock`, `linux_store_embed_layout`, and the rest) has no compile coverage anywhere, because CI has no Linux cargo job. Only the grep audit covers it.
- clippy was not run, because the repo does not run it. `cargo fmt` was intentionally not run.
- Non-test comments citing `src-tauri/src/main.rs` (about 70 files) were left unchanged by design.

## Known stubs

None.

## Self-Check: PASSED

The commits b62cf4172, df547170b and 5f53f7f8e exist. All new `.rs` files and the helper exist. No tracked file was deleted.
