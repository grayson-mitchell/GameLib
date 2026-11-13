---
status: resolved
trigger: "Steam overlay never attaches to OpenGL-rendering bridge titles (Dungeons of Dredmor 98800) — from todo .planning/todos/pending/2026-11-13-dredmor-steam-overlay-not-attached.md"
created: 2026-11-13
updated: 2026-11-13
---

# Debug: Steam overlay never attaches to OpenGL bridge titles (Dungeons of Dredmor 98800)

## Symptoms

DATA_START
- **Expected:** With overlay=on, a bridge launch on the CrossOver overlay runner gets the Steam overlay. Mac Steam self-attaches `gameoverlayui` to the game pid, and Shift+Tab opens it in-game. This is the behaviour validated on Metal-path titles: Planet Crafter 1284190 (D3DMetal D3D11) and Manor Lords 1363080 (D3DMetal D3D12, via the overlay shim). See `.claude/skills/spike-findings-gamelib/references/steam-overlay-in-bottles.md`.
- **Actual:** Dungeons of Dredmor (98800) is a 32-bit PE32 i386 title that renders through OpenGL, windowed only. The 2026-11-13 19:35 re-test went past the game's launcher into gameplay, and Shift+Tab showed no overlay. GameLib logs `overlay attach: not attached within 10s`.
- **Evidence already gathered (live pid 67148, `Dungeons of Dredmor.exe`):**
  - Injection is complete. `vmmap` lists `steamloader.dylib` (3), `gameoverlayrenderer.dylib` (5, plus .aot under Rosetta) and `overlay_shim.dylib`.
  - The GL stack is loaded: `vmmap` shows `OpenGL.framework`, `GLEngine.bundle`, `GLRendererFloat.bundle` and `libGL.dylib`. AGX Metal bundles are loaded too.
  - Steam never attached: `~/Library/Application Support/Steam/logs/console_log.txt` has no `GameOverlay: started '…/gameoverlayui' … for game process` line for this launch. The last one is at 17:24, from another title.
  - The overlay wine log (`~/Library/Application Support/GameLib/steam-bridge/overlay/trace/98800-1794551716470.overlay.wine.log`, 35 lines) never prints the shim's `hook_set_pixel_format: layer=WineMetalLayer`. It does show device/queue/command-buffer hooks with `overlay_commit=missing`, which the spike doc calls normal with the shim present.
  - The bridge itself is fine: `HELLO shim attached appid=98800`, `GINIT SteamAPI_Init ok=1`, and the game's own UserStats/RemoteStorage calls work.
- **Errors:** none. The overlay is silently absent.
- **Timeline:** First bridge-verified Dredmor launch was 2026-11-13 19:31, after quick 261113-qu7. No OpenGL-path bridge title has ever been tested with the overlay; every validated title is Metal-path.
- **Reproduction:** `pnpm tauri:dev`, launch Dungeons of Dredmor (98800, bridge route, overlay on by default), go past the launcher into the game, press Shift+Tab. Then check `console_log.txt` for a GameOverlay started line and `~/Library/Logs/GameLib/gamelib.log` for the `overlay attach:` line.
- **Working hypothesis (unproven):** Mac `gameoverlayrenderer.dylib` hooks a present path, such as `CGLFlushDrawable`, `-[NSOpenGLContext flushBuffer]` or a CAMetalLayer/Metal present, that Wine's winemac.drv OpenGL path does not call. The renderer then never sees a frame, so it never tells Steam, and Steam never starts `gameoverlayui`. If this is right, every OpenGL-rendering bridge title is affected. It is still open whether the cause is OpenGL or 32-bit/Rosetta.
- **Key code:** `native/steam-bridge/overlay-shim/overlay_shim.m` (vendored NotProton-derived Metal shim). `src/backend/storeManagers/steam/bridge/overlay/` (attach watch, launch wiring). `src/backend/storeManagers/steam/gameLaunchOverlay.ts`.
DATA_END

## Current Focus

hypothesis: gameoverlayrenderer's present hook is never hit on Wine's OpenGL path, so Steam is never signalled
test: (1) nm/otool gameoverlayrenderer.dylib for GL/CGL/NSOpenGL/Metal hook targets; (2) find which present call winemac.drv's GL path makes (CrossOver runner's winemac.so, CGL vs NSOpenGLContext vs CAMetalLayer); (3) separate OpenGL from 32-bit (a 64-bit GL title, or a different Dredmor renderer if CrossOver offers one)
expecting: a concrete mismatch between what the renderer hooks and what Wine calls, or the 32-bit/Rosetta path ruled in or out
next_action: live launch of Dredmor with STEAM_OVERLAY_LOGGING=1 (and STEAM_OVERLAY_LOGGING_FLUSH=1) in the game env, then read /tmp/gameoverlayrenderer.<pid>.log

## Evidence

- 2026-11-13 static: gameoverlayrenderer.dylib (x86_64+arm64) has a full OpenGL path (COverlayGLRenderer, COpenGLFrameCapture, "OpenGL version ... overlay will use"). Its __interpose table (15 entries) covers CGLFlushDrawable, glSwapAPPLE, CGLChoosePixelFormat, cursor/CF runloop calls. It does NOT hook NSOpenGLContext flushBuffer by name.
- winemac.so (CrossOver 26.3.0.39832) presents GL via -[NSOpenGLContext flushBuffer] (no CGLFlushDrawable import).
- Overlay shim: overlay_shim.m has adopt_overlay_gl_present (flushBuffer -> overlay CGLFlushDrawable) but it is only reached from np_overlay_shim_install, called only by lsteamclient/unixlib.cpp (FEX path). It never logs in any trace (Manor Lords too), so it is dead code on this path. Metal titles do not need it.
- Experiment (scratchpad gl/): a test app calling [NSOpenGLContext flushBuffer] with an interposer dylib on CGLFlushDrawable via DYLD_INSERT_LIBRARIES: the interposed function IS hit (arm64). So dyld interposition already catches flushBuffer; the "flushBuffer bypasses the hook" theory is not the cause, at least for native arm64.
- Renderer log is /tmp/gameoverlayrenderer.%d.log, only written when STEAM_OVERLAY_LOGGING is set; none exists for any launch, so we have never seen the renderer's own view of the Dredmor launch. Steam's gameprocess_log shows Dredmor tracked normally; no GameOverlay started line.
- Unresolved: whether the Valve CGLFlushDrawable replacement runs under Wine/Rosetta (x86_64 slice, 32-bit game via wow64) and what it logs/decides.

## Eliminated

- hypothesis: Dredmor is an OpenGL title whose present call (CGLFlushDrawable/flushBuffer) Valve's renderer never sees.
  evidence: it does not use OpenGL; no GL context is ever made current in the game pid (probe run 2), exe has no opengl32/ddraw/d3d import. Class is non-GPU 2D (GDI/windib) SDL 1.2.

- hypothesis: The 10s watch fired during Dredmor's launcher window, before the game rendered.
  evidence: The 19:35 re-test went into gameplay. No overlay appeared and Steam logged no attach.
- hypothesis: Windowed mode stops the overlay.
  evidence: The Steam overlay supports windowed games. More to the point, Steam never started gameoverlayui at all, so the failure is upstream of anything that depends on presentation mode.

## Resolution

root_cause: Dredmor is a 2D software-rendered SDL 1.2 (windib/GDI) title; its frames go through Wine's GDI/window-surface path, so Valve's Mac renderer (hooks CGLFlushDrawable/glSwapAPPLE/Metal present) has no present to hook and Steam never starts gameoverlayui. Not an OpenGL gap; the class is non-GPU 2D bridge titles.
fix: none — closed as unsupported (user decision 2026-11-13). The Steam overlay cannot attach to non-GPU 2D (GDI/DirectDraw) bridge titles: Valve's Mac renderer only hooks GPU presents. Recorded in spike-findings steam-overlay-in-bottles.md. Untried option (b): force SDL_VIDEODRIVER=directx so DirectDraw presents via wined3d GL -> winemac flushBuffer, which the CGLFlushDrawable interpose would catch.
verification: n/a — probe run 2 (pid 83280) showed zero NSOpenGLContext activity in the game for about 3 min; the exe imports SDL.dll with no GPU API.
files_changed: none (the probe dylibs were temporary and are restored byte-identical). The secondary CX_ENV-dropped defect is filed as todo 2026-11-13-bridge-overlay-launch-drops-user-cx-env.md

## Probe (temporary, uncommitted)

2026-11-13 19:45 logged launch (CX_ENV=STEAM_OVERLAY_LOGGING=1 ...) produced no /tmp/gameoverlayrenderer log; env reach unconfirmed. Built a passive universal probe (scratchpad glprobe/glprobe.m) and temporarily swapped it over the gitignored overlay_input_probe.dylib in build/, public/ and the debug bundle (originals: scratchpad glprobe/orig-{build,public,bundle}.dylib). Armed via GAMELIB_OVERLAY_INPUT_PROBE=1 on the sidecar env; logs to trace/input-probe-98800-*.log: env at load, injected images, flushBuffer hits, BOverlayNeedsPresent, which image dlsym(CGLFlushDrawable) resolves to. RESTORE ORIGINALS AFTER THE RUN.

## Evidence (probe run 1, 19:56, pid 80509)
- flushBuffer swizzled on NSOpenGLContext in the game pid, zero hits while gameplay rendered. winemac.so static: macdrv_surface_swap (0x39fbf) -> 0x156a0 -> `[ctx flushBuffer]` (the only flushBuffer call site); WineOpenGLContext does not override it (methods: dealloc, resetSurfaceIfBackingSizeChanged, wine_updateBackingSize:, dummyView). So either the game's present never reaches macdrv_surface_swap or it is not GL-through-winemac.
- STEAM_OVERLAY_LOGGING(_FLUSH) unset in game process; SteamGameId/SteamOverlayGameId=98800 set; the process's CX_ENV starts with DYLD_INSERT_LIBRARIES='...' (user CX_ENV prefix absent). Secondary defect candidate: user CX_ENV prefix not reaching the game (not located; gameBridgeWineLaunch.ts L375-380 looks correct, so loss is downstream).
- Probe v2 (build/public/bundle dylibs currently the probe; originals in scratchpad glprobe/orig-*.dylib) adds makeCurrentContext/setView:/clearDrawable hooks and a 3s tick line.

## Evidence (probe run 2, pid 83280) and conclusion
- 64 tick lines over ~3 min, all `flush=0 make=0 setView=0 clear=0` in the game pid and the 8 wine service pids. No NSOpenGLContext activity at all.
- `Dungeons of Dredmor.exe` imports ADVAPI32, KERNEL32, LIBEXPAT, OpenAL32, SDL.dll, SDL_ttf, SHELL32, SHLWAPI, USER32, comdlg32, dbghelp, steam_api. No opengl32/ddraw/d3d*/gdi32 import. Bundled DLLs are SDL 1.2 era. It is a 2D software-rendered SDL 1.2 title; SDL 1.2 on Windows defaults to windib (GDI), directx (DirectDraw) optional. Frames reach the screen via Wine's GDI/window-surface path, not GL or Metal. OpenGL.framework/GLEngine in the process are incidental.
- Runner static: CrossOver 26.3.0.39832 ships ddraw.dll, wined3d.dll (GL-based: "WineD3D and OpenGL"), winemetal.dll, opengl32.dll/so. ddraw in this build reports "Direct3D7 ... using WineD3D", so a DirectDraw path would present through wined3d -> opengl32 -> winemac -> flushBuffer (the point Valve's CGLFlushDrawable interpose catches). Not verified live.
- Secondary: user per-game CX_ENV prefix is absent from the game's CX_ENV (STEAM_OVERLAY_LOGGING unset). Loss point not located; gameBridgeWineLaunch.ts L375-380 appendCxEnvTokens looks correct.
- Probe dylibs restored (build/, public/, debug bundle) and verified byte-identical to originals.
