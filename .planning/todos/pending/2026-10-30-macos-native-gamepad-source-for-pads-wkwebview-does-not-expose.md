---
created: 2026-10-30
title: "macOS: ship a native gamepad source for pads WKWebView does not expose (PowerA Switch 2 pad cannot drive GameLib)"
area: gamepad
severity: major
platform: macos
ready: live-gate
source: "spike 051 (.planning/spikes/051-powera-pad-drives-gamelib-macos/README.md), prototype on branch spike/051-native-gamepad (a030fda87)"
files:
  - src-tauri/src/macos_native_gamepad.rs
  - src/preload/api/tauriNativeGamepad.ts
  - src/preload/tauriAttach.ts
  - src-tauri/src/main.rs
  - src-tauri/Cargo.toml
---

## Problem

On macOS, GameLib's controller mode cannot see the PowerA Advantage Wired Controller for Nintendo
Switch 2 (USB, 20d6:a720). Controller mode reads pads only through `navigator.getGamepads()`
(`src/frontend/helpers/gamepad.ts`), and WebKit on macOS does not expose HID pads that Apple's
GameController framework does not claim. Spike 051 measured this: no `[GAMEPAD]` line in GameLib and
nothing on a Safari control page, while raw IOHID read the pad's full input (564 distinct reports in
45 s). Any other pad GameController does not claim is likely in the same position.

## Prototype (validated live)

Branch `spike/051-native-gamepad`, commit `a030fda87`:

- `src-tauri/src/macos_native_gamepad.rs`: a `gilrs` 0.11 reader thread, started from `.setup()` on
  macOS, emits a `native_gamepad` event on state change. Each pad is shaped like Chromium's raw-HID
  report: id `"<name> (Vendor: xxxx Product: yyyy)"`, `mapping: ""`, `buttons[usage - 1]` padded to
  17, `axes[usage - 0x30]` with gilrs's macOS Y reversal undone, hat at `axes[9]` as `dir * 2/7 - 1`
  (neutral 3.28571). Unit test pins the hat encoding to the measured values.
- `src/preload/api/tauriNativeGamepad.ts`: merges native pads into `navigator.getGamepads()` at
  slot 8+, dispatches `gamepadconnected`/`gamepaddisconnected`, skips ids WebKit already reports.
  Installed from `tauriAttach.ts` when `isMacWebview()`.

Live 2026-10-30: `[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6
Product: a720)" mapping="" buttons=17 axes=10` — identical to the Windows/WebView2 reading in quick
260925-ms5 — and the operator confirmed focus moves and A/B act in the library. `gamepad.ts` and
`nintendo.ts` were not changed.

## To ship (quick task)

- Tests: Rust payload shape (button/axis indexing, Y negation, hat), and a renderer test for the
  merge (slot placement, de-dup against a browser-reported id, connect/disconnect dispatch).
- gilrs init failure and hot-plug: confirm the thread exits quietly and that unplug/replug emits
  disconnect/connect.
- Keep it macOS-only: Windows/Linux already see these pads through the browser API.
- Event rate: emits on every state change at a 4 ms poll; check it costs nothing noticeable while a
  stick is held.

## Gate

Live on this Mac with the pad: restart `tauri:dev`, `[NATIVE-GAMEPAD] connected` + `[GAMEPAD] …
buttons=17 axes=10` in `gamelib.log`, focus moves with D-pad and left stick, A activates, B goes back;
unplug and replug the pad and it still works.
