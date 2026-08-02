---
spike: 016
name: embedded-child-webview-basic
type: standard
validates: "Given Tauri 2.11.5 with the `unstable` feature, when a child webview is added to the main window at a position/size, then an external store URL renders INSIDE the window alongside the main webview, with the Chrome UA override applied"
verdict: VALIDATED
related: [013, 014a, 015, 017, 018]
tags: [tauri, webview, multiwebview, unstable, embed, store-browser, macos]
---

# Spike 016: Embedded child webview (in-app store browser)

## What This Validates

**Given** Tauri 2.11.5 / wry 0.55.1 on macOS with the `unstable` cargo feature, **when**
`Window::add_child` adds a second webview to the main window at a position/size, **then** an
external store URL (the real Steam store) renders *inside* the window with the app's own UI
visible around it, the Chrome UA override reaches real network requests, and the app's own
webview keeps working.

This is the kill-shot spike for the in-app store browser. Spike 013 proved the *separate
window* shape; Electron's `<webview>` tag (what `WebView/index.tsx` uses today) has no Tauri
equivalent, so an in-app "Store tab" UX needs the multiwebview API — which no prior spike had
ever exercised.

## Why This Matters

`src/frontend/screens/WebView/index.tsx` is disabled under Tauri
(`WebviewUnavailablePanel.tsx`). The two candidate replacements were: (a) a separate
`WebviewWindow` (proven, 013) with a child-window UX, or (b) a true embedded child webview
with Heroic-parity UX. This spike decides whether (b) exists at all.

## Research

Checked against vendored crate sources (`~/.cargo/registry/src/`), not docs:

- `Window::add_child(WebviewBuilder, Position, Size)` — `tauri-2.11.5/src/window/mod.rs:1129`,
  gated `#[cfg(all(desktop, feature = "unstable"))]`. Internally hops to the main thread
  itself (mpsc + `run_on_main_thread`), so callers on any thread are fine.
- wry's macOS backend has a real child implementation: `new_as_child`
  (`wry-0.55.1/src/wkwebview/mod.rs:178`) adds the WKWebView as an `NSView` subview of the
  parent window's content view (`addSubview`, mod.rs:666/681).
- `WebviewBuilder` (label + `WebviewUrl`) carries everything the store browser needs:
  `.user_agent()`, `.on_page_load()`, `.on_navigation()`, `.data_store_identifier()`,
  `.initialization_script()`, `.incognito()`, `.auto_resize()`.
- Runtime surface on `Webview`: `set_position/set_size/bounds/hide/show/close/reparent/
  navigate/cookies/window`.

| Approach | Mechanism | Status |
|----------|-----------|--------|
| `Window::add_child` (`unstable`) | WKWebView subview positioned in the parent NSView | **chosen — proven here** |
| Separate `WebviewWindow` | own OS window | fallback, proven in 013 |
| `<iframe>` in the main webview | plain HTML | rejected — store sites send `X-Frame-Options`/`frame-ancestors` |

**Feature-flag cost:** `unstable` changes only the `tauri` crate's feature set. With the
shared `CARGO_TARGET_DIR`, exactly two crates recompiled (`tauri`, `tauri-runtime-wry`); a
clean harness build took **10.8 s**, not the feared minutes.

## How to Run

```bash
cd .planning/spikes/016-embedded-child-webview-basic/app

# Interactive — a GameLib-shaped panel; buttons create/destroy/hide/show the embed
CARGO_TARGET_DIR=../../../../src-tauri/target cargo run

# Scripted (phases 0–8: embed → oracles → store page → bounds → cookies → probe B → isolation)
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 CARGO_TARGET_DIR=../../../../src-tauri/target cargo run
```

The harness serves spikes 016/017/018 (same pattern as 013's app serving 013–015).

## What to Expect

- One window: the dark GameLib-mock panel (header + sidebar + dashed `#slot` + log strip).
- Creating an embed puts a live store page *inside* the window covering `#slot`.
- `run.log` (JSONL) and `events-export.json` in the spike directory;
  `shot-embed-steam.png` / `shot-probeB.png` are window-targeted screenshots from the
  scripted run.

## Observability

Same forensic layer as 013 (ISO timestamp + ms + category + JSON data → `run.log`, stderr,
and a `spike-log` Tauri event the panel renders live). Server-side oracles: the 013 loopback
control server logs the `User-Agent:` and `Cookie:` headers the embed actually sends.
New this spike: the harness logs each window's `NSWindow.windowNumber` (== `CGWindowID`) so
the autorun can photograph the exact window with `screencapture -l<id>` — works even when
the window is occluded, which is what made unattended visual evidence possible at all.

## Investigation Trail

1. **`add_child` on the config-created main window worked first try** — no need for the
   "documented" bare-`WindowBuilder` shape. `add_child OK` in 42–51 ms; bounds read back
   exactly; `window.webviews()` → `["main", "store-embed"]`. This is the load-bearing result
   for GameLib: the existing config-created window can adopt an embed incrementally.

2. **Server-side UA verification.** The embed's requests to the loopback origin carried the
   full spoofed `Chrome/131.0.0.0 Safari/537.36` UA. (First-pass log analysis looked like the
   spoof had FAILED — the summary truncated the UA at 60 chars, exactly at `AppleWebKit/`,
   where the Chrome and default UAs are still identical. Lesson: truncate evidence *after*
   the discriminating byte.)

3. **`/probe` oracle:** the embed attached its cookie jar (`spike_domain, spike_httponly,
   spike_plain`) to a real HTTP request — the jar is live, not just API-visible.

4. **A real store page rendered.** Steam's TF2 page: `on_page_load started` +766 ms after
   navigate, `finished` at +2.8 s. Window-targeted screenshot (`shot-embed-steam.png`) shows
   the store compositing inside the window, above the main webview, with the sidebar/header
   visible around it and the panel's live event stream still updating below — i.e. the main
   webview kept rendering and receiving events while the child ran.

5. **Probe B (bare `WindowBuilder` + two children) also works** — `multi-panel` (app origin)
   and `multi-store` (GOG) side by side in one window (`shot-probeB.png`, GOG rendered its
   cookie-consent dialog). The app-origin child needed a `webviews: ["multi-panel"]` entry in
   the capability to get IPC.

6. **Only 3 of the 5 control cookies ever appeared** (`spike_secure`/`spike_both` absent).
   014a-era notes said Secure cookies ARE accepted over `http://localhost`; this session they
   were not, in either the shared or the isolated jar. Not load-bearing for 016 (the deciding
   real-world cookies are HttpOnly+Secure over real HTTPS, which worked — `steamCountry`),
   but worth re-checking if a login flow ever depends on a loopback Secure cookie.

## Results

**VERDICT: VALIDATED** — the in-app store browser shape exists and works on macOS.

| Finding | Evidence | Consequence |
|---|---|---|
| `add_child` works on the config-created main window | `add_child OK` 42–51 ms, webviews `["main","store-embed"]` | GameLib can embed without restructuring its window setup |
| External store URLs render inside the window | screenshot: Steam store composited over the panel's slot | Heroic-parity Store tab is achievable |
| Child z-order: above the main webview | screenshot: store covers slot; UI around it visible | render the embed over a reserved layout region |
| `.user_agent()` applies per-child and reaches the network | loopback server logged `Chrome/131.0.0.0` | bot-management posture same as 013; per-store UAs possible |
| Main webview stays live alongside the child | event stream kept rendering in the screenshot | app UI and embed coexist |
| The `unstable` feature costs one 10.8 s rebuild of 2 crates | build log | no meaningful build-cost objection |
| JS-viewport coords == child position coords (scale 1.0) | embed landed exactly on `#slot`'s `getBoundingClientRect()` | no titlebar/coordinate-space correction needed |

### Surprises

- The interactive panel's ResizeObserver sync **overrode the autorun's scripted bounds** —
  two writers to one child's geometry last-write-wins with no error. Design consequence: the
  real app must have exactly ONE bounds owner (the renderer), never both a backend default
  and a frontend sync.
- `window.webviews()` on the main window listed the child immediately — no event/round-trip
  lag to design around.

### Open (deferred to 017/018/live checkpoint)

- Input (click/scroll/text) inside the embed — APIs can't prove it; needs the interactive run.
- Retina (`scale_factor` 2.0) — this run's display was 1.0.
- Windows (WebView2) / Linux (webkit2gtk) — macOS-only evidence, same constraint as 013–015.
