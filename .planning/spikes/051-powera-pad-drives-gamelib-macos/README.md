---
spike: 051
name: powera-pad-drives-gamelib-macos
type: standard
validates: "Given GameLib (tauri dev, WKWebView) on macOS with the PowerA Advantage Wired Controller for Nintendo Switch 2 (20d6:a720) plugged in, when the window is focused and the pad's buttons/sticks are used, then WKWebView's Gamepad API exposes the pad ([GAMEPAD] connect line in gamelib.log) and GameLib's controller navigation responds to it"
verdict: PARTIAL
related: []
tags: [gamepad, macos, wkwebview, powera, controller-mode]
---

# Spike 051: PowerA pad drives GameLib on macOS

## What This Validates

Given GameLib on macOS (WKWebView) with the PowerA Switch 2 wired pad connected, when the user
focuses the window and presses buttons / moves sticks, then `navigator.getGamepads()` exposes the
pad and GameLib's controller navigation (focus moves, activate, back) works.

First step of a larger question — can this pad drive games on the Mac at all — taken in the
smallest scope: GameLib itself. Context: debug session
`.planning/debug/winebus-iohid-powera-wedge.md` (inside wine the pad corrupts winedevice; a native
IOHID probe reads it cleanly). The pad's button indices were measured on **Windows 11 /
WebView2** (quick 260925-ms5: `mapping="" buttons=17 axes=10`, L/R/ZL/ZR 4/5/6/7, L3/R3 10/11,
Home 12, Capture 13). Nothing has been measured under WKWebView.

## Research

- GameLib's controller input is pure DOM: `src/frontend/helpers/gamepad.ts` polls
  `navigator.getGamepads()`; `src/preload/api/tauriGamepadInput.ts` turns actions into focus
  moves/synthetic events (WKWebView has no spatial navigation). No native gamepad code in
  `src-tauri`.
- `addgamepad()` writes a permanent `[GAMEPAD] id=… mapping=… buttons=… axes=…` line to
  `~/Library/Logs/GameLib/gamelib.log` via `window.api.logInfo` (console.log never reaches the log).
- Gamepad API gating: browsers expose a pad only after a user gesture (button press) while the page
  is focused, so a missing `[GAMEPAD]` line with no press is not a negative.
- Native ground truth (this session, scratchpad `hidprobe`): IOHID reads the pad at ~125 Hz, 8-byte
  reports, idle `00 00 0f 80 80 80 80 00`.

## How to Run

- GameLib path: `pnpm tauri:dev`, watch `~/Library/Logs/GameLib/gamelib.log` for `[GAMEPAD`, focus
  the window, press A.
- WebKit control: `open -a Safari gamepad-test.html`, click the page, press buttons.
- Raw HID: `clang -arch arm64 -o hidprobe hidprobe/hidprobe.c -framework IOKit -framework
  CoreFoundation && ./hidprobe 45` (logs only changed reports; press buttons during the run).
- gilrs: `cd gilrs-probe && cargo build --release && ./target/release/gilrs-probe 20`.

## What to Expect

- A `[GAMEPAD] id=… mapping=… buttons=… axes=…` line. Compare with the WebView2 triple.
- Library focus ring moves with stick/D-pad; A activates; B goes back.

## Investigation Trail

- 2026-10-30: gamelib.log from the running dev session (started 20:15 log time, pad plugged in the
  whole time, no button presses into GameLib) has no `[GAMEPAD` line. Not a negative (gesture gate).
- Live 1 — GameLib: user focused the window and pressed A. No `[GAMEPAD` line (log tailed live), no
  UI response.
- Live 2 — Safari positive-control page (`gamepad-test.html`, same WebKit engine): user clicked the
  page and pressed buttons. Pad not shown. So the gap is WebKit-wide, not GameLib's code or Tauri
  config. (`getGamepads` exists; no `gamepadconnected` fired.)
- Live 3 — is the pad even sending input on macOS? `hidprobe/hidprobe.c` (IOHIDManager,
  input-report callback, logs only changed reports). A 20 s run showed 1 change, but the user had
  not seen the prompt (operator-timing error, not evidence). Rerun 45 s with the user pressing
  (`hidprobe/run-45s-buttons.log`): 564 distinct changes out of 5612 reports. Byte 0 button bits
  toggle (02, 08, …), byte 2 hat takes 00/02/04/06 (D-pad) and 0f neutral, bytes 3-4 left stick swing
  00–ff, byte 5 moves too. Report layout matches the HID descriptor (16 buttons, hat, button 17,
  X/Y/Z/Rz 8-bit, const byte).
- Conclusion so far: the pad delivers full input natively, but WebKit on macOS does not expose it to
  the Gamepad API (likely: WebKit only surfaces pads Apple's GameController framework claims, and it
  does not claim 20d6:a720). GameLib's Console Mode is pure `navigator.getGamepads()`, so on macOS
  this pad cannot drive GameLib through the existing path. Needs a native reader in the Tauri shell
  feeding the frontend.
- Live 4 — native reader via `gilrs` 0.11 (`gilrs-probe/`, IOKit backend, plain `cargo` binary).
  gilrs enumerates the pad: `name="PowerA Advantage Wired Controller for Nintendo Switch 2" vid=20d6
  pid=a720 uuid=03000000d620000020a7000012010000 mapping=driver` (no SDL-db entry; generic HID
  usage names, some wrong). Three user-driven runs (`run-40s.log`, `run-20s-shoulders-sticks.log`,
  `run-20s-right-stick.log`) captured every control:
  - Face (pressed in order A, B, X, Y): A = usage 3, B = 2, X = 4, Y = 1 (gilrs names Unknown/East/
    West/South). A = index 2 matches the Windows measurement.
  - L/R/ZL/ZR = usages 5/6/7/8 (indices 4–7, matches Windows). gilrs names North/Unknown/
    LeftTrigger/RightTrigger.
  - minus/plus/Home = usages 9/10/13 (indices 8/9/12, matches Windows); gilrs names
    LeftTrigger2/RightTrigger2/Mode.
  - D-pad = hat (usage 57) delivered as DPadX/DPadY ±1.
  - Left stick X/Y = usages 48/49, right stick X/Y = usages 50 (Z)/53 (Rz); all full range ±~1.0.
  - First stick run showed only the left stick: the probe throttled ALL axes with one 100 ms timer,
    which hid the second stick. Fixed to per-axis throttling, then both sticks recorded.


## Results

**PARTIAL.** The question "can the pad drive GameLib on macOS" splits in two:

- **Via the existing path (WKWebView Gamepad API): INVALIDATED.** Neither GameLib nor Safari
  exposes the pad; WebKit on macOS does not surface 20d6:a720 to `navigator.getGamepads()`, even
  though the pad delivers full input (raw IOHID, 564 distinct reports in 45 s).
- **Via a native reader: VALIDATED as a reader.** `gilrs` 0.11 in a plain Rust binary sees the pad by
  name/VID/PID/SDL GUID and delivers every control (17 buttons, hat, 4 full-range axes). Its default
  button names are wrong for this pad (no SDL mapping), so GameLib must apply its own per-pad map —
  the Windows-measured indices hold exactly (usage = index + 1).
- **Not yet shown:** GameLib's UI actually responding. That needs the Tauri shell to run gilrs and
  push state/events to the frontend in place of (or merged with) `navigator.getGamepads()` on macOS.

Signal for the build: on macOS, GameLib's controller mode needs a native gamepad source (gilrs in
`src-tauri`) bridged to `frontend/helpers/gamepad.ts`; the browser API alone is not enough for pads
Apple's GameController does not claim. The same native reader is the natural host half of the later
in-game route (host pad -> wine), since inside wine this pad corrupts winedevice
(`.planning/debug/winebus-iohid-powera-wedge.md`).

Surprises: (1) WebKit-wide blindness, confirmed with a Safari positive-control page; (2) gilrs
reports `mapping=driver` and mislabels most buttons; (3) a global axis throttle in the probe hid the
second stick — throttle per axis.
