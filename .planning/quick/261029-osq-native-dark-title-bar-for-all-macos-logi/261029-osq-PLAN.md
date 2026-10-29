---
phase: quick-261029-osq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/__tests__/loginChromeCssInjection.test.ts
  - .planning/todos/completed/2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md
autonomous: false
requirements:
  - TODO-2026-10-03-login-sheet-wedge
must_haves:
  truths:
    - "With AppleShowScrollBars=Always, the Humble/Amazon/Zoom/GOG login sheet shows no light wedge in the scrollbar gutter at the rounded top-right corner"
    - "Every macOS login sheet (Humble, Amazon, Zoom, GOG) shows one native dark 32pt bar: #161c1e fill, 1pt #272f31 bottom line, centred origin text in #caf3fd, a native × at the right"
    - "The bar's origin text comes from the shell-validated main-frame URL and follows main-frame origin changes. It never comes from page content or the document title"
    - "× and Esc both cancel the sheet and the login flow settles as cancelled; a sheet whose bar install is unconfirmed is never presented (it falls back to a free-standing window)"
    - "The page area sits below the bar; no in-page cancel strip, origin banner or scrollbar inset script is injected on macOS any more"
    - "Epic's free-floating pristine window and all Windows/Linux login windows are unchanged; Humble's footer/navbar CSS still applies on every platform"
  artifacts:
    - path: "src-tauri/src/main.rs"
      provides: "install_native_login_bar (shared builder), LoginSheetCancelTarget, NATIVE_LOGIN_BAR_HEIGHT, origin-label registry + update_native_login_bar_origin"
      contains: "fn install_native_login_bar("
    - path: "src-tauri/Cargo.toml"
      provides: "objc2-app-kit NSBox feature (plus any other net-new feature), each with a justification comment"
      contains: "NSBox"
  key_links:
    - from: "humble_login_open (visible, macOS)"
      to: "install_native_login_bar"
      via: "window.with_webview -> PlatformWebview::inner() WKWebView + its superview, confirmed over mpsc BEFORE present_login_window_as_sheet"
      pattern: "install_native_login_bar\\("
    - from: "open_pristine_epic_login_window (as_sheet)"
      to: "install_native_login_bar"
      via: "main-thread closure right after ns_view.addSubview(&webview)"
      pattern: "if as_sheet"
    - from: "humble_login_open on_page_load main-frame origin refresh"
      to: "update_native_login_bar_origin"
      via: "replaces the window.eval(login_origin_banner_update_script) call"
      pattern: "update_native_login_bar_origin\\("
---

<objective>
Replace the injected in-page title bar on every macOS login sheet with one native AppKit bar. The bar is 32pt, dark, with a centred origin label and a native ×. The webview sits 32pt below it, and the same builder serves the injected sheets (Humble/Amazon/Zoom) and the GOG pristine sheet.

Purpose: fix the light wedge in the scrollbar gutter at the sheet's rounded top-right corner. The wedge todo proved no in-page lever can fix it. Insetting the webview at least 26pt from the top corners zeroes WebKit's `_effectiveCornerRadii` there, so the scrollbar starts at the webview's top and nothing is left to paint. The fix uses public AppKit only. The private `_effectiveCornerRadii` override is ruled out (user steer: no private API in the credential window).

Output: the shared native bar in main.rs; three injected chrome scripts plus the /login-cancel sentinel channel deleted; test pins updated by name; live-verified; wedge todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md
@.planning/quick/261003-nsk-humble-login-title-bar/261003-nsk-CONTEXT.md
@.planning/quick/261029-o1w-gog-login-window-as-macos-sheet-with-nat/261029-o1w-SUMMARY.md

Load `Skill("gamelib-conventions")` (the `<verify>` formatter rule) and
`.claude/skills/spike-findings-gamelib/references/login-window-ux-macos.md` (the sheet must always show a cancel control and must dismiss itself) before editing.

<planner_findings>
## Feasibility, read from the vendored source by the planner (Task 1 re-confirms)

Versions: wry 0.55.1, tauri-runtime-wry 2.11.4. Tauri's `unstable` feature is ON for macOS (`src-tauri/Cargo.toml`, `[target.'cfg(target_os = "macos")'.dependencies]`).

1. A `WebviewWindow` webview is `WebviewKind::WindowContent`, so tauri-runtime-wry calls `webview_builder.build(&window)`, never `build_as_child` (tauri-runtime-wry lib.rs ~5245-5253). In wry that means `is_child == false`.
2. When `is_child == false`, wry (`src/wkwebview/mod.rs` ~663-686) wraps the WKWebView in a `WryWebViewParent`, sets autoresizing `ViewWidthSizable|ViewHeightSizable` on both the parent and the webview, calls `ns_window.setContentView(parent)`, then `makeFirstResponder(webview)`. The webview's initial frame is a zero-size rect that only reaches full size through autoresizing (~400-423, ~502-510).
3. `WryWebViewParent` (`class/wry_web_view_parent.rs`) overrides only `keyDown:` and `drawRect:` (traffic-light repositioning). It has no `layout`, `resizeSubviews` or `setFrame` override, so it never re-lays-out its subviews.
4. Because `unstable` is on, tauri-runtime-wry stores `WebviewBounds{0,0,1,1}` for every webview (~4993-5003). On `TaoWindowEvent::Resized` (~4331-4345) and on `SetBounds`/`SetSize`/`SetPosition` it calls `wry::WebView::set_bounds`. On macOS that function is a no-op unless `self.is_child` (wry ~1010-1028). So no resize, sheet attach, `set_size` or page load ever rewrites the WKWebView frame for this window. Only AppKit autoresizing acts on it.
5. The pristine GOG webview is ours (`WKWebView::initWithFrame_configuration` in `open_pristine_epic_login_window`), added straight into tao's content view, and no wry code touches it.

**Mechanism:** set the WKWebView frame to the superview's bounds minus a 32pt top band, keeping `ViewWidthSizable|ViewHeightSizable`. With that mask both margins stay fixed, so the 32pt top inset survives any resize. Add the bar views as siblings in the same superview, with `ViewWidthSizable` plus the top-pinning margin (`ViewMinYMargin` when not flipped, `ViewMaxYMargin` when flipped). Read `isFlipped()` at runtime, as `install_native_login_cancel_button` already does. The injected path reaches the views through `window.with_webview(|pw| pw.inner())` (WKWebView pointer) and `webview.superview()`.

## Script inventory (macOS sheet path of `humble_login_open`, `if visible`)

| script | role | fate |
| --- | --- | --- |
| `login_cancel_strip_script` (+ `/login-cancel` sentinel: `LOGIN_CANCEL_EXFIL_PATH`, `is_login_cancel_request`, the `.on_navigation(` arm, `app_for_cancel`/`nav_sentinel_label`) | pure chrome: × via hidden-iframe sentinel | DELETE. Only the strip ever emitted the sentinel, so the channel has no sender left. The `.on_navigation(` closure's only job is that arm, so delete the closure too. A navigation to `gamelib.invalid` then fails to resolve, which is harmless. `REVEAL_EXFIL_HOST` and the reveal/clear-storage arms are untouched |
| `login_origin_banner_script` + `login_origin_banner_update_script` (and its `window.eval` in `on_page_load`) | pure chrome: centred origin | DELETE. Replaced by the native label and `update_native_login_bar_origin` |
| `login_scrollbar_inset_script` | pure chrome: holds the classic scrollbar below the in-page bar | DELETE. The webview now starts below the bar, so there is nothing to inset |
| `login_chrome_css_script` | FUNCTIONAL: hides Humble footer/navbar, all platforms | KEEP, unchanged, still outside any `#[cfg(` |

All three deleted scripts sit behind `#[cfg(target_os = "macos")]` and are called only from that block, so deleting them changes nothing on Windows or Linux. Keep `request_login_sheet_cancel`, because Esc (`"esc"` route, ~main.rs:13702) and the native × still call it.

## Size decision: keep 464x592

The injected bar was `position: fixed` OVER the page's top 32px with no padding. The visible page area was therefore already 464x560 below a 32px bar. A 464x592 window with a native 32pt bar and a 560pt webview shows exactly the same area, and the page's top 32px is no longer hidden. The operator measured and chose 464x592, and the `humble_login_open` comment block plus Guard 1 pin it. Growing the window to 624 would enlarge the page area beyond what the operator approved. GOG loses 32pt of page height compared with its overlaid-× iteration. Task 3 checks that GOG's form still fits; if it does not, report that as an issue rather than silently resizing.

## Existing contracts the executor uses

- `fn request_login_sheet_cancel(app: &AppHandle, label: &str, route: &str)` (macOS): dismiss, then close (falls back to `get_window`).
- `PristineLoginCancelTarget` (`define_class!`, ivars `{app, label}`, `cancelLogin:`) and its `new(app, label, mtm)`. NSButton's target is weak, so the target is intentionally leaked with `std::mem::forget`.
- `install_native_login_cancel_button(ns_view, app, label, flipped, mtm)`: borderless 18pt `#caf3fd` × with tooltip "Cancel sign-in". This plan supersedes it.
- `const NATIVE_LOGIN_CANCEL_BUTTON_SIZE: f64 = 32.0`
- `open_pristine_epic_login_window(app, label, url, visible, user_agent, as_sheet)`: GOG passes `as_sheet = visible`, Epic passes `false`. Its delegate `EpicPristineNavDelegate` currently implements `webView:decidePolicyForNavigationAction:decisionHandler:` and the three JS-panel UI methods.
- `humble_login_open` visible arm: `origin = url.origin().ascii_serialization()` (shell-validated); `on_page_load` writes `page_load_origin` and calls `login_window_title`; the sheet is presented via a spawned `present_login_window_as_sheet` raced against `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`, with a free-standing visible fallback (~main.rs:8935).
- `with_webview` + mpsc confirmation pattern: see `humble_login_clear_cookies`'s macOS branch (~main.rs:9589). Its comment explains why `Ok` from `with_webview` does not prove the closure ran.
- The injected cancel strip's last style values (for visual parity): bar 32px, `#161c1e` fill, text `#caf3fd` sans-serif 12px, horizontal padding 36px, × 18px in a 32x32 box with a 1px `#272f31` bottom border, accessible name "Cancel sign-in".
</planner_findings>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Feasibility gate (re-confirm the vendored-source finding, or STOP)</name>
  <files>(read-only; findings go in the SUMMARY)</files>
  <action>
Re-confirm the five `<planner_findings>` facts against the vendored crates the build actually resolves. Check `src-tauri/Cargo.lock` for the wry and tauri-runtime-wry versions. Read `~/.cargo/registry/src/*/wry-VER/src/wkwebview/mod.rs` (non-child build path, `set_bounds`) and `class/wry_web_view_parent.rs`. Read `tauri-runtime-wry-VER/src/lib.rs` (the `WebviewKind::WindowContent` build, the `unstable` WebviewBounds branch, the `TaoWindowEvent::Resized` handler). Also grep `src-tauri/src/main.rs` for any `set_size(`/`set_bounds(`/`set_position(`/`set_auto_resize(` call on a login-window label. The planner found only one `.set_size(` (~7207), and it is not a login window.

STOP conditions: if any of these holds, do NOT start Task 2. Return a `checkpoint:decision` naming the fact and the file:line.
(a) A login `WebviewWindow` is built as a child webview.
(b) macOS `set_bounds` writes the frame for non-child webviews.
(c) `WryWebViewParent` (or tao's content view) re-lays-out its subviews.
(d) Some main.rs path resizes or re-bounds a login webview after build.

Otherwise, record a short "Feasibility" section in the SUMMARY: each fact with its file:line, and the chosen mechanism (frame inset plus a width/height-sizable mask on the WKWebView, bar siblings pinned to the top edge). Note that the visual half of this gate is Task 3 item 1, plus the `login-bar: installed` frame log line that Task 2 adds.
  </action>
  <verify>
    <automated>W=$(ls -d ~/.cargo/registry/src/*/wry-0.55.1 | head -1) && grep -q "if self.is_child" "$W/src/wkwebview/mod.rs" && ! grep -qE "method\((layout|resizeSubviewsWithOldSize:|setFrame:|setFrameSize:)\)" "$W/src/wkwebview/class/wry_web_view_parent.rs" && grep -q 'name = "wry"' -A1 /Users/graysonmitchell/Projects/GameLib/src-tauri/Cargo.lock && echo FEASIBLE</automated>
  </verify>
  <done>The SUMMARY has a Feasibility section citing file:line for facts 1-5, and none of the STOP conditions holds. If one does, the executor stopped with a checkpoint and Task 2 did not start. This task writes only `.planning` files, which prettier ignores, so no prettier check applies.</done>
</task>

<task type="auto">
  <name>Task 2: One shared native bar for both macOS sheet paths; delete the injected chrome; re-pin tests</name>
  <files>src-tauri/src/main.rs, src-tauri/Cargo.toml, src/backend/__tests__/tauriShellSource.test.ts, src/backend/__tests__/loginChromeCssInjection.test.ts</files>
  <action>
All new Rust is `#[cfg(target_os = "macos")]`. Keep doc comments short and factual, and cite quick-261029-osq and the wedge todo.

(1) Shared builder. Rename `NATIVE_LOGIN_CANCEL_BUTTON_SIZE` to `NATIVE_LOGIN_BAR_HEIGHT: f64 = 32.0`, and `PristineLoginCancelTarget` (plus its ivars struct) to `LoginSheetCancelTarget`, keeping the same `cancelLogin:` body that calls `request_login_sheet_cancel(.., "native")`. Replace `install_native_login_cancel_button` with `fn install_native_login_bar(container: &NSView, webview: &NSView, origin: &str, app: AppHandle, label: String, mtm: MainThreadMarker)`. `container` is the webview's superview. The function does the following, in order:

- Reads `container.isFlipped()` and `container.bounds()`.
- Sets the webview frame to the bounds minus a `NATIVE_LOGIN_BAR_HEIGHT` band at the TOP edge (flip-aware), with autoresizing `ViewWidthSizable|ViewHeightSizable`.
- Adds a custom `NSBox` (boxType Custom, borderWidth 0, no title) filling the band, with fill sRGB `#161c1e`.
- Adds a 1pt `NSBox` at the band's bottom edge, with fill `#272f31`.
- Adds an `NSTextField::labelWithString(origin)`: centred alignment, `systemFontOfSize(12.0)`, text colour `#caf3fd`, not selectable or editable, single line. It is inset 36pt from both sides (room for the ×) and vertically centred in the band. Truncate long origins if the feature is available; otherwise single-line clipping is acceptable.
- Adds the × `NSButton`, styled exactly as the current one (borderless, 18pt, tint `#caf3fd`, tooltip "Cancel sign-in"), in a 32x32 frame at the band's right edge.
- Sets an accessibility label "Cancel sign-in" on the button. This preserves the strip's former aria-label; it needs objc2-app-kit's `NSAccessibilityProtocols` feature if that is not already unioned.
- Gives every bar view `ViewWidthSizable` (the × gets `ViewMinXMargin` instead) plus the top-pin margin (`ViewMinYMargin` unflipped, `ViewMaxYMargin` flipped).
- Leaks the cancel target, as today.
- Registers the label in a main-thread-only registry, a `thread_local!` `RefCell<HashMap<String, Retained<NSTextField>>>` keyed by window label.
- Logs one line: `[shell] login-bar: installed for '{label}' flipped={} webview_y={} webview_h={} bar_h={}`. This is frame numbers only, never the origin (T-34.4.1-106 discipline).

Add `fn update_native_login_bar_origin(app: &AppHandle, label: &str, origin: &str)`: it hops to the main thread via `run_on_main_thread` (fire-and-forget) and calls `setStringValue` on the registered label if one exists. Add `fn forget_native_login_bar(label)`, which removes the registry entry, run on the main thread. Call it from both `WindowEvent::Destroyed` hooks: the `humble_login_open` one and the GOG one in `open_gog_login_sheet`.

In Cargo.toml, add `"NSBox"`, and any other net-new feature the compiler demands (e.g. `NSText` for `NSTextAlignment`, `NSAccessibilityProtocols`, `NSParagraphStyle` for line-break mode). Extend the existing comment block above `objc2-app-kit` with one justification line per feature, in the style of the quick-261029-o1w `NSColor`/`NSFont` note: say which are net-new and which are already unioned by tao/wry. If `cargoFeatures.test.ts` pins the objc2-app-kit list, update it and name that change in the SUMMARY.

(2) GOG pristine path, in `open_pristine_epic_login_window`'s main-thread closure: replace the `install_native_login_cancel_button(..)` call under `if as_sheet` with `install_native_login_bar(ns_view, &webview, &origin, ..)`. Clone `origin` into the closure. The inset happens inside the builder, so the webview's initial frame stays `ns_view.frame()`. Epic (`as_sheet == false`) gets no bar and its webview still fills the window. For origin tracking, add a `webView:didCommitNavigation:` method to `EpicPristineNavDelegate`. It reads `webview.URL()` (the committed main-frame URL, a shell-side value, not page content), parses it with `tauri::Url`, and calls `update_native_login_bar_origin(.., origin().ascii_serialization())`. That is a no-op for Epic because Epic has no registry entry. This needs the delegate to hold an `AppHandle`; if the ivars do not carry one, add it, or update the registry directly since the delegate method already runs on the main thread. Executor's choice: the main-thread direct call avoids the hop.

(3) Injected path, `humble_login_open`, `if visible` macOS:
- Delete the three `.initialization_script(..)` blocks (cancel strip, origin banner, scrollbar inset) and their eprintlns.
- Keep `login_chrome_css_script` exactly where it is, outside any `#[cfg(`.
- In `on_page_load`, replace the `window.eval(&login_origin_banner_update_script(&new_origin))` block with `update_native_login_bar_origin(&app_clone, &label, &new_origin)`, keeping the `#[cfg(target_os = "macos")]`, the `len=` log, and the `is_started` placement it had (it ran on both Started and Finished).
- Delete the `.on_navigation(` closure and its now-unused captures.
- After `.build()` and BEFORE the sheet-presentation spawn, for visible windows: call `window.with_webview(..)`. Inside, cast `pw.inner()` to `&NSView` (WKWebView) and take `superview()`. Missing superview means failure. Call `install_native_login_bar(superview, wk, &origin, ..)` and send `true` on an mpsc channel. Bound the wait with `recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT)`.
- If the install is not confirmed (dispatch Err, closure-side failure, or timeout), log a WARN and do NOT present as a sheet. Take the existing free-standing visible fallback (`show` + `center` + `set_focus`) so the user keeps the OS close button. This is the T-34.4.2-15 rule: no sheet without a visible exit.
- Leave `.inner_size(464.0, 592.0)` as is (size decision in `<planner_findings>`); add one comment line at the size call saying why it stays 592.

(4) Delete the now-dead definitions:
- `login_cancel_strip_script`, `login_origin_banner_script`, `login_origin_banner_update_script`, `login_scrollbar_inset_script`, `LOGIN_CANCEL_EXFIL_PATH`, `is_login_cancel_request`, and their section comment.
- Every `#[cfg(test)]` Rust test of those functions: the `login_cancel_request_*`, `login_cancel_strip_script_*`, `login_origin_banner_*`, `login_origin_banner_update_script_*` and `login_scrollbar_*` tests, plus `login_origin_banner_and_cancel_strip_agree_on_one_bar_height` and `login_scrollbar_track_inset_equals_the_bar_height_both_other_scripts_set`. Also remove test-only constants (e.g. `TEST_LOGIN_ORIGIN`) only if nothing else uses them.
- Fix any doc comments elsewhere that name the deleted functions (grep).
- Add one pure Rust unit test, a top-band rect helper `native_login_bar_band(bounds_h, flipped) -> (bar_y, webview_y, webview_h)`. Assert unflipped h=592 gives bar_y=560, webview_y=0, webview_h=560, and flipped gives bar_y=0, webview_y=32, webview_h=560. Use the helper inside `install_native_login_bar` so the test pins the real geometry.

(5) TS source pins. Update each deliberately and list each by name in the SUMMARY, with old assertion and new assertion.

In `tauriShellSource.test.ts`:
- The identifier-presence list near line ~1752: drop `LOGIN_CANCEL_EXFIL_PATH`, `is_login_cancel_request` and `login_cancel_strip_script`; add `install_native_login_bar`, `LoginSheetCancelTarget` and `update_native_login_bar_origin`.
- "NEGATIVE/RETIGHTENED: ... at most one .on_navigation( call ...": now asserts zero `.on_navigation(` in the arm, and that the relay is driven only by `on_page_load`.
- "quick 260927-o3h REGRESSION ...": the macOS origin-update half now pins `update_native_login_bar_origin(` in place of the banner eval.
- "Test 4 (the surviving sentinel is alone)" and "Test 5 (the strip survived the deletion)" (Plan 13 describe), and Plan 08's "Test 1", "Test 2", "Test 5 (NEGATIVE, REQ-34.4.2-06 ...)", "Test 6 (NEGATIVE, REQ-34.4.2-07)", and "Test 4 (WR-03/IN-02)": delete, or replace with assertions that the arm calls `install_native_login_bar(` inside the `if visible` block before `present_login_window_as_sheet(`, and that the sheet is not presented when the install is unconfirmed.
- "Test 3 (ORDERING ...) request_login_sheet_cancel( is CALLED exactly three times": becomes exactly two (Esc route + `LoginSheetCancelTarget`). Keep its dismiss-before-close ordering half, re-anchored on `struct LoginSheetCancelTarget;` and `fn install_native_login_bar(`.
- Any quick-261029-o1w pin naming `install_native_login_cancel_button`/`PristineLoginCancelTarget`/`NATIVE_LOGIN_CANCEL_BUTTON_SIZE`: rename.
- Leave Guard 1 (464x592) and the Epic scope guard untouched; both must stay green.

In `loginChromeCssInjection.test.ts`:
- The D-2 gate slices from the `login_origin_banner_script(` call and pins its exact line in two synthetic RED proofs (~lines 107, 130-181). Re-anchor the slice start on a line that survives: the `#[cfg(target_os = "macos")]` block that now holds the native-bar install, if it sits before the CSS call, or otherwise the `login_chrome_css_script(` call line itself. Rewrite the two synthetic sources around that anchor. The gate's meaning must not change: the CSS call is outside every `#[cfg(`. Keep both RED proofs RED against their synthetic sources.

Run `grep -n` for each deleted identifier across `src/`, `meta/`, `scripts/` and `src-tauri/` (excluding `.claude/worktrees`, `graphify-out` and `.planning`) and confirm zero hits.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo build 2>&1 | tee /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/54c03e16-4878-4934-8013-4d53e8179b56/scratchpad/osq-build.log | tail -3 && ! grep -q "^warning" /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/54c03e16-4878-4934-8013-4d53e8179b56/scratchpad/osq-build.log && cargo fmt -- --check && cargo test 2>&1 | tail -5 && cd .. && npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/backend/__tests__/cargoFeatures.test.ts src/backend/__tests__/oauthLoginCapture.test.ts 2>&1 | tail -6 && npx prettier --file-info src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts && npx prettier --check src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts && test $(grep -v '^ *//' src-tauri/src/main.rs | grep -cE 'login_cancel_strip_script|login_origin_banner_script|login_origin_banner_update_script|login_scrollbar_inset_script|is_login_cancel_request|LOGIN_CANCEL_EXFIL_PATH|install_native_login_cancel_button|PristineLoginCancelTarget') -eq 0</automated>
  </verify>
  <done>
- `cargo build` shows zero warnings; `cargo fmt --check` is clean; `cargo test` is all green, including the new band-geometry test.
- The four jest suites pass. If the executor edited `cargoFeatures.test.ts`, add it to the prettier check; `oauthLoginCapture.test.ts` is listed for the cancelled-settle contract.
- prettier `--check` is clean on the changed TS paths, both of which `--file-info` reports as not ignored. main.rs is not prettier-parseable, so rustfmt covers it.
- No deleted identifier remains in non-comment main.rs.
- On macOS, `humble_login_open` injects only `login_chrome_css_script` (plus existing dev-gated diagnostics) in its visible block, installs the native bar before sheet presentation, and falls back to a free-standing window if the install is unconfirmed.
- GOG's sheet uses the same builder.
- Epic and the non-macOS code paths are byte-identical in behaviour.
- Commit as `feat(quick-261029-osq): ...` (one commit, or two if the test re-pin splits cleanly).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live macOS check — wedge gone, bar matches, cancel works, all four store logins still succeed</name>
  <files>(none; live check only. After approval: the todo move and the STATE row named in &lt;output&gt;)</files>
  <action>Do the prep in how-to-verify (scrollbar default, restart tauri dev, confirm the rebuilt shell binary's mtime, tail the shell log). Then hand the numbered checks to the operator. Do not mark anything passed on the operator's behalf.</action>
  <verify><human-check>Operator runs items 1-7 below on macOS 26 with AppleShowScrollBars=Always</human-check><automated>grep -c 'login-bar: installed' on the shell log after opening each sheet (expect at least 1 per sheet opened)</automated></verify>
  <done>Operator types "approved". Then the todo is moved to completed/ with ## Resolution, and the STATE row is added.</done>
  <what-built>A native dark 32pt AppKit bar (origin label + ×) on every macOS login sheet, with the webview inset below it. The injected cancel strip, origin banner and scrollbar inset scripts are removed. GOG's overlaid × is replaced by the same bar.</what-built>
  <how-to-verify>
Prep (executor runs these): `defaults write -g AppleShowScrollBars -string Always`. Restart `tauri dev`, because Rust changed and there is no sidecar change. Per memory, restart dev and check that the shell binary was rebuilt. Tail the shell log for `login-bar: installed`.

1. Open the Humble sign-in sheet and scroll so the classic scrollbar shows. Look at the rounded top-right corner: no light wedge, and the gutter is dark or page-scrollbar all the way to the arc. The log line shows `webview_h` = window height minus 32.
2. The bar looks like the old injected bar: dark `#161c1e`, thin darker line under it, origin centred in light cyan, × at the right. The page starts below the bar and nothing is hidden under it.
3. Click × and the sheet closes, with sign-in settling as cancelled (no error toast). Reopen, press Esc, and it closes the same way.
4. Log in successfully on Humble, Amazon and Zoom, each through its sheet. The sheet dismisses on success. On a login that redirects to another origin (e.g. Amazon or a Google SSO hop if one occurs), the bar's origin updates.
5. GOG: open the sign-in. It shows the same bar, and the Cloudflare/Turnstile check passes. The form fits without being clipped by the bar (scrolling may be acceptable; report it if it is new). × and Esc cancel, and a real login succeeds.
6. Epic: the sign-in is still a free-floating 900x700 window with its normal title bar and no bar.
7. Optional: resize is not possible on a sheet, but confirm the bar and webview stay put after the sheet animates in, without a 1-frame jump or overlap.

Afterwards: `defaults delete -g AppleShowScrollBars` (or restore the prior value), then restart affected apps.
  </how-to-verify>
  <resume-signal>Type "approved", or list the failing item numbers with what you saw.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote login page → shell chrome | The bar is the user's anti-phishing origin indicator, and page content must never control it |
| user → sheet | The sheet blocks the main window, so a cancel control must always exist (lock-out risk) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-osq-01 | Spoofing | native bar origin label | mitigate | The label text comes only from `url.origin().ascii_serialization()` of the shell-validated open URL and of committed main-frame URLs (`on_page_load` payload URL; `WKWebView.URL` in `didCommitNavigation`). It never uses the document title or any page-supplied string. The label is a native view, outside the page's DOM and paint, so a page can no longer overlay or restyle it the way it could the old in-page banner |
| T-osq-02 | Denial of service | sheet with no exit | mitigate | The injected path presents as a sheet only after `install_native_login_bar` is confirmed over mpsc within the watchdog. Otherwise it falls back to a free-standing window with OS close. Esc still routes through `request_login_sheet_cancel` |
| T-osq-03 | Information disclosure | new log lines | mitigate | `login-bar: installed` logs frame numbers and the label only; the origin update keeps the `len=` log only, never the origin string (T-34.4.1-106) |
| T-osq-04 | Tampering | removed /login-cancel sentinel | accept | With the channel gone, a page navigating to `gamelib.invalid/login-cancel` hits an unresolvable host. Before, the worst it could do was cancel; now it does nothing. `REVEAL_EXFIL_HOST`'s reveal/clear-storage arms are unchanged |
| T-osq-05 | Elevation | private AppKit API | mitigate | None used: no `_effectiveCornerRadii` override and no swizzle; public NSBox/NSTextField/NSButton/frame APIs only (user steer) |
</threat_model>

<verification>
- Task 1 Feasibility section is present, with no STOP condition.
- `cargo build` shows 0 warnings, `cargo fmt --check` is clean, and `cargo test` is green.
- jest passes on tauriShellSource, loginChromeCssInjection, cargoFeatures and oauthLoginCapture; prettier --check is clean on changed TS paths.
- Task 3 is approved by the operator.
</verification>

<success_criteria>
- The wedge is gone on a live macOS 26 sheet with classic scrollbars.
- One shared native bar is used by the Humble/Amazon/Zoom sheets and the GOG sheet, and it looks like the old injected bar.
- × and Esc cancel; all four store logins succeed; GOG Turnstile passes; Epic is unchanged.
- No in-page chrome scripts remain on macOS other than the functional Humble CSS.
</success_criteria>

<output>
Create `.planning/quick/261029-osq-native-dark-title-bar-for-all-macos-logi/261029-osq-SUMMARY.md`. It includes the Feasibility section (Task 1), every renamed or removed test pin by name, the Cargo feature additions, and the 464x592 decision.

After Task 3 is approved, the executor (or the orchestrator, if the executor has ended) closes the wedge todo, following the 261029-my4 convention (commit `7cae67d74`):
- `git mv .planning/todos/pending/2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner.md .planning/todos/completed/`
- Append a `## Resolution` section naming quick-261029-osq, the commit(s), the mechanism (route C: native bar, webview inset 32pt, so top `_effectiveCornerRadii` reads 0), and the live PASS date.
- Commit as `docs(quick-261029-osq): close login-sheet wedge todo`.
- Add the STATE.md quick-task row in the same format as the 261029-o1w row.
</output>
