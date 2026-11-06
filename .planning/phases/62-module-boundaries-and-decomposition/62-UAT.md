# Phase 62 UAT

## Smoke 1 — after split (D-16 step 2)

Live macOS run after the games/depot/ipc split, before any capability change (D-17). Record only
pass/issue and the log excerpts needed; no tokens or account ids.

### 1. Fresh sidecar
expected: build/main/sidecar.js mtime is newer than the 62-11 commit (4e5a42d0c) after quitting and restarting `pnpm tauri:dev`.
result: pending

### 2. Bridged Steam title launches (Avernum 6, appId 206060)
expected: Avernum 6 launches through its per-game bottle; bridge log shows HELLO and the game's Steam-init log is clean.
result: pending

### 3. Grim Dawn (219990) launches in DRM mode
expected: Grim Dawn launches in DRM mode and the lsteamclient game-process trace is present.
result: pending

### 4. Epic or GOG game launches
expected: One Epic or GOG game launches normally with no Steam-only behaviour.
result: pending

### 5. Library cards show Steam-only controls only on Steam games
expected: Steam-only controls appear on Steam cards and on none of the Epic/GOG/Amazon cards.
result: pending

### 6. Game page store-specific controls
expected: Game pages for a Steam game, Grim Dawn and an Epic/GOG game each show the correct store-specific controls.
result: pending

### 7. Install modal
expected: The install modal shows Steam install options only for an uninstalled Steam game, and none for a non-Steam game.
result: pending

### 8. Console mode overlays
expected: Console mode launch and install overlays behave per store (Steam options only on Steam games).
result: pending

### 9. Download queue
expected: The queue shows a Steam item and a non-Steam item, each with its own controls.
result: pending
