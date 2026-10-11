---
created: 2026-10-11T08:40:00.000Z
title: Saved Accessibility zoom is never re-applied at startup under Tauri
area: ui
severity: medium
platform: any
ready: live-gate
found_by: "quick 261011-t4y planning (desk read), 2026-10-11"
files:
  - src/frontend/state/GlobalState.tsx:549
  - src/frontend/state/GlobalState.tsx:609-618
  - src/preload/api/tauriWindowChrome.ts:126-140
---

## Observation (desk-derived, unmeasured)

The Accessibility screen's Zoom range persists `zoomPercent` (`configStore.set('zoomPercent', ...)` in
`setZoomPercent`, `GlobalState.tsx:609-618`) and, after a 500ms debounce, calls
`window.api.setZoomFactor(percent / 100)`, which reaches `tauriSetZoomFactor` and
`getCurrentWebview().setZoom(...)`.

That is the **only** caller chain. `setZoomPercent` has one caller, the Accessibility slider's `onChange`.
The saved value is read back into state at boot (`GlobalState.tsx:549`,
`zoomPercent: configStore.get('zoomPercent', 100)`), so the slider shows the saved number, but nothing in
`src-tauri/src`, `src/preload` or GlobalState's boot path applies it to the webview. So the webview runs at
factor 1 after every launch until the Zoom slider is touched.

Desk read only: no run has set a non-100% zoom, restarted, and measured.

## Why it matters

A saved zoom that silently is not in effect: the Accessibility screen says 150%, the app renders at 100%.
It is also relevant to the Library tile-size slider (quick 261011-t4y): that work publishes the applied
factor as `--webview-zoom` from `tauriSetZoomFactor` after `setZoom` resolves. A boot re-apply routed through
`tauriSetZoomFactor` would therefore publish `--webview-zoom` automatically, and would close residual (c) of
that task's Resolution (a `window.location.reload()` leaving the webview zoomed while the property resets).

## Fix options (not chosen)

- Re-apply in GlobalState's constructor or `componentDidMount` by calling `window.api.setZoomFactor` with
  the saved `zoomPercent / 100` once, without the debounce.
- Apply it from the Tauri shell or preload at webview creation, before first paint, to avoid a flash at
  100%; this needs the setting available outside the frontend state.
- Have the Accessibility screen apply it on mount (weakest: only runs if the screen is opened).

## Owed

Live confirmation: set Accessibility Zoom to 150%, quit and relaunch, and observe whether the UI renders at
150% or at 100% with the slider still reading 150%. Then re-check Library tile width at the same zoom after
whichever fix lands.
