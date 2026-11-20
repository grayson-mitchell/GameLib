---
phase: quick-261029-osq
plan: 01
status: complete
subsystem: tauri-shell / macOS login sheets
tags: [appkit, nsbox, login-sheet, wedge]
requirements: [TODO-2026-10-03-login-sheet-wedge]
key-files:
  modified:
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
    - src/common/humble/loginChromeCss.ts (comment only)
commits:
  - e625650c4  feat(quick-261029-osq): one native dark title bar for every macOS login sheet
---

# Quick 261029-osq: native dark title bar for all macOS login sheets

Status: Tasks 1 and 2 done and committed (`e625650c4`). Task 3 (live macOS check) is pending, and the wedge todo is NOT closed.

## Feasibility (Task 1) - no STOP condition holds

Resolved versions (`src-tauri/Cargo.lock`): wry 0.55.1, tauri-runtime-wry 2.11.4.

1. A `WebviewWindow` webview is built with `WebviewKind::WindowContent`, so `build()` is called, not `build_as_child`: tauri-runtime-wry `src/lib.rs:5246-5253` (`WindowChild => build_as_child`, `WindowContent => build`). Not a child, so `is_child == false`.
2. wry `src/wkwebview/mod.rs:663-686`: for `!is_child` it makes a `WryWebViewParent`, sets `ViewHeightSizable|ViewWidthSizable` on it, `addSubview(&webview)`, `setContentView(parent)`, `makeFirstResponder(webview)`.
3. `class/wry_web_view_parent.rs` overrides only `keyDown:` (line 29) and `drawRect:` (line 41). No `layout`, `resizeSubviews` or `setFrame` override, so no re-layout of subviews.
4. `set_bounds` (wry `mod.rs:1010-1028`) is a no-op on macOS unless `self.is_child`. tauri-runtime-wry stores `WebviewBounds{0,0,1,1}` under `unstable` (`lib.rs:4983-5003`) and calls `set_bounds` on `Resized` (`lib.rs:4325-4345`); that call is a no-op for non-child webviews.
5. The only `.set_size(`/`.set_position(` in main.rs are `store_embed_set_bounds` (~7204-7207), which is not a login window. The GOG pristine WKWebView is ours (`initWithFrame_configuration`), added to tao's content view; no wry code touches it.

Chosen mechanism: set the WKWebView frame to the container bounds minus a 32pt top band, keep `ViewWidthSizable|ViewHeightSizable` (both margins fixed so the inset survives resize), and add the bar views as siblings in the same superview pinned to the top edge (flip-aware). The visual half of this gate is Task 3 item 1 plus the `login-bar: installed ... webview_y= webview_h= bar_h=` log line.

## What was built (Task 2)

- `install_native_login_bar(container, webview, origin, app, label, mtm)` in main.rs: `#161c1e` NSBox fill (32pt), `#272f31` 1pt NSBox rule at the page-facing edge, centred 12pt `#caf3fd` origin NSTextField (tail truncation, inset 36pt each side), borderless 18pt x NSButton (tooltip and accessibility label "Cancel sign-in"), webview inset by `native_login_bar_band()`. Public AppKit only, no private API, no JS.
- `NATIVE_LOGIN_BAR_HEIGHT` (was `NATIVE_LOGIN_CANCEL_BUTTON_SIZE`), `LoginSheetCancelTarget` (was `PristineLoginCancelTarget`), main-thread `thread_local` label registry, `update_native_login_bar_origin` (fire-and-forget hop), `set_native_login_bar_origin_on_main`, `forget_native_login_bar` (called from both `Destroyed` hooks).
- Injected path (`humble_login_open`): bar is installed through `window.with_webview` (WKWebView + `superview()`), confirmed over mpsc within `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`, BEFORE the sheet spawn. Unconfirmed install logs a WARN, skips the sheet and takes the existing free-standing `show`+`set_focus` fallback (T-osq-02). `on_page_load` now calls `update_native_login_bar_origin` in place of the banner eval (same cfg/`len=` log/placement).
- GOG pristine path: `open_pristine_epic_login_window` calls the same builder under `if as_sheet`; `EpicPristineNavDelegate` gained `webView:didCommitNavigation:` which reads the committed `webview.URL()` origin (shell-side value) and updates the registry directly on the main thread. Epic (`as_sheet == false`) gets no bar.
- Deleted: `login_cancel_strip_script`, `login_origin_banner_script`, `login_origin_banner_update_script`, `login_scrollbar_inset_script`, `LOGIN_CANCEL_EXFIL_PATH`, `is_login_cancel_request`, the `.on_navigation(` closure and its captures (`nav_sentinel_label`, `app_for_cancel`), and the ~26 Rust tests of those functions (the `login_cancel_*`, `login_origin_banner_*`, `login_scrollbar_*` cases, `TEST_LOGIN_ORIGIN`). `login_chrome_css_script` is unchanged and still ungated.
- New Rust test: `native_login_bar_band_pins_the_top_32pt_in_both_coordinate_systems` (h=592 unflipped -> (560, 0, 560); flipped -> (0, 32, 560); tiny container never goes negative).
- 464x592 kept (comment added at the size call): the old bar overlaid the top 32px, so the visible page was already 464x560; native 32pt bar + 560pt webview is the same area. GOG loses 32pt of page height versus its overlaid-x iteration; Task 3 item 5 checks the form fits.

### Cargo features (`objc2-app-kit`)
Added `NSBox`, `NSText` (NSTextAlignment), `NSParagraphStyle` (NSLineBreakMode), `NSAccessibilityProtocols` (`setAccessibilityLabel`), each justified in the Cargo.toml comment block. `NSBox` is net-new compiled surface; the others were added declaratively (I did not verify which were already unioned by tao/wry; the comment says "net-new unless tao/wry already union them"). `cargoFeatures.test.ts` did not need changes and passes. Cargo.lock unchanged.

### Test pins renamed/removed (tauriShellSource.test.ts)
- Identifier list `PHASE_34_4_2_NEW_SYMBOLS`: dropped `LOGIN_CANCEL_EXFIL_PATH`, `is_login_cancel_request`, `login_cancel_strip_script`; added `LoginSheetCancelTarget`, `update_native_login_bar_origin`. `install_native_login_bar` is deliberately NOT added (see deviation 1).
- "NEGATIVE/RETIGHTENED ... at most one .on_navigation( ..." -> now asserts zero `.on_navigation(` in the arm and that `.on_page_load(` exists.
- "quick 260927-o3h REGRESSION" -> macOS half pins `update_native_login_bar_origin(` (was `login_origin_banner_update_script`); closure now sliced to `.build()`.
- Phase 34.4.2 Plan 02 "Test 3 (INVERTED)": anchor `let sheet_presented = if visible {` -> `... if visible && native_bar_installed {`.
- Plan 08 "Test 1" (strip called once) -> replaced: `install_native_login_bar(` called once in the arm, before `present_login_window_as_sheet(`, gated by `native_bar_installed`, and `sheet_presented` requires it. "Test 2" (.on_navigation closure) -> replaced: no `.on_navigation(`, no `is_login_cancel_request`/`LOGIN_CANCEL_EXFIL_PATH`.
- Plan 08 "Test 3 (ORDERING)": `request_login_sheet_cancel(` exactly 3 -> exactly 2; re-anchored on `struct LoginSheetCancelTarget;` .. `fn install_native_login_bar(`; dismiss-before-close half kept.
- Plan 08 "Test 5" and "Test 6" (strip body key/value negatives) and Plan 11 "Test 4 (WR-03/IN-02)": deleted with their subject.
- Plan 13 "Test 4" (surviving sentinel) -> file-wide negative on `parse_autofill_request`/`is_login_cancel_request`; "Test 5" (strip survived) -> asserts the three injected scripts are gone and `fn install_native_login_bar(` exists.
- Guard 1 (464x592) and the Epic scope guards untouched and green.

### loginChromeCssInjection.test.ts
D-2 gate re-anchored on the `login_chrome_css_script(` call itself (the banner call it sliced from is gone). Same meaning, two checks: brace depth at the call is exactly 1 (not inside a cfg block) and the line above is not `#[cfg(`. Both synthetic RED proofs rewritten and still prove RED (depth 2; cfg attribute above).

## Verification results
- `cargo build`: 0 warnings. `cargo fmt -- --check`: clean.
- `cargo test`: 370 passed, 0 failed, 2 ignored. The test profile emits 2 pre-existing warnings (snake-case test names `the_keyring_available_arm_only_ever_READS_the_probe_account`, `wake_lock_kind_maps_the_two_kinds_to_DIFFERENT_assertions`), unrelated to this change.
- jest: tauriShellSource, loginChromeCssInjection, cargoFeatures, `sidecar/__tests__/oauthLoginCapture`, and `src/common`: 16 suites / 689 tests pass. All 32 test files that reference `main.rs`: 32 suites / 1052 tests pass.
- prettier `--check` clean on the 3 changed TS paths (`--file-info`: not ignored). Zero hits for the deleted identifiers in non-comment main.rs and in src/meta/scripts.

## Deviations from Plan
1. **[Rule 1/scope] `install_native_login_bar` not added to `PHASE_34_4_2_NEW_SYMBOLS`.** That list is asserted absent from `open_pristine_epic_login_window` and `EpicPristineNavDelegate`; the GOG pristine function legitimately calls the shared builder, so listing it would fail the Epic scope guard. Its presence is pinned by Plan 08 Test 1 / Plan 13 Test 5 instead. `LoginSheetCancelTarget` and `update_native_login_bar_origin` were added as planned.
2. **[Rule 3] Comment-only edit in `src/common/humble/loginChromeCss.ts`** (it named the deleted `login_origin_banner_script`). Not in the plan's file list.
3. Epic scope: `didCommitNavigation` was added to the shared `EpicPristineNavDelegate`, so it also fires for Epic; it is a no-op there (no registry entry). Flagged because Epic's delegate is otherwise "byte-frozen".
4. Commit: one commit, not split.

## Known risk to confirm live
- `didCommitNavigation` is the only origin-tracking route for GOG; unit tests cannot observe it. Task 3 item 5 should include a cross-origin hop if GOG produces one.
- Label vertical position uses a fixed 16pt label height centred in the band; check it looks centred.

## Threat Flags
None beyond the plan's register. No private API, no JS injected into GOG.

## Pending
- Task 3 live human-verify (operator). After approval: move the wedge todo to `completed/` with `## Resolution`, add the STATE row, commit `docs(quick-261029-osq): close login-sheet wedge todo`.


## Live verification (2026-10-29)

Operator approved Task 3: all 8 checks passed (tauri dev, `AppleShowScrollBars=Always`). The wedge todo has been moved to `todos/completed/` with a Resolution.
