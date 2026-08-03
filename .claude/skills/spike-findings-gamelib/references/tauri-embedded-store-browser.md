# Tauri Embedded Store Browser (in-app child webviews, `unstable` multiwebview)

Spike 013 proved the *separate-window* login/browser shape; Electron's `<webview>` tag
(`src/frontend/screens/WebView/index.tsx`, disabled under Tauri by
`WebviewUnavailablePanel.tsx`) has no Tauri equivalent. Spikes 016–018 (2026-08-03) proved
the *in-app* shape: `Window::add_child` embeds a store webview INSIDE the main window with
Heroic-parity "Store tab" UX. Real Steam store composited in-window, screenshot-proven
(`sources/016-embedded-child-webview-basic/shot-embed-steam.png`).

Verified on macOS / tauri 2.11.5 / wry 0.55.1 at `scale_factor` 1.0. Windows/Linux and
retina are UNVERIFIED, same constraint as the 013–015 findings.

## Requirements

1. **Embed with `Window::add_child` on the existing config-created main window** — no window
   restructuring. Gated on the `unstable` cargo feature.
2. **The renderer is the ONLY owner of the embed's geometry.** Never write bounds from two
   places — the second writer silently wins with no error.
3. **Overlay UI must never render over the embed's rect** — the child is a native subview
   above the main webview. `hide()` the embed before showing modals/dropdowns.
4. **One default cookie jar per PROCESS** — every window and child shares it. Per-store
   isolation requires `data_store_identifier` (macOS 14+).
5. **All login-webview rules carry over unchanged** (see
   `tauri-login-webview-cookies.md`): `cookies()` never `cookies_for_url()`; `on_page_load`
   never `on_navigation` for deadline-armed relays; per-child `.user_agent()` is mandatory;
   handles die with the webview.
6. **Positive controls must not rely on Secure cookies over `http://localhost`.**

## How to Build It

### Enable the feature

```toml
# src-tauri/Cargo.toml
tauri = { version = "2", features = ["tray-icon", "image-png", "unstable"] }
```

Cost measured: only `tauri` + `tauri-runtime-wry` recompile — **10.8 s** with a warm target
dir. No config or capability changes to the existing app.

### Create the embed (proven shape)

```rust
use tauri::webview::WebviewBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

let window = app.get_window("main").ok_or("no main window")?;   // Manager::get_window is unstable-gated
let builder = WebviewBuilder::new("store-embed", WebviewUrl::External(url))
    .user_agent(CHROME_UA)                       // mandatory — default macOS UA has no product token
    .on_page_load(|_w, payload| { /* did-navigate analog: Started|Finished, main frame */ })
    .on_navigation(|_u| true);                   // fires for subframes too — log only, never drive logic
// per-store isolated session (macOS 14+):
// builder = builder.data_store_identifier(*b"gamelib-store-01");
let webview = window.add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))?;
```

- `add_child` returned in **42–51 ms** and hops to the main thread internally — callable
  from any thread (`tauri-2.11.5/src/window/mod.rs:1129`).
- The child composites ABOVE the main webview; the app UI renders around it and stays fully
  live (events, re-renders) while the child runs.
- `window.webviews()` lists the child immediately; `app.get_webview("store-embed")` fetches
  the handle later.
- A bare `WindowBuilder::new` window + several `add_child` calls also works (probe B) — an
  app-origin child there needs a `"webviews": ["<label>"]` entry in the capability to get IPC.

### Bounds sync (renderer-driven, the ONLY writer)

Renderer measures the slot and invokes; Rust applies verbatim:

```js
// ResizeObserver on the slot div, debounced ~40 ms
const r = slot.getBoundingClientRect();
invoke('set_embed_bounds', { label: 'store-embed', x: r.x, y: r.y, w: r.width, h: r.height });
```

```rust
webview.set_position(LogicalPosition::new(x, y))?;
webview.set_size(LogicalSize::new(w, h))?;
```

Measured: JS viewport coords map 1:1 to child logical coords — **no titlebar offset** —
and integer px round-trip exactly; fractional CSS px round to the nearest whole logical px
(290.5 → 291) with no cumulative drift. The CSS-layout WKWebView pathology
(`[[wkwebview-percentage-height-vs-1fr-grid-row]]`) does not apply — this is native-frame
geometry.

### Route-change lifecycle

- Store tab hidden: `webview.hide()` / shown: `webview.show()` (both proven Ok; webview and
  jar survive).
- Store tab closed: `webview.close()` — the label disappears from `webviews()`, later handle
  use fails loudly (`no webview 'store-embed'`), and re-creating under the same label works.
- An ISOLATED child's jar is reachable only while that child lives (015's rule at child
  level) — anchor any cookie poller to a webview that outlives the poll.

### Cookies / login detection on the embed

`cookies()` on the child handle returns the full jar (HttpOnly + Secure incl. Steam's
`steamCountry`) in single-digit ms. Default jar sharing means a login completed inside the
embed is visible from ANY handle — including the main webview's. Proven discriminator for
isolation testing: an isolated child sees only its own session's cookies while `main` keeps
the shared set.

## What to Avoid

- **Two geometry writers.** The interactive panel's ResizeObserver silently overrode the
  scripted autorun bounds — last-write-wins, zero errors. Backend-side "default bounds"
  plus renderer sync WILL fight; give the renderer sole ownership.
- **Rendering app UI over the embed's rect.** DOM z-index cannot beat a native subview.
  Hide the embed for overlays.
- **`<iframe>` as a cheaper embed.** Store sites send `X-Frame-Options`/`frame-ancestors`;
  dead on arrival.
- **Assuming loopback Secure-cookie controls work.** `spike_secure`/`spike_both`
  (Secure over `http://localhost`) never surfaced in the 016–018 session, contra 014a's
  earlier observation. Keep control cookies flag-free or HttpOnly-only.
- **Evidence truncation before the discriminating byte.** A 60-char UA log cut at
  `AppleWebKit/` made the WORKING Chrome spoof look failed (Chrome vs default UA diverge
  only after that point).
- **Full-screen `screencapture` for visual evidence.** Repeatedly missed the app window
  (wrong display / occlusion) and swept in unrelated user windows. Log
  `NSWindow.windowNumber` (`objc2::msg_send![…, windowNumber]` on `ns_window()`) and use
  `screencapture -x -o -l<id>` — captures the exact window even occluded.

## Constraints

- `unstable` is a compile-time cargo feature of the `tauri` crate; `add_child` is
  `#[cfg(all(desktop, feature = "unstable"))]`.
- wry macOS implementation: WKWebView added via `addSubview` on the window content view
  (`wry-0.55.1/src/wkwebview/mod.rs:178,666`).
- `data_store_identifier` remains macOS 14+ / fixed `[u8;16]` (see 015).
- `window.__TAURI__` is injected into the remote store origin (014b) — invokes are
  ACL-refused but threat-model the surface.
- Unmeasured: input/scroll feel (interactive-run item), drag-resize latency, retina
  rounding, Windows (WebView2) / Linux (webkit2gtk) child-webview behaviour, Epic's
  anti-bot posture inside an embed (its pre-auth 403 is a parked known blocker).

## Reproducing

`sources/016-embedded-child-webview-basic/app/` is the full harness (serves 016/017/018):
interactive GameLib-mock panel + `SPIKE_AUTORUN=1` scripted run (phases 0–8: embed →
UA/cookie oracles → real Steam store → bounds round-trips → hide/show → cookie coexistence →
probe B two-child window → destroy → isolated-jar proof). Evidence: `run.log` (JSONL),
`shot-embed-steam.png`, `shot-probeB.png`.

```bash
cd <app> && CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build   # ~11 s warm
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 CARGO_TARGET_DIR=<repo>/src-tauri/target cargo run
```

## Origin

Synthesized from spikes: 016, 017, 018 (run 2026-08-03).
Source files: `sources/016-embedded-child-webview-basic/` (shared harness),
`sources/017-child-webview-bounds-sync/`, `sources/018-child-webview-coexistence/`.
