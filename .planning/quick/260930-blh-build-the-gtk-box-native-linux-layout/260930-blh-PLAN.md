---
phase: quick-260930-blh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/Cargo.lock (expected diff: at most one added `"gtk",` line inside gamelib-shell's own dependency list; no new [[package]] stanza)
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/index.tsx
  - src/backend/__tests__/tauriShellSource.test.ts (comment-only, PROOF STATUS truthfulness)
  - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/BASE.sha
  - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/embed_live.ts
  - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/check_settled.py
  - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
  - .planning/spikes/029-linux-embed-allocation-reliability/results-unset-dmabuf/ (Task 3 provenance commit only, if still uncommitted; these files pre-date this plan)
autonomous: true
requirements:
  - QUICK-260930-BLH

estimate:
  tokens: 180000
  raw_tokens: 180000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On this Linux host, opening /store/gog in the dev app puts the store page inside the renderer's slot. For every `[shell] store_embed(linux): settled` line, the embed's measured GTK allocation equals the renderer-requested rect after integer rounding. check_settled.py passes over the tracer evidence."
    - "The MAIN webview is never squeezed. On every settled line main == (0,0,vbox_w,vbox_h), so the Fixed is never a vbox sibling of main. This still holds after a real window resize (check_settled.py --expect-vbox-change)."
    - "Input lands on both sides. A wheel scroll inside the embed rect changes only embed pixels. A click on a NavShell tab outside the embed goes through the pass-through Fixed layer, reaches the main webview, and leaves the store route. That hides the embed. Returning to /store/gog shows it again at the slot."
    - "The Linux build compiles with `unstable` enabled through a Linux-only target table, alongside a direct `gtk = \"0.18.2\"` that adds no new crate name to Cargo.lock. The existing store_embed Rust unit tests now RUN on Linux: `cargo test --bin gamelib-shell store_embed` reports N>0 passed, where the pre-change baseline ran 0. The full Rust suite has 0 failures."
    - "Windows keeps all ten `store_embed_*:unsupported-platform` arms (non-comment count stays 10). The macOS branches of open/set_bounds are unchanged statements inside `#[cfg(target_os = \"macos\")]` blocks. No per-store data-store identifier is set anywhere, so Linux runs on the one shared cookie jar."
    - "The live run used a fresh createFakeHomeProfile() per launch, with WEBKIT_DISABLE_DMABUF_RENDERER absent from the launched process environment and identity proven by window -> _NET_WM_PID -> /proc exe. Teardown left 0 processes, killed by pid or group only, never by name."
    - "The positioning todo reads `ready: live-gate` with a dated addendum stating what was built, what was measured, and what was not verified, and it stays in pending/. If the stop rule fired it instead stays `ready: code` with the finding recorded, and strategy (a) is not re-litigated."
  artifacts:
    - path: "src-tauri/src/main.rs"
      provides: "Store-embed section gated `any(target_os = \"macos\", target_os = \"linux\")`; pure `store_embed_linux_gtk_rect` + `store_embed_linux_settled_line` with unit tests; inline `#[cfg(target_os = \"linux\")] mod linux_store_embed_layout` (ensure_overlay / mount / apply_bounds / debounced settled log); Linux branches in store_embed_open and store_embed_set_bounds"
      contains: "mod linux_store_embed_layout"
    - path: "src-tauri/Cargo.toml"
      provides: "`[target.'cfg(target_os = \"linux\")'.dependencies]` with `tauri = { version = \"2\", features = [\"unstable\"] }` and `gtk = \"0.18.2\"`"
      contains: "cfg(target_os = \"linux\")"
    - path: "src/frontend/screens/WebView/index.tsx"
      provides: "Platform gate admits darwin AND linux; every other platform still renders WebviewUnavailablePanel reason=platform"
    - path: ".planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/embed_live.ts"
      provides: "Live harness: createFakeHomeProfile launch, identity proof, incremental settled-line extraction, stop-file hold, group teardown, dispose"
    - path: ".planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/check_settled.py"
      provides: "Settled-line checker with --selftest (proves it rejects a squeezed main and a mismatched embed)"
    - path: ".planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/"
      provides: "tracer-*/expansion-* identity, settled, teardown files and inspected captures"
  key_links:
    - from: "src/frontend/screens/WebView/index.tsx platform gate"
      to: "useStoreEmbedHost -> storeEmbed seam -> rustInvoke -> dispatch arm store_embed_open"
      via: "slot div renders on linux, getBoundingClientRect rect sent as {url,x,y,w,h}"
      pattern: "platform !== 'darwin' && platform !== 'linux'"
    - from: "store_embed_open (linux branch)"
      to: "linux_store_embed_layout::ensure_overlay -> window.add_child -> linux_store_embed_layout::mount"
      via: "main webview moved into a gtk::Overlay in the default vbox; embed moved from the vbox into the pass-through gtk::Fixed overlay child"
      pattern: "linux_store_embed_layout::"
    - from: "store_embed_set_bounds (linux branch)"
      to: "gtk::Fixed::move_ + set_size_request on the embed widget"
      via: "Webview::with_webview -> PlatformWebview::inner() on the GTK main thread, result returned over mpsc with a bounded recv_timeout"
      pattern: "move_"
---

<objective>
Build the GTK-box-native Linux layout for the in-app store embed. This is strategy (a), which the
operator locked on 2026-09-28 in
`.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`.
It uses Tauri's PUBLIC Linux API (`Window::default_vbox`, `Webview::with_webview` ->
`PlatformWebview::inner`) plus stock gtk-rs. It does not patch `tauri-runtime-wry` or wry. Then
prove the layout live on this Linux host, and move the todo to `ready: live-gate`.

**The layout, settled here:**
- On the FIRST `store_embed_open` on Linux, the main webview's GTK widget moves out of the shared
  `default_vbox()` into an application-created `gtk::Overlay`.
- The Overlay is packed into the vbox at main's old position with expand/fill.
- A `gtk::Fixed` is the Overlay's only overlay child, with `set_overlay_pass_through(fixed, true)`.
- The embed webview that Tauri packs into the vbox is then moved into that Fixed. It is positioned
  with `gtk::Fixed::move_` + `set_size_request`, which is spike 029's lever, 30/30 EXACT with DMABUF
  set and 20/20 with it unset.
- The Fixed is never a vbox sibling of main. That is the spike-029 addendum's measured constraint:
  main squeezed to 61-125px.
- Lazy, at first open rather than at startup, so the hierarchy change is confined to users who
  open a store route. Reparenting a LIVE WebKitWebView is what wry's own `WebView::reparent` and
  tauri-runtime-wry's Linux reparent path already do. It is still unmeasured for the MAIN webview,
  and the Task 1 live check is that measurement.

**The design fork the orchestrator flagged (how the renderer slot rect maps on Linux) is settled
by construction, not by a new decision.**
- The Overlay's main child IS the main webview, so the Fixed's coordinate space is the main
  webview's viewport.
- GTK3 widget coordinates are logical px. `slot.getBoundingClientRect()` therefore maps 1:1, as it
  does on macOS (spike 017).
- The one Linux-specific conversion is rounding to i32, which GTK's integer API forces. D-18's
  no-rounding rule is a macOS statement, and the skill already records fractional px rounding to
  whole logical px there too.
- wry's own `set_bounds` stays a silent no-op on Linux. The Linux branch never calls it and writes
  through the Fixed instead.
- This supersedes the 2026-09-28 bullet "the renderer-measured slot-rect design ... does not apply
  on Linux", as history. Spikes 028/029 found the lever. The todo addendum in Task 3 records this.

**The renderer gate flips to admit `linux`.** This follows the 2026-09-28 decision ("It ships a
real ... Linux embed instead of none") and the 2026-09-29 addendum ("resolved in favour of
shipping"). Without it the Linux layout is unreachable code. Windows keeps the panel.

**Observed, NOT decided here** (recorded in the SUMMARY and the todo addendum for the operator):
- The embed's Chrome UA keeps its `Macintosh` platform token on Linux.
- The `platform` panel copy still names only macOS. It stays true on Windows, and no l10n churn
  is taken.
- The first open may show one frame of GTK's even split before `mount` runs, because Tauri packs
  the child into the vbox first.

**Shared cookie jar (2026-09-29 addendum):** build against the one shared jar. Set no per-store
data-store identifier, and never describe the Linux embed as isolated.

Purpose: Linux users get the same in-app store/wiki embed macOS has, positioned from the renderer's
slot rect. The layout is proven on real hardware before the todo moves to a live gate.

Output: Linux GTK layout code, un-gated `unstable` for Linux, the renderer gate, a reusable live
harness + checker, live evidence, and the todo triaged to `ready: live-gate`.

**Honest verification split.**

AT THE DESK, on this Linux host:
- `cargo build`
- `cargo test --bin gamelib-shell`, with store_embed tests now compiled and run on Linux
- jest (Frontend WebView, Backend tauriShellSource/cargoFeatures)
- `pnpm codecheck`
- `prettier --check` over the two TypeScript paths prettier sees
- the Cargo.lock diff shape

LIVE, on this Linux host (X11, dev binary, fresh fake profile, DMABUF unset):
- open/position/main height
- resize
- input on both sides
- hide/show via a route change

NOT VERIFIED BY THIS PLAN, and recorded as such:
- The macOS build leg. No apple target is installed, so macOS is protected only by leaving its
  statements inside `#[cfg(target_os = "macos")]` blocks unchanged.
- The Windows compile. Best effort only; an environment failure is not a pass.
- The packaged AppImage/release build.
- A real-profile run with logged-in stores.
- Wayland.
- HiDPI scale != 1.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
@.planning/spikes/029-linux-embed-allocation-reliability/README.md

Code anchors (read by range, never whole-file: `main.rs` is 16k lines):
- `src-tauri/src/main.rs:5049-5700`: the store-embed section. Constants, `StoreEmbedState`,
  parsers, `store_embed_navigation_policy`, and `store_embed_open` (`add_child` call at ~5449).
  `store_embed_set_bounds` (~5495) holds the D-18 sole-writer doc comment. Also hide/show/close,
  take_nav_events, back/forward/reload/navigate. 23 `#[cfg(target_os = "macos")]` item gates.
- `src-tauri/src/main.rs:8101-8216`: the ten dispatch arms, each with a
  `#[cfg(not(target_os = "macos"))]` `:unsupported-platform` branch.
- `src-tauri/src/main.rs:10293-10318`: `rustInvoke` dispatch runs on a `thread::spawn` worker,
  never on the GTK main thread. So a blocking `mpsc` `recv_timeout` around `with_webview` cannot
  deadlock. Existing convention is a 10s bound (`rx.recv_timeout(Duration::from_secs(10))`,
  e.g. ~3553, ~4004).
- `src-tauri/src/main.rs:~4871` `mod linux_wake_lock`: inline-module precedent for a
  `#[cfg(target_os = "linux")] mod`.
- `src-tauri/src/main.rs` `#[cfg(test)] mod tests`, the store-embed tests:
  - the wire-contract tests near ~11655-11705, whose fixture const `STORE_EMBED_WIRE_FIXTURE` and
    helper `wire_args` sit just above them
  - `store_embed_navigation_policy_*` / `store_embed_state_*` / `store_embed_nav_state_json_*` /
    queue tests from ~15946 to ~16266
  - all macOS-gated
- `.planning/spikes/029-linux-embed-allocation-reliability/app/src/main.rs:395-585`: the working
  gtk-rs code. `gtk_lever::widget_geometry` (uses `translate_coordinates`, NOT wry `bounds()`,
  whose GTK branch never sets position) and `gtk_apply_lever`'s `reparent_fixed` / `fixed_move`
  arms.
- Vendored, verified at planning time against the app's pinned versions (tauri 2.11.5,
  tauri-runtime-wry 2.11.4, wry 0.55.1, gtk 0.18.2, glib 0.18.5):
  - `default_vbox()` is public, Linux-family gated, and not `unstable`.
  - `Manager::get_window`/`get_webview` and `Window::add_child` ARE `unstable`-gated. That is why
    Linux needs the feature.
  - `WindowChild` on Linux packs into `default_vbox()`.
  - wry `set_bounds` writes only when `is_in_fixed_parent`.
  - wry `set_visible` calls `show_all()`/`hide()` on the widget, so hide/show work after a
    reparent.
  - wry's `Drop` calls `destroy()`, so close removes the embed from our Fixed.
  - tauri-runtime-wry `unstable = []` pulls in no new crates.
  - `OverlayExt::add_overlay`/`set_overlay_pass_through`, `FixedExt::move_`, and
    `gtk::glib::timeout_add_local_once` all exist.
- `src/frontend/screens/WebView/index.tsx:478-489`: the `platform !== 'darwin'` gate. This is the
  only renderer-side platform gate on the embed path, measured by grep.
- `src/backend/__tests__/tauriShellSource.test.ts:382-466`: the declared store-embed arm list plus
  its PROOF STATUS comments. `newArms` must stay `['tray_set_icon']`, so add NO new dispatch arm.
- `.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/appimage_smoke.ts`: the
  live-harness precedent.
  - `createFakeHomeProfile()` via `node meta/runTs.cjs --bundle --platform=node --target=node22 <file> ...`
  - `detached: true` spawn, pid/pgid bookkeeping
  - identity via window `_NET_WM_PID` -> `/proc/<pid>/exe`
  - shell-first teardown, then group reap, then `dispose()`
  - kills by pid or group only
  - Read only its spawn/identity/teardown functions (~line 150-180 and ~620-700), not all 987 lines.
- `.planning/quick/260928-tvk-run-live-linux-sitting-for-phase-38-item/linux_sitting_capture.py`:
  the X11 window-region capture tool. Subcommands are `find`, `selftest`, `grab --out`, `burst`,
  and `diff`.
- `src/backend/testUtils/fakeHomeProfile.ts`: `createFakeHomeProfile({ prefix })` returns
  `{ root, env, registerCapture, dispose }`.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer. Linux open + position, one path end to end: renderer gate -> dispatch -> GTK Overlay/Fixed -> embed at the slot rect, proven live with main's height asserted</name>
  <files>src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/src/main.rs, src/frontend/screens/WebView/index.tsx, .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/BASE.sha, .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/embed_live.ts, .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/check_settled.py, .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/</files>
  <read_first>
    - src-tauri/src/main.rs lines 5049-5130, 5355-5510 and 8101-8216. Use Grep for anything else in main.rs.
    - src-tauri/Cargo.toml (whole file, 311 lines; mind the macOS-table comment at 114-128)
    - .planning/spikes/029-linux-embed-allocation-reliability/app/src/main.rs lines 395-585
    - src/frontend/screens/WebView/index.tsx lines 457-489
    - .planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/appimage_smoke.ts: its spawn / identity / teardown functions only
    - src/backend/testUtils/fakeHomeProfile.ts lines 100-130 and 193-245
  </read_first>
  <precondition>Run from /home/graysonmitchell/GameLib, before the first edit. (1) Write `git rev-parse HEAD` to `$Q/BASE.sha`, where Q=.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout, and save `git status --porcelain` to `$Q/evidence/pre-existing-worktree.txt`. At planning time the todo file carried an UNCOMMITTED 2026-09-30 re-run addendum, and `results-unset-dmabuf/` plus two spike-025 paths were untracked. None of these are this plan's work. Tasks 1-2 must stage by explicit path only. (2) Record baselines into `$Q/evidence/baseline.txt`:
    - `(cd src-tauri && cargo test --bin gamelib-shell) 2>&1 | grep '^test result'`, the pass/fail/ignored counts. If anything already fails, STOP and report.
    - `(cd src-tauri && cargo test --bin gamelib-shell store_embed) 2>&1 | grep '^test result'`. Expected 0 passed on Linux, since the tests are macOS-gated.
    - `(cd src-tauri && cargo fmt --check) 2>&1 | grep -c '^Diff in'`. 75 at planning time. main.rs is not rustfmt-clean at HEAD, so this is a no-growth ceiling, not a clean gate.
    - `grep -v '^\s*//' src-tauri/src/main.rs | grep -cE 'store_embed_[a-z_]+:unsupported-platform'`. Expected 10.</precondition>
  <behavior>
    - store_embed_linux_gtk_rect(290.5, 96.5, 760.25, 560.75) == Ok((291, 97, 760, 561)). Spike 026's fractional rect; `f64::round`, half away from zero.
    - store_embed_linux_gtk_rect(0.0, 0.0, 0.0, 0.0) == Ok((0, 0, 0, 0))
    - store_embed_linux_gtk_rect(10.0, -40.0, 300.0, 200.0) == Ok((10, -40, 300, 200)). A negative position is legal: the slot is partly scrolled off, and GtkFixed accepts it.
    - store_embed_linux_gtk_rect(0.0, 0.0, -1.0, 10.0) is Err containing "negative-size". GTK reads -1 as "unset", so passing it through would silently change the meaning.
    - store_embed_linux_gtk_rect(f64::NAN, 0.0, 1.0, 1.0) is Err containing "non-finite"; so is any infinity.
    - store_embed_linux_gtk_rect(3.0e10, 0.0, 1.0, 1.0) is Err containing "out-of-range". Never a saturating `as i32`.
    - store_embed_linux_settled_line((291,97,760,561),(291,97,760,561),(0,0,1280,800),(1280,800)) returns exactly `[shell] store_embed(linux): settled requested=291,97,760x561 embed=291,97,760x561 main=0,0,1280x800 vbox=1280x800`
  </behavior>
  <action>
**Red first.**
- Add the two pure functions' `#[cfg(target_os = "linux")]` unit tests to `mod tests`, named
  `store_embed_linux_*`, one per behavior bullet.
- Run `cargo test --bin gamelib-shell store_embed_linux`. It must fail to compile or fail: RED.
- Then implement.

**1. Cargo.toml.**
- Add a new `[target.'cfg(target_os = "linux")'.dependencies]` table AFTER the existing
  `[target.'cfg(unix)'.dependencies]` table, containing:
  - `tauri = { version = "2", features = ["unstable"] }`. It unions with the base `tauri`,
    exactly as the macOS table does.
  - `gtk = "0.18.2"`. Pinned to the version Cargo.lock already resolves through wry, so there is
    one `gtk::Widget` type and no new crate name.
- Write a comment in the file's established "declare what your own code directly needs" style.
  It should cite the todo's decision (a), spikes 028/029, that `default_vbox`/`with_webview`
  are public API, and that no tauri-runtime-wry/wry patch is made.
- Leave the macOS table byte-identical.
- Do not add `webkit2gtk`. `pw.inner().upcast::<gtk::Widget>()` needs only gtk's prelude, so the
  webkit type is never named.

**2. main.rs, un-gating.**
- Change every store-embed ITEM gate in the section at 5049-5700 from `#[cfg(target_os = "macos")]`
  to `#[cfg(any(target_os = "macos", target_os = "linux"))]`. That covers constants, state, the
  static, parsers, policy, and every `store_embed_*` fn.
- In the ten dispatch arms, the positive branch becomes the same `any(...)` and the negative
  branch becomes `#[cfg(not(any(target_os = "macos", target_os = "linux")))]`. Keep all ten
  `:unsupported-platform` strings for Windows.
- The F-34.4.2-12 pin that forbids `any(` disjunctions scans only `.cookies()` call sites. This
  section has none (measured 0), so the pin does not apply.
- The existing store_embed unit tests stay macOS-gated until Task 2. This task adds only the two
  new Linux-gated pure-function tests.

**3. main.rs, pure helpers (Linux-gated) next to `store_embed_set_bounds_args`.**
- `store_embed_linux_gtk_rect(x, y, w, h) -> Result<(i32, i32, i32, i32), String>`. Error
  strings are prefixed `store_embed_set_bounds:` and carry `non-finite` / `out-of-range` /
  `negative-size`.
- `store_embed_linux_settled_line(requested, embed, main, vbox) -> String` in the exact format
  the behavior block pins.
- Doc-comment the rounding: GTK's integer API forces it on Linux, and it is not a relaxation of
  D-18 on macOS.

**4. main.rs, `#[cfg(target_os = "linux")] mod linux_store_embed_layout`** (inline, after
`store_embed_set_bounds`, following the `mod linux_wake_lock` precedent). Use `gtk::prelude::*`.

Constants:
- `OVERLAY_NAME = "gamelib-store-embed-overlay"`
- `FIXED_NAME = "gamelib-store-embed-fixed"`
- `GTK_DISPATCH_TIMEOUT = Duration::from_secs(10)`
- `SETTLE_MS = 500`

(a) A private helper that runs a closure on the GTK main thread against one webview's widget.
- Call `webview.with_webview(move |pw| { let w: gtk::Widget = pw.inner().upcast(); ... tx.send(f(w)) })`
  then `rx.recv_timeout(GTK_DISPATCH_TIMEOUT)`.
- `with_webview` Err maps to `<op>:with-webview-failed:{e}`. A timeout maps to
  `<op>:gtk-dispatch-timeout`.
- `with_webview`'s own Ok is NOT proof the closure ran. The existing comment at ~7379-7400 says
  the same.

(b) `pub fn ensure_overlay(app: &AppHandle) -> Result<(), String>`, run against the MAIN webview
(`app.get_webview(MAIN_WINDOW_LABEL)`). It is idempotent.
- If main's parent's `widget_name()` is `OVERLAY_NAME`, return Ok.
- Otherwise get `app.get_window(MAIN_WINDOW_LABEL)?.default_vbox()` (calling it inside the closure
  on the main thread is what spike 029 did 30/30).
- Require main's parent to BE that vbox. Otherwise return Err
  `store_embed_open:linux-unexpected-main-parent:<type name>`. Never restructure an unknown
  hierarchy.
- Record `vbox.child_position(&main)`, then `vbox.remove(&main)`. The `pw.inner()` clone keeps it
  alive.
- Create the Overlay named `OVERLAY_NAME` and `overlay.add(&main)`.
- Create the Fixed named `FIXED_NAME`, then `overlay.add_overlay(&fixed)` and
  `overlay.set_overlay_pass_through(&fixed, true)`.
- `vbox.pack_start(&overlay, true, true, 0)`, then `vbox.reorder_child(&overlay, pos)`.
- `show()` the overlay, fixed and main, then `main.grab_focus()`.

(c) `pub fn mount(app: &AppHandle, embed: &tauri::Webview, rect: (i32, i32, i32, i32)) -> Result<(), String>`,
run against the EMBED webview.
- Find the Overlay among `default_vbox().children()` by name, and the Fixed among the overlay's
  children by name. Missing either gives Err `store_embed_open:linux-no-overlay` /
  `...linux-no-fixed`.
- Remove the embed from its current parent: `parent().downcast::<gtk::Container>()` then `.remove`.
- `fixed.put(&embed, x, y)`, `embed.set_size_request(w, h)`, `embed.show()`.
- Schedule the settled log.

(d) `pub fn apply_bounds(embed: &tauri::Webview, rect) -> Result<(), String>`.
- The embed's parent must be a `gtk::Fixed` named `FIXED_NAME`. Otherwise return Err
  `store_embed_set_bounds:linux-not-mounted`. That is a distinguishable error, never a silent Ok,
  and it covers a set_bounds racing a first open.
- `fixed.move_(&embed, x, y)` and `embed.set_size_request(w, h)`.
- Schedule the settled log.

(e) The settled log, main thread only.
- A `thread_local!` `Cell<u64>` generation is bumped on every schedule.
- `gtk::glib::timeout_add_local_once(Duration::from_millis(SETTLE_MS), ...)` fires only if the
  generation is unchanged. That debounce means sustained motion (spike 017) logs one line per
  settle, not one per frame.
- Capture clones of the embed widget and the overlay. If the embed no longer has a parent (it was
  closed), return silently.
- embed rect = `translate_coordinates(&main, 0, 0)` + `allocated_width()`/`allocated_height()`,
  where main is the overlay's `BinExt::child()`.
- main rect = `main.translate_coordinates(&overlay, 0, 0)` + main's allocated size.
- vbox = `overlay.parent()` allocated size.
- Emit `eprintln!("{}", store_embed_linux_settled_line(...))`.
- Any failure inside the module is logged as `[shell] store_embed(linux): error <op>: <reason>`.
- Log only geometry. Never a URL.

**5. `store_embed_open` Linux branch.** Keep the builder chain (UA, `on_page_load`,
`on_navigation`, `on_new_window`, `on_download`) shared and textually unchanged.
- Under `#[cfg(target_os = "linux")]`, compute `store_embed_linux_gtk_rect` BEFORE creating
  anything. A bad rect returns Err with no side effects.
- Call `linux_store_embed_layout::ensure_overlay(app)?` before `window.add_child`.
- After `add_child` returns the webview, call `mount`.
- If mount fails, `close()` the new webview and `clear()` `store_embed_state()`, then return
  `store_embed_open:linux-mount-failed:<reason>`. Main must never be left squeezed next to an
  unmounted embed.
- The macOS branch and the existing-embed navigate path are unchanged.
- Set no per-store data-store identifier on the builder. Linux runs on the one shared jar (todo
  addendum 2026-09-29).

**6. `store_embed_set_bounds` Linux branch.**
- Parse, then `store_embed_linux_gtk_rect`, then `linux_store_embed_layout::apply_bounds`.
- Never call `Webview::set_position`/`set_size` on Linux. Under wry's `is_in_fixed_parent`
  gate they would be silent no-ops, and they would also be a second writer.
- Extend the D-18 doc comment to say that on Linux the sole writer is this branch, plus the
  initial `put` in `mount`, mirroring `add_child`'s initial rect on macOS.
- The macOS `set_position`/`set_size` statements are unchanged.

**7. Renderer gate** (`index.tsx:484`).
- The condition becomes `platform !== 'darwin' && platform !== 'linux'`.
- Update the comment block above it and the log text: the live embed runs on macOS and Linux (D-01/D-02; Linux per the todo's 2026-09-28 decision (a)), and every other platform still gets `WebviewUnavailablePanel` `reason="platform"`.
- Leave the panel copy and the l10n catalogues untouched.

**8. Live harness**, `$Q/embed_live.ts`, run as
`node meta/runTs.cjs --bundle --platform=node --target=node22 $Q/embed_live.ts --binary <abs>/src-tauri/target/debug/gamelib-shell --evidence <abs>/$Q/evidence --label <tracer|expansion> --stop-file <abs scratch path> --max-seconds 1500`.
Model it on appimage_smoke.ts. Use absolute paths and `process.cwd()`, never `__dirname`.

Preflight: refuse with exit 2 if either of these holds.
- Any `/proc/*/comm` equals `gamelib-shell`. That is the cross-session absorption hazard.
- `http://localhost:5173/` does not answer within 3s. The `cargo build` debug binary loads
  devUrl, because tauri-build's `is_dev()` is true without `custom-protocol`.

Launch:
- Use a FRESH `createFakeHomeProfile({ prefix: 'gl-blh-' })`.
- Child env is `process.env` overlaid with `profile.env`, then `WEBKIT_DISABLE_DMABUF_RENDERER`
  DELETED, plus `GAMELIB_DEV_SECRET_VAULT=1` (as `pnpm tauri:dev` sets it) and
  `GAMELIB_NODE=process.execPath`.
- Put stdout/stderr files INSIDE `profile.root`.
- `spawn(binary, [], { detached: true })`.

Identity (within 60s):
- Find the window by `_NET_WM_PID` == launch pid.
- `/proc/<pid>/exe` must realpath to `--binary`.
- `/proc/<pid>/environ` must lack `WEBKIT_DISABLE_DMABUF_RENDERER`.
- Write `<label>-identity.txt` with `WINDOW_ID`, `LAUNCH_PID`, `EXE_MATCH`,
  `DMABUF_VAR_PRESENT`, `FAKE_HOME=createFakeHomeProfile`. Never the profile path.

Hold:
- Every 1s, append NEW stderr lines containing `store_embed(linux)` to `<label>-settled.log`.
  This is incremental, so the executor can read it between UI steps.
- Record the pgids of the shell's direct children (the sidecar runs in its own group).
- Stop on the stop-file, max-seconds, or child exit, and record which.

Teardown:
- SIGTERM the shell pid alone, and wait up to 10s.
- Then SIGTERM, and after that SIGKILL, every recorded group.
- Then any remaining process whose `/proc/<pid>/environ` contains `profile.root` (WebKit
  helpers).
- Write `<label>-teardown.txt` with `POST_TEARDOWN_PROCS=<n>`. It must be 0.
- `dispose()` in `finally`.
- Never kill by name. `pkill -f` inside a tool command kills the calling shell.

**9. Checker**, `$Q/check_settled.py <log> [--min-lines N] [--expect-vbox-change] | --selftest`.
- Parse lines matching
  `settled requested=(-?\d+),(-?\d+),(\d+)x(\d+) embed=(-?\d+),(-?\d+),(\d+)x(\d+) main=(-?\d+),(-?\d+),(\d+)x(\d+) vbox=(\d+)x(\d+)`.
- A line PASSES when embed == requested (all four) AND main == (0, 0, vbox_w, vbox_h).
- Fail if there are fewer than N settled lines, if ANY line fails, or if any line contains
  `store_embed(linux): error`.
- `--expect-vbox-change` requires at least 2 distinct vbox sizes.
- Print `SETTLED_LINES=<n> PASS=<n> FAIL=<n>`.
- `--selftest` must accept a synthetic good line, and reject both of these:
  - a squeezed main: `main=0,0,1280x400 vbox=1280x800`, spike 029's failure shape
  - an off-by-one embed
- A checker that cannot reject is vacuous.

**10. Live tracer run.**
- Build with the REAL env: `pnpm build:sidecar && pnpm build:decompress-worker-dev && (cd src-tauri && cargo build)`.
- Start `pnpm exec vite` in the background and record its pid.
- Confirm the session is unlocked (`loginctl show-session <id> -p LockedHint` = no).
- Run the harness with `--label tracer` in the background.
- Drive the UI with `xdotool` plus `linux_sitting_capture.py grab --out`. Dismiss any onboarding
  tour, then Stores tab -> GOG tile.
- PASS needs both of these:
  - `check_settled.py $Q/evidence/tracer-settled.log --min-lines 1` passes.
  - An inspected capture shows GOG content inside the slot BELOW `StoreEmbedControls`, with the
    NavShell tabs visible above. That means main is rendering and not blank after its reparent.
- Save only inspected captures to evidence. The fresh profile has no account; check for
  identifiers anyway.
- Touch the stop-file and confirm `POST_TEARDOWN_PROCS=0`.
- Stop vite by its pid/group.

**11. Stop rule.**
- A bug inside this design gets at most 2 fix attempts. A wrong widget lookup is one example.
- If the evidence CONTRADICTS the design, do this:
  - Evidence that contradicts it: main blank or black after the reparent, embed unallocated,
    main squeezed, or a crash.
  - Revert ONLY the renderer gate line, so Linux is back on the panel.
  - Keep the compiled and tested Rust.
  - Commit, and record the finding with evidence.
  - Skip Task 2's live part.
  - Run Task 3's failure branch.
- Never switch to option (b) or (c), and never patch tauri-runtime-wry.

**12. Commit** by explicit paths only: this task's files. Check with `git diff --cached --name-only`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout && L=$(mktemp) && { (cd src-tauri && cargo build) >$L 2>&1 || { tail -30 $L; false; }; } && (cd src-tauri && cargo test --bin gamelib-shell store_embed_linux 2>&1 | grep -E '^test result: ok\. [1-9][0-9]* passed') && python3 $Q/check_settled.py --selftest && python3 $Q/check_settled.py $Q/evidence/tracer-settled.log --min-lines 1 && grep -q '^EXE_MATCH=yes' $Q/evidence/tracer-identity.txt && grep -q '^DMABUF_VAR_PRESENT=no' $Q/evidence/tracer-identity.txt && grep -q '^POST_TEARDOWN_PROCS=0' $Q/evidence/tracer-teardown.txt && test "$(grep -v '^\s*//' src-tauri/src/main.rs | grep -oE 'store_embed_[a-z_]+:unsupported-platform' | wc -l)" -eq 10 && npx prettier --file-info src/frontend/screens/WebView/index.tsx | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/screens/WebView/index.tsx</automated>
  </verify>
  <done>
    - The Linux dev binary builds with `unstable` on Linux.
    - The two new pure-function test groups pass. They were observed RED first.
    - `check_settled.py --selftest` rejects the squeezed-main and off-by-one fixtures.
    - The tracer evidence holds at least 1 settled line with embed == requested and
      main == full vbox.
    - An inspected capture shows GOG in the slot, with the app chrome rendering above it.
    - The identity proof includes DMABUF unset, and teardown left 0 processes.
    - Windows arms are intact (10).
    - index.tsx is prettier-clean.
    - Committed by explicit path. Or, if the stop rule fired: the renderer gate is reverted and the
      finding is recorded, with evidence.
  </done>
</task>

<task type="auto">
  <name>Task 2: Expansion. Run the existing store_embed Rust tests on Linux, make the proof-status comments true, run the full desk battery, then prove resize, input on both sides of the overlay, and hide/show live</name>
  <files>src-tauri/src/main.rs, src-tauri/Cargo.toml, src/backend/__tests__/tauriShellSource.test.ts, .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/</files>
  <read_first>
    - src-tauri/src/main.rs ~11650-11710 and ~15940-16270. Use Grep with `#\[cfg\(target_os = "macos"\)\]` followed by `fn store_embed_` to enumerate them.
    - src/backend/__tests__/tauriShellSource.test.ts lines 382-466
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/tracer-settled.log (Task 1's measured rect, used as the input-check coordinates)
  </read_first>
  <precondition>Task 1 committed with its tracer PASS. If Task 1's stop rule fired, do ONLY steps 1-3 below, skip step 4 (live), and go to Task 3's failure branch.</precondition>
  <action>
**1. Un-gate the existing store-embed unit tests.**
- In `mod tests`, change every `#[cfg(target_os = "macos")]` directly above a `fn store_embed_*`
  test to `#[cfg(any(target_os = "macos", target_os = "linux"))]`.
- Do the same for the wire-fixture const/helper if they are gated.
- Touch no other macOS-gated test. The ones at ~11408, ~12723-12880 and ~14232-14257 belong to
  other features.
- Count the converted tests (N_CONVERTED) and record it.
- `cargo test --bin gamelib-shell store_embed` must now report at least N_CONVERTED + the Task 1
  Linux tests passed, against the baseline 0.
- These are the parser, policy, history and queue proofs. Running them on Linux is new coverage,
  since T-40-04 scheme policy now guards a Linux embed too.

**2. Make the PROOF STATUS text true. Comments only, no logic.**
- main.rs section doc comment (~5049-5061) and the dispatch-arm comment (~8101-8104): the embed is
  macOS + Linux. Linux works through the application's gtk Overlay/Fixed (todo decision (a),
  spikes 028/029). Windows returns `:unsupported-platform`.
- Cargo.toml: the unconditional-`tauri` comment (~26-36) and the macOS-table comment (~114-128)
  now also name the Linux table.
- `tauriShellSource.test.ts` ~398-404, in the "ALSO COMMON TO ALL TEN" paragraph, state:
  - the non-macOS, non-Linux branch returns `:unsupported-platform`
  - Linux `unstable` gating is compiled and exercised on this Linux host, with this plan's evidence
    paths
  - the Rust store_embed unit tests now also run on Linux, still HAND-RUN because CI runs no
    cargo step
  - macOS was not compiled by this change
- Keep every existing honesty caveat. Change no array entry: `newArms` must still equal
  `['tray_set_icon']`.

**3. Desk battery.** Record each result in `$Q/evidence/desk-battery.txt`.
- `(cd src-tauri && cargo test --bin gamelib-shell)`: 0 failed; passed >= baseline + N_CONVERTED
  + the Task 1 tests.
- Jest Frontend: `pnpm exec jest --selectProjects Frontend src/frontend/screens/WebView`. Covers
  the WebviewUnavailablePanel structural gate over index.tsx.
- Jest Backend: `pnpm exec jest --selectProjects Backend src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/cargoFeatures.test.ts`.
  cargoFeatures's Cargo.lock crate-NAME pin must stay green, because gtk is already a locked name.
- For both jest runs, use `--json --outputFile` and assert `success` and `numTotalTests > 0`, so
  a filter that matched nothing cannot pass.
- `pnpm codecheck`.
- `npx prettier --check src/frontend/screens/WebView/index.tsx src/backend/__tests__/tauriShellSource.test.ts`.
  Both report `"ignored": false` with the typescript parser. The Rust and TOML paths have no
  prettier parser (`inferredParser: null`, measured). So the Rust gate is instead
  `cargo fmt --check` "Diff in" count <= the Task 1 baseline.
- Cargo.lock diff vs BASE.sha: the only changed lines may be one added `"gtk",`, or nothing.
- The count of non-comment `data_store_identifier` matches in `src-tauri/src` and
  `src-tauri/Cargo.toml` stays 0.
- Best effort: `(cd src-tauri && cargo check --target x86_64-pc-windows-msvc)`. If it fails in
  crates unrelated to this change, record it as an ENVIRONMENT LIMITATION. Do not count it as a
  pass or a fail.

**4. Live expansion** (fresh profile: a NEW harness run, `--label expansion`; same build/vite/unlock
preconditions as Task 1). Get window geometry from `xdotool getwindowgeometry`. Take slot
coordinates from the latest settled line.

E1 resize:
- `xdotool windowsize <WID> 1100 700`, wait 3s, capture.
- `check_settled.py expansion-settled.log --min-lines 2 --expect-vbox-change` passes. That shows
  main == vbox after the resize too.
- Restore the size.

E2 input INTO the embed:
- Move the pointer to the embed centre and send `xdotool click --repeat 5 5` (wheel down).
- Capture before and after.
- The changed-pixel fraction inside the requested rect must be clearly > 0, and the chrome band
  above `requested.y` must be ~0.
- Record both numbers. Crop with PIL or use `linux_sitting_capture.py diff`.

E3 input into MAIN outside the embed:
- Click a NavShell top tab that leaves the store route, e.g. Library. The click is through the
  full-size pass-through Fixed layer.
- PASS if the capture shows that route, with no GOG pixels where the slot was. That proves
  pass-through and `store_embed_hide` on Linux.

E4 return:
- Stores -> GOG again.
- A capture shows GOG back in the slot.
- If a new settled line appears, the checker passes on it. If none appears, record that the
  renderer did not re-send bounds and rely on the capture.

E5 (RECORDED, NOT GATING):
- Click a link inside the embed, then confirm the `StoreEmbedControls` URL label changes. That
  covers in-embed click input and the nav-event drain.
- Click Back.
- Record PASS/FAIL. It does not gate because Phase 40 Observable Truth 6 ("Chrome back/forward
  reflect the live page") is recorded as FAILED on macOS itself.

Also RECORD, not gate:
- Whether a split frame was visible on first open.
- Keyboard focus after the first open.

Finish the run:
- Touch the stop-file, then confirm `POST_TEARDOWN_PROCS=0`.
- Stop vite.
- Write `$Q/evidence/expansion-results.txt` with E1-E5 PASS/FAIL/RECORDED lines and the measured
  numbers.

If any of E1-E4 contradicts the design, apply Task 1's stop rule: revert the renderer gate line
only, and use Task 3's failure branch.

**5.** Run `graphify update .` (AST-only). Commit by explicit paths only.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout && (cd src-tauri && cargo test --bin gamelib-shell 2>&1 | grep -E '^test result: ok\. [0-9]+ passed; 0 failed') && (cd src-tauri && cargo test --bin gamelib-shell store_embed 2>&1 | grep -E '^test result: ok\. [1-9][0-9]+ passed') && J1=$(mktemp) && J2=$(mktemp) && { pnpm exec jest --selectProjects Frontend src/frontend/screens/WebView --json --outputFile=$J1 >/dev/null 2>&1 || true; } && { pnpm exec jest --selectProjects Backend src/backend/__tests__/tauriShellSource.test.ts src/backend/__tests__/cargoFeatures.test.ts --json --outputFile=$J2 >/dev/null 2>&1 || true; } && node -e "for(const f of process.argv.slice(1)){let r;try{r=require(f)}catch(e){console.error('FAIL no report '+f);process.exit(1)}if(!r.success||r.numTotalTests<1){console.error('FAIL '+f);process.exit(1)}}console.log('jest PASS')" $J1 $J2 && pnpm codecheck && npx prettier --check src/frontend/screens/WebView/index.tsx src/backend/__tests__/tauriShellSource.test.ts && B=$(cat $Q/BASE.sha) && git cat-file -e "$B^{commit}" && GD=$(git diff "$B" -- src-tauri/Cargo.lock) && D=$(printf '%s\n' "$GD" | grep -E '^[+-][^+-]' | tr -d ' \t' || true) && { [ -z "$D" ] || [ "$D" = '+"gtk",' ]; } && test "$(grep -rvE '^\s*(//|#)' src-tauri/src/main.rs src-tauri/Cargo.toml | grep -o data_store_identifier | wc -l)" -eq 0 && python3 $Q/check_settled.py $Q/evidence/expansion-settled.log --min-lines 2 --expect-vbox-change && grep -q '^POST_TEARDOWN_PROCS=0' $Q/evidence/expansion-teardown.txt && grep -Eq '^E3 PASS' $Q/evidence/expansion-results.txt</automated>
  </verify>
  <done>
    - The store_embed Rust tests run and pass on Linux, where the baseline ran 0.
    - The full Rust suite has 0 failures.
    - Both jest runs pass with non-zero test counts.
    - codecheck is clean.
    - Prettier is clean on both TypeScript paths.
    - rustfmt hunk count <= the baseline.
    - Cargo.lock gained at most `"gtk",`.
    - No data-store identifier appears in code.
    - Live: after a real resize, main == vbox and embed == requested. The embed takes wheel input
      without disturbing the chrome. A click outside the embed reaches main, and the embed is
      hidden and then re-shown. E5 and the observations are recorded.
    - Comments tell the truth, and `newArms` is unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 3: Triage the positioning todo. `ready: code` -> `ready: live-gate` with a dated addendum, or the failure branch. Commit the pre-existing re-run addendum separately for provenance</name>
  <files>.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md, .planning/spikes/029-linux-embed-allocation-reliability/results-unset-dmabuf/</files>
  <read_first>
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md (whole file)
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/ (identity, settled, teardown, expansion-results, desk-battery, pre-existing-worktree.txt)
  </read_first>
  <action>
**1. Provenance first.**
- If `git diff HEAD -- <todo>` still contains the pre-existing, uncommitted
  "## Addendum (2026-09-30): the spike-029 re-run with DMABUF UNSET — 20 of 20" hunk and its
  `ready: human` -> `ready: code` flip, commit it FIRST and ALONE. It is recorded in
  `evidence/pre-existing-worktree.txt`.
- Commit it together with the evidence directory it cites,
  `.planning/spikes/029-linux-embed-allocation-reliability/results-unset-dmabuf/`.
- Before committing, privacy-check that directory: 20 geometry-only JSON files. Grep for 17-digit
  runs, `token`, `cookie` and `password` values; expect 0.
- Message: `docs(todo): record the spike-029 DMABUF-unset re-run (pre-existing working-tree change, committed for provenance)`.
- This is not this plan's work. It is committed separately so this plan's own triage commit
  cannot absorb it.
- Leave `.planning/spikes/025-linux-add-child-compile/app/gen/` and its `run.log` untouched.
- If that hunk is already committed, skip this step and say so.

**2. SUCCESS branch** (Tasks 1-2 passed; the renderer gate admits linux):
- Frontmatter: `ready: code` -> `ready: live-gate` (bare, lowercase). Keep `severity: minor` and
  `platform: linux` in place, with `platform:` directly after `severity:` and `ready:` directly
  after `platform:`.
- Append `src-tauri/src/main.rs` and `src/frontend/screens/WebView/index.tsx` to `files:`.
- Append `## Addendum (2026-09-30, quick 260930-blh): the GTK-box-native layout is built — what remains is a live gate`, with bullets in this file's addendum style. It should record:
  - what was built: the Overlay-over-main + pass-through Fixed design, the lazy first-open
    restructure, Linux positioning via `Fixed::move_`, and wry's `set_bounds` still a no-op and
    never called on Linux
  - the 2026-09-28 bullet "set_bounds stays a no-op ... slot-rect design does not apply on Linux"
    is superseded, and kept as history
  - one shared cookie jar: no identifier is set, and the embed is not described as isolated
  - the measured live numbers from evidence: settled lines, the resize, E2/E3/E4 results, E5 as
    recorded. Say it was a dev binary under a fresh fake profile, DMABUF unset, X11, one machine.
  - NOT verified: packaged AppImage/release build, real-profile arm with logged-in stores,
    Wayland, HiDPI != 1, the macOS build leg (not compiled here), and the Windows compile (state
    the best-effort outcome)
  - open observations for the operator, not decided: the UA `Macintosh` token on Linux; the panel
    copy naming only macOS; the first-open frame and focus observations
  - what remains: an operator live gate. The Linux branches of `38-E03`/`38-E04` still route to
    this file's `pending/` path. The file stays in `pending/` and is NOT closed.
- Do not edit `38-VERIFICATION.md`.

**3. FAILURE branch** (a stop rule fired):
- Leave `ready: code`.
- Append a dated addendum recording the contradicting evidence, that the Rust layout code was
  kept, and that the renderer gate was reverted so Linux is back on the panel.
- Bring it back to the operator as a finding, per the 2026-09-28 decision's own instruction.
  Never propose (b)/(c) as settled.

**4. Gates.**
- `python3 .planning/todos/todo-frontmatter-gate.py` exits 0.
- `pnpm planning-gates` reports 12/12.
- The todo path is prettier-IGNORED (`"ignored": true`, measured), so a `--check` there would be
  vacuous. It is deliberately omitted, and the SUMMARY says so.
- Commit the triage by explicit path, separate from the provenance commit.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && T=.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md && test -f $T && python3 .planning/todos/todo-frontmatter-gate.py && PG=$(mktemp) && { pnpm planning-gates >$PG 2>&1 || { tail -20 $PG; false; }; } && tail -3 $PG && test "$(grep -n '^## Addendum (2026-09-30, quick 260930-blh)' $T | wc -l)" -eq 1 && { grep -qx 'ready: live-gate' $T || { grep -qx 'ready: code' $T && echo 'FAILURE BRANCH (ready: code) - confirm the stop rule fired'; }; } && git diff --quiet HEAD -- $T</automated>
  </verify>
  <done>
    - Any pre-existing re-run addendum and its results directory are committed in their own
      provenance commit, or it is stated that they already were.
    - The todo carries exactly one 260930-blh addendum.
    - `ready: live-gate` on success, or `ready: code` in the recorded failure branch.
    - The todo stays in pending/.
    - The todo frontmatter gate and planning-gates (12/12) are green.
    - The todo has no uncommitted changes left.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| store web origin -> embed webview | Untrusted third-party pages (GOG/Amazon/Zoom/wiki) render in a native child webview inside the app window |
| renderer -> Rust dispatch (rustInvoke) | Geometry and URLs cross from the renderer, through the sidecar, into the Rust shell |
| embed webview <-> shared WebKitWebContext | On Linux, every webview in the process shares one cookie jar |
| live-run harness -> real machine | A launched app and its captures could touch real profile data or leave orphans |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-blh-01 | Information disclosure | Linux embed shares the one WebKitWebContext jar with login windows and other stores | medium | accept | The operator accepted this on 2026-09-29 (isolation todo `## Decision`). No identifier is set, and the gate count of non-comment `data_store_identifier` is 0. The addendum and comments never claim isolation. This matches macOS, which has no identifier either. |
| T-blh-02 | Elevation of privilege | Embed navigation to the app's own scheme or unknown schemes | high | mitigate | `store_embed_navigation_policy` (T-40-04-02/03/09) is now compiled on Linux. Its unit tests run on Linux (Task 2 step 1), and the `on_navigation`/`on_new_window`/`on_download` handoffs are unchanged. |
| T-blh-03 | Spoofing (UI redress) | Embed drawn over app chrome, or the full-size Fixed layer swallowing clicks meant for main | medium | mitigate | The rect comes only from the renderer slot, and `apply_bounds` is the sole Linux writer (D-18). The Fixed is `set_overlay_pass_through(true)`, so input outside the embed reaches main. Live E3 proves it. The existing D-33 renderer suppression still hides the embed under app popovers. |
| T-blh-04 | Denial of service | GTK main-thread dispatch never returns; a failed mount leaves main squeezed | medium | mitigate | Every `with_webview` round-trip is bounded by a 10s `recv_timeout`, with a distinguishable error. A mount failure closes the new embed and clears its history, so main is never left sharing the vbox. A set_bounds before mount returns `linux-not-mounted`, never a silent Ok. |
| T-blh-05 | Tampering | Negative, NaN, infinite or huge geometry reinterpreted by GTK (-1 means "unset"; `as i32` saturates) | low | mitigate | `store_embed_linux_gtk_rect` rejects non-finite, out-of-range and negative-size input with named errors. The behavior bullets pin this with unit tests. |
| T-blh-06 | Information disclosure | Live-run captures and logs leaking profile, account or session data | medium | mitigate | A fresh `createFakeHomeProfile()` per launch. Raw streams live inside the profile and are shredded by `dispose()`. Only `store_embed(linux)` geometry lines are copied out, and settled lines carry no URL. Captures are inspected before commit, and identity files omit the profile path. |
| T-blh-07 | Denial of service | Orphaned GameLib/WebKit processes, or killing the operator's own instance | low | mitigate | Preflight refuses if any `gamelib-shell` is running. Teardown goes shell pid, then recorded groups, then environ-matched helpers, and never kills by name. `POST_TEARDOWN_PROCS=0` is asserted. |
| T-blh-SC | Tampering | New Rust dependency | low | mitigate | `gtk = "0.18.2"` is already locked, transitively through wry, at that exact version. There is no new crate NAME, and the cargoFeatures crate-name pin stays green. No npm/pip installs, so no package-legitimacy checkpoint is needed. |
</threat_model>

<verification>
- Each task's `<verify>` block passes.

Desk:
- `cargo build` and the full `cargo test --bin gamelib-shell` run on Linux with 0 failures.
- store_embed tests now run on Linux (>0, baseline 0).
- Jest Frontend WebView and Backend tauriShellSource/cargoFeatures are green with non-zero counts.
- `pnpm codecheck` is clean.
- `prettier --check` passes on the two TypeScript paths (both measured `"ignored": false`).
- The Rust/TOML formatter check is not applicable: prettier has no parser for them, and rustfmt
  has 75 pre-existing hunks, so the ceiling is no-growth.

Live (this host):
- `check_settled.py` passes on tracer and expansion evidence: embed == requested, main == full
  vbox, and a vbox change was observed.
- E2/E3/E4 PASS; E5 recorded.
- DMABUF is unset in the launched environment, and identity is proven.
- 0 processes are left after teardown.

Not verified (stated in the SUMMARY and the todo addendum): the macOS build leg, the Windows
compile (best effort), the packaged AppImage, the real-profile arm, Wayland, and HiDPI.
</verification>

<success_criteria>
- A Linux user who opens a store route in the dev build gets the store page embedded exactly in
  the slot. The app's own UI keeps its full size and stays clickable around it.
- The build uses only public Tauri Linux API plus gtk-rs. There is no runtime/wry patch, and the
  embed is never packed as a vbox sibling of main.
- macOS source paths for open/set_bounds are unchanged. Windows still reports
  `:unsupported-platform`.
- The positioning todo is at `ready: live-gate` in `pending/`, with an honest addendum. Or, on a
  design contradiction, it is at `ready: code` with the finding recorded and Linux back on the
  panel.
</success_criteria>

<output>
Create `.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/260930-blh-SUMMARY.md` when done. Record:
- the baselines and after-counts
- N_CONVERTED
- every live number and each E1-E5 result
- the Windows best-effort outcome
- the open observations (UA token, panel copy, first-open frame, focus)
- the commits, including the provenance commit, if one was made
</output>
