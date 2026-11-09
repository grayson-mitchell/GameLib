# macOS runtime signals

Three signals GameLib reads from the Mac at runtime: gamepad input to GameLib's own UI (051),
whether a CrossOver bottle's trial has expired before launching (060), and which process is the
launched non-Steam game (068).

## Requirements

- On macOS, controller mode needs a native gamepad source: WebKit's Gamepad API does not expose
  pads Apple's GameController framework does not claim (PowerA 20d6:a720). _(051)_
- Check `CX_BOTTLE=<bottle> wine --demo-status` per bottle before every CrossOver launch; the
  trial clock is per bottle, and an expired bottle hangs the launch with no error. _(060)_
- Never run a CrossOver launch without a timeout. _(060)_
- Identify a non-Steam game process by its install dir in the unix, `Z:` and (home installs)
  `Y:` forms, case-insensitive, with a trailing separator. Basename-only launches cannot be
  matched. _(068)_
- Per-game CrossOver bottle names up to 120 chars, with dots and `_20`/`_21` escapes, are
  accepted. _(068)_

## How to Build It

### Gamepad: native reader bridged into `navigator.getGamepads()` (051)

GameLib's controller input is pure DOM: `src/frontend/helpers/gamepad.ts` polls
`navigator.getGamepads()`, and `src/preload/api/tauriGamepadInput.ts` turns actions into focus
moves (WKWebView has no spatial navigation). The prototype that worked (it was not committed):

1. `src-tauri/src/macos_native_gamepad.rs` — a `gilrs` 0.11 reader thread (IOKit backend) emits a
   `native_gamepad` event on change, shaped like Chromium raw HID:
   - id `"<name> (Vendor: xxxx Product: yyyy)"`
   - `buttons[usage - 1]` padded to at least 17 (`MIN_BUTTONS`): gilrs state only holds buttons
     that have already produced an event; without padding the first boot logged `buttons=3`.
   - `axes[usage - 0x30]` with gilrs's macOS Y reversal undone.
   - hat at `axes[9]` as `dir*2/7 - 1`, neutral `3.28571`.
2. `src/preload/api/tauriNativeGamepad.ts` — merges native pads into `navigator.getGamepads()` at
   slot 8+, dispatches `gamepadconnected` / `gamepaddisconnected`, and skips ids WebKit already
   reports. Installed from `tauriAttach.ts` on macOS only. `gamepad.ts` / `nintendo.ts` unchanged.

Result: `[GAMEPAD] id="PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6
Product: a720)" mapping="" buttons=17 axes=10` — byte-identical to the Windows/WebView2 triple,
and controller mode works.

Measured PowerA map (usage = Windows index + 1): A 3, B 2, X 4, Y 1; L/R/ZL/ZR 5/6/7/8;
minus/plus/Home 9/10/13; D-pad = hat usage 57 (gilrs DPadX/DPadY ±1); left stick 48/49, right
stick 50 (Z)/53 (Rz), all full range. gilrs reports `mapping=driver` (no SDL-db entry) and its
button names are wrong for this pad — apply GameLib's own per-pad map by usage, never gilrs names.

Diagnostics: `[GAMEPAD] id=… mapping=… buttons=… axes=…` goes to
`~/Library/Logs/GameLib/gamelib.log` via `window.api.logInfo` (console.log never reaches it).
Ground truth below the browser: `hidprobe.c` (IOHIDManager input-report callback).

### CrossOver trial expiry (060)

```bash
CX=/Applications/CrossOver.app/Contents/SharedSupport/CrossOver
CX_BOTTLE="$bottle" "$CX/bin/wine" --demo-status
# -> "Standard version" | "Demo version (N days remaining)" | "Demo version (expired N days ago)"
```

~1–4 s (4.2 s cold wineserver, 0.9 s warm), no UI. Without `CX_BOTTLE` it fails (rc 1) — the query
needs a bottle. On `expired`, route to the fallback engine on the same bottle (Wine-Staging,
`USER=crossover`, spike 059) instead of launching through CrossOver. Surface "N days remaining"
to the user before it bites.

Facts for tests:

- Licence file: `~/Library/Preferences/com.codeweavers.CrossOver.license` or
  `/Library/Preferences/…` (`CXUtils.pm license_file_present`).
- Trial clock: registry `Software\CodeWeavers\CrossOver\cxoffice`, values `InstallTime` and
  `Version` (obfuscated dwords) in the bottle's `system.reg`, written on the bottle's first
  unlicensed run. Licensed bottles carry the key without these values.
- `InstallTime` = first-unlicensed-run Unix time XOR a constant: `K = stored ^ install_unix`. For
  N days remaining write `((install_unix - (15-N)*86400 - 3600) ^ K)` (Phase 61 UAT addendum).
  Stop the wineserver before editing or the edit is overwritten.
- Simulate "unlicensed" without touching the licence via `sandbox-exec -f nolicence.sb`:

  ```scheme
  (version 1)
  (allow default)
  (deny file-read* (regex #"/Library/Preferences/com\.codeweavers\.CrossOver\.license"))
  ```

### Non-Steam game process match (068)

What `ps -axo pid=,command=` shows:

| Launch shape                                  | Persistent signal                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| CrossOver `wine "<unix>/Game.exe"`            | exe as `Y:\…` (home install); unix path on the wrapper for only 1–2 s   |
| CrossOver `wine "Z:\…\Game.exe"`              | `Z:\…` on both lines                                                    |
| CrossOver `start /unix <path>`                | `start /unix Y:\…`, then exe as `Y:\…`                                  |
| cwd + bare `Game.exe`                         | basename only — **unmatchable**                                         |
| GPTK, real gogdl launch (live)                | `wine64-preloader <wine64> "<unix dir>/Bloody Hell.exe"`, whole run     |

Match rule (approved for plan 61-16, `matchShape: z-path`): case-insensitive prefix on the install
dir **with trailing separator** in any of three forms — unix path; `Z:` + absolute path with
backslashes; for installs under home, `Y:` + home-relative path with backslashes. The trailing
separator stops `Avernum 4 Remaster` matching `Avernum 4`. Only then may the launch deadline arm.

## What to Avoid

- **Do not rely on WKWebView's Gamepad API for this pad, and do not blame GameLib's code.** A
  Safari positive-control page was equally blind; the gap is WebKit-wide. Absence of a `[GAMEPAD]`
  line without a button press is not a negative either (user-gesture gate). _(051)_
- **Do not throttle all gamepad axes with one timer** — it hid the second stick. Throttle per
  axis. _(051)_
- **Do not hide the CrossOver licence with a fake HOME.** winewrapper resolves home via
  `getpwuid`; a fake HOME still reports `Standard version`. `~/Library/Application
  Support/CrossOver/tie` is CrossTie installer data, not the licence. _(060)_
- **Do not shift `InstallTime` arithmetically** (`backdate.py sub:`) — it is XOR-obfuscated, so the
  shift is non-monotonic. Use the XOR formula. _(060)_
- **Do not check expiry once per CrossOver install** — it is per bottle. _(060)_
- **Do not arm a launch deadline without a proven process match** (59-REVIEW CR-01: a deadline
  without a match kills running games), and do not match on the exe basename or on the unix path
  alone under CrossOver (it disappears after 1–2 s). _(068)_

## Constraints

- 051 measured one pad (PowerA 20d6:a720). Open follow-up: at the bottom tile, Down moves focus to
  the left panel instead of scrolling — probably `tauriGamepadInput.ts`, not the pad; keyboard
  Down discriminator not run. Inside Wine this pad corrupts winedevice
  (`.planning/debug/winebus-iohid-powera-wedge.md`); the native reader is the natural host half
  of any later in-game route.
- 060 is **PARTIAL**: the expired-launch hang (90 s cap, rc 142, game never started) is consistent
  with winewrapper's modal "Expired Bottle" nag, but the dialog was not observed. `cxbottle
  --create` under expiry and the near-expiry "will stop working in %d days" nag were not tested.
- 068 is **PARTIAL**: the live launch was GPTK, not CrossOver; CrossOver evidence is synthetic
  (S1–S3; S3's argv is reconstructed, not confirmed gogdl). The operator approved arming the rule
  anyway. The bottle-name cap of 120 is "no rejection seen", not a measured limit;
  `cxbottle --create` took ~12 s per name.

## Origin

- **051 powera-pad-drives-gamelib-macos — VALIDATED via the native route.** Reversal inside the
  spike: the existing Gamepad API path is INVALIDATED; gilrs + renderer shim drives controller
  mode.
- **060 crossover-trial-expiry — PARTIAL.** `--demo-status` detection, per-bottle clock and
  expired-launch hang established; nag dialog inferred, `cxbottle --create` not run.
- **068 nonsteam-first-match-signal — PARTIAL.** z-path match rule and 120-char bottle names
  approved; CrossOver real-launch shape unconfirmed.
- Sources: `sources/051-powera-pad-drives-gamelib-macos/` (README, gilrs probe, hidprobe,
  Safari control page), `sources/060-crossover-trial-expiry/` (run.sh, backdate.py,
  nolicence.sb), `sources/068-nonsteam-first-match-signal/` (run.sh, build.sh, sleeper.c,
  verdict.json).
