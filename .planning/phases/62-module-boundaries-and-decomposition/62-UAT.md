---
status: complete
phase: 62-module-boundaries-and-decomposition
source: [62-12-PLAN.md, 62-21-PLAN.md]
updated: 2026-11-10T00:00:00Z
---

# Phase 62 UAT

## Current Test

[testing complete]

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
reason: covered by #18a (smoke 2), where a GameLib-driven Steam depot download passed progress, pause, resume and cancel; the "Managed by Steam" hand-off passed in 62-HUMAN-UAT #3.

## Smoke 2 — after capabilities (D-16 step 3)

Live macOS run after the capability conversion (D-17). Record only pass/issue and the log
excerpts needed; no tokens or account ids.

### 10. Fresh sidecar
expected: build/main/sidecar.js mtime is newer than the 62-20 commit (421e43bce, 06:17:49 Nov 7) after quitting and restarting `pnpm tauri:dev`.
result: pass — sidecar.js rebuilt 06:27:29 Nov 7, newer than 421e43bce; launched via `pnpm tauri:dev`.

### 11. Bridged Steam title launches (Avernum 6, appId 206060)
expected: Launch completes without added delay (bottle-state persist is now awaited); gamelib.log shows HELLO and the game's Steam-init (GINIT SteamAPI_Init ok=1) is clean.
result: pass — Avernum 6 (206060): gamelib.log shows `HELLO  shim attached appid=206060` and `GINIT  fn=SteamAPI_Init ret=1 ok=1 session=1`; launch request 06:28:13 to HELLO 06:28:17 (~4s incl. anon CM logon + bottle reset); window raised 06:28:19; no perceived delay (no smoke-1 timing baseline, log rotated).

### 12. Grim Dawn (219990) launches in DRM mode
expected: Grim Dawn launches in DRM mode and the lsteamclient game-process trace is present.
result: pass — DRM trace 219990-1793986247812.log has 23 role=game lsteamclient calls incl. CreateSteamPipe, ConnectToGlobalUser, GetAppOwnershipTicketData; grim dawn.exe matched 06:30:50, raised 06:30:52.

### 13. Epic and GOG launch
expected: A GOG game (Balrum) shows its "launching" status message; an Epic game launches, including with the network off (offline-mode resolution); no Steam-only behaviour.
result: pass (62 scope) — GOG Balrum launched online and offline (ENOTFOUND on presence/library handled without crash). Epic SOMA online launch pass. GOG "launching" status NOT EXERCISED: emitted only in prepareWineLaunch (Windows titles); Balrum is native macOS. Epic offline launch silently fails, PRE-EXISTING not 62: isOnline() still true right after network-off and isEpicServiceOffline() returns false on ENOTFOUND (src/backend/utils.ts ~:240), so legendary ran without --offline and failed login. The resolveOfflineMode expired-flag hook was not reached with offlineMode=true. Filed as a todo.

### 14. Library cards
expected: Steam-only controls on Steam cards only; a sideloaded game's card renders correctly.
result: pass — sideloaded card check (14e) skipped, operator has no sideloaded game.

### 15. Game page per store
expected: Steam, Grim Dawn, Epic/GOG and sideloaded game pages each show correct store-specific controls, cloud saves and playtime per store.
result: pass — CrossOver compat score absent on Steam pages because the CodeWeavers API returns 403 all session (pre-existing, also in smoke 1; filed as a todo). GOG Balrum "Sync saves: disabled" correct (autoSync off); SOMA no cloud-saves section correct; no EOS overlay link correct (gated isLinux && legendary, as before). Sideloaded page checks skipped.

### 16. Install modal per store
expected: Steam install options only on an uninstalled Steam game; DLC selection on Epic only; modify-install options per store as before.
result: pass — Steam install options on uninstalled Steam game; Phoenix Point (Epic) shows DLC selection; GOG dialog has no Steam options; Modify Install correct per store (Epic DLC list; GOG DLC/version/RedMod). Sideload dialog skipped.

### 17. Console mode overlays
expected: Console mode launch and install overlays behave per store (Steam options only on Steam games).
result: pass — operator confirmed.

### 18. Download queue
expected: A GameLib-driven Steam depot download and a GOG/Epic download each show advancing progress with working pause/resume/cancel; Steam failures show error + Remove (not "canceled"); steam:// hand-offs appear under "Managed by Steam".
result: issue — NOT caused by phase 62. 18a pass: GameLib-driven Steam depot download showed advancing progress, pause/resume/cancel worked. 18b: GOG download resume (Endless Sky 1829678475) restarts from 0%: paused at 12.07%, resume re-ran a byte-identical gogdl command and progress restarted at 0%. Phase-62 diffs in downloadqueue.ts/utils.ts are 1:1 literal-to-capability swaps not touching pause/resume or the gogdl command; not confirmed against a pre-62 build. 18c (Managed by Steam hand-off) and the Steam-failure case skipped. Filed as a todo.

## Summary

total: 18
passed: 16
issues: 1
pending: 0
skipped: 1

#9 was skipped (no time for a Steam install) and its scope was re-run as #18. #18a passed.

## Gaps

- truth: "A GOG download resumes from where it was paused"
  status: out-of-scope
  reason: "User reported (#18b): GOG resume of Endless Sky restarts from 0%. Pre-existing, not a phase 62 regression: 62-HUMAN-UAT #5 got the same behaviour on a pre-62 build. Tracked and closed in .planning/todos/completed/2026-11-07-gog-download-resume-restarts-from-zero.md."
  severity: major
  test: 18
  artifacts: []
  missing: []
