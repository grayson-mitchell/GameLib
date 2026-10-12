# Phase 50: Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic - Research

**Researched:** 2026-10-11
**Domain:** macOS native AppKit/WebKit interop via objc2 — raw `WKWebView` subview construction, `WKNavigationDelegate`/`WKUIDelegate` implementation, main-thread objc2 marshalling, Cloudflare challenge detection
**Confidence:** HIGH (construction + delegate API surface verified against vendored crate source and the project's own shipped precedent and spike; a few UX-level choices are `[ASSUMED]` where no in-repo precedent exists)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked inputs (from the D-05 call, quick `261012-d5g` — do not re-open):**

- **L-1 Sign in button:** no interception, no DOM hiding. The live gate measures Epic's own Sign
  in in place; a hand-off to the pristine login window becomes a task of this phase ONLY if that
  arm is challenged or 403s — and then it is a native `WKNavigationDelegate` decision, not JS.
- **L-2 Platform:** macOS only. `#[cfg(target_os = "macos")]` on every Rust piece. (The rationale
  recorded in the ROADMAP — "Windows has no Stores-tab embed at all" — is stale since quick
  `261012-f25` shipped the Windows embed on WebView2; the scope is unchanged because the raw
  `WKWebView` subview is macOS code. See Deferred Ideas.)
- **L-3 Jar:** the shared default `WKWebsiteDataStore` (`defaultDataStore()`); never
  `nonPersistentDataStore()`, never `data_store_identifier`. The live gate MUST carry a warm,
  signed-in-jar arm because the spike measured a cold jar only.
- **L-4 Challenge reputation:** accepted, unquantified. No Chrome UA spoof — the subview sends
  WKWebView's default UA (no `Version/`/`Safari/` token), exactly what runs 12–27 measured. Do NOT
  apply `STORE_EMBED_USER_AGENT` to this surface.
- **Construction:** `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs`
  `pristine_create` (in-main arm) is the reference; the shipped
  `open_pristine_epic_login_window` + `EpicPristineNavDelegate` in `src-tauri/src/main.rs` is the
  in-repo precedent for the delegate class and the main-thread marshalling.

**Subview lifetime:**

- **D-01: Keep the subview alive and hidden when the user leaves the Stores tab; close it only
  at app teardown.** Phase 40 D-21 parity with the Steam/GOG embed: `hide()` on route leave,
  `show()` on return, page state and scroll intact, return instant. A cold Epic load is 10–40 s
  (spike: 11 of 16 rendered by 40 s) so re-loading on every return was rejected. The ROADMAP's
  sentence "teardown when the Stores tab unmounts — no subview may outlive its route" is
  superseded by this call: the invariant becomes *no subview outlives the app, and a hidden
  subview is never visible or hit-testable*. The first plan records this amendment against the
  ROADMAP entry through the roadmap tooling (no hand edit).
- **D-02: One lifecycle rule for store switches.** Epic → Steam → Epic inside the tab hides the
  Epic subview while the Tauri embed shows, and shows it again on return; it is not closed. The
  two surfaces are never visible at once.
- **D-03: Restore the last Epic URL across app restarts**, the same `last-url-<store>` restore the
  other stores use (Phase 40 D-30), validated by the D-31 real-origin parse so only
  `epicgames.com` hosts restore. Note the reload-loop regression pinned in
  `src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx` — the Epic path must go
  through the same validated restore, never re-derive `startUrl` per render.
- **D-04: Reload on show when GameLib's own Epic auth state changed since the page loaded.** The
  jar is shared, so a sign-in through Manage Accounts (the pristine login window) or a sign-out
  leaves the hidden store page showing the stale header. Key the reload on GameLib's Epic
  logged-in / expired state (the Phase 49 selector inputs — the legendary logged-in flag and the
  Epic `expired` flag), never on parsing jar cookies (Phase 40 D-16). One reload, only when the
  state actually flipped; a plain show with no auth change reloads nothing.

**Slow-load timeout:**

- **D-05: 45 s.** One named constant. The timer runs from the main-frame navigation start
  (`didStartProvisionalNavigation`) until `didFinishNavigation` / `didFailNavigation` for the
  main frame; it resets on every main-frame navigation the subview starts. 45 s matches the
  project's existing bound idiom (Phase 49 D-01) and clears nearly every observed healthy cold
  load while surfacing the #9 stall well before the 120 s the spike sampled at.
- **D-06: The subview is transparent over the existing placeholder until Epic paints.** Set the
  `WKWebView` non-opaque (`drawsBackground` off via `setValue:forKey:`) so the styled
  `StoreEmbedPlaceholder` shows through the slot; no "first paint" signal is needed and nothing
  flashes white in dark themes. The placeholder therefore has to render *under* a visible subview
  as well as while hidden (D-19 today shows it only while hidden) — the planner decides how.
- **D-07: On timeout, a banner row under `StoreEmbedControls`** — "Epic is taking a while to
  load — Reload · Open in browser". The subview stays visible so a late paint still lands and
  nothing is torn down; the banner clears on the next main-frame finish. Reload re-issues the
  current URL; Open in browser uses the existing external-open path.
- **D-08: No silent retry.** One timer, one banner. The stall stays visible to the user and in
  the log; the gate can measure it.

**Challenge fallback:**

- **D-09: "Challenged" means the main-frame response carries Cloudflare's `cf-mitigated:
  challenge` header**, read in `decidePolicyForNavigationResponse` for the main frame only. A
  Turnstile widget inside Epic's own sign-in form is a subframe and never trips it. The gate's
  challenged arm (if one occurs) must capture the main-frame response headers to confirm the
  header is present on Epic's interstitial; keep a main-frame host/path match
  (`challenges.cloudflare.com`, `/cdn-cgi/challenge-platform/`) as the fallback signal if it is
  absent. The signal is a response, not a request: a subframe or script load to
  `challenges.cloudflare.com` (what the spike's nav log recorded) is NOT a trigger.
- **D-10: On a challenge the subview hides and the slot shows `WebviewUnavailablePanel` with a
  new reason `'epic-challenged'`**: "Epic asked for a security check this view can't complete."
  Try again navigates the subview to the configured start URL and shows it; Open in browser is
  the existing button. Copy is new `gamelib.json` strings in all 49 catalogues (Phase 40 D-37).
- **D-11: No stickiness.** Every route entry and every Try again loads the store fresh; no
  session memory of a challenge, no backoff. Challenges were 1 of 32 raw arms and transient.

**Popups, JS dialogs and foreign schemes:**

- **D-12: Popups go to the system browser through the existing hand-off throttle.** The
  `WKUIDelegate` `createWebViewWithConfiguration:` hook returns `None` and hands the request URL
  to the OS browser, admitted by `store_embed_handoff_admitted(&STORE_EMBED_POPUP_THROTTLE)` (the
  Tauri embed's 2 s gap). Never a second window inside GameLib; the pristine login window's
  navigate-in-place popup behaviour is a login-seam rule and does not apply here.
- **D-13: `alert` / `confirm` / `prompt` use the shipped native helpers**
  (`present_native_js_alert` / `_confirm` / `_prompt` in `src-tauri/src/main.rs`), modal to the
  main window. One code path for both raw WKWebViews.
- **D-14: `com.epicgames.launcher://` is blocked by the scheme allow-list and the user gets one
  toast** — "Install from your Library instead — this view can't open the Epic Games Launcher."
  Logged once per navigation attempt. Mapping those links onto GameLib's own Epic install is a
  new capability (Deferred Ideas). All other disallowed schemes keep the Tauri embed's behaviour.

### Claude's Discretion

- Back/forward/URL reporting (native WK history preferred over D-22's Rust stack).
- IPC shape (`store_embed_*` with a discriminator vs `epic_embed_*`), with one bounds writer.
- Rust module placement; main-thread marshalling pattern.
- Timer behaviour while hidden.
- How `embeddable` becomes platform-aware; the guard and flag move together.
- Additional `objc2-web-kit` features (minimum, `default-features = false`).
- Live-gate evidence capture shape.

### Deferred Ideas (OUT OF SCOPE)

- Epic store on Windows via the WebView2 embed (unmeasured; own spike/phase).
- Map `com.epicgames.launcher://` links onto GameLib's own Epic install flow.
- Linux WebKitGTK raw-view equivalent.
</user_constraints>

<phase_requirements>
## Phase Requirements

No formal `REQ-50-*` IDs exist yet — `ROADMAP.md`'s Phase 50 entry reads `**Requirements**: TBD
(/gsd-spec-phase 50, /gsd-discuss-phase 50 ran; sub-decisions LOCKED)`. The locked decisions D-01
through D-14 and the locked inputs L-1 through L-4 above (verbatim from `50-CONTEXT.md`) are the
requirement-equivalent surface this research maps against — there is no separate REQUIREMENTS.md
entry for this phase to cross-reference.

| ID | Description | Research Support |
|----|-------------|------------------|
| L-1..L-4 | Sign-in, platform, jar, UA — locked construction inputs | Architecture Patterns, Code Examples (Cargo feature verification, `pristine_create` port) |
| D-01..D-04 | Subview lifetime, store-switch, restore, auth-reload | Don't Hand-Roll (reuse `StoreEmbedState`/restore effect), Code Examples |
| D-05..D-08 | 45 s timeout, transparency, banner, no silent retry | Code Examples (`WKNavigationDelegate` lifecycle methods), Common Pitfalls |
| D-09..D-11 | Cloudflare challenge detection, panel fallback, no stickiness | Code Examples (`decidePolicyForNavigationResponse` → `NSHTTPURLResponse` header chain, verified against vendored crate source) |
| D-12..D-14 | Popups, JS dialogs, scheme block + toast | Architecture Patterns (reuse `EpicPristineNavDelegate`'s `WKUIDelegate` methods and `present_native_js_alert`/`_confirm`/`_prompt`) |
</phase_requirements>

## Summary

Phase 50 ports a construction that is already fully proven by spike 024's `pristine_create`
in-main arm (`SPIKE_PRISTINE_INMAIN=1`, runs 17–27: 0 of 22 Epic arms challenged) and that the
project already ships a close cousin of in production (`open_pristine_epic_login_window` +
`EpicPristineNavDelegate`, `src-tauri/src/main.rs` ~L3880–4423). The work is not exploratory —
every piece of the construction (objc2/objc2-web-kit crate versions, `WKWebViewConfiguration`
setup, `addSubview`, the main-thread-only marshalling pattern, the `WKNavigationDelegate`/
`WKUIDelegate` method surface) is either already compiling in this codebase or already proven in
the spike. The genuinely new surface is: (1) reading the `cf-mitigated` response header for
Cloudflare-challenge detection — a chain this research traced and verified end-to-end against the
vendored `objc2-web-kit`/`objc2-foundation` crate source (`WKNavigationResponse::response() ->
NSURLResponse`, downcast to `NSHTTPURLResponse`, `valueForHTTPHeaderField`); (2) attaching to the
**main** window's content view at the embed slot's rect (the spike's `in_main` branch, not
`open_pristine_epic_login_window`'s own-window branch); and (3) two Cargo features
(`WKNavigationResponse`, `WKWebsiteDataStore`) that this research confirmed are **already unioned
in transitively via `wry` 0.55.1's own `objc2-web-kit` feature request** — adding them explicitly
to `src-tauri/Cargo.toml` changes zero compiled surface and zero `Cargo.lock` entries, matching
the file's own stated "declare what your own code directly needs, even if already present"
discipline.

**Primary recommendation:** Port `pristine_create`'s `in_main` branch verbatim into a new
`#[cfg(target_os = "macos")]` Rust module, driven by the existing `open_pristine_epic_login_window`
main-thread-channel marshalling pattern; attach a new `WKNavigationDelegate`+`WKUIDelegate`
delegate class (sibling of `EpicPristineNavDelegate`) that adds the 45 s timeout timer and the
`cf-mitigated` header check in `decidePolicyForNavigationResponse`; wire it into the existing
`store_embed_*` IPC surface (reusing `StoreEmbedState`'s nav-event ring, or a thin sibling) so
`useStoreEmbedHost` stays the single geometry/IPC seam the renderer already owns.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Subview geometry (position/size) | Frontend (React slot via `useStoreEmbedHost`) | API/Backend (Rust `set_bounds` writer) | D-18 "single geometry oracle": renderer reads `getBoundingClientRect()`, Rust is the sole `set_position`/`set_size` writer — never two writers |
| Subview construction / lifecycle | API/Backend (Rust, objc2/AppKit/WebKit) | — | Raw `WKWebView` has no JS/React surface at all — it is a native sibling view, built, shown, hidden and closed entirely in Rust |
| Navigation policy (scheme allow-list, origin gate) | API/Backend (`WKNavigationDelegate`) | — | Zero page-side JS injection is a hard rule (Phase 40 D-22); policy must be native delegate code, never a content script |
| Challenge / timeout detection | API/Backend (`WKNavigationDelegate`) | Frontend (panel render on signal) | The header read and the timer both require native WebKit callbacks; the renderer only reacts to a boolean/enum signal relayed over IPC |
| Auth-state-driven reload (D-04) | Frontend/Common (`src/common/signInState.ts` selector) | API/Backend (reload command) | The auth truth table already lives in `src/common` (shared sidecar+renderer); Rust only executes the reload once told the state flipped |
| Popups / JS dialogs | API/Backend (`WKUIDelegate`, native `NSAlert`) | — | No DOM, no React — these are AppKit-native panels with zero page-side code, same as the shipped login window |
| Panel / banner UI (D-07, D-10) | Frontend (`WebviewUnavailablePanel`, new banner under `StoreEmbedControls`) | — | Pure React chrome; Rust only emits the triggering signal |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `objc2` | 0.6.4 | Rust↔Objective-C FFI, `define_class!` for delegate classes | Already pinned project-wide `[VERIFIED: src-tauri/Cargo.toml:142]` (`objc2 = "0.6.4"`); the only viable maintained Rust↔AppKit/WebKit binding generator in the ecosystem |
| `objc2-web-kit` | 0.3.2 | `WKWebView`, `WKWebViewConfiguration`, `WKNavigationDelegate`, `WKUIDelegate`, `WKWebsiteDataStore`, `WKNavigationResponse` typed bindings | Already pinned `[VERIFIED: src-tauri/Cargo.toml:220-232]`; header-translator–generated, matches Apple's WebKit Objective-C headers exactly |
| `objc2-app-kit` | 0.3.2 | `NSView`, `NSWindow`, `NSAlert`, `NSEvent`, etc. | Already pinned `[VERIFIED: src-tauri/Cargo.toml:170-181]` |
| `objc2-foundation` | 0.3.2 | `NSString`, `NSURL`, `NSURLRequest`, `NSHTTPURLResponse`, `NSDictionary` | Already pinned `[VERIFIED: src-tauri/Cargo.toml:182]`; `NSHTTPURLResponse` (`allHeaderFields`, `valueForHTTPHeaderField`) lives here, confirmed by direct read of the vendored crate source `[VERIFIED: objc2-foundation-0.3.2/src/generated/NSURLResponse.rs:172-283]` |
| `block2` | 0.6.2 | Rust closures as Objective-C blocks, for the `decidePolicyFor...decisionHandler` callbacks | Already pinned `[VERIFIED: src-tauri/Cargo.toml:141]` |

No new crates are introduced by this phase — every crate above is already a direct, pinned
dependency of `src-tauri`. This phase only needs **additional Cargo *features*** on the
already-pinned `objc2-web-kit` crate (see below).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dispatch2` | 0.3.1 | `DispatchQueue::main().after(...)` | Only if a deferred main-thread dispatch turns out to be needed (not evidenced as required for this construction, unlike the sheet-presentation case `[CITED: src-tauri/Cargo.toml:183-201]` it was added for) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `WKWebView` subview (chosen) | Tauri `WebviewBuilder` child webview (the existing `store_embed_*` Epic-equivalent) | Challenged 10/10 and 6/6 across all spike runs (established #6, #7) — ruled out by measurement, not preference |
| Raw `WKWebView` subview (chosen) | A second Rust-owned `tauri::WindowBuilder` window (the `open_pristine_epic_login_window` shape) | Folded into D-05's decision as "not shippable as the browsing surface" — reusing the login-seam window for browsing is a misuse (`README.md` § Consequence); the in-main subview is what ships |
| `defaultDataStore()` (locked, L-3) | `nonPersistentDataStore()` (what the spike measured) | Spike's cold/ephemeral jar is the ONE deliberate divergence from what ships — the live gate must separately prove a warm, signed-in jar is not challenged differently |

**Installation:** No `cargo add` is needed. The only Cargo.toml change is adding two feature
strings to the existing `objc2-web-kit` entry:

```toml
objc2-web-kit = { version = "0.3.2", default-features = false, features = [
    "WKWebsiteDataRecord",
    "WKWebView",
    "WKWebViewConfiguration",
    "WKNavigation",
    "WKNavigationDelegate",
    "WKNavigationAction",
    "WKUIDelegate",
    "WKFrameInfo",
    "WKWindowFeatures",
    "WKHTTPCookieStore",
    "objc2-app-kit",
    "WKNavigationResponse",   # NEW — D-09 cf-mitigated header read
    "WKWebsiteDataStore",     # NEW — L-3 defaultDataStore() / setWebsiteDataStore
] }
```

**Version verification:** `src-tauri/Cargo.toml` already pins `objc2-web-kit = "0.3.2"` and the
exact same version is vendored on disk at
`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/objc2-web-kit-0.3.2`
`[VERIFIED: direct filesystem read of the vendored crate, this session]`. No version bump is
needed or recommended — this phase only adds features to the pinned version.

**Cargo-feature-addition is a documentation-only change, not a dependency-tree change** — traced
and verified by direct read of `wry-0.55.1/Cargo.toml`'s own `objc2-web-kit` feature request:

```toml
# wry-0.55.1/Cargo.toml lines 382-411 — read this session
[target.'cfg(target_vendor = "apple")'.dependencies.objc2-web-kit]
version = "0.3.0"
features = [
    "std", "objc2-core-foundation", "objc2-app-kit", "block2",
    "WKWebView", "WKWebViewConfiguration", "WKWebsiteDataStore",
    "WKDownload", "WKDownloadDelegate", "WKNavigation", "WKNavigationDelegate",
    "WKUserContentController", "WKURLSchemeHandler", "WKPreferences",
    "WKURLSchemeTask", "WKScriptMessageHandler", "WKUIDelegate",
    "WKOpenPanelParameters", "WKFrameInfo", "WKSecurityOrigin", "WKScriptMessage",
    "WKNavigationAction", "WKWebpagePreferences", "WKNavigationResponse",
    "WKUserScript", "WKHTTPCookieStore", "WKWindowFeatures",
]
default-features = false
```
`[VERIFIED: wry-0.55.1/Cargo.toml:382-411, direct filesystem read this session]` — both
`WKNavigationResponse` and `WKWebsiteDataStore` are already in wry's own request, so Cargo's
feature unification already compiles them into the dependency graph; `src-tauri/Cargo.toml`
simply does not **declare** them yet. This is the exact pattern the file's own comments already
document for `WKWebView`/`WKWebViewConfiguration`/`WKUIDelegate`/etc.
(`[VERIFIED: src-tauri/Cargo.toml:78-121]`, quoted: *"are already unioned in from `wry`'s own
(non-default) feature request... this adds no new compiled surface, only an explicit, correct
declaration for code that directly names `objc2_web_kit::*` types"*).

**`WKBackForwardList` is NOT in wry's request** (`[VERIFIED: wry-0.55.1/Cargo.toml:382-411]` — the
feature list above has no `WKBackForwardList` entry) — adding it WOULD be genuinely new compiled
surface. Since bare `canGoBack()`/`canGoForward()`/`goBack()`/`goForward()`/`URL()` on `WKWebView`
require **no feature gate at all** beyond `WKWebView` itself (`goBack`/`goForward` need the
already-present `WKNavigation` feature; `canGoBack`/`canGoForward`/`URL` need nothing extra)
`[VERIFIED: objc2-web-kit-0.3.2/src/generated/WKWebView.rs:363-474, direct read this session]`,
**do not add `WKBackForwardList`** — it is unneeded for the native back/forward/URL reporting
Claude's Discretion recommends, and adding it would violate the T-34.4.1-SC
"`default-features = false`, declare only what you call" discipline.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new crates and zero new npm packages — it only
adds two Cargo *feature flags* to an already-pinned, already-shipped, already-audited crate
(`objc2-web-kit` 0.3.2, already in production use for `open_pristine_epic_login_window`). The
Package Legitimacy Gate protocol is scoped to new package introductions and does not apply here.

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)                     Rust main process                      AppKit/WebKit (native)
──────────────────                   ──────────────────                     ───────────────────────
useStoreEmbedHost.ts                 dispatch_rust_channel                   Main NSWindow
  │ getBoundingClientRect()            │  match "store_embed_*" / new arm      │ .contentView (NSView)
  │ (single geometry oracle, D-18)     │                                      │   └─ Epic WKWebView (new, this phase)
  ▼                                    ▼                                      │       ├─ WKNavigationDelegate (new)
window.api.storeEmbedSetBounds() ──▶  store_embed_set_bounds()                │       │    • decidePolicyForNavigationAction → scheme allow-list
  (IPC invoke)                         │  (sole geometry WRITER, D-18)         │       │    • decidePolicyForNavigationResponse → cf-mitigated check (D-09)
                                       ▼                                      │       │    • didStartProvisionalNavigation → arm 45s timer (D-05)
window.api.storeEmbedOpen() ──────▶   epic_embed_open() (new)                 │       │    • didFinishNavigation/didFailNavigation → clear timer
  (idempotent create-or-navigate)      │  run_on_main_thread(||{ ... })  ────▶│       │
                                       │  mpsc channel + recv_timeout         │       └─ WKUIDelegate (new)
                                       ▼                                      │            • createWebViewWithConfiguration → popup hand-off (D-12)
                              pristine_create-style construction              │            • runJavaScript*Panel → present_native_js_alert/_confirm/_prompt (D-13, reused)
                              (WKWebViewConfiguration + addSubview
                               at the embed slot's rect, in_main arm)
                                       │
window.api.storeEmbedTakeNavEvents()◀─┤  nav-event ring (StoreEmbedState-style,
  (250ms poll, drains LAST event)      │   or sibling for the Epic surface)
                                       │
StoreEmbedControls (back/forward/      │  native goBack()/goForward()/
  reload buttons) ◀── nav state ───────┤   canGoBack()/canGoForward()/URL()
                                       │   (native WK history — Discretion)
New banner under StoreEmbedControls ◀──┤  timeout-fired signal (D-07)
WebviewUnavailablePanel               │
  reason='epic-challenged' (new) ◀─────┘  challenge-detected signal (D-10)
```

### Recommended Project Structure

`src-tauri/src/main.rs` is ~19k lines `[VERIFIED: wc -l src-tauri/src/main.rs this session]`;
CONTEXT.md's Discretion section explicitly sanctions a new module file:

```
src-tauri/src/
├── main.rs                      # unchanged dispatch_rust_channel wiring, new match arms only
└── macos_epic_embed.rs          # NEW, #[cfg(target_os = "macos")] — the raw WKWebView
                                  # subview construction, its WKNavigationDelegate +
                                  # WKUIDelegate delegate class, the 45s timer, the
                                  # cf-mitigated header check, native back/forward/URL
                                  # reporting
```

### Pattern 1: Port `pristine_create`'s `in_main` branch

**What:** Attach a raw `WKWebView` as a subview of the MAIN window's content view, at the embed
slot's rect, instead of building a standalone window.

**When to use:** This IS the construction — it is the exact shape spike 024 runs 17–27 proved
served (0 of 22 Epic arms challenged).

**Example** (ported from the spike's `in_main` branch, which is the authoritative, already-proven
reference per CONTEXT.md's Construction note — quoted verbatim):

```rust
// Source: .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs:291-358
// [VERIFIED: direct read this session]
#[cfg(target_os = "macos")]
fn pristine_create(app: &AppHandle, label: &str, url: &str, user_agent: Option<&str>, in_main: bool) -> Result<serde_json::Value, String> {
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURLRequest, NSURL};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration, WKWebsiteDataStore};

    let mtm = objc2::MainThreadMarker::new().ok_or("pristine_create: not on main thread")?;
    let window = if in_main {
        app.get_window("main").ok_or("pristine_create: no main window")?
    } else {
        tauri::WindowBuilder::new(app, label)/* ... */.build().map_err(|e| format!("{e}"))?
    };
    let ns_view_ptr = window.ns_view().map_err(|e| format!("pristine_create: ns_view failed: {e}"))?;
    // SAFETY: the content view of a window we hold a live handle to, on the main thread.
    let ns_view: &objc2_app_kit::NSView = unsafe { &*(ns_view_ptr as *const objc2_app_kit::NSView) };
    let frame = if in_main {
        // The child embed's rect — AppKit content views are bottom-left unless flipped.
        let bounds = ns_view.bounds();
        let (x, y, w, h) = (290.0, 96.0, 760.0, 560.0); // spike's probe values; Phase 50 uses the real embed slot rect from useStoreEmbedHost
        let origin_y = if ns_view.isFlipped() { y } else { bounds.size.height - y - h };
        NSRect::new(NSPoint::new(x, origin_y), NSSize::new(w, h))
    } else {
        ns_view.frame()
    };

    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    // L-3: ship uses defaultDataStore(), NOT the spike's nonPersistentDataStore()
    let store = unsafe { WKWebsiteDataStore::defaultDataStore(mtm) };
    unsafe { config.setWebsiteDataStore(&store) };
    let webview = unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config) };
    // L-4: do NOT set a custom user agent — WKWebView's own default UA is what runs 12-27 measured
    ns_view.addSubview(&webview);

    let nsurl = NSURL::URLWithString(&NSString::from_str(url)).ok_or("pristine_create: bad url")?;
    let request = NSURLRequest::requestWithURL(&nsurl);
    unsafe { webview.loadRequest(&request) };
    // ... park (window, webview) for later lifecycle calls (D-01: hide/show, never close until app exit)
    Ok(serde_json::json!({ /* ... */ }))
}
```

Key deviations from the spike this phase MUST make, per the locked decisions:
1. `WKWebsiteDataStore::defaultDataStore(mtm)` not `nonPersistentDataStore(mtm)` (L-3).
2. No `webview.setCustomUserAgent(...)` call at all (L-4) — the spike's own `user_agent: Option<&str>`
   parameter should simply be passed `None` / omitted for this surface.
3. The frame rect comes from the real embed slot (`useStoreEmbedHost`'s zoom-scaled rect via
   `storeEmbedZoom.ts`), not the spike's hardcoded probe values.
4. `webview.setAutoresizingMask(...)` is only applied in the spike's `!in_main` branch — the
   `in_main` branch relies on the renderer's bounds-sync IPC (the existing `set_bounds` pattern),
   consistent with D-18's single-geometry-oracle rule; do not add an autoresizing mask that would
   create a second, competing geometry authority.

### Pattern 2: Main-thread marshalling (reuse verbatim)

**What:** A worker thread blocks on an `mpsc` channel with `recv_timeout` while
`app.run_on_main_thread(move || { ...objc2/AppKit/WebKit calls... })` does all unsafe Objective-C
work and sends the result back.

**When to use:** Every new Rust entry point that touches the new Epic `WKWebView` (open, set
bounds, hide/show, back/forward/reload, challenge check) must cross onto the main thread this way
— exactly how `open_pristine_epic_login_window` already does it.

**Example:**
```rust
// Source: src-tauri/src/main.rs ~L4147-4423 (open_pristine_epic_login_window), the shipped
// precedent for this exact marshalling shape — [VERIFIED: direct read this session]
// 1. SendPtr wraps the raw ns_view pointer with an unsafe Send marker so it can cross
//    the channel to the main-thread closure.
// 2. app.run_on_main_thread(move || { ...build webview, addSubview... ; let _ = tx.send(result); })
// 3. Worker thread: rx.recv_timeout(Duration::from_secs(10))
```

### Pattern 3: Autorelease-pointer hazard — resolve and retain on the main thread

**What:** `tauri::Window::ns_window()` / `.ns_view()` return `objc2::rc::Retained::autorelease_ptr(...)`
`[VERIFIED: doc comment in src-tauri/src/main.rs ~L4515-4650 citing tauri-2.11.5/src/window/mod.rs:1642,
read this session]` — valid only within the resolving thread's autorelease pool scope.

**When to use:** Any new code that needs to hold the main window's `NSWindow`/content view across
an async boundary (e.g. parking it for later `hide()`/`show()` calls) must resolve it on the main
thread and retain immediately (`Retained::retain`), following the existing
`login_window_ns_window_retained` pattern — never store the bare pointer and dereference it later
from a different thread or after a run-loop turn has passed.

### Pattern 4: Cloudflare challenge detection (D-09) — new chain, verified against crate source

```rust
// Verified method chain, assembled from direct reads of the vendored crate sources this session:
// objc2-web-kit-0.3.2/src/generated/WKNavigationDelegate.rs:131-158 (method signature + feature gate)
// objc2-web-kit-0.3.2/src/generated/WKNavigationResponse.rs:23-41 (response() accessor)
// objc2-foundation-0.3.2/src/generated/NSURLResponse.rs:172-283 (NSHTTPURLResponse)
// objc2-0.6.4/src/rc/retained.rs:325 (Retained::downcast signature)
unsafe fn webView_decidePolicyForNavigationResponse_decisionHandler(
    &self,
    web_view: &WKWebView,
    navigation_response: &WKNavigationResponse,
    decision_handler: &block2::DynBlock<dyn Fn(WKNavigationResponsePolicy)>,
) {
    if navigation_response.isForMainFrame() {
        let response = navigation_response.response(); // Retained<NSURLResponse>
        if let Ok(http_response) = response.downcast::<NSHTTPURLResponse>() {
            let key = NSString::from_str("cf-mitigated");
            if let Some(value) = http_response.valueForHTTPHeaderField(&key) {
                if value.to_string() == "challenge" {
                    // fire the D-09/D-10 challenge signal
                }
            }
        }
        // Fallback (D-09): main-frame host/path match on
        // challenges.cloudflare.com / /cdn-cgi/challenge-platform/ if the header is absent.
    }
    decision_handler.call((WKNavigationResponsePolicy::Allow,));
}
```

`Retained<T>::downcast<U: DowncastTarget>(self) -> Result<Retained<U>, Retained<T>>`
`[VERIFIED: objc2-0.6.4/src/rc/retained.rs:325, direct read this session]` is the correct,
type-safe way to attempt the `NSURLResponse` → `NSHTTPURLResponse` narrowing (every
`NSHTTPURLResponse` the system hands back for an `https://` navigation IS one, but the typed
accessor only promises the supertype).
`NSHTTPURLResponse::valueForHTTPHeaderField(&self, field: &NSString) -> Option<Retained<NSString>>`
`[VERIFIED: objc2-foundation-0.3.2/src/generated/NSURLResponse.rs:272, direct read this session]`.

### Pattern 5: 45 s timeout (D-05) — delegate lifecycle methods

```rust
// Method names and signatures [VERIFIED: objc2-web-kit-0.3.2/src/generated/WKNavigationDelegate.rs:176-311, direct read this session]
// webView_didStartProvisionalNavigation       -> arm a 45s timer (main-frame start)
// webView_didFinishNavigation                 -> cancel the timer (main-frame success)
// webView_didFailNavigation_withError         -> cancel the timer (main-frame failure — show error, not timeout banner)
// webView_didFailProvisionalNavigation_withError -> cancel the timer (early failure)
```
None of these four methods carry a frame-info parameter distinguishing main frame from subframe —
unlike `decidePolicyForNavigationResponse`'s `isForMainFrame()` on `WKNavigationResponse`, the
delegate's lifecycle callbacks are themselves main-frame-only by contract (confirmed by the Apple
doc comments vendored into the crate: *"Invoked when a main frame navigation starts"* /
*"completes"* / etc. `[VERIFIED: objc2-web-kit-0.3.2/src/generated/WKNavigationDelegate.rs:166,
243, 267`, quoted verbatim]) — no additional main-frame filtering is needed for the timer logic.

### Pattern 6: Native back/forward/URL (Claude's Discretion — recommended: use it)

```rust
// All unconditionally available on WKWebView once the WKWebView feature is enabled —
// [VERIFIED: objc2-web-kit-0.3.2/src/generated/WKWebView.rs:363-474, direct read this session]
webview.canGoBack();     // no extra feature needed
webview.canGoForward();  // no extra feature needed
webview.URL();           // no extra feature needed, returns Option<Retained<NSURL>>
webview.goBack();        // needs "WKNavigation" feature (already enabled)
webview.goForward();     // needs "WKNavigation" feature (already enabled)
```
This satisfies D-22's original two reasons (APIs the spikes proved; zero page-side injection) with
less code than porting `StoreEmbedState`'s Rust-side history stack — recommend reusing
`StoreEmbedState`'s `nav_events` ring / `take_nav_events` polling plumbing only as the IPC
transport, with these native calls as the single source of truth for the nav-state values it
carries (`canGoBack`, `canGoForward`, `url`, `host`), never a parallel Rust-tracked stack.

### Anti-Patterns to Avoid

- **Setting a custom UA on this surface:** L-4 is explicit — do not reuse `STORE_EMBED_USER_AGENT`.
- **`nonPersistentDataStore()`:** L-3 is explicit — only `defaultDataStore()` ships.
- **A second geometry writer:** any autoresizing-mask or Rust-side resize heuristic competing with
  the renderer's `getBoundingClientRect()` → `set_bounds` IPC call violates D-18 (spike 017's own
  "last write wins" finding).
- **Any `WKUserContentController`/init script/message handler on this webview:** the whole point
  of the raw construction is zero wry setup; adding any of these re-creates exactly the surface
  spike 024 established #7 says is the trigger.
- **Treating a request-level `challenges.cloudflare.com` host match as the primary signal:** D-09
  is explicit that this is a request pattern that will false-positive on Epic's own in-page
  sign-in Turnstile widget — the header is the primary signal, the host match is fallback only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheme allow-list / origin gate | A new per-surface scheme checker | `store_embed_navigation_policy` (`src-tauri/src/main.rs` ~L6373) | Already implements the exact Allow/Block/Handoff semantics this phase needs (D-14); re-deriving it risks drift from the Tauri embed's rules |
| Steam/popup hand-off throttling | A new rate limiter | `HandoffThrottle` + `STORE_EMBED_STEAM_THROTTLE`/`STORE_EMBED_POPUP_THROTTLE` + `store_embed_handoff_admitted` (~L6423-6470) | D-12 explicitly reuses this; a second throttle instance would double-admit or desync from the Tauri embed's own popups |
| Native JS dialogs | New `NSAlert` plumbing | `present_native_js_alert`/`_confirm`/`_prompt` (~L4093-4136) | D-13 explicitly reuses these; they are already shipped, tested-by-use code |
| Nav-state polling transport | A new polling loop in the renderer | `useStoreEmbedHost`'s existing `NAV_POLL_INTERVAL_MS` drain + `StoreEmbedState`-style ring | Re-deriving a second poll loop duplicates logic `storeEmbedReloadLoop.test.tsx` already pins a regression against |
| Last-URL restore validation | A new URL validator | `resolveStoreForUrl`/`isEmbeddableOrigin` (`storeEmbedOrigins.ts`) + D-31's apex-host match | This exact validated-restore path is what D-03 requires reusing, and what the reload-loop regression test guards |
| Zoom-aware rect conversion | New CSS-px→logical-px math | `readWebviewZoomFactor`/`scaleRectForZoom` (`storeEmbedZoom.ts`) | Already correct, measured (W8 PASS at 120%/80% zoom) and is the exact unit conversion this subview's bounds also need |

**Key insight:** Nearly everything this phase needs already exists in the codebase in a form
proven correct by a prior phase's live gate. The actual new code surface is small: one new
delegate class with two genuinely new callback bodies (the timer and the challenge-header check),
one new Rust module for the `in_main`-shaped construction, and the Cargo feature additions. The
main risk is NOT "how do I build this" but "did I reuse the existing allow-list/throttle/restore
plumbing instead of quietly re-deriving a parallel copy that drifts."

## Common Pitfalls

### Pitfall 1: Dereferencing `ns_view()`/`ns_window()` across a thread or run-loop boundary
**What goes wrong:** A crash or undefined behavior from touching a freed/invalid pointer.
**Why it happens:** Both methods return an autoreleased pointer, valid only within the resolving
thread's autorelease pool scope — not a stable, retained handle.
**How to avoid:** Resolve and retain on the main thread immediately (`Retained::retain`), exactly
as `login_window_ns_window_retained` already does, if the handle needs to outlive the resolving
call `[VERIFIED: doc comment at src-tauri/src/main.rs ~L4515-4650]`.
**Warning signs:** Any code path that stores a bare `*const`/`usize` pointer from `ns_view()` and
reads it later without having retained it first.

### Pitfall 2: Flagging a subframe Cloudflare request as a challenge
**What goes wrong:** Epic's own in-page sign-in form embeds a Turnstile widget as a subframe/
script load to `challenges.cloudflare.com` — a request-level match on that host trips on every
normal sign-in, not just real challenges.
**Why it happens:** The spike's nav log recorded exactly this request pattern on runs that
rendered fine.
**How to avoid:** D-09's primary signal is the main-frame **response** header (`cf-mitigated:
challenge`), checked via `isForMainFrame()` in `decidePolicyForNavigationResponse` — never a
request-level host match as the primary trigger.
**Warning signs:** A challenge false-positive firing exactly when the user opens Epic's own
sign-in widget.

### Pitfall 3: Treating the mid-parse stall (established #9) as a webview bug
**What goes wrong:** Spending implementation effort trying to "fix" a stalled WKWebView load.
**Why it happens:** Without reading the spike README's established #8/#9, the blank-after-cold-load
symptom looks like a webview defect.
**How to avoid:** It is a stopped document stream upstream of the webview (#9) or an occluded host
window WebKit correctly declines to render into (#8) — both are measured, both have a product
answer already decided (load timeout + reload for #9; nothing to build for #8, since a hidden/
occluded app window is not a case the product needs to paint into anyway).
**Warning signs:** "The embed is sometimes just blank" bug reports with no timeout banner firing —
check whether D-05's timer and D-09's challenge check are even wired before assuming a new defect.

### Pitfall 4: Adding a competing autoresizing mask or Rust-side resize heuristic
**What goes wrong:** The subview's frame silently stops tracking the React slot, or fights the
renderer's bounds-sync IPC (visible as jitter or a frozen/offset rect).
**Why it happens:** The spike's `!in_main` branch sets `NSAutoresizingMaskOptions` to track its
*own* window's resizes — natural to copy for the `in_main` branch too, but D-18 requires the
renderer to be the sole geometry authority.
**How to avoid:** Do not set an autoresizing mask on the `in_main` subview at all; let the existing
`set_bounds` IPC path (driven by `useStoreEmbedHost`'s `ResizeObserver`) be the only thing that
ever calls `setFrame`/`setFrameSize`.
**Warning signs:** The subview visibly lags or snaps during a window resize when the Tauri-managed
Epic-less embeds (Steam/GOG) resize smoothly.

### Pitfall 5: Forgetting `isFlipped()` when converting the embed slot's rect to AppKit coordinates
**What goes wrong:** The subview appears vertically mirrored or offset from the actual slot.
**Why it happens:** AppKit content views are bottom-left-origin unless the view opts into a
flipped coordinate system; `tao`'s view may be either, and the spike explicitly asks rather than
assumes (`let origin_y = if ns_view.isFlipped() { y } else { bounds.size.height - y - h };`
`[VERIFIED: .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs:322-325,
quoted verbatim]`).
**How to avoid:** Port this exact conditional; never hardcode an origin-y formula for one
orientation.
**Warning signs:** The subview renders at the correct size but wrong vertical position, especially
noticeable relative to the Tauri-managed embeds that already handle this correctly.

## Code Examples

See **Architecture Patterns** above (Patterns 1–6) for the verified, citation-backed code for:
construction (`pristine_create`'s `in_main` branch), main-thread marshalling (reuse of
`open_pristine_epic_login_window`'s channel pattern), the autorelease-pointer-safe resolve/retain
pattern, the `cf-mitigated` header read chain, the 45 s timeout's delegate lifecycle hooks, and
native back/forward/URL reporting.

### Delegate class declaration (reuse the shipped shape)

```rust
// Source: src-tauri/src/main.rs ~L3880-4423, EpicPristineNavDelegate — the shipped,
// in-repo precedent for declaring a WKNavigationDelegate + WKUIDelegate class via
// objc2's define_class! macro. [VERIFIED: direct read this session]
// A new delegate class for this phase (e.g. EpicEmbedNavDelegate) follows the identical
// define_class! shape, with WKNavigationDelegateIvars-equivalent state for: the 45s
// timer handle, and whatever channel/sender is used to relay the timeout-fired and
// challenge-detected signals back out to the dispatch_rust_channel-reachable state.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `/store/epic` always gated (`WebviewUnavailablePanel reason="epic"` on every platform) | Rendered in-app on macOS via a Rust-managed raw `WKWebView` subview | D-05 call, 2026-10-12 (quick `261012-d5g`) | Windows/Linux keep the panel; macOS gets the real store, Sign in included |
| Explanation for the gate: "Epic's posture / anti-bot reputation, unfixable" (2026-09-15 WONTFIX) | Explanation retired: the discriminator was Tauri's own wry webview setup (init scripts / message handlers), not Epic, the IP, the jar, or the UA | Spike 024 runs 6-27, 2026-10-11/12 | The gate is NOT a permanent Epic-side limitation; a raw, non-wry WKWebView is never challenged |

**Deprecated/outdated:** The 2026-08-03 Talon-login-fingerprint theory for why Epic blocks the
embed is REFUTED, not just superseded — the injected globals (`isTauri`, `__TAURI__`, etc.) were
present in runs that rendered fine and runs that were challenged alike (established #1). Do not
resurrect this explanation in planning or UX copy.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `drawsBackground` KVC call (`setValue:forKey:` with key `"drawsBackground"`, value `false`) is the correct mechanism for D-06's transparent-subview requirement. | Common Pitfalls / Pattern reference (D-06) | This is standard, long-documented Apple private-API KVC usage for `WKWebView`/`WebView` (training knowledge), but it is NOT exposed as a typed method in `objc2-web-kit`'s generated bindings (confirmed absent by direct read) and has no in-repo precedent — if the KVC key name or value type is wrong, the call silently no-ops rather than erroring, and the subview stays opaque. The planner should budget a task to live-verify this specific call renders transparently before relying on it. |
| A2 | The embed slot's exact logical rect (position/size) for the `in_main` attach should come from the same zoom-scaled rect `useStoreEmbedHost`/`storeEmbedZoom.ts` already computes for the Tauri-managed embeds, applied identically to this subview. | Architecture Patterns, Pattern 1 | CONTEXT.md's Discretion section states this directly for the bounds-WRITER path but does not explicitly confirm the Epic subview's *initial* construction frame (vs. ongoing resize) uses the identical rect-computation call site rather than a one-off value at creation time. If the planner instead special-cases the initial frame, D-18's single-geometry-oracle invariant could be subtly violated at construction time only. |
| A3 | A named Rust constant for the 45 s timeout, implemented via a `dispatch2`/`Timer`-style main-thread-scheduled callback (rather than, e.g., a worker-thread timer that posts back through the existing channel), is the natural fit for this codebase's conventions. | Architecture Patterns, Pattern 5 | No in-repo precedent for a *recurring or delayed* main-thread timer tied to a `WKWebView` navigation lifecycle exists yet (Phase 49's 45 s-idiom bound is a different mechanism — a probe timeout, not a UI timer); the exact Rust timer primitive to use is left to the planner/executor to choose among `std::thread::spawn` + channel vs. a native `NSTimer`/`dispatch2` main-thread timer. |

## Open Questions

1. **Does a hidden/backgrounded subview's 45 s timer pause or keep running (Claude's Discretion)?**
   - What we know: D-05 says the timer runs from `didStartProvisionalNavigation` to
     `didFinishNavigation`/`didFailNavigation`; D-01 says a hidden subview is kept alive, not torn
     down.
   - What's unclear: if a navigation is in-flight when the user leaves the Stores tab (hides the
     subview), whether the timer should keep counting (so a stale banner could appear the instant
     they return) or pause/reset.
   - Recommendation: keep it running (simplest, matches "the subview is never visible or
     hit-testable" invariant — a banner that is already correct the instant the tab becomes
     visible again is arguably better UX than a reset that silently extends a real stall); the
     planner should make this an explicit task decision, not an implicit default.

2. **Exact IPC/command naming (`store_embed_*` with a discriminator vs. a parallel `epic_embed_*`
   set) — explicitly Claude's Discretion in CONTEXT.md.**
   - What we know: either shape is acceptable to the user; `useStoreEmbedHost` (or a thin sibling)
     must stay the only bounds writer.
   - What's unclear: whether reusing the `store_embed_*` dispatch arms with a `surface` field adds
     meaningful risk of accidentally coupling the Tauri-managed embed's state machine to the raw
     WKWebView's (e.g. accidentally sharing `STORE_EMBED_STATE`'s single `OnceLock<Mutex<...>>`
     across both surfaces when they need independent nav-event rings).
   - Recommendation: lean toward a parallel, explicitly-named state struct (even if the IPC command
     *names* are shared with a discriminator) to avoid cross-surface state bleed — `StoreEmbedState`
     today is written assuming exactly one Tauri-managed webview exists at a time per store key.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| macOS (darwin) build target | Entire phase (L-2) | ✓ (current platform is darwin, confirmed by environment info) | Darwin 25.6.0 | — (phase is macOS-only by design; no fallback needed) |
| `objc2-web-kit` 0.3.2 vendored source | Delegate/construction verification | ✓ | 0.3.2 | — |
| Rust/Cargo toolchain | Build | Not independently re-verified this session (already a working project toolchain per existing shipped code) | — | — |
| Epic Games Store live endpoint (for the live gate) | Live gate arms | Not verifiable from this research session (network-dependent, operator-run) | — | Live gate is explicitly operator-run per `gamelib-conventions`' live-gate-over-green-suite philosophy |

**Missing dependencies with no fallback:** None identified — every piece of tooling this phase
needs is already present and working in the existing build (evidenced by the already-shipped
`open_pristine_epic_login_window` using the identical crate set).

**Missing dependencies with fallback:** None.

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` `[VERIFIED: direct read of
.planning/config.json this session — key not present]`; per the governing rule, absence means
treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Frontend framework | Jest, `testEnvironment: 'node'` (no jsdom/react-test-renderer; hooks and components are invoked directly against hand-rolled mocks — `[CITED: src/frontend/jest.config.js's own docstring, referenced by useStoreEmbedHost.test.tsx and WebviewUnavailablePanel.test.tsx's own header comments]`) |
| Config file | `src/frontend/jest.config.js` |
| Quick run command | `pnpm test -- useStoreEmbedHost` / `pnpm test -- WebviewUnavailablePanel` (Jest project-scoped) |
| Full suite command | `pnpm test:ci` (`jest --maxWorkers=2 --silent` `[VERIFIED: package.json scripts, this session]`) |
| Backend (Rust) framework | `cargo test`, run from `src-tauri/` | 
| Rust test constraint | `AppHandle`-dependent code (anything touching a real Tauri window/webview) is **structurally untestable** via `#[test]` — confirmed by the project's own in-repo comment: *"`store_embed_open` cannot be driven from a `#[test]` -- it takes `&AppHandle`, which a unit test structurally cannot construct... all 31 other `store_embed_*` test functions in this module sit over `AppHandle`-free helpers for exactly that reason"* `[VERIFIED: src-tauri/src/main.rs:19030-19046, quoted verbatim, direct read this session]` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-09 | `cf-mitigated` header read is main-frame-only, response-based not request-based | unit (pure-function slice, if the header-check logic is factored into an `AppHandle`-free helper) | `cargo test --package gamelib -- store_embed` (new test name TBD) | ❌ Wave 0 — no such helper/test exists yet |
| D-03 | Epic's last-URL restore goes through the same validated path as other stores, no reload-loop regression | unit (structural, following the existing pattern) | `pnpm test -- storeEmbedReloadLoop` | ✅ exists today for the Tauri embed path; Epic-specific coverage is a Wave 0 gap |
| D-01/D-02 | Subview hide-on-leave/show-on-return, never torn down except at app exit | **manual-only** — no jsdom, no real `NSWindow`/`WKWebView` in CI | — | manual-only by necessity (native subview, `AppHandle`-dependent) |
| D-05/D-07/D-08 | 45s timeout fires once, banner shows, no silent retry | **manual-only (live gate)** | — | live gate arm: "timeout → reload path" (already in ROADMAP's minimum arms) |
| D-10/D-11 | Challenge → panel with `'epic-challenged'` reason, no stickiness | unit (for the new `WebviewUnavailableReason` union + render logic, following `WebviewUnavailablePanel.test.tsx`'s existing structural-gate pattern) + **live gate** for the actual header detection | `pnpm test -- WebviewUnavailablePanel` | ✅ file exists, needs new test cases for the `'epic-challenged'` reason |
| L-1 (Sign in, no interception) | Sign in button reachable, unmodified | **live gate only** (explicitly, per the ROADMAP's minimum arms: "Sign in button") | — | manual-only |

### Sampling Rate

- **Per task commit:** `pnpm test -- <touched test file>` (frontend) and/or `cargo test` scoped to
  the touched module (backend); `npx prettier --check` over exactly the files the task wrote, per
  the `<verify>` block convention.
- **Per wave merge:** `pnpm test:ci` (frontend full suite) + full `cargo test` (backend).
- **Phase gate:** Full suite green, PLUS the live gate — this phase's dominant verification
  surface is a human-driven live gate (native `WKWebView` subview; Jest/cargo structurally cannot
  see it), per the project's own "Live gate over green suite" convention
  `[CITED: 50-CONTEXT.md § Established Patterns]`.

### Wave 0 Gaps

- [ ] A new `tests/` or `__tests__/` file (or additions to `WebviewUnavailablePanel.test.tsx`) for
  the new `'epic-challenged'` reason's render/copy — follows the existing structural-gate pattern
  already proven for the `'epic'` reason.
- [ ] A pure, `AppHandle`-free helper (new, if the header-check logic is written as one) for the
  `cf-mitigated` header match / host-path fallback match, so `cargo test` can cover the string
  logic even though the real `WKNavigationResponse` plumbing cannot be unit-tested.
- [ ] Possible additions/extension to `storeEmbedReloadLoop.test.tsx` or a sibling to cover the
  Epic-specific restore path once the `embeddable` flag becomes platform-aware (per CONTEXT.md's
  Discretion note that the inverted structural test in `WebviewUnavailablePanel.test.tsx` "is
  re-derived, not deleted").
- [ ] The phase's `50-UAT.md` live-gate arms (cold jar; warm signed-in jar; Sign in; occlusion
  recovery; timeout → reload; back/forward/URL parity with GOG; Steam positive control) — these
  are the ROADMAP's own stated minimum arms and are the dominant verification surface for this
  phase; none of them are automatable.

## Security Domain

`security_enforcement` is absent from `.planning/config.json` `[VERIFIED: direct read this
session — key not present]`; per the governing rule, absence means treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (this phase does not implement Epic auth — it renders Epic's own login UI unmodified, L-1) | — |
| V3 Session Management | Partial — the shared `defaultDataStore()` jar (L-3) means Epic's session cookies are exposed to this surface the same way they already are to the pristine login window; no new session-handling code is written by this phase | Reuse of the existing shared-jar model (Phase 40 D-14); no new cookie-reading/writing code |
| V4 Access Control | Yes — the scheme allow-list / origin gate (`store_embed_navigation_policy`, D-14) is the access-control boundary for what this surface may load | Reuse `store_embed_navigation_policy` verbatim; never build a parallel allow-list |
| V5 Input Validation | Yes — the `cf-mitigated` header value and any URL/host strings this phase reads from the live page must be treated as untrusted input | Compare the header value and host/path strings via exact/allow-list match only (as D-09/D-14 already specify); never `eval`/interpret page-supplied strings as code or policy |
| V6 Cryptography | No new cryptographic work in this phase | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary-origin navigation inside the subview (a malicious or compromised redirect chain loading a non-Epic, non-allow-listed origin) | Spoofing/Tampering | `store_embed_navigation_policy`'s scheme allow-list + `resolveStoreForUrl`'s apex-host match (D-31) — reused verbatim, never re-derived per-surface |
| A page-controlled popup opening a second in-app window | Elevation of Privilege (an untrusted page gaining a second native surface) | `WKUIDelegate`'s `createWebViewWithConfiguration:` returns `None`, hands off to the system browser via the existing throttle (D-12) — never create a second in-app `WKWebView` from page-triggered JS |
| Zero page-side JS injection (hard rule, Phase 40 D-22) — any init script or message/scheme handler added to this webview would reopen exactly the surface the Talon-403 investigation (and, separately, spike 024 established #7) flagged as risky/challenge-triggering | Tampering | Build the `WKWebViewConfiguration` with no `WKUserContentController` script, no custom scheme handlers — the raw construction's entire value proposition |

## Sources

### Primary (HIGH confidence — direct filesystem reads this session)
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-CONTEXT.md` — full read, locked decisions verbatim
- `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-DISCUSSION-LOG.md` — full read, option-table audit trail
- `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md` — established #1-#9, Consequence section, full read
- `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs` — `pristine_create`, `window_visibility`, `occluder_create/close`, `pristine_read/probe/close`, lines 260-490, full read
- `.planning/spikes/024-epic-store-in-embedded-child-webview/app/Cargo.toml` — full read
- `src-tauri/src/main.rs` — `EpicPristineNavDelegate`, `open_pristine_epic_login_window`, autorelease-hazard doc comments, `StoreEmbedState`/`store_embed_*` functions, `store_embed_open` test's own doc comment on `AppHandle`-untestability (L19030-19046) — multiple section reads this session
- `src-tauri/Cargo.toml` lines 74-232 — full read, macOS dependency table and its extensive history comments
- `wry-0.55.1/Cargo.toml` lines 382-411 — vendored crate source, direct read this session
- `objc2-web-kit-0.3.2/src/generated/WKNavigationDelegate.rs`, `WKNavigationResponse.rs`, `WKWebView.rs`, `WKWebsiteDataStore.rs`, `WKWebViewConfiguration.rs` — vendored crate source, direct reads this session
- `objc2-foundation-0.3.2/src/generated/NSURLResponse.rs` — vendored crate source (NSHTTPURLResponse), direct read this session
- `objc2-0.6.4/src/rc/retained.rs` — vendored crate source (`Retained::downcast`), direct read this session
- `objc2-web-kit-0.3.2/Cargo.toml` — feature-gating definitions, direct read this session
- `src/frontend/screens/WebView/useStoreEmbedHost.ts`, `storeEmbedOrigins.ts`, `storeEmbedZoom.ts` — full reads this session
- `src/frontend/components/UI/StoreEmbedControls/index.tsx` — full read this session
- `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx`, `StoreEmbedPlaceholder.tsx` — full reads this session
- `src/common/signInState.ts` — full read this session (D-04's selector)
- `.planning/ROADMAP.md` § Phase 49, Phase 50 — direct reads this session
- `.planning/config.json` — direct read this session (nyquist_validation, security_enforcement both absent)
- `package.json` scripts section — direct read this session

### Secondary (MEDIUM confidence)
- `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx`, `storeEmbedReloadLoop.test.tsx`, `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` — doc-comment headers read this session (not the full test bodies)

### Tertiary (LOW confidence / `[ASSUMED]`)
- The `drawsBackground`/`setValue:forKey:` KVC mechanism for D-06 (training knowledge; no in-repo precedent, not exposed as a typed `objc2-web-kit` method — see Assumptions Log A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new crates, exact feature-gate requirements verified against vendored crate source
- Architecture: HIGH — the construction is a direct, already-proven port of spike 024's `pristine_create` `in_main` arm, plus reuse of the already-shipped `open_pristine_epic_login_window`/`EpicPristineNavDelegate` pattern
- Pitfalls: HIGH — every pitfall above is either a measured spike finding (occlusion, mid-parse stall, autorelease hazard) or a direct reading of the vendored crate source (coordinate-flip, feature gating)
- D-06's transparency mechanism: LOW/`[ASSUMED]` — flagged explicitly in the Assumptions Log for planner/executor live-verification

**Research date:** 2026-10-11
**Valid until:** 30 days (stable domain — the crate versions are pinned and the spike's measurements do not expire; re-check only if `objc2-web-kit`/`wry` versions are bumped, or if Epic changes its Cloudflare configuration)
