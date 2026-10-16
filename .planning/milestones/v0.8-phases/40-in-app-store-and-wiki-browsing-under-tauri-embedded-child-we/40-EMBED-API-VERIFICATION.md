# Phase 40 Plan 02 — Embed Navigation Surface Verification (D-25)

**Purpose:** D-25 requires the Tauri 2.11.5 `Webview` history/navigation surface be verified
against the VENDORED CRATE SOURCE, not documentation, before any chrome (plan `40-07`) is
designed. This file is that verdict.

**Crate paths and versions read (all under the workspace's own Cargo registry cache — no
documentation, changelog, or web search consulted):**

- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.5/src/webview/mod.rs`
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.5/src/window/mod.rs`
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.5/src/lib.rs`
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.5/Cargo.toml`
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-runtime-2.11.3/src/webview.rs`
  (tauri-runtime, the crate that owns `PageLoadEvent`'s definition; re-exported by `tauri-2.11.5`)
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/wry-0.55.1/src/lib.rs`
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/wry-0.55.1/src/wkwebview/navigation.rs`
- `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs`

A later reader can re-run this verification with:
```bash
TAURI=~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-2.11.5
WRY=~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/wry-0.55.1
grep -n "pub fn \|pub enum " "$TAURI/src/webview/mod.rs"
grep -n "pub fn " "$WRY/src/lib.rs"
cat "$WRY/src/wkwebview/class/wry_navigation_delegate.rs"
```

---

## Q1. Does `tauri::webview::Webview` expose any back/forward/history navigation method?

**Citation:** `tauri-2.11.5/src/webview/mod.rs:1497-1546` (the full public method block on
`impl<R: Runtime> Webview<R>`, spanning `cursor_position` through `show`), cross-checked against
a `grep -n "pub fn "` of the entire file (all ~30 public methods on `Webview`/`WebviewBuilder`
enumerated). The complete navigation-adjacent surface is: `url()` (`:1680`), `navigate(Url)`
(`:1689`), `reload()` (`:1694`), `close()` (`:1502`), `set_size()` (`:1518`),
`set_position()` (`:1527`), `hide()` (`:1541`), `show()` (`:1546`). No method or field named
`go_back`, `go_forward`, `can_go_back`, `can_go_forward`, `history`, or any synonym exists
anywhere in this file (`grep -n "go_back\|go_forward\|can_go_back\|can_go_forward\|history\|History"
tauri-2.11.5/src/webview/mod.rs` returns zero matches).

**VERDICT: ABSENT**

**CONSEQUENCE:** D-22 stands — a Rust-side history stack driven by `on_page_load` + `navigate()`
is confirmed to be the ONLY mechanism available, not a fallback chosen over an unverified native
alternative.

---

## Q2. Same question against `wry-0.55.1`'s `WebView`

**Citation:** `wry-0.55.1/src/lib.rs` — full `grep -n "pub fn "` of the file's public
`WebView`/`WebViewBuilder` surface. Navigation-adjacent methods found: `url()` (`:2000`),
`load_url()` (`:2117`), `load_url_with_headers()` (`:2127`), `load_html()` (`:2132`),
`reload()` (`:2122`), `cookies_for_url()` (`:2029`). One near-miss worth recording precisely so
it is not mistaken for a hit: `with_back_forward_navigation_gestures(bool)` (`:907`) exists on
`WebViewBuilder`, but its doc/signature is a builder toggle for the OS's native trackpad
swipe-to-navigate GESTURE recognizer — it takes no target URL, returns no history state, and has
no `go_back`/`go_forward` counterpart to programmatically invoke what the gesture would trigger.
It does not serve the back/forward role D-25 is asking about. `grep -n "go_back\|go_forward\|
can_go_back\|can_go_forward\|History\b" wry-0.55.1/src/lib.rs` returns zero matches.

**VERDICT: ABSENT**

**CONSEQUENCE:** Confirms Q1's finding is not a tauri-side re-export gap — wry itself has no
programmatic history API on macOS/WKWebView to re-export. D-22 stands, doubly confirmed.

---

## Q3. Does wry or tauri expose ANY navigation-FAILURE callback (a `did-fail-load` analog)?

**Citation:** `wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs` (the full
`WKNavigationDelegate` `impl` block, `define_class!` macro body) implements exactly six
delegate methods: `webView:decidePolicyForNavigationAction:decisionHandler:`,
`webView:decidePolicyForNavigationResponse:decisionHandler:`, `webView:didFinishNavigation:`,
`webView:didCommitNavigation:`, `webView:navigationAction:didBecomeDownload:`,
`webView:navigationResponse:didBecomeDownload:`, and `webViewWebContentProcessDidTerminate:`.
Apple's `WKNavigationDelegate` protocol additionally defines
`webView:didFailProvisionalNavigation:withError:` and `webView:didFailNavigation:withError:` —
neither is implemented here (`grep -n "didFail" wry-0.55.1/src/wkwebview/*.rs`, all files, returns
only `download.rs:103`'s `download_did_fail`, which is a **download**-failure callback wired to
`WKDownloadDelegate`, an entirely separate protocol from page-navigation failure). `WebViewAttributes`
in `wry-0.55.1/src/lib.rs` was also checked for a failure-handler field: the only handler fields
present are `navigation_handler`, `new_window_req_handler`, `download_handler`, and
`on_page_load_handler` — no `on_navigation_failed` / `on_load_error` field exists.

**VERDICT: ABSENT**

**CONSEQUENCE:** D-32's caveat is confirmed, not merely suspected: there is no navigation-failure
analog to Electron's `did-fail-load` anywhere in the wry→tauri chain on macOS. Plan `40-09`
(adtraction/ad-block detection) CANNOT branch on a failure event because none exists. It must
either (a) re-derive detection from `on_page_load`'s main-frame-only success signal (e.g. absence
of an expected follow-on navigation, or a timeout), or (b) declare the detection undeliverable
under Model B and drop it, per D-32's own instruction to "raise it rather than shipping a
detection that cannot fire." This verification does not resolve which of those two paths `40-09`
takes — it only forecloses the third option (a native failure callback) that this plan's action
text asked to check for.

---

## Q4. What exactly does `on_page_load` deliver?

**Citation — closure signature:** `tauri-2.11.5/src/webview/mod.rs:688`
(`pub fn on_page_load<F: Fn(Webview<R>, PageLoadPayload<'_>) + Send + Sync + 'static>`).
**Citation — `PageLoadPayload` shape:** `tauri-2.11.5/src/webview/mod.rs:106-119`:
```rust
pub struct PageLoadPayload<'a> {
  pub(crate) url: &'a Url,
  pub(crate) event: PageLoadEvent,
}
impl<'a> PageLoadPayload<'a> {
  pub fn url(&self) -> &'a Url { self.url }
  pub fn event(&self) -> PageLoadEvent { self.event }
}
```
**Citation — `PageLoadEvent` variants (defined in the sibling `tauri-runtime` crate, re-exported
by `tauri-2.11.5`):** `tauri-runtime-2.11.3/src/webview.rs:84-89`:
```rust
pub enum PageLoadEvent {
  Started,
  Finished,
}
```
Only two variants exist — no `SubframeStarted`, no frame-id field, nothing indicating main vs.
subframe. **Citation — the wry-side wiring that proves this is MAIN-FRAME-ONLY by construction,
not merely by omission of a field:** `wry-0.55.1/src/wkwebview/navigation.rs:12-31`. The Rust
`on_page_load` closure is invoked exactly twice per navigation, from
`did_commit_navigation` (→ `PageLoadEvent::Started`) and `did_finish_navigation` (→
`PageLoadEvent::Finished`) — both are `WKNavigationDelegate` methods
(`wry_navigation_delegate.rs:70-77`), and per Apple's own `WKNavigation` contract this delegate
protocol's navigation object represents ONLY the main-frame document load; subframe loads never
produce a `WKNavigation` and never reach this delegate at all. This matches the 013-015 spike's
independent empirical finding (`tauri-login-webview-cookies.md`: "`on_page_load` fired exactly
twice (Started/Finished, main frame)" vs. `on_navigation`'s 5-of-8-subframe-events) — the vendored
source confirms the mechanism behind that measurement rather than merely restating it.

**VERDICT: EXISTS** (as a main-frame-only success signal; no subframe/failure information)

**CONSEQUENCE:** D-22's history stack is sound: it is fed only real top-level navigations, never
polluted by iframe loads. D-32's derivation is constrained to exactly this signal (see Q3) — a
blocked third-party subresource (e.g. `track.adtraction.com`) produces NO event on this channel
at all, because it is neither a main-frame navigation nor a main-frame navigation failure (no
failure channel exists per Q3). Re-deriving D-32's detection against subresource blocking is
therefore not just harder under Model B, it has no direct equivalent signal; `40-09` must design
around that gap explicitly rather than assume a same-shaped port of the old `did-fail-load`
listener.

---

## Q5. Confirm `add_child`'s `#[cfg]`, its internal `run_on_main_thread` call, and whether `Manager::get_window` is itself `unstable`-gated

**Citation — `add_child`:** `tauri-2.11.5/src/window/mod.rs:1127-1142`:
```rust
#[cfg(any(test, all(desktop, feature = "unstable")))]
#[cfg_attr(docsrs, doc(cfg(all(desktop, feature = "unstable"))))]
pub fn add_child<P: Into<Position>, S: Into<Size>>(
  &self,
  webview_builder: WebviewBuilder<R>,
  position: P,
  size: S,
) -> crate::Result<Webview<R>> {
  use std::sync::mpsc::channel;
  let (tx, rx) = channel();
  let position = position.into();
  let size = size.into();
  let window_ = self.clone();
  self.run_on_main_thread(move || {
    let res = webview_builder.build(window_, position, size);
    tx.send(res).unwrap();
  })?;
  rx.recv().unwrap()
}
```
Confirmed: the `#[cfg]` gate is exactly `any(test, all(desktop, feature = "unstable"))` — matching
the spike's claim precisely, INCLUDING the `test`-cfg escape hatch (relevant only to tauri's own
internal test builds, not this project). The body DOES call
`self.run_on_main_thread(...)` internally (line 1136) and blocks synchronously on `rx.recv()` for
the result — so a caller on any thread gets a normal blocking return, no explicit main-thread hop
needed at the call site, exactly as the spike doc and PATTERNS.md both state.

**Citation — `Manager::get_window`:** `tauri-2.11.5/src/lib.rs:540-543`:
```rust
#[cfg(feature = "unstable")]
#[cfg_attr(docsrs, doc(cfg(feature = "unstable")))]
fn get_window(&self, label: &str) -> Option<Window<R>> {
  self.manager().get_window(label)
}
```
Confirmed `unstable`-gated, as the spike claimed. Also checked in passing (same file,
`:564-567`): `Manager::get_webview` (needed by `store_embed_hide`/`show`/`close`/`set_bounds` to
re-fetch the child handle) is likewise `#[cfg(feature = "unstable")]`-gated — this was not asked
directly by Q5 but is load-bearing for Task 3's arms and would otherwise silently fail to compile
under a wrong assumption.

**VERDICT: GATED** (both `add_child` and `Manager::get_window`/`get_webview` require `unstable`)

**CONSEQUENCE:** D-03's target-gating (Task 2) is validated as necessary and sufficient: gating
`unstable` to macOS is what keeps `add_child`, `get_window`, and `get_webview` from being callable
— and therefore from needing to compile — on Windows/Linux. No additional `#[cfg]` gate is needed
on the Rust call sites themselves beyond the existing `#[cfg(target_os = "macos")]` convention
already used by `open_pristine_epic_login_window`, since attempting to call any of these three
methods on a non-macOS build (where the crate is compiled without `unstable`) would simply fail
to compile, which the `#[cfg(target_os = "macos")]` wrapper on each `store_embed_*` arm's body
prevents.

---

## Q6. Confirm the three containment hooks plan `40-04` depends on

**Citation — `on_navigation`:** `tauri-2.11.5/src/webview/mod.rs:528-529`:
```rust
pub fn on_navigation<F: Fn(&Url) -> bool + Send + 'static>(mut self, f: F) -> Self
```
Return-value semantics per its doc comment (`:522`, "Returning `false` cancels navigation"):
`true` = allow, `false` = cancel. No `# Platform-specific` doc block is present on this method —
its underlying wry mechanism (`decidePolicyForNavigationAction:decisionHandler:`,
`wry_navigation_delegate.rs:52-60`) is a standard `WKNavigationDelegate` method present on every
supported wry backend (macOS/WKWebView confirmed directly; the absence of a platform-specific
caveat in tauri's own doc is consistent with, though does not independently re-verify, cross-platform
support).

**Citation — `on_new_window`:** `tauri-2.11.5/src/webview/mod.rs:585-586`:
```rust
pub fn on_new_window<F: Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static>(...)
```
`NewWindowResponse` variants, `tauri-2.11.5/src/webview/mod.rs:239-255`:
```rust
pub enum NewWindowResponse<R: Runtime> {
  Allow,
  Create { window: crate::WebviewWindow<R> },
  Deny,
}
```
The `Create` variant's doc block DOES carry a `## Platform-specific:` note (`:244-248`): on Linux
the new webview "must be related [to the] caller webview" (`with_related_view`); on Windows it
"must use [the] same environment [as the] caller webview" (`with_environment`); on macOS it "must
use [the] same webview configuration [as the] caller webview" (`with_webview_configuration` /
`NewWindowFeatures::webview_configuration`). `Allow` and `Deny` carry no platform caveat — they
are supported identically everywhere.

**Citation — `on_download`:** `tauri-2.11.5/src/webview/mod.rs:643-644`:
```rust
pub fn on_download<F: Fn(Webview<R>, DownloadEvent<'_>) -> bool + Send + Sync + 'static>(...)
```
Return-value semantics: per the plan's own action text and `DownloadEvent`'s doc
(`:73-95`, the `Requested`/`Finished` variants), returning `false` from the closure on a
`DownloadEvent::Requested` prevents that download; `DownloadEvent::Finished` is a terminal,
non-cancellable notification event (its own `success: bool` field, `:80-82`, distinguishes success
from failure, and its `path` field carries a documented macOS-only limitation: "always empty, due
to API limitations", `:76-78` — this is the one macOS-specific caveat found on the download path).

**VERDICT: EXISTS** (all three hooks; `on_navigation`/`on_download` no platform-specific caveat on
their core policy semantics, `on_new_window`'s `Create` variant carries three platform-specific
usage notes, `on_download`'s `Finished.path` carries a macOS-specific empty-path limitation)

**CONSEQUENCE:** D-28/D-29 (plan `40-04`'s free-navigation-with-`gamelib://`-blocked policy and
external routing of downloads/`window.open`) have a real, unencumbered `on_navigation` and
`on_download` return-value contract to implement against on macOS — no platform caveat narrows
what `40-04` can rely on for THIS project's macOS-only scope (D-01). `40-04` does need to read
`NewWindowResponse::Create`'s three platform notes before deciding whether `window.open` ever
returns `Create` rather than being routed straight to the system browser (D-28), since `Create`
requires additional builder wiring (`with_related_view`/`with_environment`/
`with_webview_configuration`) this plan does not add and `40-04` must decide whether to add or to
avoid by always resolving to `Allow`/`Deny`/system-browser-external instead.

---

## Decisions confirmed or overturned

| Decision | Status | Basis |
|---|---|---|
| D-22 (Rust-side history stack + `navigate()`, no native back/forward) | STANDS | Q1 + Q2: no `go_back`/`go_forward`/`can_go_back`/`can_go_forward`/history API exists on either `tauri::webview::Webview` or `wry::WebView` |
| D-25 (verify against vendored source before any chrome plan is written) | STANDS (discharged) | This document — a written verdict now exists for every question D-25 named |
| D-28 (free navigation; downloads/`window.open` route to system browser) | STANDS | Q6: `on_navigation`/`on_download` exist with the exact return-value contract D-28's design assumes, with no macOS-specific caveat narrowing that contract |
| D-29 (block `gamelib://`, allow `steam://` via `on_navigation`) | STANDS | Q6: `on_navigation`'s boolean allow/cancel contract is exactly the mechanism D-29's policy needs; confirmed present and unencumbered on macOS |
| D-32 (re-derive adtraction detection against `on_page_load`/navigation failure; caveat: main-frame-only, may have no clean equivalent) | STANDS, caveat CONFIRMED TRUE (not merely suspected) | Q3 + Q4: no navigation-failure callback exists anywhere in the wry→tauri chain, and `on_page_load` is proven main-frame-only by the underlying `WKNavigationDelegate` mechanism (not just by an undocumented omission) — a blocked third-party subresource produces no event on any available channel. Plan `40-09` must explicitly choose a fallback design or declare the detection undeliverable; it cannot port the old mechanism's shape. |

No decision was superseded by this verification. All five stand, and D-32's caveat moves from
"unverified, to check" to "verified true."
