---
title: Gamepad navigation inside the embedded store pages
trigger_condition: When the embedded store browser and console mode are both stable under Tauri AND someone is doing focused gamepad work — read upstream ccfc8e849's ControllerHints rework first as prior art, then design natively against WKWebView. Do not start before the store browser's Tauri surface has settled, or the input plumbing is a guess.
planted_date: 2026-08-15
related_phase: console mode / embedded store browser (spikes 016-018)
---

# Seed: Gamepad navigation inside the embedded store pages

## The idea

Console mode should be able to drive the **embedded in-app store browser** with a controller —
browse and buy without reaching for a mouse. Today the gamepad stops at the app chrome; the store
webview is a dead zone.

Heroic shipped exactly this in v2.22.1 as `ccfc8e849` ("Make the Store Pages controllable with
Joystick"), so the interaction design has real prior art worth reading before designing GameLib's.

## Why this is a seed and not a port

**Upstream's implementation is not portable to GameLib.** Reviewed 2026-08-15:

- It depends on a new **255-line `src/webviewPreload/index.ts`** — a preload script injected into
  the Electron `<webview>` tag, which reaches into the page's DOM to enumerate focusable elements
  and drive scrolling.
- It requires Electron `<webview>` preload wiring, plus `electron.vite.config.ts` and
  `electron-builder.yml` entries, and moves `public/webviewPreload.js` into the build graph
  (`src/backend/constants/paths.ts`, `src/backend/main_window.ts`).
- **GameLib has no `webviewPreload` at all.** Its WebView took a different path entirely
  (Tauri/WKWebView). There is no `<webview>` tag to attach a preload to.

The equivalent on WKWebView is a `WKUserScript` injected into the store webview's content
controller, messaging back over a `WKScriptMessageHandler` — a different mechanism with different
lifecycle and security characteristics. That is a design job, not a merge.

## Harvestable pieces if someone builds it

Not everything upstream did is Electron-bound. These parts are surface-agnostic and worth lifting:

- The **`ControllerHints` rework** (+64 tsx, +38 css) — the on-screen hint strip that tells the
  user which buttons do what in the current context. Pure React.
- Parts of the **+168 lines added to `gamepad.ts`** — the focus-traversal and scroll logic, as
  distinct from the parts that talk to the webview.
- The `WebviewControls` change, depending on how GameLib's equivalent chrome is structured.

## Related

- The Nintendo-layout + key-repeat gamepad todo from the same upstream review — if that lands
  first, `gamepad.ts` will already be closer to upstream, making this cheaper.
- Spikes 016-018 validated the embedded store browser via the unstable multiwebview API; that
  spike's findings constrain what can be injected and when.
