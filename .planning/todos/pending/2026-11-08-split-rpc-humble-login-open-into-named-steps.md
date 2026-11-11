---
created: 2026-11-08T00:00:00.000Z
title: 'Split rpc_humble_login_open into named steps'
area: shell
severity: minor
platform: any
ready: live-gate
---

Phase 71 D-06 extracts `rpc_humble_login_open` whole, so its body moved verbatim from the
`dispatch_rust_channel` arm into `src-tauri/src/login_window/humble_open.rs`. It is a single
641-line function (non-blank body plus comments), the largest handler in the shell.

A split into named steps (argument parsing, window build, presentation, native bar install) would
change control flow on the login path, so it needs a live sign-in on macOS (sheet presentation,
native login bar ordering) before it can land. The jest and cargo source pins read the handler
body, so they keep guarding the ordering needles across such a split only if the split keeps
them inside one function or the pins are repointed in the same commit.

**Status (2026-11-11):** the split landed in `2da0210de` and `ea210b612` (quick 261111-buh).
`rpc_humble_login_open` is now a 124-line handler that calls five named steps in order:
`arm_visible_login_latch_macos`, `build_login_window`, `install_native_bar_for_sheet_macos`,
`present_visible_login_window_macos` and `install_login_window_close_hook`. Argument parsing stays
inline. The quick-261111-d7o owner wiring (`login_owner`, `attach_login_owner`,
`present_owned_login_window`) now lives in `build_login_window`. Every moved code line is
byte-identical, per the quick dir's `baseline/verbatim-full.txt`. The jest pins now read the
handler with each step spliced in at its call, plus a linkage test, in the same commits.

Live gates still owed. macOS: the three macOS-only steps were never compiled on the planning
machine, so the first macos-latest rust-test run carrying these commits is their compile and
clippy check. Pass condition: a live sign-in presented as a sheet with the native bar; a second
visible login refused while the first is pending; x/Esc resolving it; Epic and GOG pristine sheets
unchanged. Windows: a visible login window owned by main and centred over it, main disabled while
it is up and re-enabled on close, titled `origin — document title`, where closing it resolves the
sign-in. Close this todo once both pass.
