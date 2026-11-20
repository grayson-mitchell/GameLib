---
phase: quick-261029-o1w
plan: 01
status: complete
subsystem: src-tauri login windows
tags: [macos, gog, login, sheet, appkit]
key-files:
  modified:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
metrics:
  completed: 2026-10-29
---

# Quick 261029-o1w: GOG login window as macOS sheet with native cancel

GOG's pristine (zero-injection) WKWebView login now presents as an AppKit sheet on `main` with a native NSButton "x" cancel in a 32pt top band; GOG joins the T-34.4.2-39 single-flight latch, Epic stays free-floating and exempt.

Status: Tasks 1-2 done and committed. Task 3 (live macOS verification) is pending the user.

## Commit

- `e339e95ac` feat(quick-261029-o1w): Tasks 1 and 2 in ONE commit (the two tasks edit the same hunks of main.rs and the same test file; split was not practical).

## Changes

- `open_pristine_epic_login_window` gets `as_sheet`: builds ordered-out and not centred/focused when true; Epic passes `false` (unchanged output).
- `PristineLoginCancelTarget` (define_class) + `install_native_login_cancel_button`: pure AppKit, flip-aware layout, target leaked on purpose (weak NSButton target), no JS.
- `login_window_ns_window` and `request_login_sheet_cancel` fall back to `get_window` (dismiss still first, then close).
- `open_gog_login_sheet`: pristine build, second Destroyed hook (dismiss + clear latch), watchdog-raced `present_login_window_as_sheet`, visible fallback, single `clear_pending_visible_login_window` after.
- `humble_login_open`: `is_epic_login` (Epic only, before latch, `as_sheet=false`) and `is_gog_login` (after latch).
- Pins updated deliberately: resolver Test 1, request_login_sheet_cancel 2->3, present 1->2, dismiss 2->3, clear_pending 3->6, plus new ordering pin (epic < latch < gog). Epic scope guard untouched and green.

## Verification

- `cargo build`: 0 warnings, 0 errors. `rustfmt --check`: clean.
- `cargo test`: 410 passed, 0 failed, 2 ignored.
- jest: tauriShellSource + loginChromeCssInjection + oauthLoginCapture = 320/320. Full `src/backend`: 329 suites, 8317 passed, 3 skipped, 0 failed (the 2 runnerSliceRegistration failures did not appear in src/backend).
- prettier --check on the .ts file: clean (main.rs not prettier-parseable; rustfmt used).

## Deviations

None to the plan's intent. Single commit instead of two (see above).

## Pending: Task 3 live check

Restart `tauri dev` (Rust changed, no sidecar change), then: GOG sign-in opens as a sheet (log `gog-sheet: sheet_presented=true`); Turnstile passes and form is not clipped by the top band; "x" cancels to idle; Esc cancels; successful login dismisses; optional second sign-in refused; Epic still free-floating.


## Live verification and follow-ups (2026-10-29)

Operator live check in `tauri dev`: steps 1-5 and 7 PASS; step 6 (second sign-in refused) not reachable by hand because the sheet is modal, which is the latch's intent.
Operator styling notes fixed afterwards:
- `eaf461137`: the 32pt reserved band showed as a white title bar. The × now overlays the page's top-right corner, styled 18pt `#caf3fd`. The sheet is 464x592 like the other login sheets (it had inherited Epic's 900x700). `NSColor`/`NSFont` features were added to Cargo.toml.
- `78a108850`: the `#161c1e` box read darker than GOG's form, so the fill was dropped and the × sits on the page background.
All PASS on re-check.
