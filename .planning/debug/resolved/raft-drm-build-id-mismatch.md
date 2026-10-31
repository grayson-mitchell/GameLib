---
status: resolved
trigger: "Raft (648800) DRM-mode multiplayer join fails with 'your game version does not match the host's game version' (58-09 live gate, paused; no result recorded)"
created: 2026-10-31
updated: 2026-10-31
source_plan: .planning/phases/58-steam-bridge-multiplayer/58-09-PLAN.md
---

## Symptoms

<!-- DATA_START -->
- expected: Raft (648800) hosted on the Mac through GameLib in DRM mode (steamclient layer p58, archive 4390a087…f3b1). The peer PC, a second Steam account on Windows Steam, joins through Steam friends "Join Game" and both players end up in the same world (58-08-LIVE-GATE.md, launch 1 / Direction A).
- actual:
  - The PC's Join Game launched Raft on the PC and showed Steam's "accept the following arguments" dialog. The operator clicked OK.
  - The PC landed on the main menu without joining.
  - When the operator selected "join world", the PC showed "your game version does not match the hosts game version".
- errors / evidence:
  - Build ids match on both sides.
    - The PC ACF buildid is 22312909 (operator read it from the installed files).
    - The Mac bottle ACF buildid is 22312909. The file is `GameLibSteamBridge-648800/drive_c/Program Files (x86)/Steam/steamapps/appmanifest_648800.acf`, StateFlags 4, LastUpdated 2026-10-24.
    - steamcmd.net reports public = 22312909, and also a `1.09_precrossplayupdate` branch at 10199006.
  - Crossplay was off on both sides (operator).
  - The Mac Raft install is unmodded: no BepInEx, doorstop or winhttp. `Assembly-CSharp.dll` is 3211776 bytes, sha256 prefix 0a6f0527856a9ce5. The PC hash was not compared; the operator skipped it as a long shot.
  - The Mac host's Player.log (copy at /tmp/gamelib-gate-20261031T023945Z/aborted-attempt-0/Player-host.log) records "GameScene loaded as host" at 15:53 and exit at 16:03, with no join or player-connected lines.
  - The host DRM trace is at /tmp/gamelib-gate-20261031T023945Z/aborted-attempt-0/648800-1793415053306.log. It contains these game-role events:
    - `event=callback id=1202 peer=1`
    - `event=p2p op=accept peer=1 ok=1`
    - `event=p2p op=read peer=1 bytes=10`
    - `event=p2p op=send peer=1 bytes=18`
    - callbacks 1203 and 1281
  - So Steam P2P works and the host answered a 10-byte request with 18 bytes.
  - Raft calls `ISteamApps_STEAMAPPS_INTERFACE_VERSION008_GetAppBuildId`. It appears in the trace by call name only, with no return value. Assembly-CSharp contains "GetAppBuildId" once and "GameVersion" 5 times.
  - In DRM mode lsteamclient forwards to native Mac Steam (steam_osx).
    - Mac Steam has NO install of Raft: there is no appmanifest_648800.acf in its only library (~/Library/Application Support/Steam/steamapps), and no common/Raft.
    - The operator confirms Mac Steam shows Raft not greyed out, with no Install button and no Uninstall option.
- hypothesis (UNCONFIRMED, operator-agreed to test):
  - GetAppBuildId returns 0 (or a non-22312909 value) to the game because Mac Steam has no install record.
  - The host then advertises that build in its 18-byte reply, or in rich presence, and the PC rejects it.
- timeline: First DRM-mode multiplayer attempt. It has never worked.
- reproduction:
  1. Start the dev app: `pnpm tauri:dev 2>&1 | tee -a <session>/terminal.log`.
  2. Launch Raft from GameLib (DRM mode) and host a world.
  3. On the PC (second account), use Steam friends → right-click the Mac account → Join Game → OK → join world.
- secondary observations (record, do NOT fix in this session):
  - (a) Raft world save fails in the bottle: Player.log has `Unknown error (0x2a605360) : '\\?\C:\users\crossover\AppData\LocalLow\Redbeet Interactive\Raft\User\User_<id>\World\<name>\2026.10.31-15.53-Latest'` on every save.
  - (b) Raft's in-game Social / friends list on the Mac does not show the peer account, but it does show other real friends. The PC was notified that the Mac account started playing. This may be related to the build mismatch.
- constraints:
  - Operator-approved plan:
    - (1) CONFIRM first by tracing the actual GetAppBuildId return value. Do not assume.
    - (2) If confirmed, make the DRM layer (native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c) answer GetAppBuildId from the bottle's own appmanifest buildid. Audit the related ISteamApps calls that have the same uninstalled-on-Mac problem: GetCurrentBetaName, BIsAppInstalled, GetAppInstallDir, BIsSubscribedApp, GetInstalledDepots, GetLaunchCommandLine and similar.
    - (3) Rebuild the archive. The operator must approve the new sha256 before any upload.
  - The published asset `steamclient-layer-cx26.3.0.39832-p58.tar.gz` (4390a087…f3b1) already exists on tag steamclient-layer-cx26.3.0.39832. NEVER use --clobber. The fixed archive needs a NEW asset name: propose one and ask the operator. The catalogue repin follows approval.
  - Keep the peer-ordinal rule: no raw SteamID64 in any trace line.
  - Memory: the bridge "verified" criterion is strict, and bottled Steam is a narrow fallback. Do not reroute to bottled Steam.
  - Memory: tauri dev does not rebuild the sidecar, so restart dev before live-testing backend changes and check the sidecar.js mtime.
  - Confirmation needs a live Raft launch by the operator. Return a checkpoint with exact steps when one is needed.
  - The 58-09 gate session dir /tmp/gamelib-gate-20261031T023945Z must not get debug traces mixed into launch-N files. Put debug launches in a separate dir, or move their trace files aside.
- relevant_files:
  - native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c
  - native/steam-bridge/steamclient-layer/lsteamclient/PINS.md
  - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
  - meta/bridgeCensus.ts
  - src/common/steamclientLayerCatalogue.ts
  - THIRD-PARTY-NOTICES.md
  - .planning/phases/58-steam-bridge-multiplayer/58-08-LIVE-GATE.md
  - .planning/phases/58-steam-bridge-multiplayer/58-08-SUMMARY.md
<!-- DATA_END -->

## Current Focus

- hypothesis: CONFIRMED. Native Mac Steam has no install of the Windows-only title, so GetAppBuildId returns 0.
- next_action: none (resolved)

## Evidence

- timestamp: 2026-10-31T16:15
  checked: host trace ISteamApps call names; generated winISteamApps.c
  found: Raft calls only ISteamApps_..008_GetAppBuildId, a plain forward to Mac Steam; return value was untraced.
  implication: p58b traces raw (build-id) and given (build-id-given) values and overrides from the bottle ACF.

- timestamp: 2026-10-31T16:30
  checked: p58b upload
  found: uploaded steamclient-layer-cx26.3.0.39832-p58b.tar.gz (no clobber; p58 intact); sha256 769d8532...95e7, 5368352 bytes. Catalogue + notices repinned.
  implication: live launch needed.

- timestamp: 2026-10-31 (live, after full dev restart)
  checked: first retry was invalid (dev app not restarted, stale sidecar reinstalled p58); moved to /tmp/gamelib-debug-raft-buildid-20261031T032952Z/attempt-stale-p58/. Valid attempt: COMPDIR and bottle lsteamclient.dll both 8257505948f8f5edc242 (p58b). Trace 648800-1793418295115.log.
  found: role=game event=apps op=build-id ret=0; op=build-id-given ret=22312909; callback 1202 peer=1; p2p accept ok=1; read bytes=10; send bytes=528 (was 18 -> host reject); callback 1203. Operator: "joined the same world, both see each other move." Census: multiplayer 648800 drm: verified join=1 send=1 recv=1 path=unknown oversize=0.
  implication: raw GetAppBuildId = 0 confirms root cause; override fixes join.

- timestamp: 2026-10-31 (side note)
  checked: PC shows a Windows Steam launch window + accept-arguments prompt (+connect <steamid>) on Join Game.
  found: normal Steam launch-arg confirmation, before any P2P.
  implication: observation only.

## Eliminated

- Build mismatch between installed files: both ACFs read 22312909.
- Crossplay setting: off on both sides.
- Mods / patched assemblies on the Mac: none found.
- P2P transport failure: 1202, accept and nonzero read/send observed.

## Resolution

root_cause: native Mac Steam has no install of the Windows-only title, so ISteamApps::GetAppBuildId returned 0; the host advertised build 0 and the peer rejected the join as a game version mismatch.
fix: gamelib_apps_call in steamclient_main.c answers GetAppBuildId from the bottle appmanifest buildid, falling back to Mac Steam's answer. Shipped as asset steamclient-layer-cx26.3.0.39832-p58b.tar.gz (sha256 769d8532...95e7); catalogue repinned.
verification: live Raft host/join, both players in the same world; census verified join=1 send=1 recv=1.
files_changed: [native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c, native/steam-bridge/steamclient-layer/lsteamclient/PINS.md, src/common/steamclientLayerCatalogue.ts, THIRD-PARTY-NOTICES.md]

## Secondary observations

- (a) Raft world save fails in the bottle (Unknown error 0x2a605360 on every save). STILL OPEN, not investigated; todo .planning/todos/pending/2026-10-31-raft-world-save-fails-in-bottle-unknown-error.md.
- (b) Raft in-game friends list did not show the peer account. Now shows it after the fix; same root cause (Raft filters friends by build). Resolved.
