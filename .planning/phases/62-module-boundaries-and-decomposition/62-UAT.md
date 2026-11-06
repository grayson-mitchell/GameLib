---
status: partial
phase: 62-module-boundaries-and-decomposition
source: [62-12-PLAN.md, 62-21-PLAN.md]
---

# Phase 62 UAT

## Smoke 1 — after split (D-16 step 2)

Live macOS run after the games/depot/ipc split, before any capability change (D-17). Record only
pass/issue and the log excerpts needed; no tokens or account ids.

### 1. Fresh sidecar
expected: build/main/sidecar.js mtime is newer than the 62-11 commit (4e5a42d0c) after quitting and restarting `pnpm tauri:dev`.
result: pass — sidecar.js mtime 01:08:15 Nov 7, newer than 4e5a42d0c (01:02:20); launched via `pnpm tauri:dev`.

### 2. Bridged Steam title launches (Avernum 6, appId 206060)
expected: Avernum 6 launches through its per-game bottle; bridge log shows HELLO and the game's Steam-init log is clean.
result: pass — Avernum 6 (206060): gamelib.log shows `HELLO  shim attached appid=206060` and `GINIT  fn=SteamAPI_Init ret=1 ok=1 session=1` from Avernum 6.exe; window raised, overlay attached. Exit after 8s was the operator quitting manually (closed-soon notice and overlay-exit-abnormal expected, not a defect).

### 3. Grim Dawn (219990) launches in DRM mode
expected: Grim Dawn launches in DRM mode and the lsteamclient game-process trace is present.
result: pass — DRM mode trace 219990-*.log shows role=game lsteamclient calls: create-interface SteamClient017, CreateSteamPipe, ConnectToGlobalUser, GetAppOwnershipTicketData, GetSteamID, BIsSubscribedApp; grim dawn.exe matched and raised.

### 4. Epic or GOG game launches
expected: One Epic or GOG game launches normally with no Steam-only behaviour.
result: pass — Balrum (GOG, native macOS via gogdl) launched and ran; GOG presence set. Out-of-scope noise: ExtraGameInfo errors (CodeWeavers 403, PCGamingWiki undefined read, HLTB getGogHLTBGameData) in code not touched by phase 62.

### 5. Library cards show Steam-only controls only on Steam games
expected: Steam-only controls appear on Steam cards and on none of the Epic/GOG/Amazon cards.
result: pass — operator confirmed.

### 6. Game page store-specific controls
expected: Game pages for a Steam game, Grim Dawn and an Epic/GOG game each show the correct store-specific controls.
result: pass — operator confirmed.

### 7. Install modal
expected: The install modal shows Steam install options only for an uninstalled Steam game, and none for a non-Steam game.
result: pass — operator confirmed.

### 8. Console mode overlays
expected: Console mode launch and install overlays behave per store (Steam options only on Steam games).
result: pass — operator confirmed.

### 9. Download queue
expected: A GameLib-driven Steam depot download and a GOG/Epic download each show advancing progress with working pause/resume/cancel; Steam failures show error + Remove (not "canceled"); steam:// hand-offs appear under "Managed by Steam".
result: skipped — operator had no time for a Steam install. Exercises the moved depot code, so deferred to smoke #2 (62-21).
