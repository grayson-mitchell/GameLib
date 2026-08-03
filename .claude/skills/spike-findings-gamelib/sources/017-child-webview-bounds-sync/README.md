---
spike: 017
name: child-webview-bounds-sync
type: standard
validates: "Given an embedded child webview, when the window resizes and JS reports a new content rect, then the child's bounds track it acceptably, and it can be hidden/shown/destroyed on route change"
verdict: VALIDATED
related: [016, 018]
tags: [tauri, webview, bounds, resize, lifecycle, macos]
---

# Spike 017: Child webview bounds sync (the "store tab" geometry problem)

Shares the 016 harness — see `../016-embedded-child-webview-basic/app/` for how to run.
The child webview is native (an NSView subview), so nothing in CSS moves it; a "store tab"
UX means the renderer must continuously report its layout rect to Rust.

## What This Validates

**Given** a child webview embedded via `add_child`, **when** the layout changes and JS
reports a new content rect, **then** `set_position`/`set_size` track it accurately, and
`hide`/`show`/`close` support route-change semantics.

## Investigation Trail

1. **Round-trip accuracy.** Scripted `set_position(LogicalPosition) + set_size(LogicalSize)`
   then read back `position()/size()` (physical) ÷ `scale_factor`:

   ```
   req (290, 96, 900×700)          → (290, 96, 900×700)      exact
   req (10, 400, 400×300)          → (10, 400, 400×300)      exact
   req (290.5, 96.5, 760.25×560.75)→ (291, 97, 760×561)      rounded to whole logical px
   ```

   Fractional CSS px round to the nearest whole logical pixel — sub-pixel drift does not
   accumulate, and the WKWebView percentage-height pathology (the F-10 23323 px gotcha) did
   not appear: this is native-frame geometry, not CSS layout.

2. **Coordinate space.** The JS `getBoundingClientRect()` of the panel's `#slot` div, passed
   verbatim as logical px, landed the embed exactly on the slot (screenshot evidence in 016).
   The child's coordinate origin is the same as the main webview's viewport origin — **no
   titlebar offset correction needed** (at `scale_factor` 1.0).

3. **Live sync works — and exposed a real design constraint.** The panel wires a
   ResizeObserver on `#slot` → debounced `invoke('set_embed_bounds')`. During the scripted
   run BOTH writers ran, and the live sync silently overrode the autorun's bounds:
   last-write-wins, no error, no event. A real integration must have exactly **one bounds
   owner** — the renderer — and treat backend-side geometry writes as forbidden.

4. **Route-change lifecycle.** `hide()` / `show()` returned Ok and the webview survived;
   `close()` removed it (`webviews()` back to `["main"]`), and post-close handle use fails
   loudly (`no webview 'store-embed'`) — matching 015's window-handle lifetime rule at the
   child level. Recreating after destroy worked (phase 8 created a second embed with the
   same label).

## Results

**VERDICT: VALIDATED** — JS-reported rects drive the native child accurately enough for a
store tab, with rounding to whole logical px as the only quantization.

Caveats (not invalidating, but unmeasured):
- **Visual latency/flicker during a continuous drag-resize** was not measured — the
  scripted moves were discrete. The interactive run is the test for perceptible lag of
  native-view-follows-DOM.
- **`hide()` visual effect unphotographed** (the show/hide window was 600 ms; APIs say Ok).
- **Retina displays** (`scale_factor` 2.0): rounding behaviour at fractional physical px
  unverified; this run's display was 1.0.
- **Occlusion**: anything the main webview draws over the slot region (modals, dropdowns)
  will render UNDER the native child. Overlay UI while the store tab is visible must either
  `hide()` the embed first or live outside the slot region. (Same class of problem as
  Electron `<webview>`/BrowserView z-order — not new, but unavoidable here too.)
