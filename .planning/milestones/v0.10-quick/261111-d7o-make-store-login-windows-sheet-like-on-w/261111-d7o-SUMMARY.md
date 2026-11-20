---
phase: quick-261111-d7o
plan: 01
subsystem: src-tauri/login_window
tags: [tauri, windows, linux, login-window, modal, owner-window]
status: complete
requirements: [QUICK-261111-d7o-store-login-sheet-like-windows-linux]
key-files:
  created:
    - src-tauri/src/login_window/owned_modal.rs
  modified:
    - src-tauri/src/login_window.rs
    - src-tauri/src/login_window/humble_open.rs
    - src-tauri/src/main.rs
decisions:
  - "Raw owner setters (owner_raw / transient_for_raw), never WebviewWindowBuilder::parent(): parent() consumes the builder on Err, which would turn an owner-handle miss into a failed login."
  - "Single release choke point (release_owned_login_modal) hooked on close-requested AND Destroyed, idempotent via a label registry, so main is re-enabled exactly once on every close path."
commits: 2
plan_head_before: 290ac101391cdf2024e4889805a65adf8c3f23fe
plan_head_after: 1e71e89818e856f8b5f68fb13c912393311c2ad4
actuals:
  tokens: 0
  tasks: 2
  commits: 2
---

# Phase quick-261111-d7o Plan 01: Store login window sheet-like on Windows/Linux Summary

Off macOS, the visible store login window (Epic, GOG, Amazon, Humble share one arm) is now owned by main and centered over it with no taskbar button. On Windows main is disabled while it is up and re-enabled and re-focused on every close path. On Linux it is transient for main and GTK-modal (best effort). With no usable main it opens exactly as before.

`actuals.tokens` is recorded as 0 because it was not measured; it is not an estimate of the real cost.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 (tracer) owner + modal + release on every close path | `51e6ee982` | owned_modal.rs (new), login_window.rs, humble_open.rs |
| 2 centering, Linux GTK modal | `1e71e8981` | owned_modal.rs, main.rs |

Both commits were made on `main`: `.planning/config.json` has `git.branching_strategy: none`, the orchestrator stated main / no worktree, and recent history is direct commits on main. The generic "refuse to commit on a protected branch" assertion was therefore not applied.

## Verification (against baseline captured before any edit)

Baselines and "after" captures are in `baseline/` beside this file.

| Gate | Before | After |
| ---- | ------ | ----- |
| `cargo test --bin gamelib-shell` | 416 passed, 0 failed, 3 ignored | 427 passed, 0 failed, 3 ignored (+11 = 4 registry + 7 centering) |
| clippy ratchet (win32, 1.99.1) | PASS | PASS, listing identical modulo line numbers |
| rustfmt per-file hunk counts (login_window tree) | 1/9/4/2/3/1 | identical, no owned_modal.rs line |
| Rust-source jest set (16 suites PASS) | 3 failed tests: FAIL set = tauriShellSource, appRootResolution, shortcutsFlows | identical FAIL set, `3 failed, 4 skipped, 650 passed` both times |
| tauriShellSource.test.ts + loginChromeCssInjection.test.ts | 1 failed: the WR-07 `.title(` string-literal test | identical single failure |
| `cargo check --all-targets` | n/a | no warning in owned_modal.rs or humble_open.rs (warnings listed are pre-existing in other files) |
| grep non-comment `WindowEvent::CloseRequested` in owned_modal.rs + humble_open.rs | n/a | 0 |

The one failing pinned test (WR-07 `.title(`) and the other two failing jest suites are pre-existing on this Windows box and unchanged by this work. I did not investigate them.

Prettier: `npx prettier --file-info src-tauri/src/login_window/owned_modal.rs` printed `{ "ignored": false, "inferredParser": null }` (no Rust parser), so `prettier --check` was omitted as the plan specified. rustfmt is the gate.

The TDD RED step was observed for both tasks (stubbed helper bodies failed the tests, then the real bodies passed).

## macOS unchanged (read from the diff)

`git diff 290ac1013 -- humble_open.rs` adds non-comment lines only inside the existing non-macOS sub-block (the `attach_login_owner` call and the `match`), or under their own `#[cfg(not(target_os = "macos"))]` (`login_owner` declaration and the `present_owned_login_window` call). `owned_modal.rs` is `cfg(not(target_os = "macos"))` at its `mod` declaration. The macOS rust-test leg in CI is the compile proof; I could not compile macOS here.

## Close-path census

`grep -rn '\.close()\|\.destroy()' src-tauri/src` (comments excluded):

- `humble_open.rs:787, :806`: `humble_login_close`'s programmatic `window.close()`. This is how OAuth success, the sidecar deadline and cancel arrive. `close()` emits close-requested first, so the release listener fires and re-enables main before the destroy.
- `humble_reveal.rs`: hidden reveal windows, never registered, release is a proven no-op.
- `sheet.rs`: macOS only, not compiled here.
- `store_embed/controls.rs`, `store_embed/open.rs`: embedded store webviews, not login windows.
- No `.destroy()` calls exist. `Destroyed` is still hooked as the catch-all (owner teardown, any future `destroy()`).

Title-bar X is the close-requested variant. A failed `.build()` returns at `.build()?` before registration, and a failed `show()` releases immediately, so main is never left disabled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New shell source file not registered in main.rs's source census**
- **Found during:** Task 2 full `cargo test` (Task 1's filtered `owned_modal` run could not see it)
- **Issue:** `tests::shell_source_files_names_every_shell_module_file` failed: "shell .rs files missing from SHELL_SOURCE_FILES/SHELL_SOURCE: [login_window/owned_modal.rs]". The Task 1 commit therefore briefly had a red test.
- **Fix:** Added `"login_window/owned_modal.rs"` to `SHELL_SOURCE_FILES` and `include_str!("login_window/owned_modal.rs")` to `SHELL_SOURCE_PARTS` in main.rs (2 lines, test-module-only). Went into the Task 2 commit, so Task 2's commit touches `main.rs` in addition to `owned_modal.rs`, contrary to the plan's "owned_modal.rs only".
- **Files modified:** src-tauri/src/main.rs
- **Commit:** `1e71e8981`

**2. [Rule 1 - Bug] `Result<bool, tauri::Error>` is not PartialEq**
- **Found during:** Task 1 first compile
- **Issue:** the plan's `is_visible() == Ok(true)` does not compile.
- **Fix:** `matches!(.., Ok(true))` / `matches!(.., Ok(false))`.
- **Commit:** `51e6ee982`

Test split: the plan's 7 centering behaviours are 7 tests (the odd-size floor case is its own test) so the +11 count holds.

## Owed / not verified here

- **Windows live check: PASSED (operator, 2026-11-11), all 7 items.** Run `pnpm tauri:dev` at main's normal size:
  1. Sign in to Humble, GOG, Amazon, Epic one at a time: each window opens centered over main, above it, no taskbar button.
  2. While a login is open, main ignores clicks. Clicking main's taskbar button brings the login forward.
  3. Close with the title-bar X: main is clickable again at once and comes to the front, not another app.
  4. Finish a real sign-in so the window auto-closes: main is re-enabled.
  5. Shrink main to its minimum and open a login: the login's title bar and X are not above main's top edge.
  6. Win+D while a login is open, then restore main from the taskbar: the login returns above main and its X still closes it.
  7. Humble disconnect and key reveal (hidden windows) never disable main.
- **Linux is compile-only via CI.** The `#[cfg(target_os = "linux")]` code (`transient_for_raw`, `gtk_window()`, the `with_webview` GTK modal) cannot compile on this Windows host (gtk-sys needs system libraries). Its proof is the ubuntu leg of `.github/workflows/rust-test.yml`. It mirrors the `store_embed/layout.rs` pattern (`gtk::prelude::*`, `pw.inner().upcast()`); the `toplevel().and_then(downcast::<gtk::Window>)` / `set_modal(true)` calls are new and unverified.
- **Mixed-DPI residual.** The hidden window's size is read in the primary monitor's DPI before it is shown, so on mixed-DPI setups centering can be off by that ratio.
- **Wayland.** `outer_position` is unsupported there; positioning is skipped (logged) and `transient_for` lets the compositor place the window.

## Sequencing note for 261111-buh

d7o landed first, as decided. buh's byte-identical-move baseline (`humble_open.rs` L90-732 at `b5b51c65a`) is no longer valid: this change edits comments and adds the `login_owner` declaration, the `attach_login_owner` call/match, and the `present_owned_login_window` call in that range. buh must re-derive its anchors and treat the new non-macOS lines as part of the moved body. This work did not touch any buh file.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths or file access. New `shell_eprintln!` lines log labels, fixed reason strings and numeric values only (T-d7o-02); no URL, origin or title.

## Self-Check: PASSED

- owned_modal.rs, login_window.rs, humble_open.rs, main.rs: present and in commits `51e6ee982`, `1e71e8981`.
- `git rev-list --count 290ac1013..HEAD` = 2 (measured from the on-disk ledger).
