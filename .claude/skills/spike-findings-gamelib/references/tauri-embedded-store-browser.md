# Tauri Embedded Store Browser (in-app child webviews, `unstable` multiwebview)

Spike 013 proved the *separate-window* login/browser shape; Electron's `<webview>` tag
(`src/frontend/screens/WebView/index.tsx`, disabled under Tauri by
`WebviewUnavailablePanel.tsx`) has no Tauri equivalent. Spikes 016–018 (2026-08-03) proved
the *in-app* shape: `Window::add_child` embeds a store webview INSIDE the main window with
Heroic-parity "Store tab" UX. Real Steam store composited in-window, screenshot-proven
(`sources/016-embedded-child-webview-basic/shot-embed-steam.png`).

Verified on macOS / tauri 2.11.5 / wry 0.55.1 at `scale_factor` 1.0 by 016–018. Spikes 024–029
(2026-09-05 → 2026-10-12) then extended the picture, and **several 016–018 rules do NOT carry
over** — read the per-platform sections below before applying any of them off macOS:

| Platform | `add_child` | `set_position`/`set_size` | `data_store_identifier` | Source |
| --- | --- | --- | --- | --- |
| macOS (WKWebView) | works, 42–51 ms | works (NSView subview) | works, macOS 14+ | 016–018 |
| Windows (WebView2) | works, 95 ms, **async command only** | works, 0 px error at ×1.25 (`WS_CHILD` + `SetWindowPos`) | **silent no-op** | 027 (live 2026-09-30) |
| Linux (webkit2gtk) | works, 2 ms | **silent no-op** (packed into shared `GtkBox`) — use the GTK Overlay+Fixed lever | **silent no-op** | 025/026/028/029 |

And for **Epic specifically**, a Tauri-managed child webview is Cloudflare-challenged every time;
the working embed is a Rust-managed raw `WKWebView` subview (024, see below).

## Requirements

1. **Embed with `Window::add_child` on the existing config-created main window** — no window
   restructuring. Gated on the `unstable` cargo feature.
2. **The renderer is the ONLY owner of the embed's geometry.** Never write bounds from two
   places — the second writer silently wins with no error.
3. **Overlay UI must never render over the embed's rect** — the child is a native subview
   above the main webview. `hide()` the embed before showing modals/dropdowns.
4. **One default cookie jar per PROCESS** — every window and child shares it. Per-store
   isolation requires `data_store_identifier` (macOS 14+). **It is macOS-only:** on Linux
   (webkit2gtk) and Windows (WebView2) the builder accepts it and silently ignores it — an
   "isolated" child read the full shared jar (10/10 and 15/15 cookies). Design every non-macOS
   embed around ONE shared jar. (026, 027)
5. **All login-webview rules carry over unchanged** (see
   `tauri-login-webview-cookies.md`): `cookies()` never `cookies_for_url()`; `on_page_load`
   never `on_navigation` for deadline-armed relays; per-child `.user_agent()` is mandatory;
   handles die with the webview.
6. **Positive controls must not rely on Secure cookies over `http://localhost`.**
7. **Epic's store must NOT be a Tauri-managed webview** (`add_child` / `WebviewBuilder`).
   It is Cloudflare-Turnstile-challenged 10/10 cold runs, and a human click does not clear it.
   Use a Rust-managed raw `WKWebView` (`objc2-web-kit`) added as a subview of the main window's
   content view — challenged 0/16. Decided as D-05 option A, Phase 50 (macOS first). (024)
8. **On Linux, never trust `set_position`/`set_size`** — they return `Ok` and write nothing.
   Position the embed with the GTK lever: `gtk::Overlay` over main + pass-through `gtk::Fixed`,
   `Fixed::move_` + `set_size_request`. Never pack the `Fixed` as a vbox sibling of main. (026,
   028, 029)
9. **Create webviews from an `async` command or `run_on_main_thread`, never a sync
   `#[tauri::command]`** — a sync command creating a webview deadlocks on Windows. (027)
10. **One embed on the existing main window only** — a second `Window` with two child webviews
    segfaults natively in `libwebkit2gtk-4.1` on Linux (2/2). (026)

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
  **macOS and Windows only:** on Linux this exact shape segfaults inside
  `libwebkit2gtk-4.1.so.0.19.7` at a fixed offset, 2/2, with no Rust panic — visible only in
  `journalctl` (`sources/025-linux-add-child-compile/crash-segfault-journalctl.txt`). (026)
- `add_child` from a non-main thread is fine on Linux too (029, 10/10 `offmain`).

### Bounds sync (renderer-driven, the ONLY writer)

Renderer measures the slot and invokes; Rust applies verbatim:

> **Correction (027 live run, 2026-09-30):** the original 016 harness used a pure trailing
> debounce (`clearTimeout` + restart, 40 ms). That debounce is a defect — during a drag it never
> fires, so the embed lags. Use a **leading-edge throttle with a trailing flush** (the shipped
> `useStoreEmbedHost.ts` `scheduleFlush`). Drag-resize at scale 2.0 passed only after this port.

```js
// ResizeObserver on the slot div → leading-edge throttle + trailing flush (NOT a pure debounce)
const r = slot.getBoundingClientRect();
invoke('set_embed_bounds', { label: 'store-embed', x: r.x, y: r.y, w: r.width, h: r.height });
```

```rust
webview.set_position(LogicalPosition::new(x, y))?;
webview.set_size(LogicalSize::new(w, h))?;
// macOS + Windows only. On Linux both return Ok and write nothing — see "Linux: Overlay + pass-through Fixed".
```

Measured: JS viewport coords map 1:1 to child logical coords — **no titlebar offset** —
and integer px round-trip exactly; fractional CSS px round to the nearest whole logical px
(290.5 → 291) with no cumulative drift. The CSS-layout WKWebView pathology
(`[[wkwebview-percentage-height-vs-1fr-grid-row]]`) does not apply — this is native-frame
geometry.

**Zoom caveat (2026-10-12, quick 261012-gn8):** the 1:1 mapping holds only at webview zoom 1.
Accessibility zoom is Tauri `setZoom(f)`, under which one CSS px is f logical px, so the renderer
multiplies the slot rect by the applied factor (`--webview-zoom`, read in `storeEmbedZoom.ts`) and
re-sends bounds when that factor changes and after every open (the macOS/Windows existing-embed
`store_embed_open` branch does not re-apply the rect). Live on Windows: W8 PASS at 120% and 80%.

### Route-change lifecycle

- Store tab hidden: `webview.hide()` / shown: `webview.show()` (both proven Ok; webview and
  jar survive).
- Store tab closed: `webview.close()` — the label disappears from `webviews()`, later handle
  use fails loudly (`no webview 'store-embed'`), and re-creating under the same label works.
- An ISOLATED child's jar is reachable only while that child lives (015's rule at child
  level) — anchor any cookie poller to a webview that outlives the poll.

### Epic: raw `WKWebView` subview, not a Tauri webview (024, macOS)

Spike 024 took 27 runs (2026-09-05 → 10-12) to find the discriminator. The ruled-out list matters
as much as the answer, because each was a confident wrong explanation at some point:

| Hypothesis | Ruled out by |
| --- | --- |
| The injected `__TAURI__`/`isTauri`/`ipc` globals (the Talon login fingerprint) | Run 1 rendered WITH them present |
| A human can click through Turnstile | Runs 4–5: click → challenge re-issues indefinitely |
| User agent | Runs 6–10: none, `EpicGamesLauncher`, full Safari UA — all challenged |
| IP / cookie jar | Run 11: Safari Private Window, same IP, cold jar — rendered |
| WKWebView itself | Runs 12–16: raw `WKWebView` in its own window — 0/10 challenged |
| The subview attachment | Runs 17–19: raw `WKWebView` INSIDE the main window at the embed rect — 0/6 challenged, child embed beside it 6/6 |

What is left is wry's per-webview setup (init scripts, script-message handlers, custom scheme
handlers), which the public `WebviewBuilder` cannot strip. So skip wry for Epic entirely:

```rust
// MAIN THREAD ONLY. objc2-web-kit / objc2-app-kit / objc2-foundation.
let mtm = objc2::MainThreadMarker::new().ok_or("not on main thread")?;
let window = app.get_window("main").ok_or("no main window")?;
let ns_view: &NSView = unsafe { &*(window.ns_view()? as *const NSView) };
// Renderer rects are top-left origin; AppKit content views are bottom-left unless flipped — ask.
let b = ns_view.bounds();
let oy = if ns_view.isFlipped() { y } else { b.size.height - y - h };
let config = unsafe { WKWebViewConfiguration::new(mtm) };
unsafe { config.setWebsiteDataStore(&WKWebsiteDataStore::defaultDataStore(mtm)) }; // product: shared jar
// spike used nonPersistentDataStore() to force a COLD jar per arm
let wv = unsafe { WKWebView::initWithFrame_configuration(mtm.alloc(),
    NSRect::new(NSPoint::new(x, oy), NSSize::new(w, h)), &config) };
ns_view.addSubview(&wv);
unsafe { wv.loadRequest(&NSURLRequest::requestWithURL(&NSURL::URLWithString(&NSString::from_str(url)).unwrap())) };
// keep Retained<WKWebView> in a main-thread thread_local (it is !Send); close = removeFromSuperview()
```

Full working version: `sources/024-epic-store-in-embedded-child-webview/app/src/main.rs`
(`pristine_create`, `pristine_close`). This is the same non-injected construction as the shipped
`open_pristine_epic_login_window`. It brings its own bounds-sync, cookie and navigation plumbing on
the Rust side — none of the `Webview` handle API applies to it.

Two cold-load "blank store" states, both diagnosed — neither is a webview bug:

- **Occluded host window** (recurring): the whole 1.12 MB document, 9/9 head scripts and 4/4
  stylesheets are in, `readyState` complete, nothing painted. WebKit suspends rendering for a
  window the window server reports not visible; Epic's app boot waits on a frame. Uncover the
  window → it boots and paints within one sample. Reproducible on demand for Steam too. The user
  is never looking at an occluded window, so it is not a shipping blocker.
- **Mid-parse stall** (runs 15–19, 0/16 since): `readyState=loading`, the document stopped at a
  fixed offset mid-string-literal inside an inline script — the upstream response stopped
  arriving. Product answer: **load timeout + reload affordance** on the embed.

Locked with the D-05 decision: no interception or hiding of Epic's Sign in button; the shared
default data store (warm signed-in jar — every spike run was cold, so the Phase 50 gate must carry
a warm arm); Turnstile-host detection (`challenges.cloudflare.com` nav / `Just a moment...` title)
falls back to the unavailable panel.

### Linux: Overlay + pass-through Fixed (026, 028, 029)

Why the macOS recipe fails: `tauri-runtime-wry` packs every `WindowChild` webview into the window's
`default_vbox()` — the same `GtkBox` as the main webview — so they split 50/50 (`1280x450` each in a
900 px window). wry's `set_bounds` only writes `if is_in_fixed_parent`, which is never true here.
wry's own `reparent()` doesn't help either: it never updates `is_in_fixed_parent`. And wry's GTK
`bounds()` never sets position (always `(0,0)`) — measure with
`Widget::translate_coordinates` against the toplevel instead.

The lever (stock Tauri Linux API + `gtk = "0.18.2"` pinned to wry's own copy, no fork):

```rust
// Window::default_vbox() is public, Linux-only, NOT behind `unstable`.
let vbox: gtk::Box = window.default_vbox()?;
// Webview::with_webview(|pv| pv.inner()) → the exact webkit2gtk::WebView for ONE label.
// All GTK calls on the GTK main thread (inside with_webview), bounded by a recv_timeout.
vbox.remove(&embed_widget);
let fixed = gtk::Fixed::new();
fixed.put(&embed_widget, x, y);
fixed.move_(&embed_widget, x, y);
embed_widget.set_size_request(w, h);
// 028/029 packed `fixed` into the vbox as a SIBLING — that squeezes main to 61–125 px. DON'T.
// Shipped shape (quick 260930-blh): move main's widget into a gtk::Overlay packed at main's old
// vbox position; add `fixed` as the Overlay's only overlay child with
// overlay.set_overlay_pass_through(&fixed, true); then reparent the embed into `fixed`.
```

Reliability: 028 saw the embed stuck at GTK's never-allocated sentinel `{-1,-1,1,1}` in 10/11 runs.
029 re-ran 10 treatments × N=10 with a fresh fake profile per attempt: **100/100 allocated, reparent
30/30 EXACT 700×400**, including unfocused and off-main-thread — focus/mapping is refuted. 029 ran
with `WEBKIT_DISABLE_DMABUF_RENDERER=1` (broken NVIDIA driver/library mismatch); the follow-up re-run
with it UNSET on a fixed driver (2026-09-30, `results-unset-dmabuf/`) was 20/20 (10 plain ALLOCATED,
10 reparent EXACT). Reading: 028's failure was an environment artefact of the broken GPU stack. The
lever is buildable, and was built (quick `260930-blh`).

Packing-property gotcha: `set_child_packing`/`set_size_request` show NO change on immediate
readback — GTK applies them at the next real relayout (028 saw the effect only after a resize).
Never conclude "lever had no effect" from a same-tick snapshot.

### Windows (027)

The unmodified harness built natively on MSVC (tauri 2.12.0 / wry 0.57.0) and placed a real
`WS_CHILD` WebView2 child at every requested slot rect with **0 px error at DPI ×1.25**, verified
by an independent HWND sampler. macOS's renderer-measures / Rust-places recipe applies as-is,
with two differences: `data_store_identifier` is a no-op, and webview creation must not run in a
sync `#[tauri::command]` (it hangs: log shows `add_child` with no OK/FAILED while the window keeps
pumping). Wrap creation in an `async` command or `run_on_main_thread`. Shipped `store_embed_open`
goes through sidecar RPC dispatch, not a Tauri command — keep it that way when un-gating Windows.
Claim limit: harness only, one host; `src-tauri/Cargo.toml` still target-gates `unstable`.

Cross-checking from a non-Windows host: `cargo check --target x86_64-pc-windows-gnu` works after
`mingw-w64` (resource compiler) plus a real `icons/icon.ico`; tauri-build has no flag to skip
resource embedding. `-msvc` from Linux needs `llvm-rc`.

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
- **Quoting a single run of a third-party anti-bot surface.** 024 was first written VALIDATED on
  run 1 alone; runs 2–3 were challenged. Re-run more than once, from a fresh container, and keep
  the Steam positive control in every run. Two later drafts' "reopen conditions" fired within a
  day. (024)
- **Exfiltrating probe results with `fetch` from an https store page** to `http://localhost` —
  mixed-content blocked, and it looks exactly like a blocked page. Use top-level navigation
  (`location.href = 'http://localhost:<port>/report?…'`). Inject with `eval` after settle, never an
  `initialization_script`. (024)
- **A layout-defect "known limitation" left in a harness.** 024's flex panel starved the slot to
  969×58 and silently invalidated interactive run 4 — the log could not show it (bounds logging
  was `quiet`). Fix measurement defects before the next run; pixel capture is the only bounds
  evidence. (024)
- **Trusting `Ok(())` from geometry or isolation calls off macOS.** Linux `set_bounds` and
  Linux/WebView2 `data_store_identifier` both succeed and do nothing. Verify with an independent
  oracle (GTK allocation via `with_webview`, an HWND sampler, a cookie read). (026, 027)
- **Packing the app's `gtk::Fixed` as a vbox sibling of main** — the embed rect comes out exact
  while main is squeezed to 61–125 px. Measure main's height too, not just the embed's. (029)
- **`pkill -f WebKitNetworkProcess` inline in a shell command** — the pattern matches the calling
  shell's own command line and kills it (exit 144, no output). Put it in a script file. (029)
- **Building a spike with `CARGO_TARGET_DIR` inside the repo while `pnpm tauri:dev` runs** — on
  Windows the Vite watcher hit `EBUSY` on the fresh `.exe` and crashed. (027)

## Constraints

- `unstable` is a compile-time cargo feature of the `tauri` crate; `add_child` is
  `#[cfg(all(desktop, feature = "unstable"))]`.
- wry macOS implementation: WKWebView added via `addSubview` on the window content view
  (`wry-0.55.1/src/wkwebview/mod.rs:178,666`).
- `data_store_identifier` remains macOS 14+ / fixed `[u8;16]` (see 015).
- `window.__TAURI__` is injected into the remote store origin (014b) — invokes are
  ACL-refused but threat-model the surface.
- ~~Unmeasured: … Windows (WebView2) / Linux (webkit2gtk) child-webview behaviour, Epic's
  anti-bot posture inside an embed~~ — **superseded by 024–029**: Windows measured live (027,
  harness only), Linux measured and a layout lever built (025–029, one X11/NVIDIA host), Epic
  measured (024: Tauri child challenged, raw `WKWebView` served). Still unmeasured: input/scroll
  feel, Linux HiDPI, Windows multi-monitor, a WARM-jar Epic arm, the raw-subview path on
  Windows/Linux (024's construction is macOS-only as written).
- Linux build deps: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev
  librsvg2-dev patchelf build-essential` (the `release-tauri.yml` set). Cold build 48.8 s. (025)
- Linux `default_vbox()` is gated on the Linux target family, NOT on `unstable`; gtk-rs must be
  pinned to the exact version wry resolves (`0.18.2`) so there is one `gtk::Widget` type. (028)
- Windows/Linux runs and the tauri 2.12.0 / wry 0.57.0 source reads (026–029) are a newer
  version than the 016–018 macOS baseline (2.11.5 / 0.55.1).
- Harness identifier: `tauri.conf.json`'s `identifier` is baked in by `generate_context!()` —
  a fresh WKWebsiteDataStore container needs a rebuild, not just an edit. (024)

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

Synthesized from spikes: 016, 017, 018 (run 2026-08-03); 024 (2026-09-05 → 2026-10-12, 27 runs);
025, 026, 027 (2026-09-28; 027 live Windows run 2026-09-30); 028, 029 (2026-09-29/30).
Source files: `sources/016-embedded-child-webview-basic/` (shared harness),
`sources/017-child-webview-bounds-sync/`, `sources/018-child-webview-coexistence/`,
`sources/024-epic-store-in-embedded-child-webview/` (raw `WKWebView` arms in `app/src/main.rs`),
`sources/025-linux-add-child-compile/` (Linux harness + segfault journal),
`sources/026-linux-add-child-runtime/`, `sources/027-windows-add-child-crosscheck/` (async-command
harness), `sources/028-linux-add-child-gtkbox-packing-lever/`,
`sources/029-linux-embed-allocation-reliability/` (`mod gtk_lever` in `app/src/main.rs`,
`run-variants.sh`).
