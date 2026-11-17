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

## macOS live gate (2026-11-17): PASS

Run under `pnpm tauri:dev` on a build carrying the split (no `src-tauri/src` file newer than the
running binary).

- **Compile and clippy.** `cargo clippy --all-targets` in `src-tauri` on macOS: no errors. The two
  warnings in `humble_open.rs` (`== true` at the latch, borrowed `initialization_script` arg) both
  blame to `f25afa977`, before the split; the first is deliberate per its own comment. CI did not
  provide this check: macos-latest rust-test on `aad9cedc6` failed earlier, on the unrelated
  `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first`.
- **Sheet with native bar:** Humble, Epic, GOG and Amazon all present as sheets. Amazon shows the
  in-app `TauriLoginPanel` "preparing" panel for about a second first, while `nile auth --login`
  fetches the URL. That is frontend behaviour from before the split, not a sheet fallback.
- **x and Esc** each resolve the Humble sign-in (`closed before login completed — cancelling watch`
  at 21:20:12 and 21:20:16).
- **Epic and GOG pristine sheets** unchanged.
- **Real Humble sign-in** completed: session cookie stored at 21:22:48.
- **Second visible login refused: not reachable from the UI.** The sheet is modal, and the Amazon
  `nile` spawn gap the latch comment describes (~7-8s) now measures about 1s (`nile auth --login`
  21:15:42, window label 21:15:43), too short to click a second store. The refusal path was not
  exercised live.

Not a gate item: the first library sync after the sign-in returned `access_denied` (Humble 403 or
429) at 21:22:48, in the sidecar's fetch path, which the split did not touch.

Windows live gate still owed.
