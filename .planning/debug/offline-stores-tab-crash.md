---
status: diagnosed
trigger: "offline-stores-tab-crash -- With the network off, clicking Stores does not crash GameLib (UAT 47 test 9: 'when i click on stores when offline gamelib crashes')"
created: 2026-11-18T20:10:00+13:00
updated: 2026-11-18T20:40:00+13:00
goal: find_root_cause_only
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
  status: diagnosed
---

## Current Focus

hypothesis: CONFIRMED. The renderer's 250 ms nav-event drain (`useStoreEmbedHost`) calls Rust `store_embed_take_nav_events`, which unconditionally calls `Webview::url()` on the Tauri store embed (src-tauri/src/store_embed/controls.rs:98-100). Offline, the embed's very first navigation fails, so `WKWebView.URL` is nil; wry 0.55.1 `url_from_webview` does `webview.URL().unwrap()` on the main thread and panics, taking the app down.
test: done (see Evidence 1-9, incl. a standalone WKWebView probe proving URL is nil after a failed first provisional navigation).
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller; fix is a separate step (no source modified in this session).

## Symptoms

expected: With the network off, clicking Stores opens the in-app store view (or an offline state) without GameLib crashing.
actual: User reported: "when i click on stores when offline gamelib crashes"
errors: ~/Library/Logs/GameLib/gamelib-shell-panic.log holds two Rust shell panics on the main thread (2026-11-18 19:47:39, pid 4686; and 19:48:47, pid 5589). payload `called Option::unwrap() on a None value`, location wry-0.55.1/src/wkwebview/mod.rs:1349:40. Backtrace: core::option::unwrap_failed <- Option<Retained<NSURL>>::unwrap <- wry::wkwebview::url_from_webview <- InnerWebView::url <- wry::WebView::url <- tauri_runtime_wry::handle_user_message (tauri-runtime-wry-2.11.4 lib.rs:3906).
reproduction: UAT 47 test 9. macOS, `pnpm tauri:dev`, network off, click the Stores tab/nav.
started: Discovered during phase 47 UAT (2026-11-18). Phase 47 Store Search itself is not involved. The offending `url()` read was added 2026-11-02 (commit f8782dbbf, quick 261102-sk8), so this is a ~16-day-old regression.

## Eliminated

- hypothesis: the macOS raw Epic WKWebView surface (macos_epic_embed) is the source
  evidence: its URL read (surface.rs:468-472) is Option-safe (`.URL().and_then(|u| u.absoluteString()).map(..)`); `store_embed_take_nav_events` returns `macos_epic_embed::take_nav_events()` early when the Epic surface is selected (controls.rs:85-90), so it never reaches the `url()` call. And the renderer log shows the route at panic time was `/store/amazon`, a Tauri-embed store.
  timestamp: 2026-11-18

- hypothesis: a Tauri-internal or plugin caller (e.g. `resolve_command_scope`, an ACL origin check, a plugin) asks the embed for its URL
  evidence: in tauri-2.11.5 the only internal `Webview::url()` caller is `resolve_command_scope` (webview/mod.rs:1444), which nothing in src-tauri/src uses; none of the 9 tauri-plugin-* crates in the registry call `.url()`.
  timestamp: 2026-11-18

- hypothesis: `on_page_load` / `on_navigation` / `humble_open` handlers call webview URL
  evidence: those use `payload.url()` (PageLoadPayload, a plain `Url` from the navigation event), not `Webview::url()` / WebviewMessage::Url. They never hit the WKWebView getter.
  timestamp: 2026-11-18

- hypothesis: login_window/invite_picker.rs:130 `existing.url()` is the crash
  evidence: that is a WebviewWindow that loads GameLib's own bundle/dev URL for the bridge invite picker; unrelated to the Stores nav. Noted as a latent same-class site only (see Resolution).
  timestamp: 2026-11-18

## Evidence

- timestamp: 2026-11-18
  checked: knowledge-base.md for unwrap / wry / webview.url / offline / panic
  found: no matching prior resolution.
  implication: no known-pattern candidate; investigated from scratch.

- timestamp: 2026-11-18
  checked: ~/Library/Logs/GameLib/gamelib-shell-panic.log (both panics) and gamelib.log.old (renderer/sidecar log of pid 5589)
  found: both panics have the identical backtrace through `wry::WebView::url` <- `tauri_runtime_wry::handle_user_message` (WebviewMessage::Url handler, lib.rs:3903-3908), on thread `main`. gamelib.log.old shows the network was down (`Connectivity probe failed on every host ... ENOTFOUND`) and at 19:48:47, the same second as panic #2: `[WebView] store/wiki route pathname=/store/amazon startUrl=https://gaming.amazon.com`, then `[sidecar] stdin closed` (shell died). The log for pid 4686 (panic #1) was rotated away.
  implication: the panic fires within ~1 s of entering a non-Epic (Tauri-embed) store route while offline.

- timestamp: 2026-11-18
  checked: grep of `.url(` over src-tauri/src
  found: only two `Webview::url()`-family call sites exist: store_embed/controls.rs:98-100 (`app.get_webview(STORE_EMBED_LABEL).and_then(|webview| webview.url().ok())`) and login_window/invite_picker.rs:129-135 (`existing.url()` on a WebviewWindow). Everything else is `payload.url()`.
  implication: controls.rs:100 is the only candidate reachable from the Stores tab.

- timestamp: 2026-11-18
  checked: renderer caller chain
  found: `useStoreEmbedHost.ts:362-411` runs a `setInterval(drain, NAV_POLL_INTERVAL_MS=250)` for the life of the WebView screen, calling `window.api.storeEmbedTakeNavEvents()` -> sidecar `storeEmbedTakeNavEvents` -> rustInvoke `store_embed_take_nav_events` -> `store_embed_take_nav_events(app)` (controls.rs:81). That function reads `webview.url()` on every tick whenever `app.get_webview("store-embed")` is Some -- no check on hidden/loaded/failed state. A repo-wide search of src/frontend/screens/WebView found no offline/connectivity gate before the embed opens.
  implication: offline Stores -> embed is created -> every 250 ms tick asks the embed for its URL.

- timestamp: 2026-11-18
  checked: open.rs:95 embed construction
  found: embed is built `WebviewBuilder::new(STORE_EMBED_LABEL, WebviewUrl::External(url))`, i.e. a fresh WKWebView whose FIRST and only navigation is the remote store URL (https://gaming.amazon.com here). `on_page_load` only records Started/Finished; a failed provisional load produces neither a Finished nor any state change.
  implication: offline, the first navigation fails, nothing in our state records it, and the poll keeps firing against a WKWebView that never committed a page.

- timestamp: 2026-11-18
  checked: wry-0.55.1/src/wkwebview/mod.rs:1348-1351 and tauri-runtime-wry-2.11.4 lib.rs:3903-3908
  found: `pub fn url_from_webview(webview: &WKWebView) -> Result<String> { let url_obj = unsafe { webview.URL().unwrap() }; ... }` -- line 1349:40 is exactly the panic location. The Tauri side runs this inside the main-thread event-loop handler for WebviewMessage::Url (`webview.url().map(...).map_err(..)`), so the panic unwinds the event loop (tao `stop_app_on_panic`) rather than returning to our caller.
  implication: our `.ok()` (controls.rs:100) cannot help: the failure is a panic on the main thread, not an `Err`. `Result` is never produced.

- timestamp: 2026-11-18
  checked: standalone Swift probe (scratchpad/wkprobe/probe.swift): fresh WKWebView, `load(https://nonexistent-host-gamelib-probe.invalid/)`, print `webView.URL` at each stage and for three 250 ms ticks after failure
  found: before-load = nil; right-after-load = the URL; didStartProvisional = the URL; didFailProvisional (NSURLErrorDomain -1003) = nil; poll#1..#3 = nil (stays nil). Offline fails the same provisional-navigation way (NSURLErrorNotConnectedToInternet -1009).
  implication: confirms the mechanism directly: a fresh WKWebView whose first provisional navigation fails has `URL == nil` indefinitely. Not offline-specific: DNS failure, refused/timeout, TLS failure, or `on_navigation` returning false for the start URL all reproduce it.

- timestamp: 2026-11-18
  checked: git history of the read
  found: `webview.url().ok()` was added to the drain by f8782dbbf "fix(261102-sk8): record SPA same-document navigations in store embed history" (2026-11-02), later moved by 71-12 into controls.rs. Before it the drain only read the process-static queue (the hook comment at useStoreEmbedHost.ts:358-361 still says it "reads a process-static queue in Rust, not the webview" -- stale since 261102-sk8). The reconcile that consumes the URL (`observe_live_url_at` / `observe_inner`, state.rs:258-300) has its own `current_url()?` / `page_loading` / generation guards, but they run AFTER the `url()` read, so they cannot prevent it.
  implication: regression introduced 2026-11-02; the author treated `.ok()` as sufficient.

- timestamp: 2026-11-18
  checked: whether a registry-based guard would be sufficient
  found: `prepare_open` (state.rs:391) seeds the store's HOME entry into the per-store history before the first load (Quick 261031), so "history registry has a current URL" does NOT prove the WKWebView ever committed a page.
  implication: a guard keyed on `state.current_url().is_some()` is not safe; the guard must key on an observed `PageLoadEvent::Finished` for this embed's lifetime (or read natively without unwrap).

- timestamp: 2026-11-18
  checked: upstream status (web)
  found: wry PR tauri-apps/wry#1729 "fix(macos): avoid panicking on missing webview URL" (opened 2026-05-13) proposes returning an Error instead of unwrapping; as of the snapshot found it was still open, and the wry 0.56.1 release notes found do not list it. Locked version here is wry 0.55.1 (src-tauri/Cargo.lock).
  implication: no released upstream fix to rely on; the panic is purely inside wry (any `Webview::url()` / `WebviewWindow::url()` on a nil-URL WKWebView panics the main thread on macOS), so our code must never ask.

## Resolution

root_cause: |
  Condition set (AND-gate fires: all three are required, removing any one stops the crash):
  (1) CODE (ours): `store_embed_take_nav_events` (src-tauri/src/store_embed/controls.rs:98-100) calls `Webview::url()` on the Tauri store embed on every 250 ms renderer drain tick, unconditionally, regardless of whether the embed has ever loaded a page (added in f8782dbbf, 2026-11-02);
  (2) ENVIRONMENT: with the network off (or any first-load failure) the embed's first and only navigation (`WebviewUrl::External(store url)`, open.rs:95) fails provisionally, so its WKWebView `URL` is nil and stays nil -- there is no committed page, and no offline gate exists in the WebView route to avoid opening the embed;
  (3) DEPENDENCY (upstream): wry 0.55.1 `url_from_webview` (wkwebview/mod.rs:1349) does `webview.URL().unwrap()` inside the main-thread WebviewMessage::Url handler, so a nil URL panics the event loop instead of returning the Err our `.ok()` expects. The panic cannot be caught from our side.
fix: not applied (find_root_cause_only)
verification: not applicable (diagnosis only)
files_changed: []
suggested_fix_direction: |
  Our layer must not ask a never-committed embed for its URL; upstream will not save us (wry#1729 unmerged as far as found, lock is 0.55.1).
  (a) Preferred: track "this embed has delivered at least one `PageLoadEvent::Finished`" in the process-static `STORE_EMBED_STATE` (set in the existing `on_page_load` Finished arm; reset in `clear()` / on embed close and on webview recreation) and skip the `webview.url()` read in `store_embed_take_nav_events` until it is set. Do NOT key it on `state.current_url()`: `prepare_open` seeds the home entry before the first load.
  (b) Alternative on macOS: read the URL natively via `webview.with_webview(..)` -> WKWebView `.URL()` as an Option, the way macos_epic_embed/surface.rs:468 already does; keep `Webview::url()` for Linux/Windows.
  (c) Also consider an offline/failed-load surface in the renderer (UAT expects "the in-app store view (or an offline state)"): a failed first load currently leaves a blank embed with no state change.
  (d) Defence in depth: a regression test that drives the drain against an embed with no Finished event; and fix the stale comment at useStoreEmbedHost.ts:358-361.
  (e) Latent same-class site: login_window/invite_picker.rs:129-135 `existing.url()` on a WebviewWindow would panic the same way if that window's first load failed (dev server down); low priority.
  specialist_hint: rust
