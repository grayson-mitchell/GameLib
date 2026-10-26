---
created: 2026-10-26
title: "GameMaker D3D11 titles show MSAA-probe error dialogs under D3DMetal; pick DXVK for them generically"
source: Mining Mechs (1603180) fix, completed todo 2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/games.ts
  - public/fixes/1603180-steam.json
severity: minor
platform: any
ready: code
---

Mining Mechs (1603180) showed four `Win32 function failed: HRESULT: 0x80070057 - Invalid parameter`
dialogs on launch. The GameMaker v2024 D3D11 runner calls
`GR_D3D_Device->CheckMultisampleQualityLevels` (`Graphics_DisplayM.cpp` lines 1782/1784/1792/1794) to
probe MSAA support, CrossOver's D3DMetal backend returns `E_INVALIDARG`, and the runner shows each
failure as a message box. DXVK and DXMT both start it cleanly. It was fixed per-app with the bundled
tier-1 known-fix `public/fixes/1603180-steam.json` (`CX_GRAPHICS_BACKEND=dxvk`), and the live gate
passed through GameLib with the bridge still verified.

The probe is in the runner, not the game, so every GameMaker D3D11 title routed to the bridge
will probably show the same dialogs. A file per app finds them one at a time, after a user has
already seen the dialogs.

**Proposal:** at bridge launch, detect the GameMaker runner and default `CX_GRAPHICS_BACKEND=dxvk`,
with an explicit known-fix `envVariables` entry and the user's own env still taking precedence.
Detection candidates, cheapest first: `data.win` next to the launch exe; `GameMaker` /
`GMS2-Runner` strings in the exe. The hook point is `applySteamBridgeKnownFixes`
(`bridgeKnownFixes.ts:112`, called from `games.ts:3274`), which already builds the bridge launch's
`enviromentOptions`.

Before building it, confirm the cause on a second GameMaker title. One example does not show that
the whole runner family is affected: older GMS2 runners may not run the probe, and DXVK may hurt
titles D3DMetal handles fine. Once the generic rule exists, delete `1603180-steam.json` or keep it
as a regression pin, and say which in the commit.
