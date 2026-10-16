# Phase 50: Epic store in-app on macOS: a Rust-managed raw WKWebView subview - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 9 (new + modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/src/macos_epic_embed.rs` (new) | service / native-view controller | event-driven (WKNavigationDelegate/WKUIDelegate callbacks) | `src-tauri/src/main.rs` `open_pristine_epic_login_window` + `EpicPristineNavDelegate` (~L3880–4423) | exact |
| New `EpicEmbedNavDelegate`/`EpicEmbedUIDelegate` class (inside the new module) | middleware (navigation policy + delegate) | event-driven | `EpicPristineNavDelegate` (`define_class!`, ~L3923–4076) | exact |
| New construction function (e.g. `epic_embed_open`, port of `pristine_create`'s `in_main` branch) | service (native view lifecycle) | request-response (one-shot create-or-navigate, main-thread marshalled) | `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs` `pristine_create` (lines ~291–358) AND `open_pristine_epic_login_window` (~L4147) for the channel/marshalling shape | exact |
| New Epic nav-state struct (sibling of `StoreEmbedState`, per Discretion's "parallel state" recommendation) | model (in-memory nav history/state) | CRUD (push/pop/take) | `src-tauri/src/main.rs` `StoreEmbedState` (~L6137–6264) + `store_embed_nav_state_json` (~L6273) | exact |
| New Cloudflare-challenge detector (`decidePolicyForNavigationResponse` body / a pure helper) | utility (pure string/header match) + middleware (delegate callback) | transform (header → bool) | No in-repo analog for header reads; closest structural analog is `store_embed_navigation_policy`'s pure, unit-tested decision function (~L6376–6410) | role-match |
| New 45s timer arm/clear logic (delegate lifecycle hooks) | utility / event-driven timer | event-driven | No in-repo WKWebView-timer precedent; closest idiom is Phase 49's named-constant probe-timeout convention (constant + single clear site) — structural pattern only, not a webview timer | partial |
| `src-tauri/src/main.rs` `dispatch_rust_channel` (~L7260) — extended with new arm(s) | controller (IPC dispatch) | request-response | `store_embed_open`/`store_embed_set_bounds` match arms in the same `dispatch_rust_channel` (~L6473, ~L6799) | exact |
| `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` — `reason` union gains `'epic-challenged'` | component | request-response (prop-driven render) | itself — existing `'epic'` reason branch (lines 94–146) is the direct pattern to extend | exact |
| `src/frontend/screens/WebView/storeEmbedOrigins.ts` — `embeddable` becomes platform-aware for `epic` | model/config | transform (pure lookup) | itself — the `STORE_EMBED_ORIGINS` table and `isEmbeddableOrigin`/`resolveStoreForUrl` (lines 43–128) | exact |
| New banner row under `StoreEmbedControls` (D-07 timeout banner) | component | request-response | `src/frontend/components/UI/StoreEmbedControls/index.tsx` (lines 73–142) — hookless, props-driven chrome component shape | exact |
| `src/frontend/screens/WebView/useStoreEmbedHost.ts` (or a thin sibling hook for Epic) | hook | event-driven (polling) + request-response (IPC calls) | itself — the existing hook's bounds-sync effect, nav-poll-drain effect, and D-30 restore-persistence effect (whole file) | exact |
| `public/locales/*/gamelib.json` × 49 — new copy for timeout banner, `'epic-challenged'` panel, launcher-scheme toast | config (i18n strings) | batch (flat key/value) | `48-01-PLAN.md`'s worked example of a fork-owned `gamelib.json` string addition across all 49 catalogues | exact |

## Pattern Assignments

### `src-tauri/src/macos_epic_embed.rs` (new module)

**Analog:** `src-tauri/src/main.rs` `open_pristine_epic_login_window` + `EpicPristineNavDelegate`; construction body ported from `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs` `pristine_create`.

**Imports pattern** (from `src-tauri/src/main.rs` lines 3903–3915):
```rust
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyObject, Bool, NSObject, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2::{define_class, msg_send, DeclaredClass, MainThreadOnly};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURLRequest, NSURL};
#[cfg(target_os = "macos")]
use objc2_web_kit::{
    WKFrameInfo, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate, WKUIDelegate,
    WKWebView, WKWebViewConfiguration, WKWindowFeatures,
};
```
Add `WKNavigationResponse`, `WKWebsiteDataStore` to the `objc2_web_kit` import list (new types this phase's delegate touches, per RESEARCH.md's Cargo feature table).

**Delegate class declaration pattern** (lines 3917–3927, `define_class!` shape):
```rust
#[cfg(target_os = "macos")]
struct EpicPristineNavDelegateIvars {
    event_label: String,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EpicPristineNavDelegateIvars]
    struct EpicPristineNavDelegate;

    unsafe impl NSObjectProtocol for EpicPristineNavDelegate {}

    unsafe impl WKNavigationDelegate for EpicPristineNavDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn navigation_policy(&self, webview: &WKWebView, action: &WKNavigationAction, handler: &block2::Block<dyn Fn(WKNavigationActionPolicy)>) {
            // ...
        }
    }
    // unsafe impl WKUIDelegate for ... { ... }
);
```
The new `EpicEmbedNavDelegateIvars` needs additional fields beyond `event_label`: a timer handle/deadline for D-05, and whatever sender relays the timeout-fired/challenge-detected signals (per RESEARCH.md Code Examples note). Follow the identical `define_class!` shape, adding `webView:decidePolicyForNavigationResponse:decisionHandler:`, `webView:didStartProvisionalNavigation:`, `webView:didFinishNavigation:`, `webView:didFailNavigation:withError:`, `webView:didFailProvisionalNavigation:withError:` as new `WKNavigationDelegate` methods.

**JS dialog reuse (D-13) — call these directly, do not re-implement:**
```rust
// src-tauri/src/main.rs ~L4093-4136
present_native_js_alert(mtm, &message.to_string());
present_native_js_confirm(mtm, &message.to_string()); // -> bool
present_native_js_prompt(mtm, &prompt.to_string(), &default_text_owned); // -> Option<String>
```

**Popup hand-off (D-12) — adapt `create_web_view_for_navigation_action`:**
```rust
// src-tauri/src/main.rs ~L4002-4014 — EpicPristineNavDelegate's version loads in-place.
// D-12 instead requires: return None, hand `action.request().URL()` to the OS browser via
// store_embed_handoff_admitted(&STORE_EMBED_POPUP_THROTTLE), never load in-place and never
// open a second in-app window.
fn create_web_view_for_navigation_action(
    &self,
    webview: &WKWebView,
    _configuration: &WKWebViewConfiguration,
    action: &WKNavigationAction,
    _window_features: &WKWindowFeatures,
) -> Option<Retained<WKWebView>> {
    // D-12: hand off to system browser via store_embed_handoff_admitted(&STORE_EMBED_POPUP_THROTTLE)
    None
}
```

**Construction pattern** (ported from `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs` lines 291–384, `in_main` branch):
```rust
#[cfg(target_os = "macos")]
fn pristine_create(app: &AppHandle, label: &str, url: &str, user_agent: Option<&str>, in_main: bool) -> Result<serde_json::Value, String> {
    let mtm = objc2::MainThreadMarker::new().ok_or("pristine_create: not on main thread")?;
    let window = app.get_window("main").ok_or("pristine_create: no main window")?;
    let ns_view_ptr = window.ns_view().map_err(|e| format!("pristine_create: ns_view failed: {e}"))?;
    let ns_view: &objc2_app_kit::NSView = unsafe { &*(ns_view_ptr as *const objc2_app_kit::NSView) };
    let bounds = ns_view.bounds();
    let origin_y = if ns_view.isFlipped() { y } else { bounds.size.height - y - h };
    let frame = NSRect::new(NSPoint::new(x, origin_y), NSSize::new(w, h));

    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    let store = unsafe { WKWebsiteDataStore::defaultDataStore(mtm) }; // L-3
    unsafe { config.setWebsiteDataStore(&store) };
    let webview = unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config) };
    // L-4: do NOT set a custom user agent
    ns_view.addSubview(&webview);

    let nsurl = NSURL::URLWithString(&NSString::from_str(url)).ok_or("pristine_create: bad url")?;
    let request = NSURLRequest::requestWithURL(&nsurl);
    unsafe { webview.loadRequest(&request) };
    Ok(serde_json::json!({ /* ... */ }))
}
```
Mandatory deviations from the spike (per CONTEXT.md D-01..D-14, RESEARCH.md Pattern 1):
1. `defaultDataStore()`, never `nonPersistentDataStore()` (L-3).
2. No `setCustomUserAgent(...)` call at all (L-4).
3. Frame rect comes from the real embed slot's zoom-scaled rect (`useStoreEmbedHost` → `storeEmbedZoom.ts`), not a hardcoded probe value.
4. No `setAutoresizingMask(...)` — the renderer's `set_bounds` IPC is the sole geometry writer (D-18).
5. Non-opaque background (D-06): `setValue:forKey:` with key `"drawsBackground"`, value `false` — `[ASSUMED]` per RESEARCH.md Assumptions Log A1, no in-repo precedent, budget a live-verify task.

**Main-thread marshalling pattern** (reuse verbatim, `src-tauri/src/main.rs` ~L4147–4423 `open_pristine_epic_login_window`):
```rust
// 1. Worker thread (wherever dispatch_rust_channel runs this arm) builds an mpsc channel.
// 2. app.run_on_main_thread(move || { ...objc2/AppKit/WebKit calls... ; let _ = tx.send(result); })
// 3. Worker thread: rx.recv_timeout(Duration::from_secs(10))
// SendPtr-wraps any raw pointer that must cross the channel with an unsafe Send marker.
```

**Autorelease-pointer hazard (reuse, do not re-derive):**
```rust
// src-tauri/src/main.rs ~L4515-4650, login_window_ns_window_retained's pattern:
// ns_window()/ns_view() return an autoreleased pointer -- resolve AND Retained::retain
// immediately, on the main thread, before parking it for a later hide()/show() call.
```

**Cloudflare challenge detection (D-09, genuinely new — verified chain, RESEARCH.md Pattern 4):**
```rust
unsafe fn webView_decidePolicyForNavigationResponse_decisionHandler(
    &self,
    web_view: &WKWebView,
    navigation_response: &WKNavigationResponse,
    decision_handler: &block2::DynBlock<dyn Fn(WKNavigationResponsePolicy)>,
) {
    if navigation_response.isForMainFrame() {
        let response = navigation_response.response();
        if let Ok(http_response) = response.downcast::<NSHTTPURLResponse>() {
            let key = NSString::from_str("cf-mitigated");
            if let Some(value) = http_response.valueForHTTPHeaderField(&key) {
                if value.to_string() == "challenge" {
                    // fire the D-09/D-10 challenge signal
                }
            }
        }
        // Fallback (D-09): main-frame host/path match on challenges.cloudflare.com /
        // /cdn-cgi/challenge-platform/ only if the header is absent.
    }
    decision_handler.call((WKNavigationResponsePolicy::Allow,));
}
```
Factor the header-match logic as an `AppHandle`-free pure helper (string in, bool out) so `cargo test` can cover it — same discipline as `store_embed_navigation_policy` below.

**45s timeout (D-05, genuinely new — RESEARCH.md Pattern 5):**
```rust
// webView_didStartProvisionalNavigation       -> arm a 45s timer (main-frame start)
// webView_didFinishNavigation                 -> cancel the timer (main-frame success)
// webView_didFailNavigation_withError          -> cancel the timer (main-frame failure)
// webView_didFailProvisionalNavigation_withError -> cancel the timer (early failure)
// All four fire main-frame-only by WKNavigationDelegate contract; no extra frame filtering needed.
```
Name the 45s bound as one Rust constant, read by the test (not a literal) — same idiom as Phase 49's probe-timeout convention.

---

### Epic nav-state struct (new, sibling of `StoreEmbedState`)

**Analog:** `src-tauri/src/main.rs` `StoreEmbedState` (~L6137–6264) and `store_embed_nav_state_json` (~L6273–6286).

**Core CRUD pattern** (push/take/clear, derived-not-stored booleans):
```rust
#[derive(Default)]
struct StoreEmbedState {
    history: Vec<String>,
    cursor: usize,
    pending_nav_events: Vec<Value>,
    suppress_next_push: bool,
}
impl StoreEmbedState {
    fn push(&mut self, url: String) { /* truncate forward entries, push, move cursor, enqueue_nav_event() */ }
    fn enqueue_nav_event(&mut self) { /* push to pending_nav_events, cap at STORE_EMBED_NAV_EVENTS_CAP, drop oldest */ }
    fn take_nav_events(&mut self) -> Vec<Value> { std::mem::take(&mut self.pending_nav_events) }
    fn clear(&mut self) { /* reset all fields including pending_nav_events -- D-21 teardown discipline */ }
    fn can_go_back(&self) -> bool { self.cursor > 0 } // DERIVED, never a stored flag
    fn can_go_forward(&self) -> bool { !self.history.is_empty() && self.cursor + 1 < self.history.len() }
}
static STORE_EMBED_STATE: OnceLock<Mutex<StoreEmbedState>> = OnceLock::new();
```
**Discretion note (RESEARCH.md Open Question 2):** prefer a SEPARATE, explicitly-named static/struct for the Epic surface rather than sharing `STORE_EMBED_STATE` — avoids cross-surface state bleed between the Tauri-managed embed and the raw WKWebView. If native back/forward/URL (Claude's Discretion, recommended) is used instead of a Rust-tracked stack, this struct may shrink to just the nav-event ring (`pending_nav_events`/`take_nav_events`) with `canGoBack`/`canGoForward`/`url` read live from `webview.canGoBack()`/`canGoForward()`/`URL()` at ring-push time rather than tracked separately.

**Error handling pattern:** none of these methods throw; `take_nav_events` returning empty on repeated calls with no new navigation is a normal, healthy idle state — do not treat an empty drain as an error.

---

### `dispatch_rust_channel` extension (`src-tauri/src/main.rs` ~L7260)

**Analog:** the existing `store_embed_open`/`store_embed_set_bounds` match arms (~L6473, ~L6799) and `store_embed_open_args` pure-parse helper (~L6296–6328).

**Pure-parse-then-dispatch pattern:**
```rust
fn store_embed_open_args(args: &[Value]) -> Result<(tauri::Url, f64, f64, f64, f64), String> {
    let obj = args.first().and_then(|v| v.as_object()).ok_or_else(|| "store_embed_open:bad-args".to_string())?;
    let url_str = obj.get("url").and_then(|v| v.as_str()).ok_or_else(|| "store_embed_open:bad-args:url".to_string())?;
    let url = tauri::Url::parse(url_str).map_err(|e| format!("store_embed_open:bad-url:{e}"))?;
    // ... x, y, w, h via the same and_then/ok_or_else chain
    Ok((url, x, y, w, h))
}
```
Extract arg-parsing as a pure, `AppHandle`-free helper exactly this way for every new Epic arm — this is what keeps the logic unit-testable (`cargo test`) despite the real webview call being untestable (per `store_embed_open`'s own doc comment on `AppHandle`-untestability, main.rs L19030–19046, quoted in RESEARCH.md).

**Declared-dead-returns pattern (34.3 D-08/34.4 D-04):** Windows/Linux arms of the new Epic channel(s) must return a named `unsupported-platform` error, logged, never silent — matching the project's existing convention for platform-gated Rust channels.

---

### `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx`

**Analog:** itself — extend the existing `'epic'` branch shape (lines 6, 94–146).

**Core pattern (reason-keyed copy selection):**
```typescript
type WebviewUnavailableReason = 'platform' | 'epic' // add 'epic-challenged'

const heading =
  reason === 'epic'
    ? tGamelib('webview.unavailable.epic.heading', "Epic Store browsing isn't available in-app yet")
    : tGamelib('webview.unavailable.platform.heading', '...')
```
Add a third branch (or switch to a lookup object) for `'epic-challenged'`, following D-10's copy: "Epic asked for a security check this view can't complete." Keep the "Open in browser" button wired through `window.api.openExternalUrl(url)` (line 139) — never `navigator.clipboard` or a raw `shell.openExternal` call (T-34.4.1-26). "Try again" (D-10) is new: wire it to the Epic subview's navigate-to-start-URL-and-show command, following the same button shape as `openInBrowser` (lines 135–143).

**Error handling pattern:** component renders defensively — no thrown errors on missing/malformed `url` (the `url && (...)` guard, line 135); mirror this for whatever new props the `'epic-challenged'` reason needs.

**Test pattern:** `WebviewUnavailablePanel.test.tsx` already pins the `'epic'` reason's structural render — extend it with new cases for `'epic-challenged'`, following its existing invoke-as-plain-function pattern (no jsdom, per `src/frontend/jest.config.js`'s docstring).

---

### `src/frontend/screens/WebView/storeEmbedOrigins.ts`

**Analog:** itself — the `STORE_EMBED_ORIGINS` table and `resolveStoreForUrl`/`isEmbeddableOrigin` (lines 29–128).

**Core transform pattern:**
```typescript
interface StoreEmbedConfig {
  key: string
  apexHosts: string[]
  startUrl: string
  embeddable: boolean
}
const STORE_EMBED_ORIGINS: readonly StoreEmbedConfig[] = [
  { key: 'epic', apexHosts: ['epicgames.com'], startUrl: 'https://www.epicgames.com/store/en-US/', embeddable: false },
  // ...
]
function hostMatchesApex(hostname: string, apex: string): boolean {
  return hostname === apex || hostname.endsWith(`.${apex}`)
}
export function resolveStoreForUrl(url: string): StoreEmbedConfig | null { /* exact/suffix match only, never substring */ }
export function isEmbeddableOrigin(url: string): boolean { /* config !== null && config.embeddable */ }
```
Making `embeddable` platform-aware for Epic (Claude's Discretion) means this becomes a function of `(config, platform)` rather than a static field, OR the `epic` row's `embeddable` flag is computed at call time (`process.platform`/the existing `tauriAttach.ts` platform value) rather than hardcoded `false`. **Trap (per CONTEXT.md Discretion, folded-todo section):** the `embeddable` flag and the `store === 'epic'` darwin-only guard in `src/frontend/screens/WebView/index.tsx` (~L574) MUST move together — the inverted structural test in `WebviewUnavailablePanel.test.tsx` is re-derived, not deleted, when this changes.

**Test pattern:** `storeEmbedOrigins.test.ts` already exercises `hostMatchesApex`'s exact-or-suffix discipline — extend it for the platform-aware `embeddable` case rather than writing a parallel test file.

---

### `src/frontend/screens/WebView/useStoreEmbedHost.ts` (or a thin sibling hook)

**Analog:** itself, in full — this is the single geometry/IPC seam pattern the new Epic surface must either reuse directly or mirror structurally.

**Single-geometry-oracle pattern** (lines 241–420, `flush`/`scheduleFlush`):
```typescript
const flush = () => {
  const factor = readWebviewZoomFactor()
  const bounds = scaleRectForZoom(slot.getBoundingClientRect(), factor)
  if (!openedRef.current) {
    openedRef.current = true
    window.api.storeEmbedOpen(startUrl, bounds, storeKey).then(...)
  } else {
    window.api.storeEmbedSetBounds(bounds)
  }
}
const observer = new ResizeObserver(scheduleFlush)
observer.observe(slot)
window.addEventListener('resize', scheduleFlush)
window.addEventListener('scroll', scheduleFlush, true)
```
`slot.getBoundingClientRect()` must stay the ONE rect source for the Epic subview too — never a second writer (D-18, spike 017's "last write wins" finding). If `useStoreEmbedHost` itself gains an Epic branch rather than a sibling hook, the `scaleRectForZoom`/`readWebviewZoomFactor` calls are reused verbatim from `storeEmbedZoom.ts`.

**Nav-poll-drain pattern** (lines 167–198):
```typescript
useEffect(() => {
  let inFlight = false
  const drain = () => {
    if (inFlight) return
    inFlight = true
    window.api.storeEmbedTakeNavEvents().then((events) => {
      const latest = events[events.length - 1]
      if (latest) setNavState(latest)
    }).catch(...).finally(() => { inFlight = false })
  }
  const handle = setInterval(drain, NAV_POLL_INTERVAL_MS)
  return () => clearInterval(handle)
}, [])
```
Reuse this drain shape for whatever new nav-event ring the Epic surface uses (shared `StoreEmbedState`-style ring or sibling — see Discretion note above). Applies only the LAST event per drain, never replays the whole burst.

**D-30 restore-persistence pattern** (lines 200–239): write-on-navigation-not-on-mount via `hasNavigatedRef`, validated on write via `resolveStoreForUrl(url).key === storeKey` before writing `last-url-<storeKey>`. D-03 requires the Epic path go through this identical validated restore — do not re-derive a parallel write/read pair (the regression this guards against is pinned in `storeEmbedReloadLoop.test.tsx`).

**Route lifecycle pattern** (lines 512–538): `beforeunload` flag distinguishes app-teardown (`close()`) from ordinary route leave (`hide()`) — D-01 requires the SAME "never outlive the app, close only at teardown" rule for the Epic subview, superseding the simpler per-route close a naive port might assume.

**Error handling pattern:** every `window.api.*` call failure is caught and logged via `logNavCallFailure`, never thrown — the UI always falls back to last-known state rather than crashing the route.

---

### `src/frontend/components/UI/StoreEmbedControls/index.tsx` — new banner (D-07)

**Analog:** itself — hookless, props-driven, `SvgButton`-based chrome.

**Core pattern:**
```tsx
export default function StoreEmbedControls({ url, backAvailable, forwardAvailable, onBack, onForward, onReload, onOpenInBrowser }: StoreEmbedControlsProps) {
  const display = parseDisplayUrl(url) // never throws, null on malformed/empty
  return (
    <div className="StoreEmbedControls">
      <SvgButton disabled={!backAvailable} onClick={onBack}><ArrowBackOutlined /></SvgButton>
      {/* ... */}
    </div>
  )
}
```
The D-07 banner ("Epic is taking a while to load — Reload · Open in browser") is new chrome sitting UNDER this component (host-only display, D-23) — follow the same hookless, props-driven, fail-soft shape: a `timedOut: boolean` prop drives visibility, `onReload`/`onOpenInBrowser` reuse the existing callback shapes rather than inventing new ones.

---

## Shared Patterns

### Zero page-side JS injection (hard rule)
**Source:** `src-tauri/src/main.rs` module doc comment above `EpicPristineNavDelegate` (lines 3880–3902) and RESEARCH.md Anti-Patterns.
**Apply to:** the entire new `macos_epic_embed.rs` module — no `WKUserContentController`, no init script, no message/scheme handler, ever. This is the whole point of the raw construction per spike 024 established #7.

### Main-thread objc2 marshalling
**Source:** `src-tauri/src/main.rs` `open_pristine_epic_login_window` (~L4147–4423).
**Apply to:** every new entry point touching the Epic WKWebView (open, set bounds, hide/show, back/forward/reload, challenge check) — worker thread blocks on `mpsc`/`recv_timeout`, `run_on_main_thread` does all unsafe objc2/AppKit/WebKit work.

### Native JS dialogs
**Source:** `src-tauri/src/main.rs` `present_native_js_alert`/`_confirm`/`_prompt` (~L4093–4136).
**Apply to:** the new delegate's `WKUIDelegate` methods — call these directly (D-13), never re-implement `NSAlert` plumbing.

### Scheme allow-list / Steam hand-off / popup throttle
**Source:** `src-tauri/src/main.rs` `store_embed_navigation_policy` (~L6376–6410), `HandoffThrottle`/`STORE_EMBED_STEAM_THROTTLE`/`STORE_EMBED_POPUP_THROTTLE`/`store_embed_handoff_admitted` (~L6430–6470).
**Apply to:** the new delegate's `decidePolicyForNavigationAction` (scheme checks) and `createWebViewWithConfiguration:` (popup hand-off, D-12) — call the existing functions, never a parallel allow-list or throttle instance (would desync from the Tauri embed's own rules).

### Single geometry oracle (D-18)
**Source:** `src/frontend/screens/WebView/useStoreEmbedHost.ts` (whole file doc comment, lines 7–30).
**Apply to:** any new hook/effect driving the Epic subview's bounds — `getBoundingClientRect()` on the slot div is the ONLY rect source; Rust is the sole `set_bounds` writer. Never add a native `NSAutoresizingMaskOptions`/Rust-side resize heuristic that would compete.

### Pure-parse-then-act / `AppHandle`-free testability
**Source:** `src-tauri/src/main.rs` `store_embed_open_args` (~L6296), `store_embed_navigation_policy` (~L6376), `StoreEmbedState` methods (all marked `PURE` in their doc comments).
**Apply to:** the new Cloudflare-header-match logic and any new Epic arg-parsing — factor as pure, `AppHandle`-free functions so `cargo test` can cover the decision logic even though the real `WKNavigationResponse`/`AppHandle` plumbing cannot be unit-tested.

### Fork-owned i18n strings
**Source:** `48-01-PLAN.md`'s worked example (referenced in RESEARCH.md Established Patterns); `WebviewUnavailablePanel.tsx`'s existing `tGamelib(key, fallback)` call shape.
**Apply to:** the new timeout banner copy, `'epic-challenged'` panel copy, and the launcher-scheme-blocked toast — all new strings go in `gamelib.json` only, across all 49 catalogues, with `gamelib.mt.json` stamps; no gate catches an absent key, so this is discipline-only.

## No Analog Found

| File/Surface | Role | Data Flow | Reason |
|---|---|---|---|
| `cf-mitigated` header read chain (`decidePolicyForNavigationResponse`) | middleware | transform | No in-repo precedent for reading an `NSHTTPURLResponse` header in a WKWebView delegate — RESEARCH.md traced the exact method chain against vendored crate source instead (see Pattern Assignments above); use that chain, not a codebase analog |
| 45s WKWebView-navigation timer (arm/clear across delegate lifecycle methods) | utility/event-driven | event-driven | No in-repo precedent for a timer tied to `WKNavigationDelegate` callbacks; Phase 49's "named constant, one clear site" idiom is a structural analog only, not a webview timer — RESEARCH.md flags the exact Rust timer primitive (thread+channel vs. `NSTimer`/`dispatch2`) as planner/executor discretion (Assumptions Log A3) |
| `drawsBackground` transparency KVC call (D-06) | utility | transform | `[ASSUMED]`, LOW confidence per RESEARCH.md Assumptions Log A1 — not exposed as a typed `objc2-web-kit` method, no in-repo precedent; budget a live-verify task rather than treating this as a proven pattern |

## Metadata

**Analog search scope:** `src-tauri/src/main.rs` (Epic pristine window + store embed sections), `src/frontend/screens/WebView/` (hook, origins table, unavailable panel), `src/frontend/components/UI/StoreEmbedControls/`, `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs`.
**Files scanned:** 6 source files read in full/targeted sections + graphify BFS orientation over 2 query scopes.
**Pattern extraction date:** 2026-10-12
