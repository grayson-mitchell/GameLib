---
phase: quick-261109-nq1
plan: 01
status: complete
files_modified: [src-tauri/src/main.rs]
commits: [82c85af81, a4dcbd428, 80b7450e6]
---

# Quick 261109-nq1: split fn main setup into named steps

Tasks 1 and 2 are done and committed. Task 3 (live gate) passed on 2026-11-10.

## What changed (src-tauri/src/main.rs only)

`fn main` shrank from 1,181 lines to 142. The `.setup()` closure is now `.setup(move |app| run_setup(app, primary_listener, no_gui))`. `run_setup` calls these steps in the original order:

1. macOS notifications and gamepad one-liners (inline)
2. `spawn_sidecar_state`
3. `start_single_instance_accept_loop`
4. `install_os_deep_link_handler` (placed BELOW `fn main`; the REQ-46-08 gate needs `.setup(move |app|` before `on_open_url(`)
5. `register_os_deep_link_scheme`
6. `manage_sidecar_state` (moves `state`, no new clone)
7. Tray comment block and `tray_settings()` (inline)
8. `apply_start_in_tray`
9. `attach_main_window_close_handler`
10. `route_macos_quit_paths` (macOS only)
11. `attach_main_window_focus_refresh`
12. `seed_tray_recent_games`
13. `build_tray_icon`
14. `install_login_sheet_esc_monitor` (macOS only), after the inline "DELIBERATELY RETIRED" comment
15. `hide_for_no_gui_or_open_devtools`

Pre-builder extractions: `prepare_single_instance_socket_path`, `hand_off_to_running_instance_unix`, the `PrimaryListener` cfg alias, and `handle_exit`.

Bodies were moved verbatim by a script that dedents line ranges from the original file. Only signatures, call sites and `argv` borrows changed.

## Baseline vs after

| Measure | Before | After |
| --- | --- | --- |
| `cargo test --bin gamelib-shell` | 453 passed, 0 failed, 2 ignored | 453 passed, 0 failed, 2 ignored |
| clippy ratchet `--list` | 37 lines (the ratchet already reports FAIL for `needless_range_loop` at main.rs, which predates this work) | 37 lines, identical once line numbers are stripped |
| shell-source jest set (35 suites) | 1 failed (WR-07 `.title(format!` in tauriShellSource.test.ts, pre-existing), 960 passed | same single failure, 960 passed |
| `fn main` lines | 1,181 | 142 (limit 160) |
| main.rs non-test lines | about 1,885 (line before `#[cfg(test)]` at 1886) | about 1,978 (`#[cfg(test)]` at 1979) |

The non-test count grows by about 93 lines of signatures and doc comments. This is the D-13 allowance noted in the plan.

Other checks:
- `cargo check --all-targets` shows only pre-existing warnings.
- The placement awk check passes. The first `#[cfg(debug_assertions)]` is at line 1548, `fn main` at 1678, `run_setup(` at 1780 and `on_open_url(` at 1824.
- `graphify update .` ran.
- Prettier was omitted by design, since this is a `.rs` file.

## Deviations from Plan

**1. [Rule 3 - gate conflict] The Windows Secondary arm stays inline in `fn main`.**
- Found during: Task 1.
- Issue: `tauriShellSource.test.ts` ("Secondary exit", about line 3499) reads the text between the last `WindowsSingleInstanceRole::Secondary` and the next `WindowsSingleInstanceRole::Primary`. It requires `deliver_to_running_instance_windows(` and `std::process::exit(0)` there. Extracting `hand_off_to_running_instance_windows` broke it.
- Fix: no Windows hand-off fn; the arm stays as it was. The Unix hand-off was extracted, and its gates pass.

**2. [Rule 3 - gate conflict] `.run` keeps a `match event`; only `handle_exit` is extracted, not `handle_run_event`.**
- Found during: Task 1.
- Issue: two gates read source text.
  - `tauriShellSource.test.ts` (line 853) wants `RunEvent::ExitRequested` in the text after `.run(move |app_handle, event|`.
  - `sidecarShutdownFlagSource.test.ts` (line 104) wants `begin_shutdown()` between `tauri::RunEvent::ExitRequested` and `tauri::RunEvent::Exit =>`.
- Fix: the short `ExitRequested` arm stays inline in the `.run` closure. `RunEvent::Exit =>` calls `handle_exit(app_handle, single_instance_socket_path_var.as_deref())`.
- Plan impact: the plan's key_link pattern `handle_run_event(app_handle, event` no longer applies, since that function does not exist.

**3. [Rule 1] `register_os_deep_link_scheme` gets `#[cfg(not(any(target_os = "linux", windows)))] let _ = app;`.**
- Without it, the `app` parameter is unused on macOS. The line sits after the Windows repair, so the Linux `register_all()` cfg-guard gate is unaffected.

No test or gate file was edited.

## Commit history

- `82c85af81` is the first Task 1 commit. It extracted `handle_run_event` and the Windows hand-off, and was superseded by `a4dcbd428`.
- Between my commit and my amend, another agent landed `825d3a7e3` (docs 73-16). My `git commit --amend` swallowed it.
  - I undone that with `git reset --soft 825d3a7e3` and recommitted only `main.rs` as `a4dcbd428`.
  - `825d3a7e3` is intact in history. The undone amend was never pushed.
- `80b7450e6` is the Task 2 commit.
- Each commit touches only `src-tauri/src/main.rs`.

## Known limitations

- Windows-only code (`#[cfg(windows)]`) is not compiled on this Mac. Only the accept-loop move touches it, and its body is verbatim apart from the added `let _ =` on non-unix/windows targets.
- No new stubs or threat surface.

## Task 3: live gate (PASSED 2026-11-10, operator ran all 5 steps)

Launch with `pnpm tauri:dev` (never `tauri:dev:run`). Stop any running dev session first and confirm with `pgrep -fl gamelib-shell`. The sidecar is untouched, so no `build:sidecar` is needed.

1. Window appears. Devtools open in the debug build. The terminal shows `window focus refresh: listener attached to 'main'` and a `close handler attached` line.
2. The tray icon is present, with Show, About, Quit and recent games. The terminal shows `tray recent games: seeded N entr...`. Left-click with the window hidden or minimized brings it back.
3. Minimize the window, then run `src-tauri/target/debug/gamelib-shell` in a second terminal. It prints `another GameLib instance is already running -- sending focus sentinel...` and exits. The first window un-minimizes, with `focus sentinel raise: unminimize=ok, show=ok, set_focus=ok`. There is only one sidecar (`pgrep -fl sidecar`).
4. Library and store data load, with no "could not start its backend process" dialog.
5. Quit via the tray menu (log: `exit requested (code=Some(0))`), then relaunch. Sign-ins persist with no Keychain prompt.

## Self-Check: PASSED

Commits `82c85af81`, `a4dcbd428` and `80b7450e6` exist. `src-tauri/src/main.rs` contains `fn run_setup(`.
