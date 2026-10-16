# Evidence: per-game bridge bottles (261016-u1w), observed on real CrossOver

Quick task `261016-wsq`. Discharges the five live-gate items quick task `261016-u1w` left in its
SUMMARY (LD-8) and takes the T-u1w-06 measurement the sibling cleanup todo asked for. No code change.

## (a) Rig

- **Build:** `pnpm tauri:dev` of `87f64dff5` (u1w's final commit is `2f2792de3`; the sidecar bundled
  at 07:45:33 carries 12 references to `removePerGameBridgeBottle`), launched detached with
  `nohup … & disown` on 2026-10-17 at 07:45 NZDT. Dev pid 51243, sidecar 51297, main window
  CGWindowID 90382 at 1280x800, Web Inspector auto-docked right, console prompt at (760, 847).
- **Why not the operator's instance:** their `pnpm tauri:dev` (VS Code, started 19:58 the night
  before) ran a sidecar bundled at 19:59 with **zero** references to the per-game code, every u1w
  commit landed 22:34-23:17, and `tauri dev` does not rebundle the sidecar on commit. They quit it
  before this run.
- **Auth:** vault mode (`GAMELIB_DEV_SECRET_VAULT=1`); the vault held a `steam-refresh-token` slot and
  `signInProbe steam outcome=healthy` logged at boot, so the depot download used the same Steam
  session the operator had synced 385 games with at 20:15.
- **Driving:** `gate.js` imported via vite's `/@fs/` path; `__snap`, `__launch`, `__uninst`, `__inst`,
  `__refresh` call `window.api` directly and write `[GATE-wsq] …` lines through `window.api.logInfo`
  into `~/Library/Logs/GameLib/gamelib.log`. `type.sh` focuses the shell, clicks the prompt, types one
  line, Return. Filesystem, `lsof -p <game pid>` (which bottle a wine process has open) and
  `cxbottle --status` checks ran from the shell.
- **As-found fixture, backed up first:** legacy `~/Library/Application Support/CrossOver/Bottles/
  GameLibSteamBridge` held THREE StateFlags-4 manifests — 206040 Avernum 5 (92 MB), 206060 Avernum 6
  (103 MB), 63000 HOARD (277 MB, not allowlisted). No `GameLibSteamBridge-<appId>` bottle existed.
  P2 copy of the bottle (786 MB), `store_cache/steam_library.json`, `steam_store/config.json` and
  `GamesConfig/{206040,206060,63000}.json` taken at 23:42 the night before, prior to any launch.

Because the legacy bottle already held Avernum 5, the "fresh install" arm needed Avernum 5 out of
the legacy bottle first; that is Arm 2 (and it is the T-u1w-06 measurement).

## (b) Arms

| arm | todo item | action (console) | bar | observed | verdict |
| --- | --- | --- | --- | --- | --- |
| 0 | control | `__snap('arm0-as-found')` 07:46:54 | all three installed from the legacy bottle after the new code's mount refresh | 206040, 206060, 63000 all `installed:true`, paths under `/Bottles/GameLibSteamBridge/` | pass |
| 1 | 2 | `__launch('206060')` 07:47:14 | bridge-helper path, wine from the legacy bottle, game window | `spawnHelperIfNeeded: spawning the shared bridge helper` + `LISTEN 127.0.0.1:54550`; `SteamGame: launching appId 206060 via the Steam bridge (…/GameLibSteamBridge/…/Avernum 6.exe)`; window `Avernum 6` (CGWindowID 90445, pid 51622) whose process had 6 files open under `/Bottles/GameLibSteamBridge` and none elsewhere; frame `01-*.png` | **pass** |
| 2 | T-u1w-06 | `__uninst('206040')` 07:48:43 | measurement, not pass/fail | install root removed (`SteamGame: removed bridge install for appId 206040 at …/common/Avernum 5`); `appmanifest_206040.acf` **survived**; `gameStatusUpdate done` → `[refreshLibrary] runner=steam origin=game-status` 07:48:43 → `Steam library sync complete` 07:48:46 → `__snap` 07:48:53 **`installed:true`** with the deleted path; manual refresh 07:48:58 → still `installed:true` 07:49:12; 19× `Library: 1 owned Steam game(s) silently excluded from the library grid by a stale nonAvailableGames entry: 206040` 07:48:46-07:49:57 | **measured: reverts in 3 s and hides the game from the grid** |
| 2r | re-arm | `rm appmanifest_206040.acf` (byte-identical to the backup) 07:49:52, `__refresh()`, `__snap` 07:50:08 | not installed | `206040 {installed:false}`; exclusion errors stop | re-armed, not as-found |
| 3 | 1 | `__inst('206040')` 07:50:42 | per-game bottle created, depot in it, shim placed, badge installed, launch from it | `bridge bottle "GameLibSteamBridge-206040" not yet provisioned … provisioning inline` 07:50:42; `provisionBridgeBottle: bridge bottle "GameLibSteamBridge-206040" created` 07:50:56 (**14 s**); depot 206041, 1460 files, 92,315,962 bytes, first bytes 07:51:02, `Writing StateFlags=4 full-ownership manifest` 07:51:10; `placeShimForGame: overwrote steam_api.dll … /Bottles/GameLibSteamBridge-206040/…` 07:51:12; `install polling complete … badge flipped to installed` 07:51:13; `__snap` path `/Bottles/GameLibSteamBridge-206040/…/common/Avernum 5`; `__launch('206040')` 07:58:38 → `launching appId 206040 via the Steam bridge (…/GameLibSteamBridge-206040/…/Avernum 5.exe)`, wine pid 56292 with 6 files open under `/Bottles/GameLibSteamBridge-206040`, the bottle's own wineserver 56276 | **pass** (see note A) |
| 4 | 5 | `__refresh()` 08:01:03, `__snap` 08:01:17 | both stay installed, from their own bottles | 206040 per-game path, 206060 legacy path, 63000 legacy path, all `installed:true` | **pass** |
| 5 | 3, 4 | `__uninst('206040')` 08:01:44 | bottle gone from disk and from CrossOver; legacy and Phase 17 bottles untouched | `removePerGameBridgeBottle: removed per-game bridge bottle "GameLibSteamBridge-206040" for appId "206040"` 08:01:45 (1 s); `ls Bottles` = Epic Games Store, GOG Galaxy, GameLibSteam, GameLibSteamBridge; `cxbottle --bottle GameLibSteamBridge-206040 --status` → `Unable to find the 'GameLibSteamBridge-206040' bottle`; wineserver 56276 gone, only the operator's Phase 17 `GameLibSteam` wineserver 91912 left; `~/Applications/CrossOver` = Epic Games Launcher.app, GOG.com, Playnite, Steam before and after; `GameLibSteam/cxbottle.conf` Jul 12 15:11:29 and `GameLibSteamBridge/cxbottle.conf` Jul 21 11:26:52 unchanged; legacy manifests 206060 `1fa9fccb…` and 63000 `3f05359f…` unchanged; `__refresh` + `__snap` → 206040 `installed:false`, 206060 and 63000 installed | **pass** |
| restore | — | rsync + cp from the P2 backup 08:02:45, `__refresh()`, `__snap` 08:03:02 | as-found | install root `diff -rq` identical, manifest md5 `42a0f09b…` identical; 206040 `installed:true` from `/Bottles/GameLibSteamBridge/` again | as found |

Teardown 08:03:34: shell, pnpm/tauri wrappers, vite, sidecar and the bridge helper stopped;
`pgrep` over the four patterns plus `lsof :5173` empty. The operator's dev instance was not
restarted.

## (c) Notes and observations outside the five items

- **A. Avernum 5 shows its own "requires the monitor to be set to exactly 16 Bit color" dialog**
  (frame `03-*.png`, 300x184 window, pid 56292) once launched from the per-game bottle. This is
  not a per-game-bottle regression: `cxbottle.conf` of the new bottle and the legacy bottle differ
  only in `BottleID`, both `user.reg` files carry the same CrossOver AppDefaults set and no display
  depth keys, and the legacy `user.reg` holds no `Spiderweb`/`Avernum` keys — Avernum 5 had never
  been run from the legacy bottle either (the allowlist note from Phase 24 says it was picked
  precisely because it was not previously installed; only Avernum 6 is marked VERIFIED PLAYABLE).
  CGEvent clicks at the OK button and a Return keystroke did not dismiss it; the process was
  killed. Whether Avernum 5 is playable at all under CrossOver 26.2 is a game-compat question for
  the allowlist, not for this gate.
- **B. The `launch` invoke times out at 60 s while the game runs:** `[BLANKPROBE-MARK]
  unhandled-rejection sidecar invoke timed out: launch` at 07:59:38 and `[shell] invoke abandoned
  (timeout): id=1372 channel=launch` for Avernum 5 (launched 07:58:38). The backend's `launch`
  resolves when the game exits and `INVOKE_TIMEOUT` is 60 s (`main.rs:1517`). Already recorded on
  the bottled-Steam side in `2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md`
  ("`sidecar invoke timed out: launch` about 60 s later"); same mechanism here.
- **C. HOARD (63000, not allowlisted, legacy bottle) stayed installed through every refresh** via
  the non-authoritative fallback (`native ?? bottle ?? bridge`), exactly as `library.ts` reads.
- **D. The bridge helper logs nothing when a client connects** — for both games the only helper
  lines are the spawn, `SteamAPI ready` and `LISTEN`. "Launches through the bridge" is therefore
  evidenced by the `via the Steam bridge` launch line, the helper process being alive (pid 51596,
  spawned 07:47:14, still alive at 08:03), and the wine process's bottle, not by a helper-side
  accept line.
- **E. Timings:** cxbottle create 14 s; 92 MB depot 8 s; per-game bottle delete 1 s; bridge helper
  spawn-to-LISTEN under 1 s.

## (d) Files

| file | what |
| --- | --- |
| `gate.js` | the console probe (`__snap/__launch/__uninst/__inst/__refresh`), loaded via `import('/@fs/…/evidence/gate.js')` |
| `type.sh` | focus-assert + prompt-click + keystroke driver (absolute prompt coords via `PROMPT_X/PROMPT_Y`); `winlist`/`click` are the 261015-n5k Swift helpers, recompiled |
| `gate-log-extract.txt` | the relevant `gamelib.log` lines of this launch, verbatim (snap JSON elided; its contents are in the table above) |
| `00-app-after-launch-inspector-docked.png` | the rig: 1280x800 window, inspector docked right, console at the bottom |
| `01-arm1-avernum6-window-legacy-bottle.png` | `screencapture -l 90445`: the Avernum 6 window launched from the legacy bottle |
| `03-arm3-avernum5-16bit-dialog-per-game-bottle.png` | `screencapture -l 90661`: Avernum 5's own colour-depth dialog, launched from `GameLibSteamBridge-206040` |

## (e) Limits

- One game per bottle shape was exercised (Avernum 5 per-game, Avernum 6 legacy). A machine with
  TWO per-game bottles was not built; `listReadyBridgeBottleNames()`'s ascending-appId ordering is
  desk-tested only.
- "Removed from CrossOver's own bottle list" was measured as `cxbottle --status` not finding the
  bottle plus no `~/Applications/CrossOver` entry; the CrossOver.app GUI was not opened.
- Avernum 5 was not played past its colour-depth dialog, so SteamAPI_Init through the shim from
  the per-game bottle was not observed end to end for that title (note A, note D).
- `removeSteamInstallCopy('bridge')` ("Remove all copies", LD-5) was not exercised; it remains the
  cleanup todo's open decision.
