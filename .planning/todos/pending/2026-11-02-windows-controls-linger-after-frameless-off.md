---
created: 2026-11-02
title: "Windows: turning off \"Use frameless window\" leaves GameLib's own minimize/maximize/close buttons on the tab bar, next to the native frame's"
source: Operator report, Windows, 2026-11-02
area: ui
files:
  - src/frontend/App.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/screens/Settings/components/UseFramelessWindow.tsx
  - src/frontend/components/UI/WindowControls/index.tsx
  - src/preload/api/tauriWindowChrome.ts
  - src/preload/api/settings.ts
  - src/preload/api/misc.ts
  - src/preload/__tests__/framelessRuntime.test.ts
  - src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts
severity: minor
platform: windows
ready: live-gate
---

On Windows, switching **Settings → General → Use frameless window** off brings back the standard
Windows title bar with its own minimize / maximize / close buttons, but GameLib's in-app
`WindowControls` stay rendered on the tab bar too. You end up with two sets of window buttons.

## Cause (confirmed from the code, quick 261102-dma)

- `App.tsx:84` renders `WindowControls` behind
  `showOverlayControls = isFrameless && !hasNativeOverlayControls && !isMac`. `isFrameless` comes
  from `ContextProvider`.
- `GlobalState.tsx` sets `isFrameless` once, at mount, from `await window.api.isFrameless()`, and
  never writes it again.
- The toggle reaches the preload `setSetting` (`src/preload/api/settings.ts`), which redrew the
  native frame live through `applyFramelessDecorations` but told React nothing.
- Re-querying `window.api.isFrameless()` after the toggle would not have been enough: it reads the
  settings snapshot, which is patched only when the sidecar's STORE_CHANGED push comes back, so a
  re-read straight after `setSetting` races that round trip. The fix therefore pushes the WRITTEN
  value.
- Both directions were broken. OFF left GameLib's buttons next to the native ones (the report). ON
  removed the native frame but showed no GameLib buttons until a restart.
- A restart cleared it, because all three boot paths (the `tauriAttach.ts` pre-paint, the
  post-hydration re-apply in `index.tsx`, and the GlobalState mount read) agree on the setting.

## Fix direction

When the `framelessWindow` setting changes, refresh `isFrameless` in global state. Keep the macOS
two-boolean gate in `App.tsx` exactly as its comment block requires. Add a jest test: flipping the
setting off hides `WindowControls` on win32 and linux.

Followed as written, except that the refresh is a push of the written value rather than a re-query
(see the race above).

Linux has the same problem because the gate is `!isMac`, not Windows-only. It was only seen on
Windows.

## Verify

Live on the Windows box. Toggle frameless off: one set of buttons (native). Toggle it back on:
GameLib's set returns and the native frame goes away. No restart in either direction.

## Code landed (quick 261102-dma)

Commits touching `src/`:

- fa6e56ea6 `test(quick-261102-dma): pin the frameless change push from setSetting`
- 9b2df1603 `fix(quick-261102-dma): refresh isFrameless live when the frameless setting changes`
- e8d71269e `test(quick-261102-dma): pin isFrameless refresh through GlobalState into the WindowControls gate`

What changed:

- The push: `setSetting` in `src/preload/api/settings.ts` calls `notifyFramelessChanged` with the
  written boolean, inside the existing default / `framelessWindow` guard and right after
  `applyFramelessDecorations`. Listeners are isolated by try/catch, so a faulty subscriber cannot
  break the settings write.
- The surface: `window.api.handleFramelessChanged(listener)` (subscribe only, returns an
  unsubscribe), forwarded from `src/preload/api/misc.ts`. Nothing on `window.api` can fire the push.
- The subscription: `GlobalState.tsx` `componentDidMount` registers it after the mount-time
  `isFrameless` seed, so an older seed value can never overwrite a push.
- The tests: F1-F7 in `framelessRuntime.test.ts` drive the real `setSetting` and subscribers. The
  chain gate in `GlobalStateFramelessRefresh.test.ts` pins the GlobalState write and evaluates
  App.tsx's gate across the flip on win32, linux and darwin, with anti-vacuity self-tests.
- `App.tsx` was not touched, so the macOS two-boolean gate and its comment block are unchanged.
- macOS side effect: the `frameless` / `macOverlayTitlebar` classes, and with them the 78px
  traffic-light reserve, now follow the toggle live too. WindowControls still never render on
  darwin.
- Linux uses the same `!isMac` gate, so the same fix applies. It is covered by the jest flip rows
  but not live-checked (no Linux box).

Operator live gate (NOT yet run; this todo stays pending until it passes). Use a GameLib build that
contains the fix commits, on the Windows box:

1. Toggle Use frameless window OFF. Exactly one set of window buttons should remain, the native
   one, with no restart.
2. Toggle it back ON. GameLib's set returns on the tab bar, the native frame goes away, and no
   restart is needed.
3. Optional, on the Mac: toggling still shows only the traffic lights, and the leading gap appears
   only in the frameless (overlay) state.

Record the result here, then move this todo to `.planning/todos/completed/`.
