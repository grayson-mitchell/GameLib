---
created: 2026-11-13T00:00:00.000Z
title: 'Steam overlay never attaches to OpenGL-rendering bridge titles (Dungeons of Dredmor 98800)'
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

**Re-tested 19:35, a real defect.** The operator got past the launcher into gameplay, and Shift+Tab
shows no overlay. The game only runs windowed, but that is unlikely to matter: the Steam overlay
supports windowed games.

Findings from the live process (pid 67148, `Dungeons of Dredmor.exe`):

- **Injection is complete.** `vmmap` lists `steamloader.dylib`, `gameoverlayrenderer.dylib` and
  `overlay_shim.dylib`.
- **Steam never attached.** `~/Library/Application Support/Steam/logs/console_log.txt` has no
  `GameOverlay: started '…/gameoverlayui' … for game process` line for this launch. The last one
  is at 17:24, from another title.
- **The game renders through OpenGL, not Metal.** `vmmap` shows `OpenGL.framework` with
  `GLEngine.bundle` and `GLRendererFloat.bundle` loaded. The wine log never prints the shim's
  `hook_set_pixel_format: layer=WineMetalLayer`, which `steam-overlay-in-bottles.md` names as the
  Metal-path signal. Per that same doc, `overlay_commit=missing` is normal and is not the cause.
- **Every validated overlay title is Metal-path.** Planet Crafter and Manor Lords both go through
  D3DMetal. A Wine OpenGL title (an SDL/GL game, or D3D9 through wined3d) is an untested
  renderer class.

Hypothesis: on an OpenGL frame, Mac `gameoverlayrenderer` never sees a present it hooks. Wine's
winemac.drv GL path may present in a way it does not intercept. So it never signals Steam, and
Steam never starts `gameoverlayui`. This probably affects every OpenGL-rendering bridge title,
not just Dredmor.

The 10s watch's `not attached` was a true negative.

Next steps:

1. Find out what Mac `gameoverlayrenderer.dylib` hooks for OpenGL presents, for example
   `CGLFlushDrawable` or `-[NSOpenGLContext flushBuffer]`, using `nm` or a dtrace probe. Then check
   which call winemac.drv's GL path actually makes on present.
2. Separate the renderer from the bitness. Find a 64-bit OpenGL bridge title, or force Dredmor's
   GL through a Metal-backed path if CrossOver offers one. That shows whether the cause is OpenGL
   or the 32-bit game.
3. If the hook mismatch is confirmed, decide on a fix: the overlay shim either bridges Wine's GL
   present to the call gameoverlayrenderer hooks, or GL titles are marked overlay-unsupported in
   the UI.

The Steam bridge itself is unaffected: `HELLO`, `GINIT ok=1`, and the game's own stats and
achievement calls all work.
