---
created: 2026-11-13T00:00:00.000Z
title: 'Steam overlay does not attach to Dungeons of Dredmor (98800) on a bridge-verified launch'
area: steam
severity: medium
platform: macos
ready: live-gate
source: 'quick 261113-qu7 live gate (2026-11-13 19:31): first bridge-verified Dredmor launch logged `overlay attach: not attached within 10s`'
files:
  - native/steam-bridge/overlay-shim/overlay_shim.m:644-656
  - src/backend/storeManagers/steam/bridge/overlay/overlayAttachWatch.ts:170
---

Dungeons of Dredmor (98800, 32-bit PE32 i386, CrossOver 26.3.0.39832, overlay=on by default) now
launches bridge-verified after 261113-qu7 (shim HELLO, `GINIT SteamAPI_Init ok=1`, game-originated
calls). The Steam overlay never attached, though.

Evidence from `~/Library/Logs/GameLib/gamelib.log`, lines 114-219 of the 19:30:58 launch:

- The overlay runner was used and the input fix was applied (`X-RELEASE+BLOCK applied=true`).
  Wine log: `~/Library/Application Support/GameLib/steam-bridge/overlay/trace/98800-1794551458999.overlay.wine.log`.
- `overlay_shim_load` reports `overlay=present` in every process, including
  `pid=58178 exe=Dungeons of Dredmor.exe layer_hooks=3`.
- Device, queue and command-buffer hooks install (`hooks=4`, `hooks=2`, `hooks=1`). Every
  `ensure_command_buffer_hooks` line, including the game process's, reports
  `overlay_commit=missing`: the command-buffer class never gained Steam's `steamoverlay_commit`
  method.
- `overlay attach: not attached within 10s`.

No earlier log in `~/Library/Logs/GameLib/` has an `overlay attach:` line to compare against.

**This may not be a defect.** The operator reports the session only reached Dredmor's own launcher
window, not gameplay. The 10s attach watch therefore ran entirely during the launcher. The overlay
renders through the game's draw path, so it may only attach once the game window renders.

Next steps:

0. Re-test first: launch, click through the launcher into the game, then press Shift+Tab.
   - If the overlay appears, close this todo as not-a-bug. Optionally file a minor follow-up: the
     10s watch reports a false negative for titles with a pre-game launcher window.
   - If it does not appear, continue with the steps below.
1. Read the overlay wine log for gameoverlayui / `GameOverlayRenderer` load attempts in the game
   process.
2. Check whether `overlay_commit=missing` is also normal on titles whose overlay does attach.
   The spike-findings overlay section covers Steam self-attaching gameoverlayui.
3. Decide whether this is specific to 32-bit games (Steam may not self-attach an x86 renderer
   through the CX_ENV path) or to Dredmor's renderer (an old SDL/OpenGL title, not Metal-native
   D3D through DXMT/DXVK).
4. Compare with a known-good overlay title on the same CrossOver build.

Pressing Shift+Tab in-game during the live gate would confirm the user-visible symptom.
