---
slug: macos-embed-titlebar-offset
status: resolved
trigger: "macOS store embed: with the native title bar visible (framelessWindow OFF), the Tauri store-embed child webview sits ~28px (one titlebar height) too high, covering the StoreEmbedControls row; plus R7: after resizing the window while away from Stores, the embed shows at stale size for ~1s then snaps"
created: 2026-10-30
updated: 2026-10-30
source_todo: .planning/todos/pending/2026-10-29-store-embed-follow-ups-off-windows.md
---

# macOS store embed: titlebar offset + stale geometry on return

## Symptoms

(Prefilled from the live macOS run of the source todo's item 1/item 3 on 2026-10-30. Symptoms
were observed by the operator and measured from screenshots taken by the orchestrator; not
re-gathered by interview.)

Two defects. The operator asked for BOTH to be fixed.

### Defect A: titlebar offset (macOS only)

- **Expected behavior:** the store-embed child webview fills `.WebView__embedSlot` exactly: below
  the 40px `StoreEmbedControls` row (back/forward/reload/host/open-in-browser), right of the
  sidebar, flush to the right and bottom edges. At any webview zoom.
- **Actual behavior:** with `settings.framelessWindow` OFF (the preload calls
  `setTitleBarStyle('visible')`, `src/preload/api/tauriWindowChrome.ts:310`; creation-time state
  is `"titleBarStyle": "Visible"` in `src-tauri/tauri.conf.json:23`), the embed is placed ~28-32
  logical px too HIGH, covering most of the controls row. Measured from screenshots on a 1x
  display (3440x1440, screenshot px = logical px):
  - zoom 100%: embed top ~32px above the slot top; the 41px controls row is almost fully hidden.
  - zoom 140%: embed top ~28px above the slot top; the top half of the 56px controls row shows.
  - The offset is ~constant across zoom, i.e. NOT a zoom-arithmetic error; ~= the macOS titlebar
    height (28pt).
- **Control:** with `framelessWindow` ON (`setTitleBarStyle('overlay')`), at 140%, the embed sits
  flush under the controls row. Correct.
- **Error messages:** none observed.
- **Timeline:** never measured with the titlebar visible before. Earlier macOS sittings (phase
  38/40/50) likely ran with frameless ON. R1 of the 2026-10-30 run "passed" only because nobody
  noticed the controls row was missing.
- **Reproduction:** `pnpm tauri:dev` on macOS; Settings: "Use frameless window" OFF; open Stores ->
  GOG (or Steam). The controls row is hidden under the page.
- **Hypothesis (orchestrator, unconfirmed in code):** the Tauri/wry macOS child-webview path
  flips y using the full window/frame height (including the titlebar) rather than the content
  view's height, or positions relative to a view whose frame includes the titlebar. Under the
  overlay style the content area is the whole window, so the two agree. Note
  `src-tauri/src/macos_epic_embed.rs:337-345` handles the `isFlipped()` origin itself for the
  raw Epic WKWebView subview; check whether the Epic surface shows the same offset and whether
  its approach can be reused. The fix must hold when the user toggles frameless at runtime while
  the embed is open (the titlebar style changes under a live child).

### Defect B: stale geometry on return (R7; macOS observed, Windows path shares the code)

- **Expected behavior:** open Stores, go to Library, resize the window (larger), return to
  Stores: the embed fills the NEW slot immediately.
- **Actual behavior:** the embed first shows at the old (smaller) size, then snaps to full size
  after ~1 s.
- **Known code facts:** `src-tauri/src/main.rs` `store_embed_open` (~line 6490) existing-embed
  branch on macOS/Windows shows and navigates but does NOT apply the rect it is given;
  `useStoreEmbedHost.ts` `flush()` (~line 443-495) compensates with `scheduleFlush()` after the
  open promise resolves (quick 261012-gn8, `a8e03e290`), and that resolve evidently lands ~1 s
  later. Linux re-applies the rect inside open already. Likely fix: apply the rect (respecting
  the zero-area guard) in the existing-embed branch before showing, keeping the renderer
  follow-up as a harmless re-send.

## Constraints

- Follow `Skill("gamelib-conventions")` (prettier `--check` over exact paths written; no
  unref'd sidecar handles etc. as applicable) and `Skill("spike-findings-gamelib")` (Tauri
  embedded store browser reference: multiwebview, the D-18 single-geometry-oracle rule — the
  renderer's slot rect stays the only rect source; no fallback rect).
- `tauri dev` does not rebuild the sidecar; Rust changes need a dev restart for live checks.
- Live re-verification (R1-R7 with frameless OFF and ON) is done by the operator; return a
  checkpoint asking for it rather than claiming it.

## Current Focus

- hypothesis: (A) wry/Tauri macOS child y-flip uses frame height incl. titlebar; (B) existing-embed open branch ignores the rect
- next_action: none (resolved 2026-10-30)

## Evidence

- timestamp: 2026-10-30 wry-0.55.1 `set_bounds`/`window_position` (wkwebview/mod.rs:1010,1425) flips y using `superview.frame().size.height` (the content view) and takes y relative to the content view top.
- timestamp: 2026-10-30 tauri-runtime-wry `TitleBarStyle::Visible` keeps `FullSizeContentView` set (lib.rs:1202, 3645), so the content view spans the titlebar while the page starts below an opaque titlebar. Overlay = page under titlebar, origins agree. Confirms the offset equals the titlebar band and is zoom-independent. (Original y-flip-by-frame-height hypothesis refined: the flip is right; the origin differs.)
- timestamp: 2026-10-30 R7: existing-embed branch of `store_embed_open` never applied the rect on macOS/Windows.

## Eliminated

- Zoom arithmetic (offset constant across zoom).

## Resolution

- root_cause: (A) Tauri's Visible title bar style leaves the content view full-size, so wry's child position (content-view coords) is one titlebar height above the renderer's viewport-relative slot rect. (B) store_embed_open's existing-embed branch skipped the rect on macOS/Windows.
- fix: `macos_epic_embed::content_top_inset` (0 when titlebar transparent/overlay, else contentView height - contentLayoutRect height), added to y in `store_embed_apply_rect`, used by set_bounds, the existing-embed open branch (now applies rect before show) and add_child. Renderer re-flushes on `gamelib:titlebar-style-applied` (dispatched after setTitleBarStyle resolves) for runtime frameless toggles.
- verification: cargo check/fmt/test (371) and jest WebView+preload (445) pass. Live, operator report 2026-10-30 after a dev restart: non-Epic stores PASS with frameless OFF and ON, R7 included. Epic was still offset after 2fd875107 and PASSED after b69e5efad, which applies `content_top_inset` in `rect_to_ns_rect`. No captures were taken of the re-run.
- files_changed: src-tauri/src/macos_epic_embed.rs, src-tauri/src/main.rs, src/frontend/screens/WebView/useStoreEmbedHost.ts, src/preload/api/tauriWindowChrome.ts (2fd875107, b69e5efad)
