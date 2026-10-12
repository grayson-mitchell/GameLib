---
phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
reviewed: 2026-10-12T00:00:00Z
depth: max
files_reviewed: 16
files_reviewed_list:
  - src-tauri/src/macos_epic_embed.rs
  - src-tauri/src/main.rs
  - src/backend/store/storeEmbedSeam.ts
  - src/backend/sidecar/storeEmbedFlowRegistration.ts
  - src/preload/api/storeEmbed.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/index.css
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
  - src/frontend/screens/WebView/storeEmbedZoom.ts
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
  - src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx
  - src/frontend/screens/WebView/components/EpicLauncherBlockedNotice.tsx
  - src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx
  - src/frontend/components/UI/StoreEmbedControls/index.tsx
  - src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx
findings:
  critical: 0
  warning: 15
  info: 0
  total: 15
status: resolved_pending_live_gate
---

# Phase 50: Code Review Report

**Reviewed:** 2026-10-12, at `da2a92b87` (branch `quick-261002-b63`), max depth, single pass with
every finding re-checked against the code. Scope: the 49 Phase 50 commits plus the store-embed
implementation they plug into. WebKit wiring was checked against the vendored wry 0.55.1,
tauri-runtime-wry and tao sources.

**Resolved:** 2026-10-12, all 15 findings fixed on this branch (commits below), each with a test
that fails without the change. The macOS-only Rust was type-checked and clippy-checked for
`aarch64-apple-darwin` from Linux; its decision logic moved into cfg-free modules
(`epic_embed_state.rs`, `store_embed_handoff_policy.rs`, `epic_embed_js_dialog.rs`) whose tests run
on Linux. **Nothing was run on a Mac.** The Phase 50 live gate (`50-UAT.md`) is still the
verification for every item marked "live" below.

| # | Finding | Fix | Live check needed |
|---|---|---|---|
| 1 | A macOS store switch inside the mounted WebView navigated whichever surface was selected (GOG→Epic loaded Epic in the challenged Tauri webview; Epic→GOG loaded GOG in the raw Epic view). | `b48c1bf30` — re-open with the new storeKey when the surface changes; `store_embed_open`'s Epic arm hides the Tauri embed. | gog↔epic shows one surface at a time |
| 2 | Epic back/forward/reload/navigate replies lacked `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount`, so every reply was rejected as malformed. | `e77a2f1f6` — one shared flag merge for queued events and direct replies. | — |
| 3 | `window.open` handed any URL to `open_external` (incl. `steam://`), bypassing the Valve-host gate; launcher-scheme popups skipped the D-14 counter; rejected popups used the throttle slot. Same in the Tauri embed's `on_new_window`. | `36a2d5ec7`, `388d8252e` — shared http(s)-only `store_embed_browser_handoff_policy` before the throttle, for both popup hooks and the Tauri `on_download`. | `window.open('steam://…')` does nothing; launcher popup shows the notice |
| 4 | JS alert/confirm/prompt from any frame showed app-modal NSAlerts with page text and no origin, even while hidden. | `7874bbd07` — D-13 keeps native dialogs, now main-frame only, only while visible, one at a time, rate-limited, as a sheet titled with the origin, text capped; otherwise wry's defaults. | dialogs appear as origin-titled sheets (UAT 13) |
| 5 | `show()`/warm `open()` un-hid a challenged surface. | `ba218f77e` — visibility derived in Rust as `!selected \|\| user_hidden \|\| challenged`, one writer. | challenge stays hidden across dialogs and route re-entry |
| 6 | The challenged panel stacked below the placeholder out of view, without `url` (no Open in browser). | `aca3a5fe3` — `StoreEmbedSlotContents` renders exactly one thing in the slot; panel gated on `isEpicSurface`, with `url`. | panel visible with working Open in browser |
| 7 | A challenge cleared by the page's own navigation left the surface hidden. | `ba218f77e` — clearing `challenged` re-derives visibility. | auto-passed challenge shows the page |
| 8 | Timeout banner and launcher notice rendered below the embed (grid auto-placement). | `5fd803fce` — explicit grid rows; slot on row 4. | banner/notice under the controls (UAT 14) |
| 9 | The D-04 auth reload never fired after signing in via /login and returning. | `ebf464f57` — sign-in baseline kept per storeKey across unmounts; one reload on change. | one reload after sign-in (UAT 15) |
| 10 | `open()` mutated views before a fallible NSURL build, orphaning or leaving visible-but-unselected subviews. | `bc20c19b9` — build the NSURL first; undo `addSubview` on a poisoned lock. | — |
| 11 | No `webViewWebContentProcessDidTerminate:` (blank surface after a crash) and no download routing (Epic's Download did nothing). | `2479af735` — reload on crash with a nav event; undisplayable/attachment responses cancelled and handed to the browser under the shared policy. | Download opens in the browser; crash reloads |
| 12 | Same-document `pushState` navigations never updated URL/canGoBack or `last-url-epic`. | `18266f37e` — KVO on `URL`/`canGoBack`/`canGoForward` into the capped queue; removed in `close()`. | three pages deep updates Back (UAT 9) |
| 13 | `deselect()` wrote `selected=false` off the main thread, racing an Epic `open()`. | `ba218f77e` — selection and visibility change in one main-thread closure. | — |
| 14 | No autoresizing mask, so the subview drifted on resize until the next bounds update. | `94686484c` — edge-pinning mask (wry's `ViewMinYMargin`), never size-tracking (D-18). | no drift on resize/zoom/fullscreen |
| 15 | The launcher notice scheduled a timer on every render, cutting later notices short. | `2be248287` — one timer per attempt in an effect, with cleanup. | one toast per blocked attempt |

## Open, not fixed here

- The "Paused while a window is open" placeholder copy still shows through the transparent Epic
  subview during cold loads. UI-SPEC E2 forbids new text on this surface, so changing it needs a
  copy decision.
- A cross-surface re-open while a modal is open shows the embed (the first open on mount behaves
  the same way today).
- `50-CONTEXT.md`'s "one code path for both raw WKWebViews" wording is now out of date: the Epic
  surface's JS-dialog path is gated separately from the pristine login window's.
