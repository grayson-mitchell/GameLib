---
status: awaiting_human_verify
trigger: "DRM mode: the second launch in a bottle hangs at bottle-stage (wineboot --init, winedevice spinning)"
created: 2026-10-29
updated: 2026-10-29
source_todo: .planning/todos/pending/2026-10-28-drm-second-launch-bottle-stage-hang.md
platform: macos
---

# Debug: DRM second launch in a bottle hangs at bottle-stage

## Symptoms

- **Expected:** Every DRM-mode launch in a bottle stages the bottle (`stageDrmBottle`, incl. `reg add ...`) promptly and the game launches — the second and later launches behave like the first.
- **Actual:** The first DRM launch in a bottle works. Every later DRM launch in the same bottle times out at `stageDrmBottle`. During each hang the bottle's wine session under the DRM clone runner runs `wineboot.exe --init`, and a `winedevice.exe` spins near 100% CPU and never exits.
- **Errors:** `reg add ... timed out after 15000 ms`, `reason=drm-bottle-stage`.
- **Timeline:** Seen in the phase 56 live gate (56-16), 2026-10-28: Grim Dawn (22:49:14, 22:55:43) and Raft (22:52:09), each after one successful DRM launch. Gate session dir `/tmp/gamelib-gate-20261028T081115Z` no longer exists — logs must be re-gathered live.
- **Reproduction:** DRM-mode launch a game in a bottle; exit the game; DRM-mode launch again (same or different game) in the same bottle → hang at bottle-stage.
- **Extra observation:** `wineserver -k` with `CX_BOTTLE` alone did not stop the Grim Dawn session; a pid kill and `kill -9` of winedevice did.
- **Code:** `src/backend/storeManagers/steam/games.ts` (`stageDrmBottle`).

## Current Focus

- hypothesis: H-b (session never ended after game exit; second launch's `reg add` hits a fresh/lingering wineserver) is favoured but UNCONFIRMED; H-c (staged-check misses -> needless reg add) is a contributing trigger. Needs live evidence.
- (old) hypothesis: (none yet) — candidates from todo: (a) stock vs DRM-clone wineserver mismatch on the bottle (session left alive by one runner, stage `reg add` driven by the other → prefix re-init / `wineboot --init`); (b) bottle session not ended after game exit (D-11), so the leftover winedevice/wineserver wedges the next stage.
- next_action: RETURNED CHECKPOINT to user for live repro (see checkpoint); then apply fix. Old: gather initial evidence — read `stageDrmBottle` and the DRM launch/exit path; sample the spinning winedevice; check which wineserver binary(ies) own the bottle's session after the first launch; test ending the bottle session after game exit (D-11).

## Evidence

- checked: drmLaunchSetup.ts runSetup step 6 + bottle.ts endPerGameBridgeBottleSession (only caller in launch path)
  found: endBottleSession (wineserver -k) runs ONLY when `getRunner(appId)?.runner.runnerDir !== runner.runnerDir`, i.e. the first DRM launch per app-process. Nothing ends the bottle session after the game exits. Later launches inherit whatever session/winedevice the previous game left.
  implication: matches "first works, later hang"; supports H-b.
- checked: killBottleWineServer called before registerRunner -> drmRunnerBinDir(appId) undefined -> stock CrossOver wineserver -k, even if the live session belongs to the clone runner (e.g. after app restart, drmBridgeRunners is in-memory only).
  implication: stock/clone wineserver mismatch (H-a) is possible on app restart; consistent with todo note that CX_BOTTLE-only `wineserver -k` did not stop the session.
- checked: stageDrmBottle step 6 skips `reg add` only if user.reg already holds all 4 values (drmRegistryStagedInUserReg).
  found: real bottle GameLibSteamBridge-219990/user.reg has `[Software\\Valve\\Steam] "SteamPath"="C:\\Program Files (x86)\\Steam\\"` (TRAILING backslash, rewritten after staging by the helper steam.exe/lsteamclient), while ActiveProcess SteamPath has none. Bottle 648800 has no trailing backslash (matches). The check requires exact equality -> for 219990 it returns false on every launch after the first, forcing a `reg add` into a wineserver that is the thing hanging.
  implication: H-c: strict equality turns a no-op into the hanging call for Grim Dawn. Does not explain Raft (648800 matches now), so not the sole cause.
- checked: ps for wine processes, app logs, /tmp gate dir
  found: no wine processes running, no gamelib logs on disk, gate dir gone.
  implication: cannot sample a spinning winedevice offline; live repro required.
- timestamp: 2026-10-29 (live repro by user, Grim Dawn, bottle GameLibSteamBridge-219990)
  checked: user-facing error "GameLib could not prepare this game's bottle to run it with its Steam DRM. Details: reg add SteamPath timed out after 15000 ms"; `ps` while hung
  found: all from the DRM clone runner (crossover-26.3.0.39832 under ~/Library/Application Support/gamelib/steam-bridge/drm/runners/): wineserver 23720, `wineboot.exe --init` 23722, winedevice 23726 (0% CPU), winedevice 23732 (101% CPU), and the hung `reg add HKCU\Software\Valve\Steam\ActiveProcess /v SteamPath` (23718, WINESERVER/CX_ROOT = clone). All 37s old, i.e. a FRESH session started by this launch's reg add, not a leftover from the previous game. No stock-CrossOver wineserver present.
  implication: weakens H-a (no stock/clone mix in this repro) and weakens H-b as stated (nothing lingering; the hang is inside a brand-new session's prefix init).
- timestamp: 2026-10-29
  checked: `sample 23732 3` (saved: /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/a4d57b32-f262-4210-911c-19d2d084b41e/scratchpad/winedevice-23732.sample.txt)
  found: winedevice 23732 hosts winebus.so. Its main CFRunLoop runs `-[_GCKeyboardAndMouseManager _onqueue_HIDServiceAdded:]` -> `_onqueue_addMouse:` -> `-[GCMouseInput setButtonEventSource:]` -> objc cache_t::insert -> free_tiny -> **malloc_zone_error -> abort()** -> SIGABRT -> `_sigtramp` -> wine ntdll.so signal handler, which then recurses/spins at ntdll.so+0x35ba5 (thousands of identical frames, Rosetta). It is a CRASHED process, and wine's signal handling of the abort spins at 100% CPU instead of dying.
  implication: root mechanism = heap corruption in winedevice (winebus / macOS GameController mouse registration) during `wineboot --init`; the dead device service blocks wineboot, so reg add never returns. The prior "first launch works, later hang" pattern needs re-explaining in these terms (e.g. what differs about first-launch prefix init / whether winebus is loaded then).
- timestamp: 2026-10-29
  checked: shasum clone vs stock /Applications/CrossOver.app for ntdll.so, winebus.so, winebus.sys, winedevice.exe, ntdll.dll
  found: ntdll.so, winebus.so, winebus.sys, winedevice.exe IDENTICAL; only x86_64-windows/ntdll.dll differs (expected DRM-clone patch).
  implication: the crashing unix-side code is stock CrossOver; open question whether stock CrossOver hits the same crash in this bottle, or the patched ntdll.dll contributes. Candidate mitigations: disable winebus in DRM bottles (e.g. `HKLM\System\CurrentControlSet\Services\winebus` Start=4 / DllOverrides winebus.sys=d, or WINEDLLOVERRIDES for the stage reg add), stage registry by editing user.reg directly while no session runs instead of `reg add`, and loosen drmRegistryStagedInUserReg trailing-backslash equality so no session is started at all when values are already present.

## Eliminated

## Resolution

- root_cause: After the first launch, the helper steam.exe/lsteamclient rewrites HKCU\\Software\\Valve\\Steam SteamPath with a trailing backslash. drmRegistryStagedInUserReg required exact equality, so it judged an already-staged bottle (e.g. Grim Dawn 219990) unstaged on every later launch and ran `reg add`. That starts a fresh clone-runner wine session whose `wineboot --init` blocks on winedevice (winebus.so), which crashes in macOS GameController `_onqueue_addMouse` (malloc_zone_error -> SIGABRT) while wine's ntdll.so signal handler spins at 100% CPU, so `reg add` times out at 15000 ms. Earlier H-a (stock/clone wineserver mismatch) and H-b (leftover session) were weakened by live evidence (session was fresh, all clone runner).
- fix: drmRegistryStagedInUserReg (stageDrmBottle.ts) now treats a trailing backslash on SteamPath as equal (case-insensitive), so no wine session is started when values are already present. Commit 5ff2dbd8c.
- verification: jest stageDrmBottle.test.ts 42/42 incl. new trailing-backslash case; prettier --check clean; user live-confirmed fixed (2026-10-29) on 5ff2dbd8c.
- residual_risk: the winebus/GameController abort-spin in stock CrossOver is NOT fixed. A truly unstaged bottle (fresh, or registry reset) still starts a session and can hit it. Why the first launch usually avoids it is unproven. Raft (648800) hang was not separately explained (its user.reg already matched). Follow-up todo filed.
- files_changed: src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts, src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
