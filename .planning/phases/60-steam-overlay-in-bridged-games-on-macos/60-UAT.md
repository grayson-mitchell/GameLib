---
status: testing
phase: 60-steam-overlay-in-bridged-games-on-macos
source: [60-10-PLAN.md]
---

# Phase 60 UAT: Steam overlay in bridged games on macOS

## Preconditions

Recorded 2026-11-03 before the live gate.

- `lipo -info public/bin/arm64/darwin/overlay_shim.dylib`: `Architectures in the fat file: ... are: x86_64 arm64` (D-14 met; built Nov 2 19:10).
- Phase base: `b9d5c71d7` (parent of `f6f189379`, first 60-01 commit). `git diff --stat b9d5c71d7..HEAD -- src/backend/storeManagers/steam/bridge/inviteBridge.ts` prints nothing (D-16: invite routing unchanged).
- `grep -n '"d3d11"' .../GameLibSteamBridge-<appid>/user.reg`:
  - 3205720 (Schedule I): line 769 `"d3d11"="native,builtin"`. This is the DXVK title, so the override is expected; Pitfall 7 only concerns the D3DMetal titles.
  - 1284190 (Planet Crafter): no d3d11 line.
  - 1363080 (Manor Lords): no d3d11 line.
  - 219990 (Grim Dawn): no d3d11 line.
- All four bridge bottles and their `appmanifest_<appid>.acf` exist, so all four titles are installed.
- Sidecar freshness: `build/main/sidecar.js` mtime is 2026-11-03 08:20:35, which is 35 s BEFORE the last code commit `05b22464c` (08:21:10, the post-launch wiring). It must be rebuilt before the gate (see How to run).

## How to run

- Mac Steam running and signed in. Launch every title from GameLib only, and quit the game between titles.
- `tauri dev` does not rebuild the sidecar: rebuild it (`pnpm build:sidecar-sea`, plus a vite build in a fresh worktree), restart dev, and confirm the mtime of `build/main/sidecar.js` is newer than 2026-11-03 08:21:10.
- Game pid: from the attach line `for game process <pid>`, or `pgrep -f <exe>`.
- Evidence commands (paste only the specific lines, redact the home dir to `~`, never whole logs):
  - `vmmap <pid> | grep -E 'overlay_shim|steamloader|gameoverlayrenderer'`
  - `grep 'overlay attach:' <launch log>`
  - `grep 'overlay_shim hook_set_pixel_format' <launch log>`
  - the overlay wine log under `<appFolder>/steam-bridge/overlay/trace/`
- Bridge-verified is strict: HELLO plus a clean game Steam-init log. For Grim Dawn the lsteamclient game-process trace. In-Game never counts. Screenshots never count (`screencapture` returns stale Metal frames).

## Tests

### 1. Schedule I Free Sample (3205720): DXVK, TCP, overlay clone
expected: Shift+Tab opens Mac Steam's overlay, it draws correctly and takes clicks (operator judgment, not screenshots); bridge verified strictly (HELLO plus a clean game Steam-init log; for Grim Dawn the lsteamclient game-process trace; In-Game never counts); the launch log has `overlay=on source=default` and `overlay attach: attached`; vmmap lists overlay_shim, steamloader and gameoverlayrenderer; the launch log or overlay wine log has an `overlay_shim hook_set_pixel_format` line. Note the GPU and macOS version, and whether game input leaks through while the overlay is open (RESEARCH Pitfall 9, observation only).
result: pending

### 2. The Planet Crafter (1284190): D3DMetal D3D11, TCP
expected: Shift+Tab opens Mac Steam's overlay, it draws correctly and takes clicks (operator judgment, not screenshots); bridge verified strictly (HELLO plus a clean game Steam-init log; for Grim Dawn the lsteamclient game-process trace; In-Game never counts); the launch log has `overlay=on source=default` and `overlay attach: attached`; vmmap lists overlay_shim, steamloader and gameoverlayrenderer; the launch log or overlay wine log has an `overlay_shim hook_set_pixel_format` line. Note the GPU and macOS version, and whether game input leaks through while the overlay is open (RESEARCH Pitfall 9, observation only).
result: pending

### 3. Manor Lords (1363080): D3DMetal D3D12 RGB10A2, through the UE stub
expected: Launched through the UE stub, never `...-Shipping.exe`; shim-dependent. Shift+Tab opens Mac Steam's overlay, it draws correctly and takes clicks (operator judgment, not screenshots); bridge verified strictly (HELLO plus a clean game Steam-init log; In-Game never counts); the launch log has `overlay=on source=default` and `overlay attach: attached`; vmmap lists overlay_shim, steamloader and gameoverlayrenderer; the launch log or overlay wine log has an `overlay_shim hook_set_pixel_format` line. Note the GPU and macOS version, and whether game input leaks through while the overlay is open (Pitfall 9, observation only).
result: pending

### 4. Grim Dawn (219990): DRM mode on the DRM clone
expected: DRM mode on the DRM clone (bin/wineloader re-signed; the launch log has no `reason=overlay-resign`). Shift+Tab opens Mac Steam's overlay, it draws correctly and takes clicks (operator judgment, not screenshots); bridge verified strictly (the lsteamclient game-process trace; In-Game never counts); the launch log has `overlay=on source=default` and `overlay attach: attached`; vmmap lists overlay_shim, steamloader and gameoverlayrenderer; the launch log or overlay wine log has an `overlay_shim hook_set_pixel_format` line. Note the GPU and macOS version, and whether game input leaks through while the overlay is open (Pitfall 9, observation only).
result: pending

### 5. Invite button observation (D-16)
expected: Record what the overlay's own Invite button does in one bridged title. Phase 58's picker routing is unchanged. Record only; any result passes.
result: pending

### 6. Per-game toggle off (D-02, D-04)
expected: With Advanced > Steam overlay set to Off on Schedule I, the launch log has `overlay=off source=user`, the game runs on stock CrossOver (no 'GameLib overlay runner' in the log), and Shift+Tab does nothing.
result: pending

### 7. Fail-open toast (D-08, D-09)
expected: With public/bin/arm64/darwin/overlay_shim.dylib temporarily renamed, two consecutive launches of Schedule I each show the 'Steam overlay unavailable' toast, each log has `[bridge-notice] appId=3205720 reason=overlay-shim`, and the game launches both times. Restore the file afterwards (re-run the lipo check).
result: pending

### 8. Fallback engine skipped (D-07)
expected: Under the Phase 59 no-crossover.sb profile, a bridge launch logs `overlay=skipped reason=fallback-engine` and shows no overlay toast.
result: skipped — superseded by item 9 (quick 261103-wci injects the overlay on the fallback engine via plain env)

### 9. Fallback engine overlay via plain env (D-07, quick 261103-wci)
expected: Run GameLib under the Phase 59 profile `.planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/no-crossover.sb` and launch a TCP-mode bridge title that runs on the fallback engine (Wine-Staging + DXVK; operator's choice, record the title and appId). The launch log has `overlay=on source=default`, `overlay=env reason=fallback-engine (D-07)` and `Wine-Staging` in the engine line, and no `GameLib overlay runner` line. Shift+Tab opens Mac Steam's overlay and it draws correctly and takes clicks (operator judgment, not screenshots; this is the winemac + DXVK-macOS/MoltenVK rendering question). `vmmap <game pid>` lists overlay_shim, steamloader and gameoverlayrenderer. Record the number of `overlay attach:` lines and whether `vmmap $(pgrep -x wineserver)` also lists gameoverlayrenderer (RESEARCH A1 multiple-attach observation; record only, it does not fail the item by itself). The game launches and no `overlay-exit-abnormal` dialog appears. Apply the bridge verified criterion strictly.
result: pending
