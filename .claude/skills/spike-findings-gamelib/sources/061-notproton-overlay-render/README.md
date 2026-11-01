---
spike: 061
name: notproton-overlay-render
type: standard
validates: "Given Grim Dawn (219990, DXVK → MoltenVK → Metal) staged into native Mac Steam on NotProton 1.2.1's compat tool, when Steam launches it and the operator presses Shift+Tab at the menu, then Mac Steam's own overlay draws over the Wine game and takes input"
verdict: VALIDATED
related: [043, 044, 062]
tags: [steam, macos, overlay, gameoverlayui, gameoverlayrenderer, notproton, metal, dxvk, moltenvk, crossover, grim-dawn, live]
---

# Spike 061: Mac Steam's overlay over a Wine game (NotProton)

## What This Validates

Given Grim Dawn (219990) staged into native Mac Steam as a Windows install on NotProton's
`notproton-26.3` compat tool, when Steam launches it and the operator presses Shift+Tab at the
menu, then Mac Steam's overlay draws over the game and takes clicks.

This is the cheap half of the question "can a bottled game show the Steam overlay, the way
Proton games do on Linux Steam?" If Mac Steam's overlay cannot draw over Wine + Metal at all,
GameLib's bridge (062) has nothing to reach for.

## Research

- **How Linux does it.** Linux Steam `LD_PRELOAD`s `gameoverlayrenderer.so` into the Proton game.
  It hooks the Vulkan present that DXVK/vkd3d use, and Steam's separate `gameoverlayui` process
  supplies the overlay's content. The Windows game never sees it.
- **Mac Steam ships the same pieces.** `gameoverlayrenderer.dylib`, `steamloader.dylib` and
  `gameoverlayui` live in `Steam.AppBundle/Steam/Contents/MacOS`. For a compat-tool launch Steam
  puts both dylibs in `STEAM_DYLD_INSERT_LIBRARIES` and sets `SteamOverlayGameId`.
- **NotProton does real work here.** Its `overlay-shim.dylib` (universal, 1.2.1) names the overlay
  renderer's Metal entry points (`steammetalhook_init`, `steamoverlay_nextDrawable`,
  `steamoverlay_commit`) and hooks the Metal device, command queue, command buffer, encoder and
  drawable, plus `CAMetalLayer` pixel format and colour space. NotProton's `run` script prepends
  it to `DYLD_INSERT_LIBRARIES` on a loader it re-signed with
  `com.apple.security.cs.allow-dyld-environment-variables`. Stock CrossOver's loader lacks that
  entitlement, so dyld would drop the insert list (062).
- **Prior evidence (044).** The shim loaded and hooked Metal, and Steam started `gameoverlayui`,
  but nobody pressed Shift+Tab. `overlay_commit=missing` looked like a possible failure.

## How to Run

1. NotProton installed, and its setup run **from Finder or the Dock** (see the trail below).
2. Quit Steam and run `./stage.sh`, which clones Grim Dawn from GameLib's bridge bottle and writes
   a Windows ACF. The 044 `CompatToolMapping` is still in `config.vdf`.
3. Start Steam and run `./watch.sh <label> "grim dawn"` in the background, which photographs the
   game window every 3 s.
4. Launch Grim Dawn in compatibility mode (`compat/grim dawn.exe`) and press Shift+Tab at the menu.
5. Run `./collect.sh <label>`.

Undo: quit Steam, then `./stage.sh --undo`.

## Investigation Trail

- **The setup was partly undone.** `/Applications/Steam.app` was back to Valve's signature
  (team `MXGJJ98X76`) without NotProton's `DYLD_INSERT_LIBRARIES` plist entry, and both 044
  games had been unstaged. The compat tool and the `CompatToolMapping` survived.
- **NotProton setup failed: "could not write files".** `app.log` read
  `run failed: cannot write /Applications/Steam.app/Contents/MacOS`, but NotProton was "on" under
  App Management. `tccd` logged the request as `kTCCServiceSystemPolicyAppBundles` from
  **`com.apple.Terminal`**, returning denied. NotProton had been started from a zsh shell in
  Terminal, so TCC treated Terminal as the responsible process. Relaunching it from Finder fixed
  it. **Gotcha: launch App-Management-dependent apps from Finder or the Dock, never from a shell.**
- **Run 1.** Steam launched the game. Steam started
  `gameoverlayui -pid 41590 -steampid 40643 -manuallyclearframes 0 -gameid 219990` for the game
  process 3 s after launch. In `grim dawn.exe` the shim logged what 044 never reached:
  `hook_set_pixel_format: layer=WineMetalLayer format=80 (BGRA8Unorm) overlay_pipeline=present`
  and `record_overlay_pipeline` in four formats (BGRA8, BGRA8 sRGB, BGR10A2, RGBA16F).
  `overlay_commit=missing` was still logged, so it does not mean failure.
- **The screenshots were unusable.** `winshot` took the first matching window, which was a
  3440×30 strip the game also owns, not the 3440×1440 game window. Fixed by picking the largest
  window and recompiling. The operator's report stands in for pixels on this run.

## Results

**VALIDATED** (operator, run 1): "it drew fine, behaved as normally does". Mac Steam's overlay drew
over Grim Dawn running on Wine + DXVK + MoltenVK + Metal and took input.

| Signal | Evidence |
|---|---|
| Steam attaches its overlay UI | `GameOverlay: started … gameoverlayui (pid 41644) for game process 41590` |
| Renderer + shim in the game | `overlay_shim_load: pid=41590 exe=grim dawn.exe … overlay=present` |
| Renderer prepared to draw into Wine's layer | `hook_set_pixel_format: layer=WineMetalLayer …`, 4× `record_overlay_pipeline` |
| Draws and takes input | operator report |

**What it settles:** the overlay *can* draw over a Wine Metal game on macOS. Neither Wine nor
MoltenVK blocks it. The pieces needed are Steam's two dylibs in the game process, NotProton's
Metal shim, and a `gameoverlayui` attached to the game's pid.

**What it does not settle:** whether that needs Steam to have launched the game. That is 062.

**Licensing note for the build:** `overlay-shim.dylib` is NotProton's binary. Shipping it, or
porting it, needs NotProton's licence checked first.

## Artifacts

- `stage.sh`: Grim Dawn-only restage (backup in `~/.gamelib-spike061-backup`).
- `winshot.swift`: window photographer (largest matching window; `screencapture -l`).
- `watch.sh`, `collect.sh`: capture loop and log collection.
- `logs/run1/`: NotProton run and wine logs, Steam console and compat tails, `watch.log`.

## Machine state left behind

- NotProton's Steam.app patch is re-applied (re-done by the operator this session).
- Grim Dawn is staged in Mac Steam. Quit Steam and run `./stage.sh --undo` to remove it.
