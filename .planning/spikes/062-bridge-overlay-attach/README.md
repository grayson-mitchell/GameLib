---
spike: 062
name: bridge-overlay-attach
type: standard
validates: "Given Schedule I Free Sample (3205720) launched the way GameLib's bridge launches it (bridge helper + steam_api shim over TCP, CrossOver bin/wine + CX_BOTTLE, DXVK known fix), not by Steam, when Mac Steam's overlay renderer and NotProton's Metal shim are injected into the game process, then Mac Steam attaches gameoverlayui and Shift+Tab draws a working overlay"
verdict: VALIDATED
related: [044, 056, 061]
tags: [steam, macos, overlay, gameoverlayui, gameoverlayrenderer, bridge, crossover, dyld, codesign, entitlements, metal, dxvk, schedule-i, live]
---

# Spike 062: the Steam overlay in a GameLib-bridged game

## What This Validates

061 showed Mac Steam's overlay draws over a Wine Metal game when **Steam** launches it. GameLib's
bridge is different. GameLib launches the game itself, and Mac Steam only ever sees the native
bridge helper (`Game process added : AppID 3205720 … ProcID <helper pid>`). Steam never started
`gameoverlayui` for any bridged launch in the console history. This spike asks whether the overlay
can be brought into that path.

## Research

- **CrossOver strips the insert list twice.** `bin/wine` (Perl) execs `bin/wineloader`, which
  execs `lib/wine/x86_64-unix/wine`. Both Mach-O loaders are hardened (`flags=0x10000(runtime)`,
  team `9C6B7X7Z8E`) and carry `disable-library-validation` but **not**
  `allow-dyld-environment-variables`, so dyld drops `DYLD_INSERT_LIBRARIES` at the first one.
  NotProton re-signs its runner's loader with that entitlement, and so does GameLib's DRM-mode
  clone (`runnerClone.ts`, `DYLD_ENTITLEMENT`). That clone re-signs only
  `lib/wine/x86_64-unix/wine`, and both of those runners also carry a patched ntdll.
- **CrossOver's wrapper drops plain `DYLD_*`/`WINEDLL*` env, but `CX_ENV` gets through** (56-01). It
  takes `NAME='value'` tokens, so paths with spaces work.
- **GameLib's bridge launch** (`fireBridgeWineLaunch`, `helperProcess.ts`): the helper is spawned as
  `steam-bridge-helper --appid <id> --port 0` with `GAMELIB_BRIDGE_SECRET` in env only. The port is
  read off its `LISTEN` line and written, with the secret, into both `gamelib_bridge.cfg` copies.
  The game runs as `CX_BOTTLE=<bridge bottle> bin/wine <exe>`, with `CX_GRAPHICS_BACKEND=dxvk`
  from the known fix.

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Plain `DYLD_INSERT_LIBRARIES` on stock CrossOver | no runner change | dropped by the hardened loaders | ruled out (signatures) |
| In-process `dlopen` from a unix-side lib (vendored lsteamclient `load_overlay_libraries`) | stock runner (it has `disable-library-validation`) | only exists in DRM mode; default bridge has no unix-side code in the game | not tried |
| Clone CrossOver, re-sign **both** loaders with the dyld entitlement, inject via `CX_ENV` | mirrors NotProton; GameLib already clones runners | ad-hoc re-sign = trust widening; must keep the clone outside an `.app` bundle | **chosen** |

## How to Run

```sh
# one-time: clone only the inner CrossOver folder, outside any .app bundle
cp -c -R /Applications/CrossOver.app/Contents/SharedSupport/CrossOver <scratch>/cx062/CrossOver
xattr -cr <scratch>/cx062/CrossOver
# re-sign lib/wine/x86_64-unix/wine AND bin/wineloader: stock entitlements + allow-dyld
codesign -f -s - --options runtime --entitlements <stock+dyld>.plist <loader>

./run.sh <label> [overlayui=1|0] [shim=1|0]   # Steam running, game not running
```

`run.sh` spawns the helper as GameLib does, points both cfg copies at it (restored on exit), and
injects `overlay-shim.dylib:steamloader.dylib:gameoverlayrenderer.dylib` plus
`SteamOverlayGameId/SteamGameId/SteamAppId` through `CX_ENV`. It finds the game's pid by its
window and, with `overlayui=1`, starts `gameoverlayui` for it. It also runs 061's `watch.sh`.

## Investigation Trail

- **Run 1: Gatekeeper killed it.** The first clone was the whole `CrossOver.app`. Re-signing the
  loader inside it broke the bundle seal. `syspolicyd` showed a prompt, then logged
  `GatekeeperPolicyScanError -67018 "Code did not match any currently allowed policy"`, and the
  wrapper died with `Killed: 9` after about 3.5 minutes. Fix: clone only
  `Contents/SharedSupport/CrossOver`, which is GameLib's DRM-clone layout, and run `xattr -cr`.
  There was also a harness bug: the window lookup's "no window matched" text was taken as a pid.
  It now accepts digits only. I also edited `run.sh` mid-run, which corrupted that run's tail
  (`rue: command not found`); the cfg restore still ran.
- **Run 2 (accidental control).** The game ran on the clone with a working bridge
  (`HELLO shim attached`, `GINIT … ok=1`), and the `gameoverlayui` I started came up, but
  **nothing was injected**: no `overlay_shim` lines and none of the dylibs in `vmmap`. Operator:
  Shift+Tab "did nothing". Cause: `bin/wineloader` is a second hardened binary without the dyld
  entitlement, so it stripped `DYLD_INSERT_LIBRARIES` before the re-signed `lib/wine` loader
  ran. Re-signing `bin/wineloader` too (after the game exited) fixed it.
- **Run 3 (my gameoverlayui + Steam's).** All three dylibs were mapped in
  `Schedule I Free Sample.exe` (pid 50261). The shim hooked `WineMetalLayer`, the device, queue,
  encoder and colour space as in 061, and the bridge attached. I started `gameoverlayui` at
  20:19:41Z. **Steam then started its own one second later**
  (`GameOverlay: started … (pid 50332) for game process 50261`). Operator: "it drew fine, clicks
  worked".
- **Run 4 (`overlayui=0`, isolates Steam's attach).** The harness started nothing. Steam started
  `gameoverlayui -pid 8764 -steampid 40643 -manuallyclearframes 0 -gameid 3205720` by itself 6 s
  after launch. Operator: "it drew fine again, clicks worked".
- **Run 5 (`overlayui=0 shim=0`, Steam's dylibs alone).** Only `steamloader.dylib` and
  `gameoverlayrenderer.dylib` were mapped in the game (no `overlay_shim` lines). Steam again
  attached `gameoverlayui -pid 14425` by itself. Operator: "it drew fine, clicks worked". The
  DXVK `Failed to compile pipeline` errors (2–3 per run) appear in every run, including run 2 with
  nothing injected, so they are unrelated.
- **Screenshots are not evidence here.** Every in-game frame in run 3 came out byte-identical
  (2,420,498 bytes), including while the overlay was open, so `screencapture -l` returned a stale
  copy of the Metal surface. The verdict rests on the operator's report plus the process and
  console evidence. The frames were deleted.

## Results

**VALIDATED.** GameLib's bridge path can show Mac Steam's own overlay, fully working (draws and
takes clicks), with no Steam-side patching.

| Run | Injected | We started gameoverlayui | Steam started gameoverlayui | Operator |
|---|---|---|---|---|
| 2 | no (stripped by `bin/wineloader`) | yes | no | nothing happened |
| 3 | yes | yes | **yes** | drew, clicks worked |
| 4 | yes | no | **yes** | drew, clicks worked |
| 5 | yes, **without NotProton's shim** | no | **yes** | drew, clicks worked |

**What it settles:**

1. **The renderer in the game process is the whole trigger.** Once
   `gameoverlayrenderer.dylib` (with `SteamOverlayGameId` set) is in the game, Mac Steam attaches
   `gameoverlayui` to that pid itself, even though Steam did not launch it and only knows the
   helper as the game. GameLib does **not** need to start `gameoverlayui`. Doing so produces two.
2. **The only obstacle is code signing.** Both CrossOver loaders (`bin/wineloader` and
   `lib/wine/x86_64-unix/wine`) need `allow-dyld-environment-variables` and every stock
   entitlement kept, and the re-signed clone must live outside an `.app` bundle, or Gatekeeper
   kills it. No patched ntdll is needed. This is the same trust widening GameLib's DRM-mode clone
   already accepts, applied to one more binary.
3. **The default bridge is unaffected.** The helper, the TCP shim and the cfg handshake worked
   unchanged on the clone (`HELLO` + `GINIT ok=1` in runs 2–5).
4. **NotProton's shim is not needed on the DXVK path.** Steam's own `steamloader.dylib` +
   `gameoverlayrenderer.dylib` drew a working overlay alone (run 5). The build injects only
   Valve's files from the user's own Steam install and takes no dependency on NotProton's binary or
   code, so its licence does not matter here.

**Open questions for the build (not tested here):**

- **Other render paths:** only DXVK → MoltenVK was tried (Grim Dawn in 061, Schedule I here), and
  only run 5 went without the shim. D3DMetal, DXMT and WineD3D-GL titles are untested. NotProton
  ships the shim for some reason (its strings name `WineMetalLayer` pixel-format and colour-space
  fixes, Metal 4 queues and GL `CGLFlushDrawable`), so expect it may matter on another path, HDR
  or 10-bit formats, or Metal 4.
- **Fullscreen:** run windowed or at the menu only. The 58-33 fullscreen raise path is untested
  with the overlay on top.
- **Interplay with GameLib's own picker (58-29..36):** the overlay's invite dialog and GameLib's
  picker could now both respond to `ActivateGameOverlayInviteDialog`.

## Artifacts

- `run.sh`: the harness (helper spawn, cfg swap and restore, `CX_ENV` injection, optional
  `gameoverlayui`).
- `winshot.swift`: window pid lookup (`winshot <owner> -`) and capture.
- `logs/run{1..5}/`: `run.log` (with the operator's verdict line), `helper.log`, `wine.log` (shim
  trace), `overlayui.log`, `console_log.tail.txt`, `watch.log`.
- The clone and its entitlement plists live in the session scratchpad (`cx062/`) and are not
  committed. Recreate them from How to Run.
