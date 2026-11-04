# Phase 60 Plan 12: G1 live probe diagnosis (IN PROGRESS)

Status: Task 1 done, Task 2 (operator live runs) pending. Frontmatter and the `## G1 verdict` section are written in Task 3 after live evidence exists.

## Static evidence

- `pnpm build-steam-bridge` ran 2026-11-04 17:0x NZDT; both dylibs rebuilt.
- `lipo -info public/bin/arm64/darwin/overlay_shim.dylib`: x86_64 arm64
- `lipo -info public/bin/arm64/darwin/overlay_input_probe.dylib`: x86_64 arm64
- `pnpm build:sidecar-sea` ran 17:08 NZDT. `build/main/sidecar.js` mtime Nov 4 17:08, size 2371362.
- Sidecar built from HEAD 572bf5f4c (includes 60-13 commits 47c192b0e, 5d24cb8ae). `git status --short -- src`: clean. `git merge-base --is-ancestor a4f4696e2 HEAD` (60-11 probe wiring): succeeds.
- `otool -l gameoverlayrenderer.dylib | grep -A4 __interpose`: TWO `__interpose` sections (size 0xf0 each, 15 pairs). The dylib does interpose.
- `nm -m gameoverlayrenderer.dylib` imports (all undefined externals): CGAssociateMouseAndMouseCursorPosition, CGDisplayHideCursor, CGDisplayShowCursor, CGSForceShowCursor, CGWarpMouseCursorPosition, HideCursor, ShowCursor, OBJC_CLASS_$_NSCursor. No EventTap or sendEvent imports. (Which of these are interposed versus merely called is for the probe trace to show.)
- `user.reg` `[Software\\Wine\\Mac Driver]` in GameLibSteamBridge-1284190: only `"AllowSetGamma"=dword:00000000`. Same in GameLibSteamBridge-3205720. Neither bottle sets UseConfinementCursorClipping or CursorClippingLocksWindows.
- Current engine of the 1284190 bottle: `~/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-1284190/.gamelib-engine.json` = `{"kind":"crossover",...}`. Run A needs CrossOver (already set); Run B flips to Staging under the sandbox profile.
- Bottle sharing: `getBridgeBottleSettings` -> `fallbackBridgeBottleSettings` (bottle.ts L1761-1772) calls the same `resolveBridgeBottleName(appId)` as the CrossOver path, and `buildFallbackGameSettings(resolved, sel)` takes that bottle. engineSwitch.ts L511-529 also uses the same `bottleDir`. So the Staging launch runs in the same bottle directory.

staging-shares-bottle: yes
